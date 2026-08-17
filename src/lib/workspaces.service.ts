/**
 * Workspaces — o tenant.
 *
 * Nenhuma função aqui escreve `plano`, `status` ou `plano_expira_em`: o grant
 * de coluna do banco não permite (migration 0002), e é assim de propósito. Se
 * alguma tela precisar mudar plano, o caminho é `assinaturas.service.ts` →
 * Edge Function.
 */

import { supabase } from './supabase';
import { normalizar, ouEstoura, ErroApp } from './erros';
import { zWorkspace, zUso, type Workspace, type Uso } from './tipos';
import { validarLista, validarUm } from './validar';

const CAMPOS = 'id, nome, slug, plano, status, tema, plano_expira_em';

export async function listarMeusWorkspaces(): Promise<Workspace[]> {
  const { data, error } = await supabase
    .from('workspaces')
    .select(CAMPOS)
    .order('criado_em', { ascending: true });

  if (error) throw normalizar(error);
  return validarLista(zWorkspace, data, 'workspaces');
}

export async function buscarPorSlug(slug: string): Promise<Workspace | null> {
  const { data, error } = await supabase
    .from('workspaces')
    .select(CAMPOS)
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw normalizar(error);
  if (!data) return null;
  return validarUm(zWorkspace, data, 'workspaces');
}

export interface NovoWorkspace {
  nome: string;
  oficioChave: string;
  semear?: boolean;
}

/**
 * Cria o workspace com o quadro e as pautas de exemplo, tudo numa transação
 * (RPC `criar_workspace`, migration 0008).
 *
 * Fazer isso em três chamadas do cliente pareceria mais simples e criaria um
 * caso ruim: falhar entre a segunda e a terceira deixa o usuário num workspace
 * com quadro vazio, sem saber o que aconteceu — e sem caminho de volta, porque
 * o limite do plano Solo já foi consumido pelo quadro que ele não pediu.
 */
export async function criarWorkspace(entrada: NovoWorkspace): Promise<{
  workspaceId: string;
  slug: string;
  quadroId: string;
}> {
  const nome = entrada.nome.trim();
  if (nome.length < 1 || nome.length > 60) {
    throw new ErroApp('entrada_invalida', 'O nome precisa ter entre 1 e 60 caracteres.');
  }

  const { data, error } = await supabase.rpc('criar_workspace', {
    p_nome: nome,
    p_oficio_chave: entrada.oficioChave,
    p_semear: entrada.semear ?? true,
  });

  const linha = ouEstoura(Array.isArray(data) ? data[0] : data, error);
  return {
    workspaceId: linha.workspace_id as string,
    slug: linha.slug as string,
    quadroId: linha.quadro_id as string,
  };
}

export async function renomearWorkspace(id: string, nome: string): Promise<void> {
  const { error } = await supabase
    .from('workspaces')
    .update({ nome: nome.trim() })
    .eq('id', id);
  if (error) throw normalizar(error);
}

/** White-label: a identidade visual do tenant. */
export async function salvarTema(
  id: string,
  tema: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from('workspaces').update({ tema }).eq('id', id);
  if (error) throw normalizar(error);
}

export async function excluirWorkspace(id: string): Promise<void> {
  const { error } = await supabase.from('workspaces').delete().eq('id', id);
  if (error) throw normalizar(error);
}

/**
 * Uso vs. limites. É o que permite desabilitar o botão *antes* do clique —
 * prevenção de erro em vez de mensagem de erro (CLAUDE.md, princípio nº 1).
 * A view respeita RLS via `security_invoker` (migration 0007).
 */
export async function carregarUso(workspaceId: string): Promise<Uso | null> {
  const { data, error } = await supabase
    .from('v_uso_workspace')
    .select('workspace_id, plano, plano_nome, status, quadros, pautas, membros, convites_abertos, limites')
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (error) throw normalizar(error);
  if (!data) return null;
  return validarUm(zUso, data, 'v_uso_workspace');
}

/** Meu papel neste workspace — define o que a UI mostra e o que ela esconde. */
export async function meuPapel(workspaceId: string): Promise<'owner' | 'admin' | 'membro' | null> {
  const { data: sessao } = await supabase.auth.getSession();
  const userId = sessao.session?.user.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from('workspace_members')
    .select('papel')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw normalizar(error);
  return (data?.papel as 'owner' | 'admin' | 'membro' | undefined) ?? null;
}
