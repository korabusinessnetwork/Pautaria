/**
 * assinatura-portal, leva o usuário de volta à fatura em aberto.
 *
 * O boleto venceu, o Pix expirou, a pessoa fechou a aba antes de pagar. Sem uma
 * porta de volta, o único caminho seria cancelar e contratar de novo, que
 * gera cobrança nova, número novo, e uma conversa com o suporte.
 *
 * A função consulta a Asaas ao vivo em vez de devolver a URL que guardamos:
 * uma fatura vencida ganha novo link quando a Asaas a reemite, e o link antigo
 * levaria a uma página morta.
 */

import { comEnvelope, ErroApi, exigirMetodo, lerJson, responderOk } from '../_shared/http.ts';
import {
  clienteAdmin,
  exigirPapelNoWorkspace,
  exigirUsuario,
} from '../_shared/supabase.ts';
import { aplicarRateLimit } from '../_shared/seguranca.ts';
import { entradaWorkspace, validar } from '../_shared/validacao.ts';
import { cobrancasDaAssinatura, reaisParaCentavos } from '../_shared/asaas.ts';

/** Estados da Asaas em que a fatura ainda pode ser paga. */
const PAGAVEIS = new Set(['PENDING', 'OVERDUE', 'AWAITING_RISK_ANALYSIS']);

Deno.serve(comEnvelope(async (req, origem) => {
  exigirMetodo(req, 'POST');

  const usuario = await exigirUsuario(req);
  const admin = clienteAdmin();

  await aplicarRateLimit(admin, usuario.id, {
    escopo: 'portal',
    limite: 30,
    janelaSegundos: 3600,
  });

  const { workspaceId } = validar(entradaWorkspace, await lerJson(req));

  // Admin também consulta: quem administra o workspace precisa saber se a
  // cobrança está em aberto, mesmo sem poder assinar ou cancelar.
  const workspace = await exigirPapelNoWorkspace(admin, workspaceId, usuario.id, [
    'owner',
    'admin',
  ]);

  const { data: assinatura } = await admin
    .from('assinaturas')
    .select('id, plano, ciclo, status, valor_centavos, proxima_cobranca, fim_periodo, asaas_subscription_id')
    .eq('workspace_id', workspace.id)
    .in('status', ['pendente', 'ativa', 'inadimplente'])
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!assinatura) {
    throw new ErroApi(
      'assinatura_inexistente',
      'Este workspace não tem assinatura em andamento.',
    );
  }

  let urlPagamento: string | null = null;
  let vencimento: string | null = null;

  if (assinatura.asaas_subscription_id) {
    const cobrancas = await cobrancasDaAssinatura(assinatura.asaas_subscription_id);
    const emAberto = cobrancas
      .filter((c) => PAGAVEIS.has((c.status ?? '').toUpperCase()) && c.invoiceUrl)
      .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))[0];

    if (emAberto) {
      urlPagamento = emAberto.invoiceUrl ?? null;
      vencimento = emAberto.dueDate ?? null;

      // Sincroniza o que a Asaas acabou de nos contar. Aproveitar a consulta
      // mantém o histórico local em dia mesmo se um webhook se perdeu.
      await admin.from('cobrancas').upsert({
        workspace_id: workspace.id,
        assinatura_id: assinatura.id,
        asaas_payment_id: emAberto.id,
        status: (emAberto.status ?? '').toUpperCase() === 'OVERDUE' ? 'vencida' : 'pendente',
        valor_centavos: reaisParaCentavos(emAberto.value),
        forma_pagamento: emAberto.billingType ?? null,
        vencimento: emAberto.dueDate ?? null,
        url_fatura: emAberto.invoiceUrl ?? null,
      }, { onConflict: 'asaas_payment_id' });
    }
  }

  return responderOk({
    plano: assinatura.plano,
    ciclo: assinatura.ciclo,
    status: assinatura.status,
    valorCentavos: assinatura.valor_centavos,
    proximaCobranca: assinatura.proxima_cobranca,
    fimPeriodo: assinatura.fim_periodo,
    urlPagamento,
    vencimento,
  }, origem);
}));
