import { describe, expect, it } from 'vitest';
import {
  PASSO,
  posicaoAoFim,
  posicaoAoTopo,
  posicaoEntre,
  precisaRenumerar,
  renumerar,
  vizinhasNoDestino,
} from './ordenacao';

describe('posicaoEntre', () => {
  it('devolve o passo quando a coluna está vazia', () => {
    expect(posicaoEntre()).toBe(PASSO);
  });

  it('coloca antes da primeira quando não há anterior', () => {
    expect(posicaoEntre(undefined, 1000)).toBeLessThan(1000);
  });

  it('coloca depois da última quando não há próxima', () => {
    expect(posicaoEntre(3000, undefined)).toBeGreaterThan(3000);
  });

  it('usa a média entre duas vizinhas', () => {
    expect(posicaoEntre(1000, 2000)).toBe(1500);
  });

  it('mantém a ordem depois de inserções sucessivas no mesmo ponto', () => {
    // O caso que a ordenação fracionária existe para resolver: inserir sempre
    // entre os dois primeiros nunca deve reordenar nada.
    let a = 1000;
    const b = 2000;
    for (let i = 0; i < 20; i++) {
      const nova = posicaoEntre(a, b);
      expect(nova).toBeGreaterThan(a);
      expect(nova).toBeLessThan(b);
      a = nova;
    }
  });
});

describe('posicaoAoFim e posicaoAoTopo', () => {
  it('respeitam listas vazias', () => {
    expect(posicaoAoFim([])).toBe(PASSO);
    expect(posicaoAoTopo([])).toBe(PASSO);
  });

  it('ficam além dos extremos existentes', () => {
    expect(posicaoAoFim([1000, 5000, 3000])).toBeGreaterThan(5000);
    expect(posicaoAoTopo([1000, 5000, 3000])).toBeLessThan(1000);
  });

  it('não se confunde com listas fora de ordem', () => {
    expect(posicaoAoFim([9000, 100])).toBe(10_000);
  });
});

describe('precisaRenumerar', () => {
  it('é falso no caso normal', () => {
    expect(precisaRenumerar([1000, 2000, 3000])).toBe(false);
    expect(precisaRenumerar([1000])).toBe(false);
    expect(precisaRenumerar([])).toBe(false);
  });

  it('detecta esgotamento de precisão', () => {
    expect(precisaRenumerar([1000, 1000.000_01])).toBe(true);
  });

  it('detecta mesmo com a lista desordenada', () => {
    expect(precisaRenumerar([3000, 1000.000_01, 1000])).toBe(true);
  });
});

describe('renumerar', () => {
  it('redistribui em múltiplos do passo preservando a ordem', () => {
    const resultado = renumerar([
      { id: 'c', posicao: 3000 },
      { id: 'a', posicao: 1000 },
      { id: 'b', posicao: 1500 },
    ]);

    expect(resultado).toEqual([
      { id: 'a', posicao: 1000 },
      { id: 'b', posicao: 2000 },
      { id: 'c', posicao: 3000 },
    ]);
  });
});

describe('vizinhasNoDestino', () => {
  const coluna = [1000, 2000, 3000];

  it('no topo, só tem próxima', () => {
    expect(vizinhasNoDestino(coluna, 0)).toEqual({ anterior: undefined, proxima: 1000 });
  });

  it('no meio, tem as duas', () => {
    expect(vizinhasNoDestino(coluna, 2)).toEqual({ anterior: 2000, proxima: 3000 });
  });

  it('no fim, só tem anterior', () => {
    expect(vizinhasNoDestino(coluna, 3)).toEqual({ anterior: 3000, proxima: undefined });
  });

  it('tolera índice fora da faixa', () => {
    expect(vizinhasNoDestino(coluna, 99)).toEqual({ anterior: 3000, proxima: undefined });
    expect(vizinhasNoDestino(coluna, -5)).toEqual({ anterior: undefined, proxima: 1000 });
  });

  it('funciona em coluna vazia', () => {
    expect(vizinhasNoDestino([], 0)).toEqual({ anterior: undefined, proxima: undefined });
  });
});
