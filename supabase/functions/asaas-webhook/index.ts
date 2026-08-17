/**
 * asaas-webhook — a única porta pelo qual um plano é liberado.
 *
 * É a função mais sensível do sistema: roda sem JWT (a Asaas não tem um) e
 * decide quem paga e quem não paga. Três defesas, nesta ordem:
 *
 *   1. **Autenticação por token, em tempo constante.** A Asaas envia o
 *      cabeçalho `asaas-access-token` combinado no cadastro do webhook. A
 *      comparação byte a byte de tempo fixo impede descobrir o token medindo o
 *      tempo de resposta. Sem token válido, nada além de 401 acontece — nem
 *      leitura de corpo, nem escrita.
 *
 *   2. **Idempotência por id de evento.** A Asaas reentrega: por timeout, por
 *      reprocessamento manual, por instabilidade. Sem trava, uma reentrega de
 *      PAYMENT_CONFIRMED estenderia o período pago de novo. O UNIQUE em
 *      `webhook_eventos` resolve — e distingue "já processado" (ignora) de
 *      "recebido e falhou" (reprocessa).
 *
 *   3. **Semântica de retentativa correta.** Erro nosso responde 500 para a
 *      Asaas insistir. Evento já resolvido ou que não nos diz respeito responde
 *      200 — porque devolver erro faria a Asaas retentar para sempre um evento
 *      que nunca vai mudar de estado.
 *
 * O que esta função nunca faz: confiar em valor vindo do payload para decidir
 * plano. Ela grava fatos (esta cobrança foi confirmada) e chama
 * `aplicar_estado_assinatura`, que deriva o plano do que está no banco.
 */

import {
  comEnvelope,
  ErroApi,
  exigirMetodo,
  lerJson,
  responderOk,
} from '../_shared/http.ts';
import { asaasWebhookToken } from '../_shared/ambiente.ts';
import {
  aplicarEstadoAssinatura,
  auditar,
  clienteAdmin,
  type ClienteAdmin,
} from '../_shared/supabase.ts';
import {
  aplicarRateLimit,
  hashIp,
  iguaisEmTempoConstante,
  ipDaRequisicao,
} from '../_shared/seguranca.ts';
import { eventoAsaas, type EventoAsaas, validar } from '../_shared/validacao.ts';
import { avancarCiclo, dataAsaas, reaisParaCentavos } from '../_shared/asaas.ts';

type StatusCobranca =
  | 'pendente' | 'confirmada' | 'recebida' | 'vencida'
  | 'estornada' | 'removida' | 'chargeback';

/**
 * Mapa evento → efeito. Ter isso como dado, e não como uma escada de `if`,
 * deixa explícito o conjunto inteiro de eventos que o sistema entende — e
 * qualquer evento fora do mapa é ignorado com 200, sem tentativa de adivinhação.
 */
const EFEITOS: Record<string, {
  cobranca: StatusCobranca;
  assinatura?: 'ativa' | 'inadimplente' | 'cancelada';
  /** Estende o período pago a partir do vencimento da cobrança. */
  estendePeriodo?: boolean;
}> = {
  PAYMENT_CREATED: { cobranca: 'pendente' },
  PAYMENT_UPDATED: { cobranca: 'pendente' },
  PAYMENT_CONFIRMED: { cobranca: 'confirmada', assinatura: 'ativa', estendePeriodo: true },
  PAYMENT_RECEIVED: { cobranca: 'recebida', assinatura: 'ativa', estendePeriodo: true },
  PAYMENT_OVERDUE: { cobranca: 'vencida', assinatura: 'inadimplente' },
  PAYMENT_REFUNDED: { cobranca: 'estornada', assinatura: 'cancelada' },
  PAYMENT_CHARGEBACK_REQUESTED: { cobranca: 'chargeback', assinatura: 'cancelada' },
  PAYMENT_DELETED: { cobranca: 'removida' },
};

