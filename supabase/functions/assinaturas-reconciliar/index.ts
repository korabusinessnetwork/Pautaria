/**
 * assinaturas-reconciliar — a rede de segurança diária.
 *
 * Webhook é entrega **melhor-esforço**. A Asaas pode ter uma janela de
 * instabilidade, a função pode ter estourado o tempo num pico, o token pode ter
 * sido trocado sem atualizar dos dois lados. Se o único caminho para mudar o
 * plano fosse o webhook, cada evento perdido viraria um cliente pagante em
 * plano solo — ou, pior, um cliente que parou de pagar mantendo o plano Time.
 *
 * Esta função roda uma vez por dia e reconcilia por estado, não por evento:
 * varre as assinaturas cujo período expirou e manda o banco recalcular. Como
 * `aplicar_estado_assinatura` é uma derivação pura, rodá-la sem necessidade não
 * causa efeito nenhum — o que torna a reconciliação segura de repetir e
 * dispensável de coordenar com o webhook.
 *
 * Sem JWT: quem chama é o agendador. A autenticação é o `x-cron-token`,
 * comparado em tempo constante.
 */

import { comEnvelope, ErroApi, exigirMetodo, responderOk } from '../_shared/http.ts';
import { cronToken } from '../_shared/ambiente.ts';
import { auditar, clienteAdmin } from '../_shared/supabase.ts';
import {
  hashIp,
  iguaisEmTempoConstante,
  ipDaRequisicao,
} from '../_shared/seguranca.ts';

/** Teto por execução: uma varredura infinita seria um jeito criativo de cair. */
const LOTE_MAXIMO = 500;

Deno.serve(comEnvelope(async (req, origem) => {
  exigirMetodo(req, 'POST');

  const admin = clienteAdmin();

  const recebido = req.headers.get('x-cron-token') ?? '';
  if (!iguaisEmTempoConstante(recebido, cronToken())) {
    await auditar(admin, {
      workspaceId: null,
      atorId: null,
      evento: 'cron.token_invalido',
      recurso: 'reconciliacao',
      ipHash: await hashIp(ipDaRequisicao(req)),
    });
    throw new ErroApi('nao_autenticado', 'Token de agendamento inválido.');
  }

  const agora = new Date().toISOString();

  // ── 1. Assinaturas cujo período acabou ───────────────────────────────────
  // Inclui as canceladas: é aqui que o acesso de quem cancelou no meio do mês
  // finalmente termina, na data em que o mês pago acabou.
  const { data: vencidas, error: erroVencidas } = await admin
    .from('assinaturas')
    .select('id, workspace_id, plano, status, fim_periodo')
    .in('status', ['ativa', 'inadimplente', 'cancelada'])
    .not('fim_periodo', 'is', null)
    .lt('fim_periodo', agora)
    .limit(LOTE_MAXIMO);

  if (erroVencidas) {
    throw new ErroApi('erro_interno', 'Falha ao listar assinaturas.', erroVencidas);
  }

  // ── 2. Workspaces cuja tolerância terminou ───────────────────────────────
  const { data: expirados, error: erroExpirados } = await admin
    .from('workspaces')
    .select('id, plano, status, plano_expira_em')
    .not('plano_expira_em', 'is', null)
    .lt('plano_expira_em', agora)
    .limit(LOTE_MAXIMO);

  if (erroExpirados) {
    throw new ErroApi('erro_interno', 'Falha ao listar workspaces.', erroExpirados);
  }

  const alvos = new Set<string>([
    ...(vencidas ?? []).map((a) => a.workspace_id as string),
    ...(expirados ?? []).map((w) => w.id as string),
  ]);

  const mudancas: Array<Record<string, unknown>> = [];
  const falhas: string[] = [];

  for (const workspaceId of alvos) {
    // Um workspace com problema não pode interromper a varredura dos outros:
    // a reconciliação é um lote, e um lote que para na primeira exceção deixa
    // 400 tenants sem processar por causa de um.
    try {
      const { data: antes } = await admin
        .from('workspaces')
        .select('plano, status')
        .eq('id', workspaceId)
        .single();

      const { data: depois, error } = await admin.rpc('aplicar_estado_assinatura', {
        p_workspace: workspaceId,
      });
      if (error) throw new Error(error.message);

      const novo = Array.isArray(depois) ? depois[0] : depois;
      if (novo && antes && (novo.plano !== antes.plano || novo.status !== antes.status)) {
        mudancas.push({
          workspaceId,
          de: `${antes.plano}/${antes.status}`,
          para: `${novo.plano}/${novo.status}`,
        });

        await auditar(admin, {
          workspaceId,
          atorId: null,
          evento: novo.plano === 'solo' ? 'plano.rebaixado' : 'plano.ajustado',
          recurso: 'workspace',
          recursoId: workspaceId,
          meta: { de: antes.plano, para: novo.plano, origem: 'reconciliacao' },
        });
      }
    } catch (erro) {
      falhas.push(workspaceId);
      console.error('[reconciliar] falha em', workspaceId, String(erro));
    }
  }

  // ── 3. Faxina dos baldes de rate limit ───────────────────────────────────
  let baldesRemovidos = 0;
  const { data: faxina, error: erroFaxina } = await admin.rpc('faxina_operacional');
  if (erroFaxina) {
    console.warn('[reconciliar] faxina falhou:', erroFaxina.message);
  } else {
    const linha = Array.isArray(faxina) ? faxina[0] : faxina;
    baldesRemovidos = Number(linha?.baldes_removidos ?? 0);
  }

  // ── 4. Sentinela de RLS ──────────────────────────────────────────────────
  // Custa uma consulta por dia e responde a uma pergunta que ninguém lembra de
  // fazer: alguma tabela entrou em produção sem RLS? Uma migration aplicada às
  // pressas não pode ficar meses invisível.
  const { data: semRls } = await admin.rpc('auditoria_rls');
  const tabelasSemRls = (semRls ?? []) as Array<{ tabela: string; motivo: string }>;

  if (tabelasSemRls.length > 0) {
    console.error('[ALERTA] tabelas sem RLS:', tabelasSemRls.map((t) => t.tabela).join(', '));
    await auditar(admin, {
      workspaceId: null,
      atorId: null,
      evento: 'seguranca.rls_ausente',
      recurso: 'banco',
      meta: { tabelas: tabelasSemRls.map((t) => t.tabela) },
    });
  }

  return responderOk({
    avaliados: alvos.size,
    mudancas,
    falhas,
    baldesRemovidos,
    tabelasSemRls: tabelasSemRls.map((t) => t.tabela),
  }, origem);
}));
