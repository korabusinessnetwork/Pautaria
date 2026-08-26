import { describe, expect, it } from 'vitest';
import { accentDe, avatarDe, variaveisDeAccent } from './tema';

describe('accentDe', () => {
  it('deriva as quatro variações do handoff', () => {
    // Ofício de Marketing: hue 45, chroma .16, os valores do protótipo.
    expect(accentDe(45, 0.16)).toEqual({
      ac: 'oklch(60% 0.16 45)',
      acSoft: 'oklch(60% 0.16 45 / .13)',
      acFaint: 'oklch(60% 0.16 45 / .07)',
      acDeep: 'oklch(44% 0.16 45)',
    });
  });

  it('mantém a mesma luminosidade em qualquer matiz', () => {
    // É o que o OKLCH garante e o HSL não: 60% é 60% em 45° e em 265°.
    for (const hue of [0, 45, 160, 265, 359]) {
      expect(accentDe(hue, 0.13).ac).toContain('60%');
      expect(accentDe(hue, 0.13).acDeep).toContain('44%');
    }
  });

  it('normaliza matiz fora da faixa em vez de gerar CSS inválido', () => {
    expect(accentDe(405, 0.13).ac).toContain(' 45)');
    expect(accentDe(-90, 0.13).ac).toContain(' 270)');
  });

  it('limita o croma ao máximo utilizável', () => {
    expect(accentDe(45, 9).ac).toContain('0.4');
    expect(accentDe(45, -1).ac).toContain('0 45');
  });
});

describe('variaveisDeAccent', () => {
  it('devolve exatamente as quatro custom properties do design system', () => {
    const vars = variaveisDeAccent(160, 0.13);
    expect(Object.keys(vars).sort()).toEqual(['--ac', '--acDeep', '--acFaint', '--acSoft']);
  });
});

describe('avatarDe', () => {
  it('mantém contraste fixo variando só a matiz', () => {
    const a = avatarDe(45);
    const b = avatarDe(265);
    expect(a.fundo).toContain('88%');
    expect(b.fundo).toContain('88%');
    expect(a.texto).toContain('38%');
    expect(a.fundo).not.toBe(b.fundo);
  });

  it('é estável para a mesma matiz', () => {
    expect(avatarDe(120)).toEqual(avatarDe(120));
  });
});