Deno.serve(comEnvelope(async (req, origem) => {
  exigirMetodo(req, 'POST');

  const admin = clienteAdmin();
  const ip = ipDaRequisicao(req);

  // ── Defesa 1: autenticação ───────────────────────────────────────────────
  const recebido = req.headers.get('asaas-access-token') ?? '';
  if (!iguaisEmTempoConstante(recebido, asaasWebhookToken())) {
    // Só quem erra o token gasta uma consulta ao banco. O tráfego legítimo da
    // Asaas nunca toca o rate limit — e quem está tentando adivinhar esgota o
    // balde depressa.
    await aplicarRateLimit(admin, ip ?? 'sem-ip', {
      escopo: 'webhook-negado',
      limite: 20,
      janelaSegundos: 300,
    });
    await auditar(admin, {
      workspaceId: null,
      atorId: null,
      evento: 'webhook.token_invalido',
      recurso: 'webhook',
      meta: { provedor: 'asaas' },
      ipHash: await hashIp(ip),
    });
    throw new ErroApi('nao_autenticado', 'Token de webhook inválido.');
  }

  const evento = validar(eventoAsaas, await lerJson(req));

  // ── Defesa 2: idempotência ───────────────────────────────────────────────
  const { data: jaVisto } = await admin
    .from('webhook_eventos')
    .select('id, processado_em, tentativas')
    .eq('provedor', 'asaas')
    .eq('evento_externo_id', evento.id)
    .maybeSingle();

  if (jaVisto?.processado_em) {
    // 200, não erro: o evento está resolvido e retentar nunca mudaria isso.
    return responderOk({ duplicado: true, evento: evento.event }, origem);
  }

  let registroId = jaVisto?.id ?? null;
  if (registroId) {
    await admin
      .from('webhook_eventos')
      .update({ tentativas: (jaVisto?.tentativas ?? 0) + 1, erro: null })
      .eq('id', registroId);
  } else {
    const { data: novo, error } = await admin
      .from('webhook_eventos')
      .insert({
        provedor: 'asaas',
        evento_externo_id: evento.id,
        tipo: evento.event,
        payload: evento,
        tentativas: 1,
      })
      .select('id')
      .single();

    // Corrida com uma entrega simultânea do mesmo evento: o UNIQUE segurou.
    // A outra requisição está processando; esta responde 200 e sai.
    if (error?.code === '23505') {
      return responderOk({ duplicado: true, evento: evento.event }, origem);
    }
    if (error || !novo) {
      throw new ErroApi('erro_interno', 'Falha ao registrar o evento.', error);
    }
    registroId = novo.id;
  }

  // ── Processamento ────────────────────────────────────────────────────────
  try {
    const resultado = await processar(admin, evento);

    await admin
      .from('webhook_eventos')
      .update({ processado_em: new Date().toISOString(), erro: null })
      .eq('id', registroId);

    return responderOk({ duplicado: false, evento: evento.event, ...resultado }, origem);
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await admin.from('webhook_eventos').update({ erro: mensagem }).eq('id', registroId);

    // `processado_em` fica nulo de propósito: a Asaas vai retentar, e a
    // retentativa cai no caminho de reprocessamento acima em vez de ser
    // descartada como duplicata.
    console.error('[webhook] falha ao processar', evento.event, mensagem);
    throw new ErroApi('erro_interno', 'Falha ao processar o evento.');
  }
}));


/**
 * Aplica o efeito do evento. Todas as escritas são idempotentes (upsert por id
 * externo + recálculo derivado), de modo que reprocessar não muda o resultado.
 */
