/**
 * assinatura-cancelar, encerra a recorrência.
 *
 * Duas decisões de produto que o código precisa honrar:
 *
 *   1. **Cancelar é fácil.** Um clique do dono, sem retenção forçada, sem
 *      telefone. Assinatura difícil de cancelar é assinatura que ninguém
 *      contrata de novo.
 *
 *   2. **O acesso vale até o fim do período pago.** Quem pagou o mês inteiro
 *      usa o mês inteiro. Cortar na hora do cancelamento seria ficar com
 *      dinheiro sem entregar o serviço, e o `fim_periodo` que já está gravado
 *      faz `aplicar_estado_assinatura` cuidar disso sozinha.
 *
 * Só o dono cancela. Admin administra o workspace, não o contrato.
 */

import { comEnvelope, ErroApi, exigirMetodo, lerJson, responderOk } from '../_shared/http.ts';
import {
  aplicarEstadoAssinatura,
  auditar,
  clienteAdmin,
  exigirDonoDoWorkspace,
  exigirUsuario,
} from '../_shared/supabase.ts';
import { aplicarRateLimit, hashIp, ipDaRequisicao } from '../_shared/seguranca.ts';
import { entradaCancelar, validar } from '../_shared/validacao.ts';
import { cancelarAssinatura } from '../_shared/asaas.ts';

Deno.serve(comEnvelope(async (req, origem) => {
  exigirMetodo(req, 'POST');

  const usuario = await exigirUsuario(req);
  const admin = clienteAdmin();

  await aplicarRateLimit(admin, usuario.id, {
    escopo: 'cancelamento',
    limite: 10,
    janelaSegundos: 3600,
  });

  const entrada = validar(entradaCancelar, await lerJson(req));
  const workspace = await exigirDonoDoWorkspace(admin, entrada.workspaceId, usuario.id);

  const { data: assinatura } = await admin
    .from('assinaturas')
    .select('id, asaas_subscription_id, fim_periodo, plano')
    .eq('workspace_id', workspace.id)
    .in('status', ['pendente', 'ativa', 'inadimplente'])
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!assinatura) {
    throw new ErroApi(
      'assinatura_inexistente',
      'Não há assinatura ativa para cancelar.',
    );
  }

  // Cancela primeiro na Asaas: se falhasse depois de marcarmos como cancelada,
  // a recorrência continuaria cobrando o cliente enquanto o nosso banco diz que
  // acabou, o pior desencontro possível. Um 404 da Asaas (já cancelada por lá)
  // não impede o cancelamento local; o objetivo é o mesmo.
  if (assinatura.asaas_subscription_id) {
    try {
      await cancelarAssinatura(assinatura.asaas_subscription_id);
    } catch (erro) {
      const detalhe = erro instanceof ErroApi ? erro.detalhe : undefined;
      const status = (detalhe as { status?: number } | undefined)?.status;
      if (status !== 404) throw erro;
      console.warn('[cancelar] assinatura já inexistente na Asaas, seguindo.');
    }
  }

  const { error } = await admin
    .from('assinaturas')
    .update({
      status: 'cancelada',
      cancelada_em: new Date().toISOString(),
      motivo_cancelamento: entrada.motivo || 'Cancelado pelo dono do workspace',
    })
    .eq('id', assinatura.id);

  if (error) throw new ErroApi('erro_interno', 'Falha ao cancelar a assinatura.', error);

  // `aplicar_estado_assinatura` não encontra mais assinatura viva, mas antes de
  // rebaixar procura uma cancelada com `fim_periodo` no futuro, e mantém o
  // plano até lá. É onde a decisão nº 2 lá de cima vira comportamento real: o
  // usuário cancela agora e continua no Estúdio até o fim do mês que pagou.
  // A reconciliação diária faz a transição quando a data chegar.
  await aplicarEstadoAssinatura(admin, workspace.id);

  await auditar(admin, {
    workspaceId: workspace.id,
    atorId: usuario.id,
    evento: 'assinatura.cancelada',
    recurso: 'assinatura',
    recursoId: assinatura.id,
    meta: { origem: 'usuario', plano: assinatura.plano },
    ipHash: await hashIp(ipDaRequisicao(req)),
  });

  return responderOk({
    cancelada: true,
    acessoAte: assinatura.fim_periodo,
  }, origem);
}));
