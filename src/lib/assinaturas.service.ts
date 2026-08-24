/**
 * Assinaturas — leitura direta, escrita só por Edge Function.
 *
 * A assimetria deste arquivo é o desenho de segurança do produto inteiro:
 * `carregar*` fala com o banco (a RLS deixa dono e admin lerem); `contratar`,
 * `cancelar` e `abrirFatura` chamam Edge Functions. Não existe caminho do
 * browser até uma escrita em `assinaturas` — o banco recusaria de qualquer
 * forma, mas a camada de serviços deixa isso explícito para quem lê o código.
 */

import { supabase } from './supabase';
import { demo, seDemo } from './demo';
import { normalizar } from './erros';
import { chamarFuncao } from './edge';
import {
  zAssinatura,
  zPlanoCatalogo,
  type Assinatura,
  type Ciclo,
  type PlanoCatalogo,
} from './tipos';
import { validarLista, validarUm } from './validar';

// ─────────────────────────────────────────────────────────────────────────────
// Leitura
// ─────────────────────────────────────────────────────────────────────────────

/** Catálogo público — a página de preços funciona sem login. */
export async function listarPlanos(): Promise<PlanoCatalogo[]> {
  const d = import.meta.env.DEV ? await seDemo(() => demo.planos()) : null;
  if (d) return d;

  const { data, error } = await supabase
    .from('planos')
    .select('chave, nome, chamada, preco_mensal_centavos, preco_anual_centavos, limites, destaques, ordem')
    .order('ordem');

  if (error) throw normalizar(error);
  return validarLista(zPlanoCatalogo, data, 'planos');
}

export async function carregarAssinatura(workspaceId: string): Promise<Assinatura | null> {
  // `{ v }` porque `null` é resposta válida — workspace sem assinatura viva.
  // Sem a caixa, esse nulo cairia no caminho real e chamaria o Supabase.
  const d = import.meta.env.DEV ? await seDemo(() => ({ v: demo.assinatura() })) : null;
  if (d) return d.v;

  const { data, error } = await supabase
    .from('assinaturas')
    .select('id, plano, ciclo, status, valor_centavos, proxima_cobranca, fim_periodo, cancelada_em')
    .eq('workspace_id', workspaceId)
    .in('status', ['pendente', 'ativa', 'inadimplente'])
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw normalizar(error);
  if (!data) return null;
  return validarUm(zAssinatura, data, 'assinaturas');
}

export interface LinhaCobranca {
  id: string;
  status: string;
  valorCentavos: number;
  vencimento: string | null;
  pagoEm: string | null;
  urlFatura: string | null;
  formaPagamento: string | null;
}

export async function listarCobrancas(workspaceId: string): Promise<LinhaCobranca[]> {
  const d = import.meta.env.DEV ? await seDemo(() => demo.cobrancas()) : null;
  if (d) return d;

  const { data, error } = await supabase
    .from('cobrancas')
    .select('id, status, valor_centavos, vencimento, pago_em, url_fatura, forma_pagamento')
    .eq('workspace_id', workspaceId)
    .order('vencimento', { ascending: false })
    .limit(24);

  if (error) throw normalizar(error);

  return (data ?? []).map((c) => ({
    id: c.id as string,
    status: c.status as string,
    valorCentavos: c.valor_centavos as number,
    vencimento: c.vencimento as string | null,
    pagoEm: c.pago_em as string | null,
    urlFatura: c.url_fatura as string | null,
    formaPagamento: c.forma_pagamento as string | null,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Escrita — sempre via Edge Function
// ─────────────────────────────────────────────────────────────────────────────

export interface DadosContratacao {
  workspaceId: string;
  plano: 'estudio' | 'time';
  ciclo: Ciclo;
  nomeCobranca: string;
  documento: string;
  telefone?: string;
}

export interface RespostaContratacao {
  assinaturaId: string;
  plano: string;
  ciclo: Ciclo;
  valorCentavos: number;
  /** Fatura hospedada pela Asaas. É para lá que o front redireciona. */
  urlPagamento: string | null;
  /** `true` quando a Asaas ainda não gerou a fatura; use o portal em seguida. */
  aguardandoFatura: boolean;
}

/**
 * Contrata o plano. Repare no que **não** é enviado: valor. O preço é lido da
 * tabela `planos` dentro da Edge Function. Mandar valor daqui deixaria o
 * cliente escolher quanto pagar.
 */
export async function contratar(dados: DadosContratacao): Promise<RespostaContratacao> {
  const d = import.meta.env.DEV ? await seDemo(() => demo.contratar(dados)) : null;
  if (d) return d;

  return chamarFuncao<RespostaContratacao>('assinatura-criar', {
    workspaceId: dados.workspaceId,
    plano: dados.plano,
    ciclo: dados.ciclo,
    nomeCobranca: dados.nomeCobranca,
    documento: dados.documento,
    telefone: dados.telefone ?? '',
  });
}

export interface RespostaPortal {
  plano: string;
  ciclo: Ciclo;
  status: string;
  valorCentavos: number;
  proximaCobranca: string | null;
  fimPeriodo: string | null;
  urlPagamento: string | null;
  vencimento: string | null;
}

/** Recupera a fatura em aberto (boleto vencido, Pix expirado, aba fechada). */
export async function abrirFatura(workspaceId: string): Promise<RespostaPortal> {
  const d = import.meta.env.DEV ? await seDemo(() => demo.abrirFatura()) : null;
  if (d) return d;

  return chamarFuncao<RespostaPortal>('assinatura-portal', { workspaceId });
}

export interface RespostaCancelamento {
  cancelada: boolean;
  /** Até quando o acesso pago continua valendo. */
  acessoAte: string | null;
}

export async function cancelar(
  workspaceId: string,
  motivo?: string,
): Promise<RespostaCancelamento> {
  const d = import.meta.env.DEV ? await seDemo(() => demo.cancelar()) : null;
  if (d) return d;

  return chamarFuncao<RespostaCancelamento>('assinatura-cancelar', {
    workspaceId,
    motivo: motivo ?? '',
  });
}
