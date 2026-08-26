/**
 * Ponte para as Edge Functions.
 *
 * Toda operação de dinheiro passa por aqui. O front nunca escreve em
 * `assinaturas` ou `workspaces.plano`, nem conseguiria: o banco recusa por
 * privilégio de coluna (migration 0002). Este arquivo é, literalmente, o único
 * caminho do browser até a cobrança.
 */

import { supabase, urlFuncoes } from './supabase';
import { deEnvelope, ErroApp, normalizar } from './erros';

interface Envelope<T> {
  data: T | null;
  error: { codigo: string; mensagem: string } | null;
}

/** Timeout do lado do cliente: a UI não fica pendurada se a função travar. */
const TIMEOUT_MS = 20_000;

export async function chamarFuncao<T>(
  nome: string,
  corpo: Record<string, unknown>,
): Promise<T> {
  const { data: sessao } = await supabase.auth.getSession();
  const token = sessao.session?.access_token;

  if (!token) {
    throw new ErroApp('nao_autenticado', 'Sua sessão expirou. Entre de novo.');
  }

  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), TIMEOUT_MS);

  try {
    const resposta = await fetch(`${urlFuncoes}/${nome}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(corpo),
      signal: controle.signal,
    });

    const envelope = (await resposta.json()) as Envelope<T>;

    if (envelope.error) {
      throw deEnvelope(envelope.error.codigo, envelope.error.mensagem);
    }
    if (!resposta.ok || envelope.data === null) {
      throw new ErroApp('erro_interno', 'Resposta inesperada do servidor.');
    }
    return envelope.data;
  } catch (erro) {
    if (erro instanceof ErroApp) throw erro;
    if (erro instanceof DOMException && erro.name === 'AbortError') {
      throw new ErroApp(
        'sem_conexao',
        'A operação demorou demais. Verifique sua conexão e tente de novo.',
      );
    }
    throw normalizar(erro);
  } finally {
    clearTimeout(timer);
  }
}