async function processar(
  admin: ClienteAdmin,
  evento: EventoAsaas,
): Promise<Record<string, unknown>> {
  // Cancelamento da assinatura na Asaas (pelo painel ou pela nossa API).
  if (evento.event === 'SUBSCRIPTION_DELETED' && evento.subscription) {
    const assinatura = await buscarAssinatura(admin, evento.subscription.id);
    if (!assinatura) return { ignorado: 'assinatura_desconhecida' };

    await admin
      .from('assinaturas')
      .update({ status: 'cancelada', cancelada_em: new Date().toISOString() })
      .eq('id', assinatura.id);
    await aplicarEstadoAssinatura(admin, assinatura.workspace_id);

    await auditar(admin, {
      workspaceId: assinatura.workspace_id,
      atorId: null,
      evento: 'assinatura.cancelada',
      recurso: 'assinatura',
      recursoId: assinatura.id,
      meta: { origem: 'webhook' },
    });
    return { acao: 'assinatura_cancelada' };
  }

  const efeito = EFEITOS[evento.event];
  const pagamento = evento.payment;

  // Evento fora do mapa, ou cobrança avulsa sem assinatura: nada a fazer.
  // 200 e segue — insistir num evento que não nos diz respeito só encheria a
  // fila de retentativas da Asaas.
  if (!efeito || !pagamento) return { ignorado: 'evento_sem_efeito' };
  if (!pagamento.subscription) return { ignorado: 'cobranca_avulsa' };

  const assinatura = await buscarAssinatura(admin, pagamento.subscription);
  if (!assinatura) return { ignorado: 'assinatura_desconhecida' };

  // ── Fato 1: a cobrança ───────────────────────────────────────────────────
  const pagoEm = pagamento.confirmedDate ?? pagamento.paymentDate ??
    pagamento.clientPaymentDate ?? null;

  const { error: erroCobranca } = await admin.from('cobrancas').upsert({
    workspace_id: assinatura.workspace_id,
    assinatura_id: assinatura.id,
    asaas_payment_id: pagamento.id,
    status: efeito.cobranca,
    valor_centavos: reaisParaCentavos(pagamento.value ?? 0),
    forma_pagamento: pagamento.billingType ?? null,
    vencimento: pagamento.dueDate ?? null,
    pago_em: pagoEm ? new Date(`${pagoEm}T12:00:00Z`).toISOString() : null,
    url_fatura: pagamento.invoiceUrl ?? null,
  }, { onConflict: 'asaas_payment_id' });

  if (erroCobranca) throw new Error(`cobranca: ${erroCobranca.message}`);

  // ── Fato 2: a assinatura ─────────────────────────────────────────────────
  if (efeito.assinatura) {
    const patch: Record<string, unknown> = { status: efeito.assinatura };

    if (efeito.estendePeriodo && pagamento.dueDate) {
      // O período pago vai do vencimento desta cobrança até o vencimento da
      // próxima. Derivado do payload, sem chamada extra à Asaas — e igual em
      // toda reentrega, o que mantém o reprocessamento inofensivo.
      const inicio = new Date(`${pagamento.dueDate}T00:00:00Z`);
      const fim = avancarCiclo(inicio, assinatura.ciclo);
      patch.inicio_periodo = inicio.toISOString();
      patch.fim_periodo = fim.toISOString();
      patch.proxima_cobranca = dataAsaas(fim);
    }

    if (efeito.assinatura === 'cancelada') {
      patch.cancelada_em = new Date().toISOString();
      patch.motivo_cancelamento = `Evento ${evento.event} na Asaas`;
    }

    const { error } = await admin
      .from('assinaturas')
      .update(patch)
      .eq('id', assinatura.id);
    if (error) throw new Error(`assinatura: ${error.message}`);
  }

  // ── Derivação: o plano do workspace ──────────────────────────────────────
  await aplicarEstadoAssinatura(admin, assinatura.workspace_id);

  await auditar(admin, {
    workspaceId: assinatura.workspace_id,
    atorId: null,
    evento: `cobranca.${efeito.cobranca}`,
    recurso: 'cobranca',
    recursoId: pagamento.id,
    // Nenhum dado do pagador. Só o suficiente para reconstruir a linha do tempo.
    meta: { evento_asaas: evento.event, assinatura_id: assinatura.id },
  });

  return { acao: efeito.cobranca, assinaturaId: assinatura.id };
}


interface AssinaturaLocal {
  id: string;
  workspace_id: string;
  ciclo: 'mensal' | 'anual';
  plano: string;
  status: string;
}

async function buscarAssinatura(
  admin: ClienteAdmin,
  asaasSubscriptionId: string,
): Promise<AssinaturaLocal | null> {
  const { data } = await admin
    .from('assinaturas')
    .select('id, workspace_id, ciclo, plano, status')
    .eq('asaas_subscription_id', asaasSubscriptionId)
    .maybeSingle();
  return (data as AssinaturaLocal | null) ?? null;
}
