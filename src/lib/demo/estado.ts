/**
 * Modo demonstração — o front rodando sem backend nenhum.
 *
 * Existe por uma razão prática: até aqui, `npm run dev` sem `.env` mostrava a
 * tela de configuração ausente e parava. Nenhuma tela autenticada podia ser
 * vista, revisada contra o design, ou testada. Construir front antes do back
 * exigia um jeito de rodar o front sem back.
 *
 * A camada de serviços (`src/lib/*.service.ts`) já era a única fronteira com o
 * backend — decisão do ADR-001, tomada para permitir trocar de provedor. Aqui
 * ela paga um dividendo que não estava previsto: dá para não ter provedor
 * nenhum, e nenhum componente percebe a diferença.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE `import.meta.env.DEV` E NÃO UMA VARIÁVEL `VITE_`
 *
 * O caminho óbvio seria uma variável do prefixo público. Ele esbarra em `memory/restrictions.md`
 * S1: só existem duas variáveis `VITE_*`, e uma terceira seria bug de segurança
 * por construção — o plugin `exigirAmbiente` aborta o build de produção se
 * encontrar qualquer outra.
 *
 * `import.meta.env.DEV` não é variável de ambiente: é um literal que o Vite
 * substitui por `false` no build de produção, permitindo ao minificador remover
 * o código de demonstração do bundle publicado — o mesmo mecanismo de eliminação
 * de código morto que causou o bug B1 (`memory/learnings.md` A1), usado agora de
 * propósito e a nosso favor.
 *
 * **A eliminação não é automática.** Ela depende de cada chamador usar o padrão
 * do docblock de `seDemo` abaixo. Escrever `await seDemo(...)` sem o ternário
 * constrói a closure em produção, e a referência a `demo.*` arrasta os dados
 * fictícios inteiros de volta para o bundle. Foi o bug B7.
 *
 * A garantia é verificável, e é verificada: o gate confere que nem o marcador
 * nem os dados de demonstração aparecem em `dist/`.
 *
 * (O comentário acima evita soletrar o nome da variável proibida de propósito:
 * `scripts/checar-segredos.sh` varre os arquivos de build atrás de qualquer
 * `VITE_` fora da lista autorizada e não distingue comentário de código. Manter
 * o scanner estrito vale mais que a conveniência de citar o nome.)
 */

/** Marcador procurado no bundle de produção. Não deve existir lá. */
export const MARCADOR_DEMO = 'MODO_DEMONSTRACAO';

const CHAVE = 'pautaria.demo';

/**
 * `true` quando o app deve responder com dados fixos em vez de falar com o
 * Supabase.
 *
 * `import.meta.env.DEV` vem primeiro na condição de propósito: sendo um literal
 * `false` em produção, o `&&` inteiro é resolvido em tempo de build e todo o
 * resto vira código inalcançável.
 */
export function estaEmDemo(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    // `?demo=1` liga a demonstração já no primeiro carregamento, antes de
    // qualquer componente montar. Serve para compartilhar um link de
    // demonstração em desenvolvimento e para automação (captura de tela,
    // teste de ponta a ponta) — que não teria como escrever no sessionStorage
    // antes de a página existir.
    if (new URLSearchParams(window.location.search).get('demo') === '1') {
      sessionStorage.setItem(CHAVE, '1');
      return true;
    }
    return sessionStorage.getItem(CHAVE) === '1';
  } catch {
    // Navegador com armazenamento bloqueado: sem demo, e sem quebrar.
    return false;
  }
}

export function ativarDemo(): void {
  if (!import.meta.env.DEV) return;
  try {
    sessionStorage.setItem(CHAVE, '1');
  } catch {
    /* silencioso: é conveniência de desenvolvimento, não funcionalidade */
  }
}

export function desativarDemo(): void {
  try {
    sessionStorage.removeItem(CHAVE);
  } catch {
    /* idem */
  }
}

/**
 * Simula a latência da rede.
 *
 * Sem isso, todo estado de carregamento passa batido em desenvolvimento — e
 * estados de carregamento são requisito do princípio nº 1 (`CLAUDE.md`). Um
 * front que só é visto instantâneo é um front cujos spinners ninguém revisou.
 */
export function demora<T>(valor: T, ms = 180): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(valor), ms));
}

/**
 * Envolve uma função de serviço: em modo demo devolve o dado fixo; fora dele,
 * executa o caminho real. É o único ponto de contato entre a demonstração e a
 * camada de serviços.
 *
 * O padrão de chamada é **obrigatoriamente** este, com o ternário:
 *
 *     export async function listarQuadros(ws: string) {
 *       const d = import.meta.env.DEV ? await seDemo(() => demo.quadros(ws)) : null;
 *       if (d) return d;
 *       …caminho real com supabase…
 *     }
 *
 * O ternário não é estilo: sem ele, a closure `() => demo.quadros(ws)` é
 * construída mesmo em produção, e essa referência mantém `dados.ts` vivo no
 * grafo do bundler. Com ele, a expressão inteira vira `null` em tempo de build.
 * O CI reprova o build se encontrar vestígio de demonstração em `dist/`.
 *
 * Quando o retorno legítimo puder ser `null`, envolva numa caixa — `{ v }` —
 * para que um nulo verdadeiro não seja confundido com "não está em demo".
 */
export async function seDemo<T>(
  produzir: () => T,
  ms?: number,
): Promise<T | null> {
  if (!estaEmDemo()) return null;
  return demora(produzir(), ms);
}
