/**
 * Autenticação — cadastro, entrada, saída e recuperação.
 *
 * Duas decisões de segurança visíveis daqui:
 *
 * 1. **Não confirmamos nem negamos e-mail.** Tanto o cadastro quanto a
 *    recuperação respondem a mesma coisa para e-mail existente e inexistente.
 *    Uma resposta diferente para cada caso transforma o formulário num
 *    verificador de contas: quem quer atacar descobre quem é cliente antes de
 *    tentar senha.
 *
 * 2. **A sessão é responsabilidade do supabase-js.** Não guardamos token em
 *    lugar nenhum por conta própria; o cliente cuida do refresh rotativo
 *    configurado em `supabase/config.toml`.
 */

import { supabase } from './supabase';
import { demo, estaEmDemo, seDemo } from './demo';
import { ErroApp, normalizar } from './erros';
import { zPerfil, type Perfil } from './tipos';
import { validarUm } from './validar';
import type { Session } from '@supabase/supabase-js';

/**
 * Reexportado daqui de propósito. `Session` é um tipo do SDK, e o resto do app
 * é proibido de importar `@supabase/supabase-js` (regra do ESLint). Um tipo não
 * é acoplamento de runtime, mas deixar cada componente importar do SDK abriria
 * a porta para o próximo import ser o `createClient`. A camada de serviços
 * reexporta o que a UI precisa, e a fronteira continua sendo uma só.
 */
export type { Session };

export interface DadosCadastro {
  nome: string;
  email: string;
  senha: string;
}

/** Espelha `auth.password` do config.toml. Validar aqui é gentileza; o servidor decide. */
export const SENHA_MINIMA = 10;

export function forcaDaSenha(senha: string): {
  valida: boolean;
  faltando: string[];
} {
  const faltando: string[] = [];
  if (senha.length < SENHA_MINIMA) faltando.push(`pelo menos ${SENHA_MINIMA} caracteres`);
  if (!/[a-z]/.test(senha)) faltando.push('uma letra minúscula');
  if (!/[A-Z]/.test(senha)) faltando.push('uma letra maiúscula');
  if (!/[0-9]/.test(senha)) faltando.push('um número');
  return { valida: faltando.length === 0, faltando };
}

export async function cadastrar({ nome, email, senha }: DadosCadastro): Promise<void> {
  const forca = forcaDaSenha(senha);
  if (!forca.valida) {
    throw new ErroApp(
      'entrada_invalida',
      `A senha precisa de ${forca.faltando.join(', ')}.`,
    );
  }

  // O desvio vem depois da validação, não antes: a demonstração precisa recusar
  // uma senha fraca com a mesma mensagem que o app real recusa.
  const d = import.meta.env.DEV ? await seDemo(() => true) : null;
  if (d) return;

  const { error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password: senha,
    options: {
      // Vira `raw_user_meta_data` e alimenta o trigger que cria o profile (0002).
      data: { nome: nome.trim() },
      emailRedirectTo: `${window.location.origin}/entrar`,
    },
  });

  if (error) {
    // Senha vazada (HIBP) tem mensagem própria: é acionável, e o usuário
    // precisa entender por que uma senha "forte" foi recusada.
    if (/pwned|compromised|breach/i.test(error.message)) {
      throw new ErroApp(
        'entrada_invalida',
        'Essa senha apareceu em vazamentos públicos. Escolha outra.',
      );
    }
    if (/already registered|already exists/i.test(error.message)) {
      // Não vazamos a existência da conta. O usuário recebe o mesmo caminho de
      // sempre; se a conta já existe, o Supabase manda um e-mail avisando.
      return;
    }
    throw normalizar(error);
  }
}

export async function entrar(email: string, senha: string): Promise<Session> {
  const d = import.meta.env.DEV ? await seDemo(() => demo.sessao()) : null;
  if (d) return d;

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password: senha,
  });

  if (error || !data.session) {
    // Mensagem única para senha errada e e-mail inexistente — de novo, para não
    // transformar o login num oráculo de "esse e-mail tem conta aqui".
    throw new ErroApp('nao_autenticado', 'E-mail ou senha incorretos.');
  }
  return data.session;
}

export async function sair(): Promise<void> {
  const d = import.meta.env.DEV ? await seDemo(() => true) : null;
  if (d) return;

  const { error } = await supabase.auth.signOut();
  if (error) throw normalizar(error);
}

export async function pedirRecuperacao(email: string): Promise<void> {
  const d = import.meta.env.DEV ? await seDemo(() => true) : null;
  if (d) return;

  await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${window.location.origin}/nova-senha`,
  });
  // Sem checar erro de propósito: a resposta é sempre a mesma, exista a conta
  // ou não. Ver a decisão nº 1 no topo do arquivo.
}

export async function definirNovaSenha(senha: string): Promise<void> {
  const forca = forcaDaSenha(senha);
  if (!forca.valida) {
    throw new ErroApp('entrada_invalida', `A senha precisa de ${forca.faltando.join(', ')}.`);
  }

  const d = import.meta.env.DEV ? await seDemo(() => true) : null;
  if (d) return;

  const { error } = await supabase.auth.updateUser({ password: senha });
  if (error) throw normalizar(error);
}

export async function sessaoAtual(): Promise<Session | null> {
  // Envelopado em `{ v }` porque `null` é resposta legítima aqui: sem a caixa,
  // um valor nulo do modo demo cairia no caminho real e falaria com o Supabase.
  const d = import.meta.env.DEV ? await seDemo(() => ({ v: demo.sessao() })) : null;
  if (d) return d.v;

  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function meuPerfil(): Promise<Perfil | null> {
  const d = import.meta.env.DEV ? await seDemo(() => ({ v: demo.perfil() })) : null;
  if (d) return d.v;

  const { data: sessao } = await supabase.auth.getSession();
  const userId = sessao.session?.user.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, nome, email, iniciais, avatar_hue')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw normalizar(error);
  if (!data) return null;
  return validarUm(zPerfil, data, 'profiles');
}

export async function atualizarPerfil(campos: {
  nome?: string;
  iniciais?: string;
}): Promise<void> {
  const d = import.meta.env.DEV ? await seDemo(() => {
    demo.atualizarPerfil(campos);
    return true;
  }) : null;
  if (d) return;

  const { data: sessao } = await supabase.auth.getSession();
  const userId = sessao.session?.user.id;
  if (!userId) throw new ErroApp('nao_autenticado', 'Entre para continuar.');

  const { error } = await supabase
    .from('profiles')
    .update({
      ...(campos.nome !== undefined ? { nome: campos.nome.trim() } : {}),
      ...(campos.iniciais !== undefined
        ? { iniciais: campos.iniciais.trim().slice(0, 2).toUpperCase() }
        : {}),
    })
    .eq('id', userId);

  if (error) throw normalizar(error);
}

/** Assina mudanças de sessão (login em outra aba, expiração, logout). */
export function observarSessao(
  callback: (sessao: Session | null) => void,
): () => void {
  // A única função síncrona do arquivo, então sem `seDemo`. Não chamamos o
  // callback: em demonstração a sessão nunca muda sozinha, e emitir `null` aqui
  // derrubaria o app para a tela de login logo depois de entrar.
  if (estaEmDemo()) return () => {};

  const { data } = supabase.auth.onAuthStateChange((_evento, sessao) => {
    callback(sessao);
  });
  return () => data.subscription.unsubscribe();
}
