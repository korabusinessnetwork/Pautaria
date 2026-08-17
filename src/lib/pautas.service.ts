/**
 * Quadros e pautas — o dado operacional.
 *
 * Sobre `posicao`: é `double precision`, não um inteiro sequencial. Mover uma
 * pauta entre duas outras vira a média das vizinhas — um UPDATE de uma linha.
 * Com índice inteiro, o mesmo movimento renumeraria a coluna inteira, e duas
 * pessoas arrastando cards ao mesmo tempo produziriam ordens divergentes. Ver
 * `posicaoEntre` em `src/utils/ordenacao.ts`.
 */

import { supabase } from './supabase';
import { normalizar, ErroApp } from './erros';
import { zPauta, zQuadro, type Pauta, type Quadro } from './tipos';
import { validarLista, validarUm } from './validar';
import { posicaoAoFim, posicaoEntre } from '@/utils/ordenacao';

const CAMPOS_QUADRO = 'id, workspace_id, oficio_id, titulo, arquivado_em';
const CAMPOS_PAUTA = `
  id, workspace_id, quadro_id, oficio_id, etapa_id, titulo,
  campo1, campo2, prazo, responsavel_id, posicao, arquivada_em
`;

// ─────────────────────────────────────────────────────────────────────────────
// Quadros
// ─────────────────────────────────────────────────────────────────────────────

export async function listarQuadros(workspaceId: string): Promise<Quadro[]> {
  const { data, error } = await supabase
    .from('quadros')
    .select(CAMPOS_QUADRO)
    .eq('workspace_id', workspaceId)
    .is('arquivado_em', null)
    .order('criado_em');

  if (error) throw normalizar(error);
  return validarLista(zQuadro, data, 'quadros');
}

export async function criarQuadro(entrada: {
  workspaceId: string;
  oficioId: string;
  titulo: string;
}): Promise<Quadro> {
  const { data, error } = await supabase
    .from('quadros')
    .insert({
      workspace_id: entrada.workspaceId,
      oficio_id: entrada.oficioId,
      titulo: entrada.titulo.trim(),
    })
    .select(CAMPOS_QUADRO)
    .single();

  if (error) throw normalizar(error);
  return validarUm(zQuadro, data, 'quadros');
}

export async function renomearQuadro(id: string, titulo: string): Promise<void> {
  const { error } = await supabase
    .from('quadros')
    .update({ titulo: titulo.trim() })
    .eq('id', id);
  if (error) throw normalizar(error);
}

/**
 * Troca o ofício do quadro levando as pautas junto — "a pauta viaja junto".
 * RPC porque precisa ser atômica e mexe em coluna que o cliente não escreve
 * (migration 0008).
 */
