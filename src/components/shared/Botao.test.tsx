/**
 * O `Botao` carrega uma regra de produto, não só estilo.
 *
 * `CLAUDE.md` diz: *"Botão que estouraria o limite do plano nasce desabilitado
 * com o motivo à vista; não deixe o usuário clicar para receber um não."*
 * Desabilitar sem explicar é uma parede, e é o padrão para o qual o código
 * escorrega sozinho, porque `disabled` é uma prop e explicar dá trabalho.
 *
 * Estes testes existem para que essa regra não se perca numa refatoração.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Botao } from './Botao';

describe('Botao', () => {
  it('dispara o clique no caminho normal', async () => {
    const aoClicar = vi.fn();
    render(<Botao onClick={aoClicar}>Nova pauta</Botao>);

    await userEvent.click(screen.getByRole('button', { name: 'Nova pauta' }));
    expect(aoClicar).toHaveBeenCalledOnce();
  });

  it('motivoDesabilitado desabilita o botão', () => {
    render(<Botao motivoDesabilitado="Seu plano permite 1 quadro.">Novo quadro</Botao>);
    expect(screen.getByRole('button', { name: /novo quadro/i })).toBeDisabled();
  });

  it('o motivo chega a quem usa mouse, via title', () => {
    render(<Botao motivoDesabilitado="Seu plano permite 1 quadro.">Novo quadro</Botao>);
    expect(screen.getByRole('button', { name: /novo quadro/i })).toHaveAttribute(
      'title',
      'Seu plano permite 1 quadro.',
    );
  });

  it('e a quem usa leitor de tela, via aria-describedby', () => {
    render(<Botao motivoDesabilitado="Seu plano permite 1 quadro.">Novo quadro</Botao>);

    const botao = screen.getByRole('button', { name: /novo quadro/i });
    const idDescricao = botao.getAttribute('aria-describedby');

    expect(idDescricao).toBeTruthy();
    // O texto precisa existir no documento; um aria-describedby apontando para
    // nada é pior que nenhum, porque parece acessível numa auditoria automática.
    expect(document.getElementById(idDescricao as string)).toHaveTextContent(
      'Seu plano permite 1 quadro.',
    );
  });

  it('não deixa clicar quando há motivo', async () => {
    const aoClicar = vi.fn();
    render(
      <Botao motivoDesabilitado="Sem permissão." onClick={aoClicar}>
        Excluir
      </Botao>,
    );

    await userEvent.click(screen.getByRole('button', { name: /excluir/i }));
    expect(aoClicar).not.toHaveBeenCalled();
  });

  it('sem motivo, não inventa aria-describedby', () => {
    render(<Botao>Salvar</Botao>);
    expect(screen.getByRole('button', { name: 'Salvar' })).not.toHaveAttribute(
      'aria-describedby',
    );
  });

  it('carregando bloqueia clique duplo', async () => {
    const aoClicar = vi.fn();
    render(
      <Botao carregando onClick={aoClicar}>
        Ir para o pagamento
      </Botao>,
    );

    const botao = screen.getByRole('button', { name: /pagamento/i });
    expect(botao).toBeDisabled();
    await userEvent.click(botao);
    expect(aoClicar).not.toHaveBeenCalled();
  });

  it('nasce type="button", um submit acidental dentro de form é bug clássico', () => {
    render(<Botao>Qualquer</Botao>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});
