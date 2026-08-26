/**
 * Topbar, título, contador, busca, alternador de visão e a nova pauta.
 *
 * O título do quadro vem do ofício ("Pauta de conteúdo", "Pauta do time",
 * "Minha semana"), não de uma string no componente. Os avatares só aparecem
 * quando o ofício **não** é solo, o ofício de Produtividade esconde
 * responsável por definição, mesmo num workspace do plano Time. Essa é a
 * diferença entre configuração por tenant e configuração por contexto de uso, e
 * o produto precisa das duas.
 */

import { useMemo } from 'react';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useLimites } from '@/hooks/useLimites';
import { Avatar } from '@/components/shared/Avatar';
import { Botao } from '@/components/shared/Botao';
import { pluralizar } from '@/utils/formato';
import type { Membro } from '@/lib/tipos';
import estilos from './Topbar.module.css';

export type Visao = 'quadro' | 'tabela';

interface Props {
  total: number;
  busca: string;
  aoBuscar: (valor: string) => void;
  visao: Visao;
  aoTrocarVisao: (visao: Visao) => void;
  aoNovaPauta: () => void;
  membros: Membro[];
  pautasNoQuadro: number;
}

export function Topbar({
  total,
  busca,
  aoBuscar,
  visao,
  aoTrocarVisao,
  aoNovaPauta,
  membros,
  pautasNoQuadro,
}: Props) {
  const { oficioAtivo, quadroAtivo } = useWorkspace();
  const limites = useLimites(pautasNoQuadro);

  // Ofício solo esconde a equipe inteira, é uma escolha do ofício, não do plano.
  const mostrarEquipe = !oficioAtivo?.solo && membros.length > 1;

  const visiveis = useMemo(() => membros.slice(0, 3), [membros]);
  const excedente = membros.length - visiveis.length;

  return (
    <header className={estilos.topbar}>
      <h1 className={estilos.titulo}>
        {quadroAtivo?.titulo ?? oficioAtivo?.tituloQuadro ?? 'Pauta'}
      </h1>

      <span className={estilos.contador}>{pluralizar(total, 'pauta')}</span>

      <div className={estilos.espacador} />

      <input
        type="search"
        value={busca}
        onChange={(e) => aoBuscar(e.target.value)}
        placeholder="Buscar na pauta…"
        className={estilos.busca}
        aria-label="Buscar na pauta"
      />

      <div className={estilos.alternador} role="tablist" aria-label="Modo de visualização">
        <button
          type="button"
          role="tab"
          aria-selected={visao === 'quadro'}
          className={visao === 'quadro' ? estilos.abaAtiva : estilos.aba}
          onClick={() => aoTrocarVisao('quadro')}
        >
          Quadro
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={visao === 'tabela'}
          className={visao === 'tabela' ? estilos.abaAtiva : estilos.aba}
          onClick={() => aoTrocarVisao('tabela')}
        >
          Tabela
        </button>
      </div>

      <Botao
        onClick={aoNovaPauta}
        motivoDesabilitado={limites.criarPauta.liberado ? undefined : limites.criarPauta.motivo}
      >
        + Nova pauta
      </Botao>

      {mostrarEquipe ? (
        <div className={estilos.equipe} aria-label={`${membros.length} membros`}>
          {visiveis.map((membro) => (
            <Avatar
              key={membro.userId}
              iniciais={membro.iniciais}
              hue={membro.hue}
              nome={membro.nome}
              tamanho="medio"
              empilhado
            />
          ))}
          {excedente > 0 ? (
            <span className={estilos.excedente} title={`mais ${excedente}`}>
              +{excedente}
            </span>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
