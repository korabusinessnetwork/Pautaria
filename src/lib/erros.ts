/**
 * Erros, códigos estáveis e mensagens humanas.
 *
 * O front nunca decide comportamento lendo texto de erro. Texto muda numa
 * revisão de copy; código não. Toda falha que atravessa a camada de serviços
 * vira um `ErroApp` com `codigo` (contrato) e `mensagem` (para a pessoa).
 *
 * A tradução dos erros do Postgres merece explicação: o banco é a autoridade
 * sobre limite de plano e permissão (ver migrations 0007 e 0002), e ele fala em
 * SQLSTATE. Traduzir aqui, num lugar só, evita que cada tela invente o seu
 * jeito de interpretar um `42501`, e evita mostrar "new row violates
 * row-level security policy" para alguém que só queria criar um card.
 */

import type { PostgrestError } from '@supabase/supabase-js';

export type CodigoErro =
  | 'nao_autenticado'
  | 'sem_permissao'
  | 'entrada_invalida'
  | 'documento_invalido'
  | 'nao_encontrado'
  | 'plano_limite_atingido'
  | 'plano_ja_ativo'
  | 'plano_inexistente'
  | 'assinatura_inexistente'
  | 'convite_invalido'
  | 'conflito'
  | 'limite_de_requisicoes'
  | 'somente_leitura'
  | 'erro_no_provedor'
  | 'sem_conexao'
  | 'erro_interno';

export class ErroApp extends Error {
  constructor(
    readonly codigo: CodigoErro,
    mensagem: string,
    readonly causa?: unknown,
  ) {
    super(mensagem);
    this.name = 'ErroApp';
  }
}

/** Mensagem padrão por código, quando o servidor não mandou uma melhor. */
const MENSAGENS: Record<CodigoErro, string> = {
  nao_autenticado: 'Sua sessão expirou. Entre de novo para continuar.',
  sem_permissao: 'Você não tem permissão para isso neste workspace.',
  entrada_invalida: 'Confira os campos e tente de novo.',
  documento_invalido: 'CPF ou CNPJ inválido. Confira os dígitos.',
  nao_encontrado: 'Não encontramos o que você procura.',
  plano_limite_atingido: 'Seu plano atingiu o limite. Faça upgrade para continuar.',
  plano_ja_ativo: 'Este workspace já tem uma assinatura em andamento.',
  plano_inexistente: 'Plano indisponível.',
  assinatura_inexistente: 'Não há assinatura para este workspace.',
  convite_invalido: 'Convite inválido ou expirado.',
  conflito: 'Alguém alterou isso antes de você. Recarregue e tente de novo.',
  limite_de_requisicoes: 'Muitas tentativas em pouco tempo. Espere um instante.',
  somente_leitura: 'Este workspace está em modo somente leitura.',
  erro_no_provedor: 'O processador de pagamento não respondeu. Tente de novo em instantes.',
  sem_conexao: 'Sem conexão. Verifique sua internet e tente de novo.',
  erro_interno: 'Algo deu errado do nosso lado. Já estamos sabendo.',
};

/**
 * Converte um erro do PostgREST/Postgres em `ErroApp`.
 *
 * Os SQLSTATE que importam aqui:
 *   42501, permissão negada. Vem do GRANT de coluna (tentou escrever `plano`)
 *           ou de uma política de RLS que recusou o WITH CHECK.
 *   23505, violação de unicidade. Em `assinaturas`, é o índice parcial que
 *           impede duas assinaturas vivas, logo, "já tem plano".
 *   23503, FK violada. Em `pautas`, é a FK composta pegando etapa de outro
 *           ofício: dado corrompido, não erro do usuário.
 *   P0001, RAISE nosso. O `hint` carrega o código estável (ver 0007).
 *   PGRST116, o PostgREST não achou linha em `.single()`.
 */
export function deErroPostgrest(erro: PostgrestError | null): ErroApp | null {
  if (!erro) return null;

  // Os nossos RAISE carregam o código estável no `hint`. Ver app.erro_limite().
  const dica = erro.hint ?? '';
  if (dica === 'plano_limite_atingido') {
    return new ErroApp('plano_limite_atingido', erro.message, erro);
  }
  if (dica === 'convite_invalido') {
    return new ErroApp('convite_invalido', erro.message, erro);
  }

  switch (erro.code) {
    case '42501':
      return new ErroApp('sem_permissao', MENSAGENS.sem_permissao, erro);
    case '23505':
      return new ErroApp('conflito', 'Esse registro já existe.', erro);
    case '23503':
    case '23514':
      return new ErroApp('entrada_invalida', MENSAGENS.entrada_invalida, erro);
    case 'PGRST116':
      return new ErroApp('nao_encontrado', MENSAGENS.nao_encontrado, erro);
    case 'PGRST301':
    case '401':
      return new ErroApp('nao_autenticado', MENSAGENS.nao_autenticado, erro);
    case 'P0001':
      // RAISE nosso sem hint conhecido: a mensagem foi escrita para o usuário.
      return new ErroApp('entrada_invalida', erro.message, erro);
    default:
      return new ErroApp('erro_interno', MENSAGENS.erro_interno, erro);
  }
}

/** Erro vindo do envelope de uma Edge Function. */
export function deEnvelope(codigo: string, mensagem?: string): ErroApp {
  const conhecido = (codigo in MENSAGENS ? codigo : 'erro_interno') as CodigoErro;
  return new ErroApp(conhecido, mensagem || MENSAGENS[conhecido]);
}

/** Última barreira: qualquer coisa vira um ErroApp legível. */
export function normalizar(erro: unknown): ErroApp {
  if (erro instanceof ErroApp) return erro;
  if (erro instanceof TypeError && /fetch|network/i.test(erro.message)) {
    return new ErroApp('sem_conexao', MENSAGENS.sem_conexao, erro);
  }
  if (erro instanceof Error) {
    return new ErroApp('erro_interno', MENSAGENS.erro_interno, erro);
  }
  return new ErroApp('erro_interno', MENSAGENS.erro_interno, erro);
}

/** Estoura se houver erro; caso contrário devolve o dado já estreitado. */
export function ouEstoura<T>(dado: T | null, erro: PostgrestError | null): T {
  const convertido = deErroPostgrest(erro);
  if (convertido) throw convertido;
  if (dado === null || dado === undefined) {
    throw new ErroApp('nao_encontrado', MENSAGENS.nao_encontrado);
  }
  return dado;
}
