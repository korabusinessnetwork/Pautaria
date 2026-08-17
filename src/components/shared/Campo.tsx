/**
 * Campo de formulário — rótulo, input, dica e erro, sempre associados.
 *
 * O `useId` liga rótulo, dica e erro ao input via `htmlFor`, `aria-describedby`
 * e `aria-errormessage`. Fazer isso à mão em cada formulário é o tipo de coisa
 * que se esquece na terceira tela, e o resultado é um leitor de tela anunciando
 * "campo de edição" sem dizer de quê.
 */

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import estilos from './Campo.module.css';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  rotulo: string;
  dica?: ReactNode;
  erro?: string | null;
}

export const Campo = forwardRef<HTMLInputElement, Props>(function Campo(
  { rotulo, dica, erro, className = '', ...resto },
  ref,
) {
  const id = useId();
  const idDica = `${id}-dica`;
  const idErro = `${id}-erro`;

  const descritores = [dica ? idDica : null, erro ? idErro : null].filter(Boolean).join(' ');

  return (
    <div className={estilos.grupo}>
      <label htmlFor={id} className={estilos.rotulo}>
        {rotulo}
      </label>
      <input
        {...resto}
        id={id}
        ref={ref}
        aria-invalid={erro ? true : undefined}
        aria-describedby={descritores || undefined}
        className={[estilos.input, erro ? estilos.comErro : '', className]
          .filter(Boolean)
          .join(' ')}
      />
      {dica && !erro ? (
        <span id={idDica} className={estilos.dica}>
          {dica}
        </span>
      ) : null}
      {erro ? (
        <span id={idErro} className={estilos.erro} role="alert">
          {erro}
        </span>
      ) : null}
    </div>
  );
});
