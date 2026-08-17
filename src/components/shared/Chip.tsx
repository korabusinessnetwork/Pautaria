/**
 * Chip — os dois campos livres da pauta.
 *
 * `preenchido` é o campo 1 (fundo accent suave), `contorno` é o campo 2 (só
 * borda). A hierarquia é intencional: o primeiro campo do ofício costuma ser o
 * mais consultado (Canal, Sprint, Contexto) e ganha peso visual.
 *
 * `mono` vem do ofício, não de uma condição no componente. É o que permite ao
 * ofício de TI ter chips monoespaçados sem que exista um `if (oficio ===
 * 'ti')` em lugar nenhum do código.
 */

import estilos from './Chip.module.css';

interface Props {
  children: string;
  variante?: 'preenchido' | 'contorno';
  mono?: boolean;
}

export function Chip({ children, variante = 'preenchido', mono = false }: Props) {
  return (
    <span
      className={[
        estilos.base,
        variante === 'preenchido' ? estilos.preenchido : estilos.contorno,
        mono ? estilos.mono : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  );
}
