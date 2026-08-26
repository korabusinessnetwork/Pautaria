/**
 * Seletor de quadros, a lista de quadros do workspace, na sidebar.
 *
 * O banco sempre permitiu vários quadros por workspace e o plano pago vende
 * isso; a sidebar é que só mostrava o primeiro. Este componente é a peça que
 * faltava, e ele existe separado da `Sidebar` por dois motivos:
 *
 * 1. Ele não lê contexto nenhum. Recebe `quadros`, `quadroAtivoId` e três
 *    callbacks, o que o torna montável num teste sem provedor, sem rede e sem
 *    sessão. A ligação com `useWorkspace`/`useLimites` acontece uma camada
 *    acima, onde já existe.
 * 2. O glifo e o accent de cada linha vêm **do ofício daquele quadro**, nunca
 *    do tema ativo. É a mesma decisão do seletor de ofício: a troca precisa ser
 *    legível *antes* de acontecer. Um quadro de Marketing pintado com o accent
 *    do quadro de TI que está aberto agora seria uma mentira visual.
 *
 * Nenhum nome de ofício aparece aqui, a lista vem do banco, e o par
 * (hue, chroma) vira as quatro variações do accent por construção.
 */

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import { Aviso } from '@/components/shared/Aviso';
import { Botao } from '@/components/shared/Botao';
import { normalizar } from '@/lib/erros';
import type { Oficio, Quadro } from '@/lib/tipos';
import { variaveisDeAccent } from '@/utils/tema';
import estilos from './SeletorQuadros.module.css';

/**
 * O quadro como esta lista precisa dele: identidade, título e o ofício já
 * resolvido. O `Quadro` do banco guarda só `oficioId`; casar id com ofício é
 * trabalho de quem tem as duas listas (o contexto), não desta linha da sidebar.
 */
export interface QuadroDoSeletor extends Pick<Quadro, 'id' | 'titulo'> {
  oficio: Pick<Oficio, 'nome' | 'glifo' | 'hue' | 'chroma'> | null;
}

export interface LimiteDeCriacao {
  liberado: boolean;
  motivo: string;
}

interface Props {
  quadros: QuadroDoSeletor[];
  quadroAtivoId: string | null;
  aoSelecionar: (quadroId: string) => void;
  /** Cria um quadro com este título. Pode ser assíncrono, o botão espera. */
  aoCriar: (titulo: string) => void | Promise<void>;
  aoRenomear: (quadroId: string, titulo: string) => void | Promise<void>;
  /** `false` esconde criar e renomear: membro comum não mexe na estrutura. */
  podeAdministrar: boolean;
  /** Veredito pronto de `useLimites().criarQuadro`. */
  limiteCriar: LimiteDeCriacao;
}

/** O que a área de edição está fazendo agora. */
type Modo =
  | { tipo: 'lista' }
  | { tipo: 'criando' }
  | { tipo: 'renomeando'; quadroId: string };

const LIMITE_TITULO = 60;
const MS_SUCESSO = 2600;

