/**
 * Workspace, o tenant ativo, seu papel, seu uso e seus ofícios.
 *
 * Este contexto é onde o white-label deixa de ser conceito e vira
 * comportamento. Nenhum componente abaixo dele sabe o nome de um ofício ou uma
 * cor: eles leem `oficioAtivo` e renderizam o que estiver ali. Trocar de ofício
 * é trocar um id, a UI inteira se re-tematiza porque as variáveis CSS mudam na
 * raiz do documento.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as workspaces from '@/lib/workspaces.service';
import * as oficiosService from '@/lib/oficios.service';
import * as pautasService from '@/lib/pautas.service';
import type { Oficio, Papel, Quadro, Uso, Workspace } from '@/lib/tipos';
import { aplicarAccentGlobal } from '@/utils/tema';
import { useSessao } from './SessaoContext';

interface ValorWorkspace {
  workspace: Workspace | null;
  papel: Papel | null;
  uso: Uso | null;
  quadros: Quadro[];
  quadroAtivo: Quadro | null;
  oficios: Oficio[];
  oficioAtivo: Oficio | null;
  carregando: boolean;
  erro: Error | null;

  /** `true` para dono e admin, quem pode mexer em configuração. */
  podeAdministrar: boolean;
  /** `true` só para o dono, quem mexe em cobrança. */
  ehDono: boolean;
  /** `false` em workspace suspenso ou cancelado: a UI vira somente leitura. */
  gravavel: boolean;

  selecionarQuadro: (quadroId: string) => void;
  recarregar: () => Promise<void>;
}

const Contexto = createContext<ValorWorkspace | null>(null);

export function ProvedorWorkspace({
  slug,
  children,
}: {
  slug: string;
  children: ReactNode;
}) {
  const { autenticado } = useSessao();
  const cliente = useQueryClient();
  const [quadroSelecionado, setQuadroSelecionado] = useState<string | null>(null);

  const consultaWorkspace = useQuery({
    queryKey: ['workspace', slug],
    queryFn: () => workspaces.buscarPorSlug(slug),
    enabled: autenticado && Boolean(slug),
  });

  const workspace = consultaWorkspace.data ?? null;

  const consultaPapel = useQuery({
    queryKey: ['papel', workspace?.id],
    queryFn: () => workspaces.meuPapel(workspace!.id),
    enabled: Boolean(workspace?.id),
  });

  const consultaUso = useQuery({
    queryKey: ['uso', workspace?.id],
    queryFn: () => workspaces.carregarUso(workspace!.id),
    enabled: Boolean(workspace?.id),
  });

  const consultaQuadros = useQuery({
    queryKey: ['quadros', workspace?.id],
    queryFn: () => pautasService.listarQuadros(workspace!.id),
    enabled: Boolean(workspace?.id),
  });

  const consultaOficios = useQuery({
    queryKey: ['oficios', workspace?.id],
    queryFn: () => oficiosService.listarOficiosDisponiveis(workspace!.id),
    enabled: Boolean(workspace?.id),
  });

  const quadros = useMemo(() => consultaQuadros.data ?? [], [consultaQuadros.data]);
  const oficios = useMemo(() => consultaOficios.data ?? [], [consultaOficios.data]);

  const quadroAtivo = useMemo(() => {
    if (quadros.length === 0) return null;
    return quadros.find((q) => q.id === quadroSelecionado) ?? quadros[0] ?? null;
  }, [quadros, quadroSelecionado]);

  const oficioAtivo = useMemo(() => {
    if (!quadroAtivo) return null;
    return oficios.find((o) => o.id === quadroAtivo.oficioId) ?? null;
  }, [oficios, quadroAtivo]);

  // O tema segue o ofício do quadro ativo, com a matiz do tenant tendo
  // precedência quando ela existir: é o gancho de white-label, um cliente com
  // marca própria mantém a cor dele mesmo trocando de ofício.
  useEffect(() => {
    if (!oficioAtivo) return;
    const hueDoTenant = workspace?.tema?.hue;
    aplicarAccentGlobal(
      typeof hueDoTenant === 'number' ? hueDoTenant : oficioAtivo.hue,
      oficioAtivo.chroma,
    );
  }, [oficioAtivo, workspace?.tema?.hue]);

  const recarregar = useCallback(async () => {
    await Promise.all([
      cliente.invalidateQueries({ queryKey: ['workspace', slug] }),
      cliente.invalidateQueries({ queryKey: ['quadros', workspace?.id] }),
      cliente.invalidateQueries({ queryKey: ['oficios', workspace?.id] }),
      cliente.invalidateQueries({ queryKey: ['uso', workspace?.id] }),
    ]);
  }, [cliente, slug, workspace?.id]);

  const papel = consultaPapel.data ?? null;

  const valor = useMemo<ValorWorkspace>(
    () => ({
      workspace,
      papel,
      uso: consultaUso.data ?? null,
      quadros,
      quadroAtivo,
      oficios,
      oficioAtivo,
      carregando:
        consultaWorkspace.isLoading || consultaQuadros.isLoading || consultaOficios.isLoading,
      erro: (consultaWorkspace.error as Error | null) ?? null,
      podeAdministrar: papel === 'owner' || papel === 'admin',
      ehDono: papel === 'owner',
      gravavel: workspace?.gravavel ?? false,
      selecionarQuadro: setQuadroSelecionado,
      recarregar,
    }),
    [
      workspace, papel, consultaUso.data, quadros, quadroAtivo, oficios, oficioAtivo,
      consultaWorkspace.isLoading, consultaWorkspace.error,
      consultaQuadros.isLoading, consultaOficios.isLoading, recarregar,
    ],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useWorkspace(): ValorWorkspace {
  const valor = useContext(Contexto);
  if (!valor) {
    throw new Error('useWorkspace precisa estar dentro de <ProvedorWorkspace>.');
  }
  return valor;
}
