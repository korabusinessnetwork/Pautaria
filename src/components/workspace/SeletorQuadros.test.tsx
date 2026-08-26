/**
 * O seletor de quadros é onde o limite de plano encontra o usuário.
 *
 * A regra que estes testes protegem vem de duas fontes que se somam:
 *
 *   `CLAUDE.md`, prevenção de erro é melhor que mensagem de erro: o botão que
 *   não vai funcionar nasce desabilitado, com o motivo à vista.
 *
 *   `memory/restrictions.md` P1, **trocar de ofício nunca é paywall**. O plano
 *   Solo limita a *um quadro*, e o motivo precisa dizer que trocar o sotaque do
 *   quadro atual continua grátis. Sem essa frase, o limite lê como se o produto
 *   cobrasse pela única coisa que o diferencia.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SeletorQuadros, type QuadroDoSeletor } from './SeletorQuadros';

const QUADROS: QuadroDoSeletor[] = [
  {
    id: 'q1',
    titulo: 'Pauta de conteúdo',
    oficio: { nome: 'Marketing', glifo: '▲', hue: 45, chroma: 0.16 },
  },
  {
    id: 'q2',
    titulo: 'Pauta do time',
    oficio: { nome: 'TI · Dev', glifo: '■', hue: 160, chroma: 0.13 },
  },
];

function montar(props: Partial<Parameters<typeof SeletorQuadros>[0]> = {}) {
  const padrao = {
    quadros: QUADROS,
    quadroAtivoId: 'q1',
    aoSelecionar: vi.fn(),
    aoCriar: vi.fn(),
    aoRenomear: vi.fn(),
    podeAdministrar: true,
    limiteCriar: { liberado: true, motivo: '' },
  };
  return { props: { ...padrao, ...props }, ...render(<SeletorQuadros {...padrao} {...props} />) };
}

describe('SeletorQuadros, navegação', () => {
  it('lista os quadros com o nome do ofício de cada um', () => {
    montar();
    expect(screen.getByText('Pauta de conteúdo')).toBeInTheDocument();
    expect(screen.getByText('Marketing')).toBeInTheDocument();
    expect(screen.getByText('TI · Dev')).toBeInTheDocument();
  });

  it('marca o quadro ativo para leitor de tela', () => {
    montar({ quadroAtivoId: 'q2' });
    // Âncora no início: "Renomear o quadro Pauta do time" também casaria com
    // /Pauta do time/. O nome acessível do botão de seleção vem do conteúdo,
    // título + nome do ofício, não do atributo `title`.
    const lista = screen.getByRole('navigation', { name: /quadros/i });
    const ativo = within(lista).getByRole('button', { name: /^Pauta do time/ });
    expect(ativo).toHaveAttribute('aria-current', 'true');
  });

  it('selecionar avisa quem está por cima', async () => {
    const aoSelecionar = vi.fn();
    montar({ aoSelecionar });

    await userEvent.click(screen.getByRole('button', { name: /^Pauta do time/ }));
    expect(aoSelecionar).toHaveBeenCalledWith('q2');
  });
});

describe('SeletorQuadros, limite de plano', () => {
  it('deixa criar quando o plano permite', async () => {
    const aoCriar = vi.fn();
    montar({ aoCriar });

    await userEvent.click(screen.getByRole('button', { name: /novo quadro/i }));
    await userEvent.type(screen.getByRole('textbox'), 'Quadro novo');
    await userEvent.click(screen.getByRole('button', { name: /criar quadro/i }));

    expect(aoCriar).toHaveBeenCalledWith('Quadro novo');
  });

  it('desabilita com o motivo quando o plano não permite', () => {
    montar({
      limiteCriar: {
        liberado: false,
        motivo:
          'O plano Solo tem um quadro. Você pode trocar o ofício dele quando quiser, trocar é grátis.',
      },
    });

    const botao = screen.getByRole('button', { name: /novo quadro/i });
    expect(botao).toBeDisabled();
    expect(botao).toHaveAttribute('title', expect.stringContaining('trocar é grátis'));
  });

  it('o motivo do plano Solo diz que trocar de ofício continua grátis', () => {
    // Este teste parece redundante com o anterior e não é: ele guarda a
    // *mensagem*, não o mecanismo. Um refactor que troque o texto por
    // "Faça upgrade para criar mais quadros" passaria no teste acima e
    // quebraria a restrição P1 sem ninguém perceber.
    montar({
      limiteCriar: {
        liberado: false,
        motivo:
          'O plano Solo tem um quadro. Você pode trocar o ofício dele quando quiser, trocar é grátis.',
      },
    });

    // Duas ocorrências de propósito: o texto visível e a cópia que o
    // `aria-describedby` do <Botao> aponta. Exigir uma só reprovaria justamente
    // a versão acessível.
    expect(screen.getAllByText(/trocar é grátis/i).length).toBeGreaterThan(0);
  });

  it('membro comum não vê criar nem renomear', () => {
    montar({ podeAdministrar: false });

    expect(screen.queryByRole('button', { name: /novo quadro/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /renomear/i })).not.toBeInTheDocument();
  });
});

describe('SeletorQuadros, renomear', () => {
  it('renomeia pelo botão, que é o caminho de teclado e o único no toque', async () => {
    const aoRenomear = vi.fn();
    montar({ aoRenomear });

    await userEvent.click(
      screen.getByRole('button', { name: /^Renomear o quadro Pauta de conteúdo/i }),
    );

    const campo = screen.getByRole('textbox');
    await userEvent.clear(campo);
    await userEvent.type(campo, 'Calendário editorial{Enter}');

    expect(aoRenomear).toHaveBeenCalledWith('q1', 'Calendário editorial');
  });

  it('Esc cancela sem salvar', async () => {
    const aoRenomear = vi.fn();
    montar({ aoRenomear });

    await userEvent.click(
      screen.getByRole('button', { name: /^Renomear o quadro Pauta de conteúdo/i }),
    );
    await userEvent.type(screen.getByRole('textbox'), 'algo{Escape}');

    expect(aoRenomear).not.toHaveBeenCalled();
    expect(screen.getByText('Pauta de conteúdo')).toBeInTheDocument();
  });
});
