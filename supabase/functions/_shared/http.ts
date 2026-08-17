/**
 * HTTP — envelope de resposta, CORS e leitura segura de corpo.
 *
 * Todas as funções respondem no mesmo formato:
 *
 *     { "data": {...}, "error": null }
 *     { "data": null,  "error": { "codigo": "plano_ja_ativo", "mensagem": "…" } }
 *
 * O `codigo` é a parte estável do contrato — o front decide comportamento por
 * ele. A `mensagem` é para o humano e pode mudar sem quebrar nada. Casar erro
 * por texto é o tipo de acoplamento que quebra silenciosamente na primeira
 * revisão de copy.
 */

import { origensPermitidas } from './ambiente.ts';

/** Códigos de erro do contrato. Adicionar aqui e em docs/07_APIS. */
export type CodigoErro =
  | 'nao_autenticado'
  | 'sem_permissao'
  | 'entrada_invalida'
  | 'documento_invalido'
  | 'nao_encontrado'
  | 'plano_ja_ativo'
  | 'plano_inexistente'
  | 'assinatura_inexistente'
  | 'limite_de_requisicoes'
  | 'erro_no_provedor'
  | 'metodo_nao_suportado'
  | 'corpo_grande_demais'
  | 'erro_interno';

const STATUS: Record<CodigoErro, number> = {
  nao_autenticado: 401,
  sem_permissao: 403,
  entrada_invalida: 422,
  documento_invalido: 422,
  nao_encontrado: 404,
  plano_ja_ativo: 409,
  plano_inexistente: 422,
  assinatura_inexistente: 404,
  limite_de_requisicoes: 429,
  erro_no_provedor: 502,
  metodo_nao_suportado: 405,
  corpo_grande_demais: 413,
  erro_interno: 500,
};

export class ErroApi extends Error {
  constructor(
    readonly codigo: CodigoErro,
    mensagem: string,
    readonly detalhe?: unknown,
  ) {
    super(mensagem);
    this.name = 'ErroApi';
  }
}

/**
 * CORS com origem espelhada a partir de uma lista fechada.
 *
 * `Access-Control-Allow-Origin: *` seria mais simples e estaria errado: estas
 * funções recebem o JWT do usuário no cabeçalho `Authorization`, e um curinga
 * autorizaria qualquer site a fazer o browser de alguém logado disparar
 * chamadas autenticadas. Origem desconhecida não recebe cabeçalho de CORS
 * algum — o browser corta antes da resposta chegar ao script.
 */
export function cabecalhosCors(origem: string | null): Record<string, string> {
  const permitidas = origensPermitidas();
  const base: Record<string, string> = {
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, asaas-access-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origem && permitidas.includes(origem)) {
    base['Access-Control-Allow-Origin'] = origem;
    base['Access-Control-Allow-Credentials'] = 'true';
  }
  return base;
}

/** Cabeçalhos de segurança aplicados a toda resposta. */
const SEGURANCA: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
};

export function responderOk<T>(dados: T, origem: string | null, status = 200): Response {
  return new Response(JSON.stringify({ data: dados, error: null }), {
    status,
    headers: { ...SEGURANCA, ...cabecalhosCors(origem) },
  });
}

export function responderErro(erro: unknown, origem: string | null): Response {
  const api = erro instanceof ErroApi
    ? erro
    : new ErroApi('erro_interno', 'Algo deu errado do nosso lado. Tente de novo.');

  // O detalhe interno fica no log do servidor; o cliente recebe só código e
  // mensagem. Vazar stack trace numa API de cobrança é dar o mapa da casa.
  if (!(erro instanceof ErroApi)) {
    console.error('[erro_nao_tratado]', erro instanceof Error ? erro.message : String(erro));
  }

  return new Response(
    JSON.stringify({ data: null, error: { codigo: api.codigo, mensagem: api.message } }),
    { status: STATUS[api.codigo], headers: { ...SEGURANCA, ...cabecalhosCors(origem) } },
  );
}

export function responderPreflight(origem: string | null): Response {
  return new Response(null, { status: 204, headers: cabecalhosCors(origem) });
}

/**
 * Lê o corpo JSON com teto de tamanho.
 *
 * Sem o teto, um POST de 200 MB é aceito, bufferizado na memória da função e
 * cobrado como tempo de execução — negação de serviço barata contra um endpoint
 * que precisa ficar público. 256 KB é folgado para qualquer payload nosso e
 * para os da Asaas.
 */
const TETO_CORPO = 256 * 1024;

export async function lerJson(req: Request): Promise<unknown> {
  const declarado = req.headers.get('content-length');
  if (declarado && Number(declarado) > TETO_CORPO) {
    throw new ErroApi('corpo_grande_demais', 'Corpo da requisição grande demais.');
  }

  const bruto = await req.text();
  if (bruto.length > TETO_CORPO) {
    throw new ErroApi('corpo_grande_demais', 'Corpo da requisição grande demais.');
  }
  if (bruto.trim() === '') return {};

  try {
    return JSON.parse(bruto);
  } catch {
    throw new ErroApi('entrada_invalida', 'Corpo da requisição não é JSON válido.');
  }
}

export function exigirMetodo(req: Request, metodo: 'POST'): void {
  if (req.method !== metodo) {
    throw new ErroApi('metodo_nao_suportado', `Use ${metodo}.`);
  }
}

/**
 * Envolve o handler: trata preflight, captura erro e garante que toda saída
 * tenha envelope e cabeçalhos. Nenhuma função exporta um `serve` cru.
 */
export function comEnvelope(
  handler: (req: Request, origem: string | null) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const origem = req.headers.get('origin');
    if (req.method === 'OPTIONS') return responderPreflight(origem);
    try {
      return await handler(req, origem);
    } catch (erro) {
      return responderErro(erro, origem);
    }
  };
}
