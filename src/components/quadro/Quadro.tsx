/**
 * O quadro kanban.
 *
 * Arrasto com a API nativa de HTML5, sem biblioteca. A decisão vale ser
 * registrada: `dnd-kit` e companhia adicionam ~40 kB e uma camada de conceitos
 * (sensors, collision detection, modifiers) para resolver um problema que aqui
 * é simples, mover um card entre listas, com o índice de destino calculado
 * pela posição do ponteiro. O que essas bibliotecas realmente entregam a mais é
 * acessibilidade de teclado, e isso o drawer já cobre (ver `PautaCard`).
 *
 * O índice de destino é calculado no `dragover` da coluna, comparando o Y do
 * ponteiro com o meio de cada card. É o que permite soltar *entre* dois cards e
 * não só "nesta coluna".
 */

import { useCallback, useRef, useState, type DragEvent } from 'react';
import { PautaCard } from './PautaCard';
import { Etiqueta } from '@/components/shared/Etiqueta';
import { NovaPautaInline } from './NovaPautaInline';
import type { Coluna as ColunaDados } from '@/hooks/useQuadro';
import type { Membro, Oficio, Pauta } from '@/lib/tipos';
import estilos from './Quadro.module.css';

interface Props {
  colunas: ColunaDados[];
  oficio: Oficio;
  membros: Membro[];
  mostrarResponsavel: boolean;
  compacta?: boolean;
  podeEditar: boolean;
  motivoBloqueio?: string;
  /** Etapa cujo input inline está aberto (vindo do botão da topbar). */
  etapaAdicionando: string | null;
  aoAbrirAdicao: (etapaId: string | null) => void;
  aoAbrirPauta: (pauta: Pauta) => void;
  aoCriar: (etapaId: string, titulo: string) => Promise<void>;
  aoMover: (pautaId: string, etapaId: string, indice: number) => Promise<void>;
}

export function Quadro({
  colunas,
  oficio,
  membros,
  mostrarResponsavel,
  compacta = false,
  podeEditar,
  motivoBloqueio,
  etapaAdicionando,
  aoAbrirAdicao,
  aoAbrirPauta,
  aoCriar,
  aoMover,
}: Props) {
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<{ etapaId: string; indice: number } | null>(null);
  const refsColuna = useRef<Record<string, HTMLDivElement | null>>({});

  const porId = useCallback(
    (id: string | null) => membros.find((m) => m.userId === id),
    [membros],
  );

  function iniciarArraste(evento: DragEvent<HTMLElement>, pauta: Pauta) {
    setArrastando(pauta.id);
    try {
      evento.dataTransfer.setData('text/plain', pauta.id);
      evento.dataTransfer.effectAllowed = 'move';
    } catch {
      // Safari antigo recusa setData em alguns contextos; o estado local já
      // guarda o id, então o arrasto continua funcionando.
    }
  }

  function terminarArraste() {
    setArrastando(null);
    setAlvo(null);
  }

  /** Onde o card cairia se soltasse agora: acima ou abaixo de cada vizinho. */
  function calcularIndice(etapaId: string, clientY: number, pautas: Pauta[]): number {
    const container = refsColuna.current[etapaId];
    if (!container) return pautas.length;

    const cards = Array.from(container.querySelectorAll<HTMLElement>('[data-card]'));
    for (let i = 0; i < cards.length; i++) {
      const caixa = (cards[i] as HTMLElement).getBoundingClientRect();
      if (clientY < caixa.top + caixa.height / 2) return i;
    }
    return cards.length;
  }

  function sobreColuna(evento: DragEvent<HTMLElement>, coluna: ColunaDados) {
    if (!arrastando || !podeEditar) return;
    evento.preventDefault();
    evento.dataTransfer.dropEffect = 'move';

    const indice = calcularIndice(coluna.etapa.id, evento.clientY, coluna.pautas);
    if (alvo?.etapaId !== coluna.etapa.id || alvo?.indice !== indice) {
      setAlvo({ etapaId: coluna.etapa.id, indice });
    }
  }

  async function soltar(evento: DragEvent<HTMLElement>, coluna: ColunaDados) {
    evento.preventDefault();
    const id = arrastando ?? evento.dataTransfer.getData('text/plain');
    if (!id || !podeEditar) return terminarArraste();

    const indice = alvo?.etapaId === coluna.etapa.id
      ? alvo.indice
      : calcularIndice(coluna.etapa.id, evento.clientY, coluna.pautas);

    terminarArraste();
    await aoMover(id, coluna.etapa.id, indice);
  }

  return (
    <div className={estilos.area}>
      <div className={estilos.trilho}>
        {colunas.map((coluna) => {
          const recebendo = alvo?.etapaId === coluna.etapa.id && arrastando !== null;

          return (
            <section
              key={coluna.etapa.id}
              className={recebendo ? estilos.colunaRecebendo : estilos.coluna}
              onDragOver={(e) => sobreColuna(e, coluna)}
              onDragLeave={() => {
                if (alvo?.etapaId === coluna.etapa.id) setAlvo(null);
              }}
              onDrop={(e) => void soltar(e, coluna)}
              aria-label={`${coluna.etapa.nome}: ${coluna.pautas.length} pautas`}
            >
              <header className={estilos.cabecalhoColuna}>
                <Etiqueta>{coluna.etapa.nome}</Etiqueta>
                <span className={estilos.contagem}>{coluna.pautas.length}</span>
              </header>

              <div
                className={estilos.pilha}
                ref={(el) => {
                  refsColuna.current[coluna.etapa.id] = el;
                }}
              >
                {coluna.pautas.map((pauta, i) => (
                  <div key={pauta.id} data-card>
                    {recebendo && alvo?.indice === i ? <div className={estilos.marcador} /> : null}
                    <PautaCard
                      pauta={pauta}
                      oficio={oficio}
                      responsavel={porId(pauta.responsavelId)}
                      mostrarResponsavel={mostrarResponsavel}
                      compacta={compacta}
                      arrastando={arrastando === pauta.id}
                      aoAbrir={() => aoAbrirPauta(pauta)}
                      aoIniciarArraste={(e) => iniciarArraste(e, pauta)}
                      aoTerminarArraste={terminarArraste}
                    />
                  </div>
                ))}

                {recebendo && alvo?.indice === coluna.pautas.length ? (
                  <div className={estilos.marcador} />
                ) : null}

                {/* Coluna vazia nunca fica muda, o handoff é explícito. */}
                {coluna.pautas.length === 0 && !recebendo ? (
                  <div className={estilos.vazia}>solte uma pauta aqui</div>
                ) : null}
              </div>

              {etapaAdicionando === coluna.etapa.id ? (
                <NovaPautaInline
                  aoConfirmar={async (titulo) => {
                    await aoCriar(coluna.etapa.id, titulo);
                  }}
                  aoCancelar={() => aoAbrirAdicao(null)}
                />
              ) : (
                <button
                  type="button"
                  className={estilos.adicionar}
                  onClick={() => aoAbrirAdicao(coluna.etapa.id)}
                  disabled={!podeEditar}
                  title={podeEditar ? undefined : motivoBloqueio}
                >
                  + Nova pauta
                </button>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
