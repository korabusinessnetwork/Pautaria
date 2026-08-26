/**
 * assinatura-criar, contrata um plano pago.
 *
 * Só o dono do workspace chama. Devolve a URL da fatura hospedada pela Asaas,
 * para onde o front redireciona. O plano **não** é liberado aqui: quem libera é
 * o webhook, quando a Asaas confirmar o pagamento. Liberar na contratação daria
 * o produto de graça a quem gera boleto e não paga.
 *
 * Ordem das operações e por quê:
 *   1. grava a assinatura local como `pendente`, ANTES de falar com a Asaas
 *   2. cria cliente e assinatura na Asaas
 *   3. atualiza a linha local com os ids do provedor
 *
 * O passo 1 vir primeiro não é detalhe de estilo. O índice único parcial
 * `assinaturas_viva_por_workspace_idx` transforma esse INSERT numa trava: dois
 * cliques no botão, ou duas abas, produzem duas requisições simultâneas, e a
 * segunda bate no índice e para, antes de criar uma segunda assinatura na
 * Asaas e cobrar o cliente duas vezes. Se falássemos com a Asaas primeiro, a
 * trava chegaria tarde demais.
 */

import {
  comEnvelope,
  ErroApi,
  exigirMetodo,
  lerJson,
  responderOk,
} from '../_shared/http.ts';
import {
  aplicarEstadoAssinatura,
  auditar,
  clienteAdmin,
  exigirDonoDoWorkspace,
  exigirUsuario,
} from '../_shared/supabase.ts';
import { aplicarRateLimit, hashIp, ipDaRequisicao } from '../_shared/seguranca.ts';
import { entradaCriarAssinatura, validar } from '../_shared/validacao.ts';
import * as asaas from '../_shared/asaas.ts';

