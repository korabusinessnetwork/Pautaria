/**
 * Rota protegida — autenticação **antes** de renderizar.
 *
 * A ordem importa e é regra do CLAUDE.md. O padrão comum (renderizar e
 * redirecionar num `useEffect`) monta a tela protegida por um frame antes de
 * sair dela: o conteúdo aparece, pisca e some. Aqui nada monta enquanto a
 * sessão não for conhecida.
 *
 * `carregando` tem tela própria em vez de cair no `<Navigate>`: no primeiro
 * carregamento a sessão vem do storage de forma assíncrona, e tratar "ainda não
 * sei" como "não está logado" jogaria todo mundo para o login a cada F5.
 */

import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useSessao } from '@/context/SessaoContext';
import { Carregando } from './Carregando';

export function RotaProtegida({ children }: { children: ReactNode }) {
  const { autenticado, carregando } = useSessao();
  const local = useLocation();

  if (carregando) {
    return <Carregando mensagem="Abrindo sua pauta…" />;
  }

  if (!autenticado) {
    // `state.de` preserva o destino: depois de entrar, a pessoa volta para onde
    // queria ir, e não para uma home genérica.
    return <Navigate to="/entrar" replace state={{ de: local.pathname + local.search }} />;
  }

  return <>{children}</>;
}
