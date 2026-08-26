/**
 * Controle visual do quadro, densidade dos cards e exportação.
 *
 * Componente de props puras: não consulta serviço, não conhece plano e não sabe
 * o que é um ofício. Recebe a densidade atual, avisa quando ela muda, chama
 * `aoExportar` e mostra o motivo quando exportar está fora do plano. Quem sabe
 * dessas coisas é a página.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE `sessionStorage` E NÃO `localStorage`
 *
 * A densidade é conveniência de quem está olhando: não é dado do workspace, não
 * pertence ao tenant e não vale uma ida ao banco a cada clique. Guardar no
 * navegador é o certo, mas `localStorage.setItem` é proibido pelo ESLint
 * (`.eslintrc.cjs`), e a regra existe por causa de `docs/11_SEGURANCA`: nada
 * sensível em armazenamento persistente, e sessão é assunto do supabase-js.
 *
 * A regra é uma barreira grossa de propósito, ela não tenta julgar caso a caso
 * se o valor é sensível, porque essa avaliação é exatamente onde se erra. E
 * aqui `sessionStorage` não é só o desvio permitido, é o comportamento melhor:
 * a preferência vale para a aba onde a pessoa está trabalhando e some quando o
 * trabalho acaba, em vez de perseguir a pessoa por meses num dispositivo
 * compartilhado. É o mesmo armazenamento que o modo demonstração já usa
 * (`src/lib/demo/estado.ts`).
 */

import { useEffect, useRef, useState } from 'react';
import { Botao } from '@/components/shared/Botao';
import estilos from './ControleVisual.module.css';

export type Densidade = 'confortavel' | 'compacta';

/** Espelha o `Veredito` de `useLimites` sem depender dele. */
interface LimiteExportar {
  liberado: boolean;
  motivo: string;
}

interface Props {
  densidade: Densidade;
  aoTrocarDensidade: (densidade: Densidade) => void;
  /** Síncrono de propósito: erro em manipulador sobe para o `ErrorBoundary`. */
  aoExportar: () => void;
  limiteExportar: LimiteExportar;
}

const OPCOES: ReadonlyArray<{ valor: Densidade; rotulo: string; dica: string }> = [
  {
    valor: 'confortavel',
    rotulo: 'Confortável',
    dica: 'Cards com respiro: título, chips e prazo bem separados.',
  },
  {
    valor: 'compacta',
    rotulo: 'Compacta',
    dica: 'Cards mais baixos: cabe mais pauta na tela sem rolar.',
  },
];

const CHAVE = 'pautaria.densidade';

/** Quanto tempo o "Exportado ✓" fica na tela antes de voltar ao normal. */
const MS_CONFIRMACAO = 2400;

function ehDensidade(valor: string | null): valor is Densidade {
  return valor === 'confortavel' || valor === 'compacta';
}

function lerPreferencia(): Densidade | null {
  try {
    const guardada = sessionStorage.getItem(CHAVE);
    return ehDensidade(guardada) ? guardada : null;
  } catch {
    // Navegador com armazenamento bloqueado: sem preferência, e sem quebrar.
    return null;
  }
}

function guardarPreferencia(densidade: Densidade): void {
  try {
    sessionStorage.setItem(CHAVE, densidade);
  } catch {
    /* silencioso: é conveniência de leitura, não funcionalidade */
  }
}

export function ControleVisual({
  densidade,
  aoTrocarDensidade,
  aoExportar,
  limiteExportar,
}: Props) {
  const [exportado, setExportado] = useState(false);
  const restaurada = useRef(false);

  // O estado da densidade é do pai (o quadro precisa dele), mas a preferência é
  // deste controle. Restaurar, então, é avisar o pai uma única vez na montagem
  //, daí em diante quem manda é o clique. O `ref` guarda esse "uma vez" sem
  // precisar mentir sobre as dependências do efeito.
  useEffect(() => {
    if (restaurada.current) return;
    restaurada.current = true;

    const guardada = lerPreferencia();
    if (guardada && guardada !== densidade) aoTrocarDensidade(guardada);
  }, [densidade, aoTrocarDensidade]);

  // Sem isto, trocar de tela durante a confirmação atualizaria um componente
  // desmontado.
  useEffect(() => {
    if (!exportado) return;
    const relogio = setTimeout(() => setExportado(false), MS_CONFIRMACAO);
    return () => clearTimeout(relogio);
  }, [exportado]);

  function trocar(valor: Densidade) {
    guardarPreferencia(valor);
    aoTrocarDensidade(valor);
  }

  function exportar() {
    aoExportar();
    // O arquivo baixa em silêncio: sem esta confirmação, um clique que
    // funcionou e um clique que não fez nada são indistinguíveis na tela.
    setExportado(true);
  }

  return (
    <div className={estilos.controle}>
      <div className={estilos.alternador} role="group" aria-label="Densidade dos cards">
        {OPCOES.map((opcao) => {
          const ativa = opcao.valor === densidade;
          return (
            <button
              key={opcao.valor}
              type="button"
              aria-pressed={ativa}
              title={opcao.dica}
              className={ativa ? estilos.opcaoAtiva : estilos.opcao}
              onClick={() => trocar(opcao.valor)}
            >
              {opcao.rotulo}
            </button>
          );
        })}
      </div>

      <Botao
        variante="secundario"
        onClick={exportar}
        motivoDesabilitado={limiteExportar.liberado ? undefined : limiteExportar.motivo}
      >
        {exportado ? 'Exportado ✓' : 'Exportar CSV'}
      </Botao>

      {/* O rótulo do botão muda, mas um leitor de tela não relê sozinho o botão
          que já está em foco. A região viva conta o que aconteceu. */}
      <span className="apenas-leitor" role="status">
        {exportado ? 'Arquivo CSV gerado e baixado.' : ''}
      </span>
    </div>
  );
}