Deno.serve(comEnvelope(async (req, origem) => {
  exigirMetodo(req, 'POST');

  const usuario = await exigirUsuario(req);
  const admin = clienteAdmin();

  // Checkout é caro (duas chamadas externas) e é alvo natural de abuso.
  // 5 tentativas por hora sobra para quem erra o CPF duas vezes.
  await aplicarRateLimit(admin, usuario.id, {
    escopo: 'checkout',
    limite: 5,
    janelaSegundos: 3600,
  });

  const entrada = validar(entradaCriarAssinatura, await lerJson(req));
  const workspace = await exigirDonoDoWorkspace(admin, entrada.workspaceId, usuario.id);

  if (workspace.status === 'cancelado') {
    throw new ErroApi('sem_permissao', 'Este workspace foi encerrado.');
  }

  // ── Preço vem da tabela, nunca do cliente ────────────────────────────────
  // O corpo da requisição diz qual plano, jamais quanto custa. Aceitar valor do
  // cliente seria deixá-lo assinar o plano Time por um centavo.
  const { data: plano, error: erroPlano } = await admin
    .from('planos')
    .select('chave, nome, preco_mensal_centavos, preco_anual_centavos')
    .eq('chave', entrada.plano)
    .single();

  if (erroPlano || !plano) {
    throw new ErroApi('plano_inexistente', 'Plano indisponível.');
  }

  const valorCentavos = entrada.ciclo === 'anual'
    ? plano.preco_anual_centavos
    : plano.preco_mensal_centavos;

  if (valorCentavos <= 0) {
    throw new ErroApi('plano_inexistente', 'Este plano não é cobrado.');
  }

  // ── Passo 1: a trava ─────────────────────────────────────────────────────
  const { data: assinaturaLocal, error: erroInsercao } = await admin
    .from('assinaturas')
    .insert({
      workspace_id: workspace.id,
      plano: entrada.plano,
      ciclo: entrada.ciclo,
      status: 'pendente',
      valor_centavos: valorCentavos,
      asaas_customer_id: workspace.asaas_customer_id ?? 'pendente',
      criado_por: usuario.id,
    })
    .select('id')
    .single();

  if (erroInsercao || !assinaturaLocal) {
    // 23505 = violação de unicidade → já existe assinatura viva.
    if (erroInsercao?.code === '23505') {
      throw new ErroApi(
        'plano_ja_ativo',
        'Este workspace já tem uma assinatura em andamento. Cancele a atual antes de contratar outra.',
      );
    }
    throw new ErroApi('erro_interno', 'Não foi possível iniciar a assinatura.', erroInsercao);
  }

  const desfazer = async () => {
    await admin.from('assinaturas').delete().eq('id', assinaturaLocal.id);
  };

  try {
    // ── Passo 2: cliente na Asaas ──────────────────────────────────────────
    // Reaproveitamos o cliente já vinculado ao workspace; se não houver,
    // procuramos pelo documento antes de criar, a Asaas recusa CPF duplicado,
    // e um usuário que troca de workspace usa o mesmo CPF.
    let customerId = workspace.asaas_customer_id;

    if (!customerId) {
      const existente = await asaas.buscarClientePorDocumento(entrada.documento);
      customerId = existente?.id ?? (await asaas.criarCliente({
        name: entrada.nomeCobranca,
        email: usuario.email,
        cpfCnpj: entrada.documento,
        mobilePhone: entrada.telefone || undefined,
        externalReference: workspace.id,
        notificationDisabled: false,
      })).id;

      const { error } = await admin
        .from('workspaces')
        .update({ asaas_customer_id: customerId })
        .eq('id', workspace.id);
      if (error) throw new ErroApi('erro_interno', 'Falha ao vincular o cliente.', error);
    }

    // ── Passo 3: assinatura na Asaas ───────────────────────────────────────
    // `billingType: 'UNDEFINED'` deixa a escolha (Pix, boleto, cartão) para o
    // usuário na página da Asaas. Fixar aqui só reduziria a chance de ele pagar.
    const assinaturaAsaas = await asaas.criarAssinatura({
      customer: customerId,
      billingType: 'UNDEFINED',
      value: asaas.centavosParaReais(valorCentavos),
      nextDueDate: asaas.primeiroVencimento(),
      cycle: asaas.CICLO_ASAAS[entrada.ciclo],
      description: `Pautaria · plano ${plano.nome} (${entrada.ciclo}) · ${workspace.nome}`,
      externalReference: workspace.id,
    });

    const { error: erroVinculo } = await admin
      .from('assinaturas')
      .update({
        asaas_subscription_id: assinaturaAsaas.id,
        asaas_customer_id: customerId,
        proxima_cobranca: assinaturaAsaas.nextDueDate,
        inicio_periodo: new Date().toISOString(),
      })
      .eq('id', assinaturaLocal.id);

    if (erroVinculo) {
      throw new ErroApi('erro_interno', 'Falha ao registrar a assinatura.', erroVinculo);
    }

    // ── Passo 4: a primeira fatura ─────────────────────────────────────────
    // A Asaas gera a cobrança de forma assíncrona. Se ela ainda não apareceu, o
    // webhook PAYMENT_CREATED grava depois e o usuário chega à fatura pelo
    // portal, não é motivo para falhar o checkout inteiro.
    const cobrancas = await asaas.cobrancasDaAssinatura(assinaturaAsaas.id);
    const primeira = cobrancas[0];

    if (primeira) {
      await admin.from('cobrancas').upsert({
        workspace_id: workspace.id,
        assinatura_id: assinaturaLocal.id,
        asaas_payment_id: primeira.id,
        status: 'pendente',
        valor_centavos: asaas.reaisParaCentavos(primeira.value),
        forma_pagamento: primeira.billingType ?? null,
        vencimento: primeira.dueDate ?? null,
        url_fatura: primeira.invoiceUrl ?? null,
      }, { onConflict: 'asaas_payment_id' });
    }

    // Recalcula (segue em `solo` até a confirmação) para manter o invariante de
    // que o plano do workspace é sempre derivado, nunca deduzido.
    await aplicarEstadoAssinatura(admin, workspace.id);

    await auditar(admin, {
      workspaceId: workspace.id,
      atorId: usuario.id,
      evento: 'assinatura.contratada',
      recurso: 'assinatura',
      recursoId: assinaturaLocal.id,
      // Sem CPF, sem e-mail, sem nome. Só o que serve para investigar depois.
      meta: { plano: entrada.plano, ciclo: entrada.ciclo, valor_centavos: valorCentavos },
      ipHash: await hashIp(ipDaRequisicao(req)),
    });

    return responderOk({
      assinaturaId: assinaturaLocal.id,
      plano: entrada.plano,
      ciclo: entrada.ciclo,
      valorCentavos,
      urlPagamento: primeira?.invoiceUrl ?? null,
      aguardandoFatura: !primeira?.invoiceUrl,
    }, origem);
  } catch (erro) {
    // A assinatura local só existe para travar o caminho concorrente. Se o
    // provedor recusou, ela não pode sobreviver, senão o usuário fica travado
    // num `plano_ja_ativo` fantasma e sem como contratar.
    await desfazer();
    throw erro;
  }
}));
