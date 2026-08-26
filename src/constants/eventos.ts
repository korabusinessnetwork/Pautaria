/**
 * Eventos de domínio, em `dot.case`, substantivo no passado (CLAUDE.md).
 *
 * São a espinha para automação futura ("quando uma pauta entra em Aprovação,
 * avise no canal") e o vocabulário do `audit_log`. Manter a lista fechada num
 * arquivo, em vez de escrever a string na chamada, evita a bagunça previsível:
 * `pauta.movida`, `pauta_movida` e `pautaMovida` convivendo no mesmo log e
 * quebrando qualquer consulta que tente contá-los.
 *
 * O banco também valida o formato: a coluna `audit_log.evento` tem CHECK com
 * a expressão regular de dot.case (migration 0006).
 */

export const EVENTOS = {
  // Tenant
  WORKSPACE_CRIADO: 'workspace.criado',
  WORKSPACE_RENOMEADO: 'workspace.renomeado',
  WORKSPACE_EXCLUIDO: 'workspace.excluido',

  // Quadro e ofício
  QUADRO_CRIADO: 'quadro.criado',
  QUADRO_OFICIO_TROCADO: 'quadro.oficio_trocado',
  OFICIO_CRIADO: 'oficio.criado',
  OFICIO_EXCLUIDO: 'oficio.excluido',

  // Pauta
  PAUTA_CRIADA: 'pauta.criada',
  PAUTA_MOVIDA: 'pauta.movida',
  PAUTA_EDITADA: 'pauta.editada',
  PAUTA_ARQUIVADA: 'pauta.arquivada',
  PAUTA_DESARQUIVADA: 'pauta.desarquivada',

  // Time
  MEMBRO_CONVIDADO: 'membro.convidado',
  MEMBRO_ENTROU: 'membro.entrou',
  MEMBRO_REMOVIDO: 'membro.removido',
  MEMBRO_PAPEL_ALTERADO: 'membro.papel_alterado',

  // Cobrança, escritos só pelo servidor (origem = 'servidor')
  ASSINATURA_CONTRATADA: 'assinatura.contratada',
  ASSINATURA_ATIVADA: 'assinatura.ativada',
  ASSINATURA_CANCELADA: 'assinatura.cancelada',
  COBRANCA_CONFIRMADA: 'cobranca.confirmada',
  COBRANCA_VENCIDA: 'cobranca.vencida',
  PLANO_REBAIXADO: 'plano.rebaixado',

  // Segurança
  WEBHOOK_TOKEN_INVALIDO: 'webhook.token_invalido',
  SEGURANCA_RLS_AUSENTE: 'seguranca.rls_ausente',
} as const;

export type Evento = (typeof EVENTOS)[keyof typeof EVENTOS];

/** Rótulos em português para exibir o log de atividade na UI. */
export const ROTULO_EVENTO: Partial<Record<Evento, string>> = {
  'workspace.criado': 'criou o workspace',
  'quadro.criado': 'criou um quadro',
  'quadro.oficio_trocado': 'trocou o ofício do quadro',
  'pauta.criada': 'criou uma pauta',
  'pauta.movida': 'moveu uma pauta',
  'pauta.arquivada': 'arquivou uma pauta',
  'membro.entrou': 'entrou no workspace',
  'membro.removido': 'saiu do workspace',
  'assinatura.contratada': 'contratou um plano',
  'assinatura.cancelada': 'cancelou a assinatura',
  'cobranca.confirmada': 'teve um pagamento confirmado',
  'plano.rebaixado': 'voltou ao plano gratuito',
};
