/**
 * Limites de plano na UI.
 *
 * Este hook existe para uma frase do CLAUDE.md: *"Botão que estouraria o limite
 * do plano nasce desabilitado com o motivo à vista; não deixe o usuário clicar
 * para receber um não."*
 *
 * Ele não **aplica** limite nenhum, quem aplica são os triggers da migration
 * 0007, e nada que aconteça aqui muda isso. O papel deste código é puramente de
 * cortesia: saber, antes do clique, que o clique não vai funcionar, e dizer o
 * porquê num idioma que a pessoa entende.
 */

import { useMemo } from 'react';
import { useWorkspace } from '@/context/WorkspaceContext';
import type { LimitesPlano } from '@/lib/tipos';

export interface Veredito {
  /** `true` quando a ação pode ser tentada. */
  liberado: boolean;
  /** Por que não, texto pronto para o `title` do botão ou um aviso inline. */
  motivo: string;
  /** `true` quando resolver o problema é assinar um plano melhor. */
  sugerirUpgrade: boolean;
}

const LIBERADO: Veredito = { liberado: true, motivo: '', sugerirUpgrade: false };

function bloqueio(motivo: string, sugerirUpgrade = true): Veredito {
  return { liberado: false, motivo, sugerirUpgrade };
}

export interface Limites {
  criarQuadro: Veredito;
  criarPauta: Veredito;
  convidarMembro: Veredito;
  criarOficio: Veredito;
  exportar: Veredito;
  /** Quanto falta para bater o teto de pautas, alimenta a barra de uso. */
  pautasRestantes: number | null;
  membrosRestantes: number | null;
  limites: LimitesPlano | null;
}

export function useLimites(pautasNoQuadroAtual = 0): Limites {
  const { uso, workspace, gravavel, podeAdministrar } = useWorkspace();

  return useMemo<Limites>(() => {
    const limites = uso?.limites ?? null;

    // Sem dados de uso ainda: liberamos de forma otimista. Desabilitar tudo
    // durante o carregamento faria a tela parecer quebrada por meio segundo, e
    // o banco continua sendo a autoridade se o clique passar.
    if (!uso || !limites || !workspace) {
      return {
        criarQuadro: LIBERADO, criarPauta: LIBERADO, convidarMembro: LIBERADO,
        criarOficio: LIBERADO, exportar: LIBERADO,
        pautasRestantes: null, membrosRestantes: null, limites: null,
      };
    }

    // Workspace suspenso ou cancelado é somente leitura. Vem antes do limite de
    // plano porque a mensagem é outra: não adianta fazer upgrade, precisa
    // regularizar.
    if (!gravavel) {
      const somenteLeitura = bloqueio(
        workspace.status === 'suspenso'
          ? 'Este workspace está suspenso por falta de pagamento. Regularize para voltar a editar.'
          : 'Este workspace foi encerrado e está em modo somente leitura.',
        workspace.status === 'suspenso',
      );
      return {
        criarQuadro: somenteLeitura, criarPauta: somenteLeitura,
        convidarMembro: somenteLeitura, criarOficio: somenteLeitura,
        exportar: LIBERADO, pautasRestantes: 0, membrosRestantes: 0, limites,
      };
    }

    const maxQuadros = limites.max_quadros;
    const maxPautas = limites.max_pautas_por_quadro;
    const maxMembros = limites.max_membros;

    const criarQuadro = maxQuadros !== null && uso.quadros >= maxQuadros
      ? bloqueio(
          maxQuadros === 1
            ? 'O plano Solo tem um quadro. Você pode trocar o ofício dele quando quiser, trocar é grátis.'
            : `Seu plano permite ${maxQuadros} quadros.`,
        )
      : LIBERADO;

    const criarPauta = maxPautas !== null && pautasNoQuadroAtual >= maxPautas
      ? bloqueio(`Seu plano permite ${maxPautas} pautas por quadro. Arquive alguma ou faça upgrade.`)
      : LIBERADO;

    const ocupacaoMembros = uso.membros + uso.convitesAbertos;
    const convidarMembro = !podeAdministrar
      ? bloqueio('Só o dono ou um admin pode convidar pessoas.', false)
      : maxMembros !== null && ocupacaoMembros >= maxMembros
        ? bloqueio(
            maxMembros === 1
              ? 'Convidar pessoas faz parte do plano Time.'
              : `Seu plano permite ${maxMembros} membros, contando convites em aberto.`,
          )
        : LIBERADO;

    const criarOficio = !podeAdministrar
      ? bloqueio('Só o dono ou um admin cria ofícios.', false)
      : !limites.oficios_personalizados
        ? bloqueio('Ofícios personalizados fazem parte dos planos Estúdio e Time.')
        : LIBERADO;

    const exportar = limites.exportar
      ? LIBERADO
      : bloqueio('Exportar faz parte dos planos Estúdio e Time.');

    return {
      criarQuadro,
      criarPauta,
      convidarMembro,
      criarOficio,
      exportar,
      pautasRestantes: maxPautas === null ? null : Math.max(maxPautas - pautasNoQuadroAtual, 0),
      membrosRestantes: maxMembros === null ? null : Math.max(maxMembros - ocupacaoMembros, 0),
      limites,
    };
  }, [uso, workspace, gravavel, podeAdministrar, pautasNoQuadroAtual]);
}
