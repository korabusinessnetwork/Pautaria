/**
 * Densidade e exportação, dois controles pequenos, duas regras reais.
 *
 * A exportação é recurso de plano pago (`limites.exportar`). O botão precisa
 * nascer desabilitado com o motivo, não estourar erro depois do clique.
 *
 * A densidade é preferência de leitura por pessoa, guardada em `sessionStorage`.
 * O ESLint proíbe `localStorage.setItem` neste projeto (ver `.eslintrc.cjs`), e
 * `sessionStorage` aqui não é só o desvio permitido, é o comportamento melhor,
 * porque a preferência acompanha a sessão de trabalho e não persegue a pessoa.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ControleVisual } from './ControleVisual';

function montar(props: Partial<Parameters<typeof ControleVisual>[0]> = {}) {
  const padrao = {
    densidade: 'confortavel' as const,
    aoTrocarDensidade: vi.fn(),
    aoExportar: vi.fn(),
    limiteExportar: { liberado: true, motivo: '' },
  };
  return render(<ControleVisual {...padrao} {...props} />);
}

beforeEach(() => {
  sessionStorage.clear();
});

describe('ControleVisual, densidade', () => {
  it('mostra qual densidade está ativa, para leitor de tela', () => {
    montar({ densidade: 'confortavel' });

    expect(screen.getByRole('button', { name: /confortável/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /compacta/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('trocar avisa quem está por cima', async () => {
    const aoTrocarDensidade = vi.fn();
    montar({ aoTrocarDensidade });

    await userEvent.click(screen.getByRole('button', { name: /compacta/i }));
    expect(aoTrocarDensidade).toHaveBeenCalledWith('compacta');
  });

  it('guarda a preferência em sessionStorage, não em localStorage', async () => {
    montar();
    await userEvent.click(screen.getByRole('button', { name: /compacta/i }));

    expect(sessionStorage.getItem('pautaria.densidade')).toBe('compacta');
    expect(localStorage.getItem('pautaria.densidade')).toBeNull();
  });
});

describe('ControleVisual, exportação', () => {
  it('exporta quando o plano permite', async () => {
    const aoExportar = vi.fn();
    montar({ aoExportar });

    await userEvent.click(screen.getByRole('button', { name: /exportar/i }));
    expect(aoExportar).toHaveBeenCalledOnce();
  });

  it('confirma visualmente que exportou', async () => {
    montar();
    await userEvent.click(screen.getByRole('button', { name: /exportar/i }));

    // Estado de sucesso visível é requisito do princípio nº 1: um download que
    // acontece em silêncio deixa a pessoa clicando de novo.
    expect(await screen.findByRole('button', { name: /exportado/i })).toBeInTheDocument();
  });

  it('desabilita com o motivo quando exportar está fora do plano', async () => {
    const aoExportar = vi.fn();
    montar({
      aoExportar,
      limiteExportar: {
        liberado: false,
        motivo: 'Exportar faz parte dos planos Estúdio e Time.',
      },
    });

    const botao = screen.getByRole('button', { name: /exportar/i });
    expect(botao).toBeDisabled();
    expect(botao).toHaveAttribute('title', 'Exportar faz parte dos planos Estúdio e Time.');

    await userEvent.click(botao);
    expect(aoExportar).not.toHaveBeenCalled();
  });
});
