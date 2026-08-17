/**
 * Ordenação fracionária — mover um card sem renumerar a coluna.
 *
 * A posição de uma pauta é um `double precision`, não um índice inteiro.
 * Arrastar um card entre dois outros vira a média das posições vizinhas: um
 * UPDATE, uma linha. Com índice inteiro, o mesmo gesto exigiria reescrever
 * todas as pautas abaixo — e duas pessoas arrastando ao mesmo tempo
 * produziriam ordens diferentes, porque cada uma renumeraria a partir do que
 * viu.
 *
 * O limite conhecido da técnica: dividir ao meio repetidamente esgota a
 * precisão do `double` por volta da 50ª inserção **no mesmo ponto**. Na prática
 * isso não acontece num quadro de pautas; `precisaRenumerar` detecta o caso e
 * `renumerar` resolve, para o dia em que acontecer.
 */

/** Espaçamento entre posições de itens criados em sequência. */
export const PASSO = 1000;

/** Abaixo disto, a distância entre duas posições virou risco de colisão. */
const FOLGA_MINIMA = 0.0001;

/**
 * Posição para inserir entre duas vizinhas.
 * - sem nenhuma vizinha → primeiro item da coluna
 * - só `proxima`        → vai para o topo
 * - só `anterior`       → vai para o fim
 */
export function posicaoEntre(anterior?: number, proxima?: number): number {
  if (anterior === undefined && proxima === undefined) return PASSO;
  if (anterior === undefined) return (proxima as number) - PASSO;
  if (proxima === undefined) return anterior + PASSO;
  return (anterior + proxima) / 2;
}

/** Posição para acrescentar ao fim de uma coluna. */
export function posicaoAoFim(posicoes: number[]): number {
  if (posicoes.length === 0) return PASSO;
  return Math.max(...posicoes) + PASSO;
}

/** Posição para acrescentar ao topo de uma coluna. */
export function posicaoAoTopo(posicoes: number[]): number {
  if (posicoes.length === 0) return PASSO;
  return Math.min(...posicoes) - PASSO;
}

/**
 * Duas posições ficaram próximas demais? Chame `renumerar` na coluna.
 * Ordenar antes é intencional: a lista pode chegar em qualquer ordem.
 */
export function precisaRenumerar(posicoes: number[]): boolean {
  if (posicoes.length < 2) return false;
  const ordenadas = [...posicoes].sort((a, b) => a - b);
  for (let i = 1; i < ordenadas.length; i++) {
    if ((ordenadas[i] as number) - (ordenadas[i - 1] as number) < FOLGA_MINIMA) {
      return true;
    }
  }
  return false;
}

/** Redistribui as posições de uma coluna em múltiplos de PASSO, mantendo a ordem. */
export function renumerar<T extends { id: string; posicao: number }>(
  itens: T[],
): Array<{ id: string; posicao: number }> {
  return [...itens]
    .sort((a, b) => a.posicao - b.posicao)
    .map((item, i) => ({ id: item.id, posicao: (i + 1) * PASSO }));
}

/**
 * Calcula as vizinhas de um destino de drop.
 *
 * `destino` é o índice onde o card vai ficar dentro da coluna já **sem** ele.
 * Quem chama precisa remover o card arrastado da lista antes — senão, ao mover
 * dentro da própria coluna, ele entraria como vizinho de si mesmo e a posição
 * calculada não sairia do lugar.
 */
export function vizinhasNoDestino(
  posicoesDaColuna: number[],
  destino: number,
): { anterior?: number; proxima?: number } {
  const ordenadas = [...posicoesDaColuna].sort((a, b) => a - b);
  const indice = Math.max(0, Math.min(destino, ordenadas.length));
  return {
    anterior: indice > 0 ? ordenadas[indice - 1] : undefined,
    proxima: indice < ordenadas.length ? ordenadas[indice] : undefined,
  };
}
