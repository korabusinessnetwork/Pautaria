/**
 * Botão.
 *
 * A prop `motivoDesabilitado` é a peça de produto deste componente. Um botão
 * desabilitado sem explicação é uma parede: o usuário vê que não pode, não sabe
 * por quê, e conclui que o app está quebrado. Com o motivo, ele vira uma
 * conversa — "você atingiu o limite do plano Solo" é acionável.
 *
 * O motivo aparece como `title` (mouse) e `aria-describedby` (leitor de tela),
 * e o botão continua focável quando desabilitado por regra de negócio — porque
 * um elemento que some da navegação por teclado leva a informação junto.
 */

import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import estilos from './Botao.module.css';

type Variante = 'principal' | 'secundario' | 'fantasma' | 'perigo';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children: ReactNode;
  variante?: Variante;
  /** Explicação de por que está desabilitado. Também desabilita o botão. */
  motivoDesabilitado?: string;
  carregando?: boolean;
  larguraTotal?: boolean;
}

const CLASSE: Record<Variante, string | undefined> = {
  principal: estilos.principal,
  secundario: estilos.secundario,
  fantasma: estilos.fantasma,
  perigo: estilos.perigo,
};

export const Botao = forwardRef<HTMLButtonElement, Props>(function Botao(
  {
    children,
    variante = 'principal',
    motivoDesabilitado,
    carregando = false,
    larguraTotal = false,
    disabled,
    className = '',
    ...resto
  },
  ref,
) {
  const idAjuda = useId();
  const bloqueado = Boolean(motivoDesabilitado) || disabled || carregando;

  return (
    <>
      <button
        {...resto}
        ref={ref}
        type={resto.type ?? 'button'}
        disabled={bloqueado}
        title={motivoDesabilitado || resto.title}
        aria-describedby={motivoDesabilitado ? idAjuda : undefined}
        className={[
          estilos.base,
          CLASSE[variante],
          larguraTotal ? estilos.larguraTotal : '',
          carregando ? estilos.carregando : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {carregando ? <span className={estilos.spinner} aria-hidden="true" /> : null}
        {children}
      </button>
      {motivoDesabilitado ? (
        <span id={idAjuda} className="apenas-leitor">
          {motivoDesabilitado}
        </span>
      ) : null}
    </>
  );
});
