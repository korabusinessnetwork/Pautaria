/**
 * Tabela — a mesma pauta, densa.
 *
 * O quadro responde "o que está em cada etapa?"; a tabela responde "o que
 * vence primeiro?". São perguntas diferentes sobre os mesmos dados, e por isso
 * a ordenação padrão aqui é por etapa e depois por prazo, não pela posição do
 * kanban — arrastar cards define ordem visual, não prioridade.
 *
 * Os cabeçalhos das colunas de campo vêm do ofício: PAUTA / ETAPA / CANAL /
 * CAMPANHA para Marketing, PAUTA / ETAPA / SPRINT / ESTIMATIVA para TI. Nenhum
 * nome de coluna está escrito neste arquivo.
 */

import { useMemo } from 'react';
import { Avatar } from '@/components/shared/Avatar';
import { formatarPrazo } from '@/utils/formato';
import type { Etapa, Membro, Oficio, Pauta } from '@/lib/tipos';
import estilos from './Tabela.module.css';

interface Props {
  pautas: Pauta[];
  oficio: Oficio;
  membros: Membro[];
  mostrarResponsavel: boolean;
  aoAbrirPauta: (pauta: Pauta) => void;
}

export function Tabela({ pautas, oficio, membros, mostrarResponsavel, aoAbrirPauta }: Props) {
  const etapaPorId = useMemo(() => {
    const mapa = new Map<string, Etapa>();
    for (const etapa of oficio.etapas) mapa.set(etapa.id, etapa);
    return mapa;
  }, [oficio.etapas]);

  const ordenadas = useMemo(() => {
    return [...pautas].sort((a, b) => {
      const ordemA = etapaPorId.get(a.etapaId)?.ordem ?? 99;
      const ordemB = etapaPorId.get(b.etapaId)?.ordem ?? 99;
      if (ordemA !== ordemB) return ordemA - ordemB;
      // Sem prazo vai para o fim: o que não tem data não compete por atenção.
      if (!a.prazo && !b.prazo) return a.posicao - b.posicao;
      if (!a.prazo) return 1;
      if (!b.prazo) return -1;
      return a.prazo.localeCompare(b.prazo);
    });
  }, [pautas, etapaPorId]);

  const responsavelPorId = useMemo(
    () => new Map(membros.map((m) => [m.userId, m])),
    [membros],
  );

  if (ordenadas.length === 0) {
    return (
      <div className={estilos.area}>
        <div className={estilos.vazio}>
          <p className={estilos.vazioTitulo}>Nenhuma pauta por aqui.</p>
          <p className={estilos.vazioTexto}>
            Crie a primeira no quadro ou use um dos modelos da lateral.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={estilos.area}>
      <div className={estilos.painel} role="table" aria-label="Pautas em tabela">
        <div className={estilos.cabecalho} role="row">
          <span role="columnheader">PAUTA</span>
          <span role="columnheader">ETAPA</span>
          <span role="columnheader">{oficio.campo1Label.toUpperCase()}</span>
          <span role="columnheader">{oficio.campo2Label.toUpperCase()}</span>
          <span role="columnheader">PRAZO</span>
          <span role="columnheader" aria-label="Responsável" />
        </div>

        {ordenadas.map((pauta) => {
          const etapa = etapaPorId.get(pauta.etapaId);
          const prazo = formatarPrazo(pauta.prazo);
          const responsavel = pauta.responsavelId
            ? responsavelPorId.get(pauta.responsavelId)
            : undefined;

          return (
            <div
              key={pauta.id}
              role="row"
              tabIndex={0}
              className={estilos.linha}
              onClick={() => aoAbrirPauta(pauta)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  aoAbrirPauta(pauta);
                }
              }}
            >
              <span role="cell" className={estilos.titulo}>
                {pauta.titulo}
              </span>
              <span role="cell">
                <span className={estilos.pillEtapa}>{etapa?.nome ?? '—'}</span>
              </span>
              <span role="cell" className={oficio.mono ? estilos.campoMono : estilos.campo}>
                {pauta.campo1 || '—'}
              </span>
              <span role="cell" className={oficio.mono ? estilos.campoMono : estilos.campo}>
                {pauta.campo2 || '—'}
              </span>
              <span
                role="cell"
                className={prazo.atrasado ? estilos.prazoAtrasado : estilos.prazo}
              >
                {prazo.texto || '—'}
              </span>
              <span role="cell">
                {mostrarResponsavel && responsavel ? (
                  <Avatar
                    iniciais={responsavel.iniciais}
                    hue={responsavel.hue}
                    nome={responsavel.nome}
                  />
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
