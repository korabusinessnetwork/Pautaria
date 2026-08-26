/**
 * O quadro, pautas, colunas e as mutações que o kanban dispara.
 *
 * Mover um card usa **atualização otimista**: o React Query reescreve o cache
 * antes de a rede responder, e desfaz se der erro. Não é enfeite. Arrastar um
 * card e vê-lo voltar ao lugar original por 200 ms enquanto o servidor pensa
 * quebra a ilusão de manipulação direta, o gesto passa a parecer um pedido em
 * vez de uma ação, e o quadro deixa de parecer seu.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as pautasService from '@/lib/pautas.service';
import type { Etapa, Oficio, Pauta } from '@/lib/tipos';
import { vizinhasNoDestino } from '@/utils/ordenacao';

export interface Coluna {
  etapa: Etapa;
  pautas: Pauta[];
}

export interface UseQuadro {
  pautas: Pauta[];
  colunas: Coluna[];
  total: number;
  carregando: boolean;
  erro: Error | null;
  busca: string;
  setBusca: (valor: string) => void;

  criar: (entrada: { etapaId: string; titulo: string; campo1?: string | null; campo2?: string | null }) => Promise<void>;
  mover: (pautaId: string, etapaDestino: string, indiceDestino: number) => Promise<void>;
  editar: (pautaId: string, campos: pautasService.CamposEditaveis) => Promise<void>;
  arquivar: (pautaId: string) => Promise<void>;
  salvando: boolean;
}

export function useQuadro(
  quadroId: string | null,
  oficio: Oficio | null,
  workspaceId: string | null,
): UseQuadro {
  const cliente = useQueryClient();
  const [busca, setBusca] = useState('');
  const chave = useMemo(() => ['pautas', quadroId] as const, [quadroId]);

  const consulta = useQuery({
    queryKey: chave,
    queryFn: () => pautasService.listarPautas(quadroId!),
    enabled: Boolean(quadroId),
  });

  // Realtime: quando outro membro move um card, o quadro se atualiza sozinho.
  // Invalidamos em vez de aplicar o payload do evento, a consulta completa é
  // barata no volume de um quadro, e reconciliar delta a delta seria uma fonte
  // silenciosa de divergência entre abas.
  useEffect(() => {
    if (!quadroId) return;
    return pautasService.observarPautas(quadroId, () => {
      void cliente.invalidateQueries({ queryKey: ['pautas', quadroId] });
    });
  }, [quadroId, cliente]);

  const pautas = useMemo(() => consulta.data ?? [], [consulta.data]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return pautas;
    return pautas.filter(
      (p) =>
        p.titulo.toLowerCase().includes(termo) ||
        (p.campo1 ?? '').toLowerCase().includes(termo) ||
        (p.campo2 ?? '').toLowerCase().includes(termo),
    );
  }, [pautas, busca]);

  const colunas = useMemo<Coluna[]>(() => {
    if (!oficio) return [];
    return oficio.etapas.map((etapa) => ({
      etapa,
      pautas: filtradas
        .filter((p) => p.etapaId === etapa.id)
        .sort((a, b) => a.posicao - b.posicao),
    }));
  }, [oficio, filtradas]);

  const mutacaoCriar = useMutation({
    mutationFn: async (entrada: {
      etapaId: string;
      titulo: string;
      campo1?: string | null;
      campo2?: string | null;
    }) => {
      if (!quadroId || !oficio || !workspaceId) throw new Error('Quadro indisponível.');
      return pautasService.criarPauta({
        workspaceId,
        quadroId,
        oficioId: oficio.id,
        etapaId: entrada.etapaId,
        titulo: entrada.titulo,
        campo1: entrada.campo1 ?? null,
        campo2: entrada.campo2 ?? null,
        irmas: pautas.filter((p) => p.etapaId === entrada.etapaId),
      });
    },
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: chave });
      // O contador de uso muda: o aviso de limite precisa acompanhar.
      void cliente.invalidateQueries({ queryKey: ['uso', workspaceId] });
    },
  });

  const mutacaoMover = useMutation({
    mutationFn: (entrada: { id: string; etapaId: string; indice: number }) => {
      const naColuna = pautas
        .filter((p) => p.etapaId === entrada.etapaId && p.id !== entrada.id)
        .sort((a, b) => a.posicao - b.posicao)
        .map((p) => p.posicao);

      const { anterior, proxima } = vizinhasNoDestino(naColuna, entrada.indice);
      return pautasService.moverPauta({ id: entrada.id, etapaId: entrada.etapaId, anterior, proxima });
    },

    // Otimista: o card chega ao destino no mesmo quadro em que o dedo soltou.
    onMutate: async (entrada) => {
      await cliente.cancelQueries({ queryKey: chave });
      const anterior = cliente.getQueryData<Pauta[]>(chave);

      cliente.setQueryData<Pauta[]>(chave, (atual) => {
        if (!atual) return atual;
        const naColuna = atual
          .filter((p) => p.etapaId === entrada.etapaId && p.id !== entrada.id)
          .sort((a, b) => a.posicao - b.posicao)
          .map((p) => p.posicao);
        const { anterior: ant, proxima } = vizinhasNoDestino(naColuna, entrada.indice);
        const nova = ant === undefined && proxima === undefined
          ? 1000
          : ant === undefined
            ? (proxima as number) - 1000
            : proxima === undefined
              ? ant + 1000
              : (ant + proxima) / 2;

        return atual.map((p) =>
          p.id === entrada.id ? { ...p, etapaId: entrada.etapaId, posicao: nova } : p,
        );
      });

      return { anterior };
    },

    // Rollback com o estado exato de antes. O usuário vê o card voltar, o que
    // é honesto: o movimento realmente não aconteceu.
    onError: (_erro, _entrada, contexto) => {
      if (contexto?.anterior) cliente.setQueryData(chave, contexto.anterior);
    },

    onSettled: () => {
      void cliente.invalidateQueries({ queryKey: chave });
    },
  });

  const mutacaoEditar = useMutation({
    mutationFn: (entrada: { id: string; campos: pautasService.CamposEditaveis }) =>
      pautasService.atualizarPauta(entrada.id, entrada.campos),
    onSuccess: () => void cliente.invalidateQueries({ queryKey: chave }),
  });

  const mutacaoArquivar = useMutation({
    mutationFn: (id: string) => pautasService.arquivarPauta(id),
    onMutate: async (id) => {
      await cliente.cancelQueries({ queryKey: chave });
      const anterior = cliente.getQueryData<Pauta[]>(chave);
      cliente.setQueryData<Pauta[]>(chave, (atual) => atual?.filter((p) => p.id !== id));
      return { anterior };
    },
    onError: (_e, _id, contexto) => {
      if (contexto?.anterior) cliente.setQueryData(chave, contexto.anterior);
    },
    onSettled: () => {
      void cliente.invalidateQueries({ queryKey: chave });
      void cliente.invalidateQueries({ queryKey: ['uso', workspaceId] });
    },
  });

  const criar = useCallback(
    async (entrada: { etapaId: string; titulo: string; campo1?: string | null; campo2?: string | null }) => {
      await mutacaoCriar.mutateAsync(entrada);
    },
    [mutacaoCriar],
  );

  const mover = useCallback(
    async (pautaId: string, etapaDestino: string, indiceDestino: number) => {
      await mutacaoMover.mutateAsync({ id: pautaId, etapaId: etapaDestino, indice: indiceDestino });
    },
    [mutacaoMover],
  );

  const editar = useCallback(
    async (pautaId: string, campos: pautasService.CamposEditaveis) => {
      await mutacaoEditar.mutateAsync({ id: pautaId, campos });
    },
    [mutacaoEditar],
  );

  const arquivar = useCallback(
    async (pautaId: string) => {
      await mutacaoArquivar.mutateAsync(pautaId);
    },
    [mutacaoArquivar],
  );

  return {
    pautas,
    colunas,
    total: pautas.length,
    carregando: consulta.isLoading,
    erro: (consulta.error as Error | null) ?? null,
    busca,
    setBusca,
    criar,
    mover,
    editar,
    arquivar,
    salvando:
      mutacaoCriar.isPending ||
      mutacaoMover.isPending ||
      mutacaoEditar.isPending ||
      mutacaoArquivar.isPending,
  };
}
