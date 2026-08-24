/**
 * O card é onde a promessa do produto vira pixel — e onde ela é mais fácil de
 * quebrar sem perceber.
 *
 * A regra que estes testes protegem está em `memory/restrictions.md` P2:
 * *nenhum componente conhece o nome de um ofício*. O card não pode saber que
 * existe "Marketing"; ele recebe um ofício e obedece. Um `if (oficio.chave ===
 * 'ti')` compilaria, passaria no lint, e mataria a promessa de que um ofício
 * novo é um INSERT — sem nenhum sinal.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PautaCard } from './PautaCard';
import { emDias, membro, oficioMarketing, oficioSolo, oficioTi, pauta } from '@/teste/fixturas';

function montar(props: Partial<Parameters<typeof PautaCard>[0]> = {}) {
  const padrao = {
    pauta: pauta(),
    oficio: oficioMarketing(),
    mostrarResponsavel: false,
    arrastando: false,
    aoAbrir: vi.fn(),
    aoIniciarArraste: vi.fn(),
    aoTerminarArraste: vi.fn(),
  };
  return render(<PautaCard {...padrao} {...props} />);
}

describe('PautaCard — o ofício manda', () => {
  it('mostra os dois campos livres com os valores da pauta', () => {
    montar({ pauta: pauta({ campo1: 'Instagram', campo2: 'Aquisição' }) });

    expect(screen.getByText('Instagram')).toBeInTheDocument();
    expect(screen.getByText('Aquisição')).toBeInTheDocument();
  });

  it('não renderiza chip de campo vazio — o traço do protótipo é renderização, não dado', () => {
    montar({ pauta: pauta({ campo1: 'Instagram', campo2: null }) });

    expect(screen.getByText('Instagram')).toBeInTheDocument();
    // Se um dia alguém salvar '—' no banco, este teste continua verde e o de
    // `criarPauta` (que converte vazio em NULL) é quem pega. Aqui a garantia é
    // só que ausência não vira chip fantasma.
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('o mesmo card serve qualquer ofício, sem saber qual é', () => {
    const { unmount } = montar({
      oficio: oficioMarketing(),
      pauta: pauta({ campo1: 'Instagram' }),
    });
    expect(screen.getByText('Instagram')).toBeInTheDocument();
    unmount();

    montar({ oficio: oficioTi(), pauta: pauta({ campo1: 'Sprint 14' }) });
    expect(screen.getByText('Sprint 14')).toBeInTheDocument();
  });
});

describe('PautaCard — responsável', () => {
  it('mostra o avatar quando o quadro é de time', () => {
    const pessoa = membro({ nome: 'Marina Alves', iniciais: 'MA' });
    montar({
      pauta: pauta({ responsavelId: pessoa.userId }),
      responsavel: pessoa,
      mostrarResponsavel: true,
    });

    expect(screen.getByText('MA')).toBeInTheDocument();
  });

  it('esconde quando o ofício é solo — decisão do ofício, não do plano', () => {
    const pessoa = membro();
    montar({
      oficio: oficioSolo(),
      pauta: pauta({ responsavelId: pessoa.userId }),
      responsavel: pessoa,
      // O ofício solo faz a página passar `false`; o card obedece.
      mostrarResponsavel: false,
    });

    expect(screen.queryByText('MA')).not.toBeInTheDocument();
  });
});

describe('PautaCard — prazo', () => {
  it('diz "hoje" em vez da data', () => {
    montar({ pauta: pauta({ prazo: emDias(0) }) });
    expect(screen.getByText('hoje')).toBeInTheDocument();
  });

  it('diz "amanhã"', () => {
    montar({ pauta: pauta({ prazo: emDias(1) }) });
    expect(screen.getByText('amanhã')).toBeInTheDocument();
  });

  it('marca atraso com texto próprio — a pergunta real é "estou atrasado?"', () => {
    montar({ pauta: pauta({ prazo: emDias(-3) }) });
    expect(screen.getByText('há 3 dias')).toBeInTheDocument();
  });

  it('sem prazo, não finge que há um', () => {
    montar({ pauta: pauta({ prazo: null }) });
    expect(screen.getByText('sem prazo')).toBeInTheDocument();
  });
});

describe('PautaCard — interação', () => {
  it('clicar abre o detalhe', async () => {
    const aoAbrir = vi.fn();
    montar({ aoAbrir });

    await userEvent.click(screen.getByRole('button'));
    expect(aoAbrir).toHaveBeenCalledOnce();
  });

  it('é alcançável por teclado — o arrasto não pode ser o único caminho', async () => {
    const aoAbrir = vi.fn();
    montar({ aoAbrir });

    await userEvent.tab();
    expect(screen.getByRole('button')).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    expect(aoAbrir).toHaveBeenCalledOnce();
  });

  it('o título aparece por inteiro, sem truncar no DOM', () => {
    const longo = 'Newsletter #42 — cases de quem começou do zero e chegou lá';
    montar({ pauta: pauta({ titulo: longo }) });
    expect(screen.getByText(longo)).toBeInTheDocument();
  });
});
