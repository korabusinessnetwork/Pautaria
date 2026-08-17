/**
 * Ofícios — a configuração que define o produto.
 *
 * Uma consulta traz o ofício com etapas e templates aninhados. Não é
 * otimização prematura: sem isso seriam três viagens ao servidor para montar a
 * primeira tela, e a promessa do produto é justamente que o quadro apareça
 * pronto. Latência aqui é a diferença entre "se adaptou a mim" e "está
 * carregando".
 */

import { supabase } from './supabase';
import { normalizar } from './erros';
import { zOficio, type Oficio } from './tipos';
import { validarLista, validarUm } from './validar';

const CAMPOS = `
  id, workspace_id, chave, nome, descricao, glifo, hue, chroma,
  titulo_quadro, campo1_label, campo2_label, mono, solo, ordem,
  oficio_etapas ( id, nome, ordem ),
  oficio_templates ( id, nome, campo1, campo2, ordem )
`;

/**
 * Ofícios do sistema — os três da tela de abertura. Disponíveis a qualquer
 * usuário autenticado, sem workspace ainda criado.
 */
export async function listarOficiosDoSistema(): Promise<Oficio[]> {
  const { data, error } = await supabase
    .from('oficios')
    .select(CAMPOS)
    .is('workspace_id', null)
    .order('ordem');

  if (error) throw normalizar(error);
  return validarLista(zOficio, data, 'oficios (sistema)');
}

/** Do sistema + os próprios do workspace. É o que a sidebar lista. */
export async function listarOficiosDisponiveis(workspaceId: string): Promise<Oficio[]> {
  const { data, error } = await supabase
    .from('oficios')
    .select(CAMPOS)
    .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
    .order('ordem');

  if (error) throw normalizar(error);
  return validarLista(zOficio, data, 'oficios');
}

export async function buscarOficio(id: string): Promise<Oficio> {
  const { data, error } = await supabase
    .from('oficios')
    .select(CAMPOS)
    .eq('id', id)
    .single();

  if (error) throw normalizar(error);
  return validarUm(zOficio, data, 'oficios');
}

export interface NovoOficio {
  workspaceId: string;
  chave: string;
  nome: string;
  descricao?: string;
  glifo?: string;
  hue: number;
  chroma?: number;
  tituloQuadro: string;
  campo1Label: string;
  campo2Label: string;
  mono?: boolean;
  solo?: boolean;
  etapas: string[];
  templates?: string[];
}

/**
 * Cria um ofício próprio do workspace (planos Estúdio e Time).
 *
 * O trigger `limitar_oficios_personalizados` (migration 0007) recusa no plano
 * Solo — a UI já desabilita o caminho, mas a recusa que vale é a do banco.
 */
export async function criarOficio(entrada: NovoOficio): Promise<Oficio> {
  const { data: oficio, error } = await supabase
    .from('oficios')
    .insert({
      workspace_id: entrada.workspaceId,
      chave: entrada.chave,
      nome: entrada.nome,
      descricao: entrada.descricao ?? '',
      glifo: entrada.glifo ?? '●',
      hue: entrada.hue,
      chroma: entrada.chroma ?? 0.13,
      titulo_quadro: entrada.tituloQuadro,
      campo1_label: entrada.campo1Label,
      campo2_label: entrada.campo2Label,
      mono: entrada.mono ?? false,
      solo: entrada.solo ?? false,
      ordem: 90,
    })
    .select('id')
    .single();

  if (error) throw normalizar(error);

  const oficioId = (oficio as { id: string }).id;

  const { error: erroEtapas } = await supabase.from('oficio_etapas').insert(
    entrada.etapas.map((nome, i) => ({ oficio_id: oficioId, nome, ordem: i })),
  );
  if (erroEtapas) throw normalizar(erroEtapas);

  if (entrada.templates?.length) {
    const { error: erroTemplates } = await supabase.from('oficio_templates').insert(
      entrada.templates.map((nome, i) => ({ oficio_id: oficioId, nome, ordem: i })),
    );
    if (erroTemplates) throw normalizar(erroTemplates);
  }

  return buscarOficio(oficioId);
}

export async function excluirOficio(id: string): Promise<void> {
  const { error } = await supabase.from('oficios').delete().eq('id', id);
  if (error) throw normalizar(error);
}
