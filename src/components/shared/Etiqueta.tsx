/**
 * Etiqueta, a "fita adesiva" que nomeia uma etapa.
 *
 * Monoespaçada, caixa alta, `letter-spacing` largo e `rotate(-1.2deg)`. A
 * rotação é o detalhe que faz o quadro parecer um mural em vez de um formulário
 *, e é exatamente o tipo de coisa que se perde numa "limpeza" de CSS. Ela está
 * no handoff hi-fi e é final.
 */

import type { CSSProperties } from 'react';
import estilos from './Etiqueta.module.css';

interface Props {
  children: string;
  /** `true` remove a inclinação, usado no drawer, onde o texto é lido de perto. */
  reta?: boolean;
  style?: CSSProperties;
}

export function Etiqueta({ children, reta = false, style }: Props) {
  return (
    <span className={reta ? estilos.reta : estilos.fita} style={style}>
      {children}
    </span>
  );
}
