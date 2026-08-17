/**
 * O card — a ficha alfinetada.
 *
 * Detalhes do handoff que não são enfeite: o pino de 7px no topo (é o que faz a
 * metáfora de mural funcionar), a inclinação de -0.3° no hover (o card
 * "desprende" um pouco do papel) e o `cursor: grab`.
 *
 * Sobre acessibilidade do arrasto: `draggable` do HTML5 não funciona por
 * teclado, e nenhuma quantidade de `tabindex` conserta isso. Em vez de fingir
 * que conserta, o card é um `<button>` que abre o drawer, e o drawer tem as
 * pills de "MOVER PARA" — que já estavam no design. Quem usa mouse arrasta;
 * quem usa teclado move pelo drawer; ninguém fica sem caminho.
 */

import type { DragEvent } from 'react';
import { Chip } from '@/components/shared/Chip';
import { Avatar } from '@/components/shared/Avatar';
import { formatarPrazo } from '@/utils/formato';
import type { Membro, Oficio, Pauta } from '@/lib/tipos';
import estilos from './PautaCard.module.css';

interface Props {
  pauta: Pauta;
  oficio: Oficio;
  responsavel?: Membro;
  mostrarResponsavel: boolean;
  compacta?: boolean;
  arrastando: boolean;
  aoAbrir: () => void;
  aoIniciarArraste: (evento: DragEvent<HTMLElement>) => void;
  aoTerminarArraste: () => void;
}

export function PautaCard({
  pauta,
  oficio,
  responsavel,
  mostrarResponsavel,
  compacta = false,
  arrastando,
  aoAbrir,
  aoIniciarArraste,
  aoTerminarArraste,
}: Props) {
  const prazo = formatarPrazo(pauta.prazo);

  return (
    <article
      className={[estilos.card, compacta ? estilos.compacta : '', arrastando ? estilos.arrastando : '']
        .filter(Boolean)
        .join(' ')}
      draggable
      onDragStart={aoIniciarArraste}
      onDragEnd={aoTerminarArraste}
    >
      <span className={estilos.pino} aria-hidden="true" />

      <button type="button" className={estilos.gatilho} onClick={aoAbrir}>
        <span className={estilos.titulo}>{pauta.titulo}</span>

        {pauta.campo1 || pauta.campo2 ? (
          <span className={estilos.chips}>
            {pauta.campo1 ? (
              <Chip variante="preenchido" mono={oficio.mono}>
                {pauta.campo1}
              </Chip>
            ) : null}
            {pauta.campo2 ? (
              <Chip variante="contorno" mono={oficio.mono}>
                {pauta.campo2}
              </Chip>
            ) : null}
          </span>
        ) : null}

        <span className={estilos.rodape}>
          {prazo.texto ? (
            <span
              className={
                prazo.atrasado ? estilos.prazoAtrasado : prazo.urgente ? estilos.prazoUrgente : estilos.prazo
              }
            >
              {prazo.texto}
            </span>
          ) : (
            <span className={estilos.semPrazo}>sem prazo</span>
          )}

          <span className={estilos.espacador} />

          {mostrarResponsavel && responsavel ? (
            <Avatar
              iniciais={responsavel.iniciais}
              hue={responsavel.hue}
              nome={responsavel.nome}
              tamanho="pequeno"
            />
          ) : null}
        </span>
      </button>
    </article>
  );
}