export function SeletorQuadros({
  quadros,
  quadroAtivoId,
  aoSelecionar,
  aoCriar,
  aoRenomear,
  podeAdministrar,
  limiteCriar,
}: Props) {
  const idCampo = useId();
  const [modo, setModo] = useState<Modo>({ tipo: 'lista' });
  const [rascunho, setRascunho] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<unknown>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const entrada = useRef<HTMLInputElement | null>(null);
  const botoesQuadro = useRef(new Map<string, HTMLButtonElement>());
  const botaoNovo = useRef<HTMLButtonElement | null>(null);
  // Para onde o foco volta quando a edição termina. Sem isto, quem renomeia
  // pelo teclado é devolvido ao topo do documento e perde o lugar na sidebar.
  const focoAoSair = useRef<string | null>(null);

  const editando = modo.tipo !== 'lista';

  useEffect(() => {
    if (editando) entrada.current?.focus();
  }, [editando, modo]);

  useEffect(() => {
    if (editando) return;
    const alvo = focoAoSair.current;
    if (!alvo) return;
    focoAoSair.current = null;
    const botao = alvo === 'novo' ? botaoNovo.current : botoesQuadro.current.get(alvo);
    botao?.focus();
  }, [editando]);

  // A confirmação some sozinha: é feedback, não histórico.
  useEffect(() => {
    if (!sucesso) return;
    const timer = window.setTimeout(() => setSucesso(null), MS_SUCESSO);
    return () => window.clearTimeout(timer);
  }, [sucesso]);

  const unico = quadros.length === 1;
  const vazio = quadros.length === 0;

  const motivoAdministrar = podeAdministrar
    ? undefined
    : 'Só o dono ou um admin cria e renomeia quadros.';
  const motivoCriar = motivoAdministrar ?? (limiteCriar.liberado ? undefined : limiteCriar.motivo);

  function abrirCriacao() {
    setErro(null);
    setSucesso(null);
    setRascunho('');
    focoAoSair.current = 'novo';
    setModo({ tipo: 'criando' });
  }

  function abrirRenomeacao(quadro: QuadroDoSeletor) {
    if (!podeAdministrar) return;
    setErro(null);
    setSucesso(null);
    setRascunho(quadro.titulo);
    focoAoSair.current = quadro.id;
    setModo({ tipo: 'renomeando', quadroId: quadro.id });
  }

  function cancelar() {
    setRascunho('');
    setErro(null);
    setModo({ tipo: 'lista' });
  }

  async function confirmar(evento: FormEvent) {
    evento.preventDefault();
    const titulo = rascunho.trim();
    if (!titulo || modo.tipo === 'lista') return;

    setErro(null);
    setSalvando(true);
    try {
      if (modo.tipo === 'criando') {
        await aoCriar(titulo);
        setSucesso('Quadro criado ✓');
      } else {
        await aoRenomear(modo.quadroId, titulo);
        setSucesso('Nome atualizado ✓');
      }
      setRascunho('');
      setModo({ tipo: 'lista' });
    } catch (e) {
      // O formulário continua aberto com o texto digitado: perder o que a
      // pessoa escreveu porque a rede caiu é castigo pelo erro de outro.
      setErro(normalizar(e));
    } finally {
      setSalvando(false);
    }
  }

  /** Esc cancela em qualquer campo de edição, atalho esperado, não enfeite. */
  function teclado(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === 'Escape') {
      evento.preventDefault();
      cancelar();
    }
  }

  function formulario(rotulo: string, acao: string) {
    return (
      <form className={estilos.formulario} onSubmit={(e) => void confirmar(e)}>
        <label className={estilos.rotuloCampo} htmlFor={idCampo}>
          {rotulo}
        </label>
        <input
          id={idCampo}
          ref={entrada}
          className={estilos.entrada}
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          onKeyDown={teclado}
          maxLength={LIMITE_TITULO}
          autoComplete="off"
          disabled={salvando}
        />
        <span className={estilos.dica}>Enter salva · Esc cancela</span>
        <div className={estilos.acoes}>
          <Botao
            type="submit"
            carregando={salvando}
            motivoDesabilitado={rascunho.trim() ? undefined : 'Dê um nome ao quadro para salvar.'}
          >
            {acao}
          </Botao>
          <Botao variante="fantasma" onClick={cancelar} disabled={salvando}>
            Cancelar
          </Botao>
        </div>
      </form>
    );
  }

  return (
    <nav
      className={unico ? `${estilos.raiz} ${estilos.discreto}` : estilos.raiz}
      aria-label="Quadros do workspace"
      aria-busy={salvando || undefined}
    >
      {/* Com um quadro só, o rótulo de seção seria mobília: a linha única já se
          explica. Ele volta assim que existe escolha a fazer. */}
      {!unico ? <span className={estilos.rotuloSecao}>QUADROS</span> : null}

      {vazio ? (
        <p className={estilos.vazio}>
          Nenhum quadro por aqui ainda.
          <span className={estilos.vazioDica}>
            Crie o primeiro para começar a pautar, o ofício escolhido já traz as etapas
            prontas.
          </span>
        </p>
      ) : (
        <ul className={estilos.lista}>
          {quadros.map((quadro) => {
            const ativo = quadro.id === quadroAtivoId;
            const renomeando = modo.tipo === 'renomeando' && modo.quadroId === quadro.id;
            const accent = quadro.oficio
              ? (variaveisDeAccent(quadro.oficio.hue, quadro.oficio.chroma) as CSSProperties)
              : undefined;

            return (
              <li key={quadro.id} className={estilos.linha} style={accent}>
                {renomeando ? (
                  formulario('Novo nome do quadro', 'Salvar')
                ) : (
                  <>
                    <button
                      type="button"
                      ref={(no) => {
                        if (no) botoesQuadro.current.set(quadro.id, no);
                        else botoesQuadro.current.delete(quadro.id);
                      }}
                      className={ativo ? estilos.itemAtivo : estilos.item}
                      onClick={() => aoSelecionar(quadro.id)}
                      onDoubleClick={() => abrirRenomeacao(quadro)}
                      aria-current={ativo ? 'true' : undefined}
                      title={
                        quadro.oficio
                          ? `Abrir ${quadro.titulo} · ofício ${quadro.oficio.nome}`
                          : `Abrir ${quadro.titulo}`
                      }
                      disabled={editando}
                    >
                      <span className={estilos.glifo} aria-hidden="true">
                        {quadro.oficio?.glifo ?? '·'}
                      </span>
                      <span className={estilos.texto}>
                        <span className={estilos.titulo}>{quadro.titulo}</span>
                        {quadro.oficio ? (
                          <span className={estilos.oficio}>{quadro.oficio.nome}</span>
                        ) : null}
                      </span>
                    </button>

                    {/* O duplo clique é o gesto rápido; este botão é o caminho
                        de teclado equivalente, e o único que existe no toque. */}
                    {podeAdministrar ? (
                      <button
                        type="button"
                        className={estilos.renomear}
                        onClick={() => abrirRenomeacao(quadro)}
                        aria-label={`Renomear o quadro ${quadro.titulo}`}
                        title={`Renomear o quadro ${quadro.titulo}`}
                        disabled={editando}
                      >
                        ✎
                      </button>
                    ) : null}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {podeAdministrar || vazio ? (
        modo.tipo === 'criando' ? (
          formulario('Nome do novo quadro', 'Criar quadro')
        ) : (
          <>
            <Botao
              ref={botaoNovo}
              variante="fantasma"
              larguraTotal
              onClick={abrirCriacao}
              motivoDesabilitado={motivoCriar}
              className={estilos.novo}
            >
              + Novo quadro
            </Botao>
            {/* O motivo já viaja no `title` e no `aria-describedby` do Botao;
                aqui ele também fica à vista, porque tooltip não existe no
                toque. `aria-hidden` evita o leitor de tela dizer duas vezes. */}
            {motivoCriar ? (
              <span className={estilos.motivo} aria-hidden="true">
                {motivoCriar}
              </span>
            ) : null}
          </>
        )
      ) : null}

      {erro ? (
        <div className={estilos.erro}>
          <Aviso erro={erro} aoFechar={() => setErro(null)} />
        </div>
      ) : null}

      <span className={estilos.sucesso} role="status">
        {sucesso}
      </span>
    </nav>
  );
}
