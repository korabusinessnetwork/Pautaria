/**
 * Membros e convites (plano Time).
 *
 * O token do convite é gerado aqui, no browser, com `crypto.getRandomValues`,
 * e só o **hash** dele viaja para o banco. Isso significa que nem um dump do
 * Postgres nem um administrador com acesso ao painel conseguem reconstruir um
 * link de convite em aberto. O token existe em dois lugares: nesta função, por
 * alguns milissegundos, e no link que o dono do workspace envia.
 *
 * O preço dessa escolha é que não dá para "reenviar" um convite: o token
 * original não existe mais em lugar nenhum. Revoga-se e cria-se outro. É o
 * comportamento correto de qualquer segredo de uso único.
 */

import { supabase } from './supabase';
import { demo, seDemo } from './demo';
import { normalizar, ouEstoura, ErroApp } from './erros';
import { zMembro, type Membro, type Papel } from './tipos';
import { validarLista } from './validar';

export async function listarMembros(workspaceId: string): Promise<Membro[]> {
  const d = import.meta.env.DEV ? await seDemo(() => demo.membros()) : null;
  if (d) return d;

  const { data, error } = await supabase
    .from('workspace_members')
    .select('workspace_id, user_id, papel, profiles ( nome, iniciais, avatar_hue, email )')
    .eq('workspace_id', workspaceId);

  if (error) throw normalizar(error);

  // O PostgREST devolve o relacionamento como objeto ou array conforme a
  // cardinalidade que ele infere. Normalizamos antes de validar.
  const normalizado = (data ?? []).map((m) => ({
    ...m,
    profiles: Array.isArray(m.profiles) ? (m.profiles[0] ?? null) : m.profiles,
  }));

  return validarLista(zMembro, normalizado, 'workspace_members');
}

export interface Convite {
  id: string;
  email: string;
  papel: Papel;
  expiraEm: string;
  aceitoEm: string | null;
}

export async function listarConvites(workspaceId: string): Promise<Convite[]> {
  const d = import.meta.env.DEV ? await seDemo(() => demo.convites()) : null;
  if (d) return d;

  const { data, error } = await supabase
    .from('convites')
    .select('id, email, papel, expira_em, aceito_em')
    .eq('workspace_id', workspaceId)
    .is('aceito_em', null)
    .order('criado_em', { ascending: false });

  if (error) throw normalizar(error);

  return (data ?? []).map((c) => ({
    id: c.id as string,
    email: c.email as string,
    papel: c.papel as Papel,
    expiraEm: c.expira_em as string,
    aceitoEm: c.aceito_em as string | null,
  }));
}

/** 256 bits de entropia, em base64url. Impossível de adivinhar por força bruta. */
function gerarToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function hashDoToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const DIAS_DE_VALIDADE = 7;

export interface ConviteCriado {
  id: string;
  /** O link completo. **Única** vez em que o token existe, mostre e esqueça. */
  link: string;
}

export async function convidar(entrada: {
  workspaceId: string;
  email: string;
  papel: Exclude<Papel, 'owner'>;
}): Promise<ConviteCriado> {
  const email = entrada.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ErroApp('entrada_invalida', 'E-mail inválido.');
  }

  // Depois da validação: e-mail malformado é recusado com ou sem backend.
  const d = import.meta.env.DEV ? await seDemo(() => demo.convidar({ email, papel: entrada.papel })) : null;
  if (d) return d;

  const { data: sessao } = await supabase.auth.getSession();
  const userId = sessao.session?.user.id;
  if (!userId) throw new ErroApp('nao_autenticado', 'Entre para continuar.');

  const token = gerarToken();
  const expira = new Date(Date.now() + DIAS_DE_VALIDADE * 86_400_000);

  const { data, error } = await supabase
    .from('convites')
    .insert({
      workspace_id: entrada.workspaceId,
      email,
      papel: entrada.papel,
      token_hash: await hashDoToken(token),
      expira_em: expira.toISOString(),
      criado_por: userId,
    })
    .select('id')
    .single();

  const linha = ouEstoura(data, error);

  return {
    id: linha.id as string,
    link: `${window.location.origin}/convite?t=${token}`,
  };
}

export async function revogarConvite(id: string): Promise<void> {
  const d = import.meta.env.DEV ? await seDemo(() => {
    demo.revogarConvite(id);
    return true;
  }) : null;
  if (d) return;

  const { error } = await supabase.from('convites').delete().eq('id', id);
  if (error) throw normalizar(error);
}

/**
 * Aceita o convite. RPC porque quem aceita ainda não é membro e, pela RLS, nem
 * enxerga a linha do convite (migration 0008).
 */
export async function aceitarConvite(token: string): Promise<{
  workspaceId: string;
  slug: string;
}> {
  const d = import.meta.env.DEV ? await seDemo(() => {
    const ws = demo.porSlug();
    return { workspaceId: ws.id, slug: ws.slug };
  }) : null;
  if (d) return d;

  const { data, error } = await supabase.rpc('aceitar_convite', { p_token: token });
  const linha = ouEstoura(Array.isArray(data) ? data[0] : data, error);
  return { workspaceId: linha.workspace_id as string, slug: linha.slug as string };
}

export async function mudarPapel(
  workspaceId: string,
  userId: string,
  papel: Papel,
): Promise<void> {
  const d = import.meta.env.DEV ? await seDemo(() => {
    demo.mudarPapel(userId, papel);
    return true;
  }) : null;
  if (d) return;

  const { error } = await supabase
    .from('workspace_members')
    .update({ papel })
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId);
  if (error) throw normalizar(error);
}

/**
 * Remove um membro, ou sai do workspace, se for você mesmo. As duas ações
 * batem na mesma política de RLS (migration 0002), e o trigger
 * `proteger_ultimo_owner` impede deixar o workspace sem dono.
 */
export async function removerMembro(workspaceId: string, userId: string): Promise<void> {
  const d = import.meta.env.DEV ? await seDemo(() => {
    demo.removerMembro(userId);
    return true;
  }) : null;
  if (d) return;

  const { error } = await supabase
    .from('workspace_members')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId);
  if (error) throw normalizar(error);
}
