/**
 * Segurança — comparação em tempo constante, pseudonimização de IP e o balde
 * de rate limiting.
 */

import { salIp } from './ambiente.ts';
import { ErroApi } from './http.ts';
import type { ClienteAdmin } from './supabase.ts';

/**
 * Compara dois segredos sem vazar informação pelo tempo de execução.
 *
 * `a === b` em strings retorna assim que encontra o primeiro byte diferente.
 * Um atacante que mede o tempo de resposta consegue, com requisições
 * suficientes, descobrir o token byte a byte — o ataque clássico de timing.
 * Aqui percorremos o comprimento inteiro sempre, acumulando as diferenças em
 * XOR, e o tempo passa a ser função do tamanho, não do conteúdo.
 *
 * O comprimento em si vaza, e tudo bem: tokens do projeto têm tamanho fixo.
 */
export function iguaisEmTempoConstante(a: string, b: string): boolean {
  const bytesA = new TextEncoder().encode(a);
  const bytesB = new TextEncoder().encode(b);

  // Comprimentos diferentes já reprovam, mas ainda assim percorremos o mesmo
  // número de posições para não transformar o tamanho num atalho de medição.
  let diferenca = bytesA.length ^ bytesB.length;
  const n = Math.max(bytesA.length, bytesB.length);
  for (let i = 0; i < n; i++) {
    diferenca |= (bytesA[i] ?? 0) ^ (bytesB[i] ?? 0);
  }
  return diferenca === 0;
}

/**
 * HMAC-SHA256 do IP, em hex.
 *
 * Guardar IP em claro num log de auditoria é coletar dado pessoal que quase
 * nunca precisamos ler — e que, num vazamento, entrega geolocalização
 * aproximada de todos os usuários. Guardar o HMAC preserva o que realmente
 * usamos (duas tentativas vieram do mesmo lugar?) e descarta o que não usamos.
 * Precisa ser HMAC e não hash puro: o espaço de IPv4 tem 4 bilhões de valores,
 * então um SHA-256 sem chave é revertido por força bruta em minutos.
 */
export async function hashIp(ip: string | null): Promise<string | null> {
  if (!ip) return null;
  const chave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(salIp()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const assinatura = await crypto.subtle.sign(
    'HMAC',
    chave,
    new TextEncoder().encode(ip),
  );
  return Array.from(new Uint8Array(assinatura))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** IP do cliente atrás do proxy do Supabase. */
export function ipDaRequisicao(req: Request): string | null {
  const encaminhado = req.headers.get('x-forwarded-for');
  if (encaminhado) return encaminhado.split(',')[0]?.trim() ?? null;
  return req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip');
}

export interface LimiteConfig {
  /** Prefixo do balde: separa contextos (`checkout`, `webhook`, `portal`). */
  escopo: string;
  /** Quantas requisições a janela permite. */
  limite: number;
  /** Tamanho da janela, em segundos. */
  janelaSegundos: number;
}

/**
 * Consome uma unidade do balde e estoura 429 se acabou.
 *
 * A contagem vive no Postgres (`app.consumir_rate_limit`), não na memória da
 * função: Edge Functions escalam para várias instâncias, e um contador em
 * memória seria N vezes mais permissivo do que o configurado — exatamente sob
 * carga, que é quando ele importa.
 *
 * Falha aberta de propósito: se o banco estiver indisponível, a requisição
 * passa. Rate limit é proteção contra abuso, não controle de acesso; derrubar o
 * checkout de todo mundo porque o contador está fora do ar troca um problema
 * pequeno por um grande. O que nunca falha aberto é a autenticação.
 */
export async function aplicarRateLimit(
  admin: ClienteAdmin,
  identificador: string,
  config: LimiteConfig,
): Promise<void> {
  const chave = `${config.escopo}:${identificador}`;

  const { data, error } = await admin.rpc('consumir_rate_limit', {
    p_chave: chave,
    p_limite: config.limite,
    p_janela_s: config.janelaSegundos,
  });

  if (error) {
    console.warn('[rate_limit] indisponível, seguindo:', error.message);
    return;
  }

  const linha = Array.isArray(data) ? data[0] : data;
  if (linha && linha.permitido === false) {
    throw new ErroApi(
      'limite_de_requisicoes',
      'Muitas tentativas em pouco tempo. Espere um instante e tente de novo.',
    );
  }
}
