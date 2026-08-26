/**
 * Aviso, erro, alerta e informação, no mesmo formato.
 *
 * Toda falha que chega à UI passa por aqui, e por isso o componente aceita um
 * `ErroApp`: ele já sabe extrair a mensagem em português e, quando o código é
 * `plano_limite_atingido`, oferecer o caminho de upgrade em vez de só informar
 * o bloqueio. Uma mensagem de erro sem próxima ação é meio trabalho.
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ErroApp } from '@/lib/erros';
import estilos from './Aviso.module.css';

type Tom = 'erro' | 'atencao' | 'info';

interface Props {
  tom?: Tom;
  titulo?: string;
  children?: ReactNode;
  /** Erro capturado, a mensagem e o tom saem dele. */
  erro?: unknown;
  /** Rota do upgrade, para erros de limite de plano. */
  linkPlano?: string;
  aoFechar?: () => void;
}

const CLASSE: Record<Tom, string | undefined> = {
  erro: estilos.erro,
  atencao: estilos.atencao,
  info: estilos.info,
};

export function Aviso({ tom = 'erro', titulo, children, erro, linkPlano, aoFechar }: Props) {
  const app = erro instanceof ErroApp ? erro : null;
  const mensagem = app?.message ?? (erro instanceof Error ? erro.message : null);
  const ehLimite = app?.codigo === 'plano_limite_atingido' || app?.codigo === 'plano_ja_ativo';
  const tomFinal: Tom = ehLimite ? 'atencao' : tom;

  if (!mensagem && !children && !titulo) return null;

  return (
    <div className={`${estilos.base} ${CLASSE[tomFinal]}`} role="alert">
      <div className={estilos.corpo}>
        {titulo ? <strong className={estilos.titulo}>{titulo}</strong> : null}
        {mensagem ? <span>{mensagem}</span> : null}
        {children}
        {ehLimite && linkPlano ? (
          <Link to={linkPlano} className={estilos.acao}>
            Ver planos →
          </Link>
        ) : null}
      </div>
      {aoFechar ? (
        <button type="button" className={estilos.fechar} onClick={aoFechar} aria-label="Fechar aviso">
          ✕
        </button>
      ) : null}
    </div>
  );
}