export async function trocarOficioDoQuadro(
  quadroId: string,
  oficioId: string,
): Promise<void> {
  const { error } = await supabase.rpc('trocar_oficio_quadro', {
    p_quadro: quadroId,
    p_oficio: oficioId,
  });
  if (error) throw normalizar(error);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pautas
// ─────────────────────────────────────────────────────────────────────────────

export async function listarPautas(quadroId: string): Promise<Pauta[]> {
  const { data, error } = await supabase
    .from('pautas')
    .select(CAMPOS_PAUTA)
    .eq('quadro_id', quadroId)
    .is('arquivada_em', null)
    .order('posicao');

  if (error) throw normalizar(error);
  return validarLista(zPauta, data, 'pautas');
}

export interface NovaPauta {
  workspaceId: string;
  quadroId: string;
  oficioId: string;
  etapaId: string;
  titulo: string;
  campo1?: string | null;
  campo2?: string | null;
  prazo?: string | null;
  responsavelId?: string | null;
  /** Pautas já existentes na etapa, para calcular a posição final. */
  irmas?: Pauta[];
}

export async function criarPauta(entrada: NovaPauta): Promise<Pauta> {
  const titulo = entrada.titulo.trim();
  if (!titulo) {
    throw new ErroApp('entrada_invalida', 'A pauta precisa de um título.');
  }

  const { data, error } = await supabase
    .from('pautas')
    .insert({
      workspace_id: entrada.workspaceId,
      quadro_id: entrada.quadroId,
      oficio_id: entrada.oficioId,
      etapa_id: entrada.etapaId,
      titulo: titulo.slice(0, 200),
      // Campo vazio é NULL, nunca o traço '—' do protótipo: o traço é decisão
      // de renderização e não pode virar conteúdo salvo no banco.
      campo1: entrada.campo1?.trim() || null,
      campo2: entrada.campo2?.trim() || null,
      prazo: entrada.prazo || null,
      responsavel_id: entrada.responsavelId ?? null,
      posicao: posicaoAoFim(entrada.irmas?.map((p) => p.posicao) ?? []),
    })
    .select(CAMPOS_PAUTA)
    .single();

  if (error) throw normalizar(error);
  return validarUm(zPauta, data, 'pautas');
}

export interface CamposEditaveis {
  titulo?: string;
  campo1?: string | null;
  campo2?: string | null;
  prazo?: string | null;
  responsavelId?: string | null;
  etapaId?: string;
}

export async function atualizarPauta(
  id: string,
  campos: CamposEditaveis,
): Promise<Pauta> {
  const patch: Record<string, unknown> = {};
  if (campos.titulo !== undefined) patch.titulo = campos.titulo.trim().slice(0, 200);
  if (campos.campo1 !== undefined) patch.campo1 = campos.campo1?.trim() || null;
  if (campos.campo2 !== undefined) patch.campo2 = campos.campo2?.trim() || null;
  if (campos.prazo !== undefined) patch.prazo = campos.prazo || null;
  if (campos.responsavelId !== undefined) patch.responsavel_id = campos.responsavelId;
  if (campos.etapaId !== undefined) patch.etapa_id = campos.etapaId;

  const { data, error } = await supabase
    .from('pautas')
    .update(patch)
    .eq('id', id)
    .select(CAMPOS_PAUTA)
    .single();

  if (error) throw normalizar(error);
  return validarUm(zPauta, data, 'pautas');
}

/**
 * Move uma pauta para outra etapa, na posição indicada.
 *
 * `posicaoEntre` recebe as vizinhas de destino; nenhuma outra linha é tocada.
 * A FK composta `pautas_etapa_oficio_fk` garante que a etapa de destino é do
 * mesmo ofício — não há como arrastar um card para a coluna de outro quadro,
 * nem mesmo forjando a requisição.
 */
export async function moverPauta(entrada: {
  id: string;
  etapaId: string;
  anterior?: number;
  proxima?: number;
}): Promise<Pauta> {
  const { data, error } = await supabase
    .from('pautas')
    .update({
      etapa_id: entrada.etapaId,
      posicao: posicaoEntre(entrada.anterior, entrada.proxima),
    })
    .eq('id', entrada.id)
    .select(CAMPOS_PAUTA)
    .single();

  if (error) throw normalizar(error);
  return validarUm(zPauta, data, 'pautas');
}

/**
 * Arquivar em vez de apagar. O drawer chama isso no botão "Arquivar pauta":
 * a pauta some do quadro, o dado continua existindo, e um arrependimento é
 * reversível por SQL em vez de irreversível para sempre.
 */
export async function arquivarPauta(id: string): Promise<void> {
  const { error } = await supabase
    .from('pautas')
    .update({ arquivada_em: new Date().toISOString() })
    .eq('id', id);
  if (error) throw normalizar(error);
}

export async function desarquivarPauta(id: string): Promise<void> {
  const { error } = await supabase
    .from('pautas')
    .update({ arquivada_em: null })
    .eq('id', id);
  if (error) throw normalizar(error);
}

export async function listarArquivadas(quadroId: string): Promise<Pauta[]> {
  const { data, error } = await supabase
    .from('pautas')
    .select(CAMPOS_PAUTA)
    .eq('quadro_id', quadroId)
    .not('arquivada_em', 'is', null)
    .order('arquivada_em', { ascending: false })
    .limit(100);

  if (error) throw normalizar(error);
  return validarLista(zPauta, data, 'pautas (arquivadas)');
}

/** Exclusão definitiva. Só o caminho de "esvaziar arquivo" chega aqui. */
export async function excluirPauta(id: string): Promise<void> {
  const { error } = await supabase.from('pautas').delete().eq('id', id);
  if (error) throw normalizar(error);
}

/**
 * Realtime: o quadro de outro membro se move sozinho.
 *
 * O Realtime do Supabase aplica RLS na entrega — um membro do workspace A não
 * recebe evento do workspace B, mesmo assinando o canal. Ainda assim filtramos
 * por `quadro_id` no servidor para não trafegar o que a tela não vai usar.
 */
export function observarPautas(
  quadroId: string,
  aoMudar: () => void,
): () => void {
  const canal = supabase
    .channel(`quadro:${quadroId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'pautas', filter: `quadro_id=eq.${quadroId}` },
      aoMudar,
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(canal);
  };
}
