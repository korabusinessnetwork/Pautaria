/**
 * Landing pública — a porta do funil.
 *
 * É a primeira tela que alguém vê do Pautaria, e ela tem uma única obrigação:
 * fazer a promessa ("toda pauta tem um sotaque") e **provar** a promessa na
 * mesma rolagem. Por isso a vitrine dos ofícios não é uma lista de features com
 * ícone — é o quadro real de cada ofício, com as etapas reais e os rótulos de
 * campo reais. Quem chega aqui vê o produto antes de criar conta.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE A VITRINE É CONSTANTE LOCAL E NÃO CONSULTA AO BANCO
 *
 * `oficios` só é legível por usuário autenticado (RLS, migration 0003), e esta
 * página existe justamente para quem ainda não tem conta. Mesmo que a política
 * mudasse, a north star é tempo até o primeiro quadro útil: a porta do funil
 * não pode depender de ida e volta à rede para desenhar seu argumento
 * principal.
 *
 * A constante `VITRINE_DE_OFICIOS` foi então modelada com os **mesmos nomes de
 * campo da tabela** (`campo1Label`, `tituloQuadro`, `hue`, `chroma`, `mono`).
 * No dia em que existir um endpoint público de catálogo, trocar a origem é
 * trocar a linha do `const` por um `useQuery` — nenhum JSX abaixo sabe que
 * "Marketing" existe: tudo é lido do objeto.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OS QUATRO ESTADOS
 *
 * O único dado assíncrono desta página é o catálogo de planos, e ele carrega os
 * quatro estados (carregando, vazio, erro, sucesso) na seção de preço. O resto
 * é vitrine estática — de propósito, pelo motivo acima. Os preços, esses, vêm
 * do banco: a mesma tabela que a Edge Function lê para cobrar. Preço escrito no
 * JSX é promessa que ninguém validou.
 */

import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { listarPlanos } from '@/lib/assinaturas.service';
import { useSessao } from '@/context/SessaoContext';
import { formatarPreco } from '@/utils/formato';
import { accentDe, variaveisDeAccent } from '@/utils/tema';
import { Chip } from '@/components/shared/Chip';
import { Etiqueta } from '@/components/shared/Etiqueta';
import { CarregandoInline } from '@/components/shared/Carregando';
import estilos from './Landing.module.css';

/**
 * Para onde vai quem já está logado e cai na landing.
 *
 * Hoje `/` é o `Destino` (rota protegida). Quando esta página assumir `/`, o
 * `Destino` precisa de rota própria — ver a nota de integração. A rota vive
 * numa constante para que essa troca seja uma linha, e não uma caçada.
 */
const ROTA_DO_APP = '/app';

// ─────────────────────────────────────────────────────────────────────────────
// A vitrine
// ─────────────────────────────────────────────────────────────────────────────

interface CartaoDaVitrine {
  titulo: string;
  campo1: string;
  campo2: string;
  /** Rótulo curto de prazo, como o card do quadro mostra. `null` = sem prazo. */
  prazo: string | null;
  atrasado?: boolean;
}

interface ColunaDaVitrine {
  /** Índice em `etapas` — assim a coluna nunca discorda do nome da etapa. */
  etapa: number;
  cartoes: CartaoDaVitrine[];
}

interface OficioDaVitrine {
  chave: string;
  nome: string;
  glifo: string;
  descricao: string;
  hue: number;
  chroma: number;
  tituloQuadro: string;
  campo1Label: string;
  campo2Label: string;
  /** Chips e etiquetas em monoespaçada — é do ofício, não do componente. */
  mono: boolean;
  etapas: string[];
  colunas: ColunaDaVitrine[];
}

/**
 * Espelho da seed `supabase/seeds/0001_oficios.sql`. Se um ofício mudar lá,
 * muda aqui — e só aqui.
 *
 * A última coluna de cada ofício fica vazia de propósito: o estado vazio que
 * ensina a próxima ação é parte do produto, e a landing mostra o produto.
 *
 * O tipo é tupla não-vazia (`[T, ...T[]]`) para que o primeiro item seja o
 * ofício de partida sem `!` nem checagem de `undefined`: uma vitrine vazia não
 * é um estado possível deste produto, e o compilador passa a saber disso.
 */
const VITRINE_DE_OFICIOS: [OficioDaVitrine, ...OficioDaVitrine[]] = [
  {
    chave: 'mkt',
    nome: 'Marketing',
    glifo: '▲',
    descricao: 'Da ideia ao publicado, cada canal no seu ritmo.',
    hue: 45,
    chroma: 0.16,
    tituloQuadro: 'Pauta de conteúdo',
    campo1Label: 'Canal',
    campo2Label: 'Campanha',
    mono: false,
    etapas: ['Ideias', 'Roteiro', 'Produção', 'Aprovação', 'Publicado'],
    colunas: [
      {
        etapa: 0,
        cartoes: [
          {
            titulo: 'Série: bastidores do estúdio',
            campo1: 'Instagram',
            campo2: 'Marca · mensal',
            prazo: 'qua',
          },
        ],
      },
      {
        etapa: 1,
        cartoes: [
          {
            titulo: 'Reels — 3 erros de quem começa',
            campo1: 'Instagram',
            campo2: 'Aquisição',
            prazo: 'sex',
          },
        ],
      },
      {
        etapa: 2,
        cartoes: [
          {
            titulo: 'Newsletter #42 — cases',
            campo1: 'E-mail',
            campo2: 'Retenção',
            prazo: 'há 2 dias',
            atrasado: true,
          },
        ],
      },
      { etapa: 3, cartoes: [] },
    ],
  },
  {
    chave: 'ti',
    nome: 'TI · Dev',
    glifo: '■',
    descricao: 'Sprint, review e deploy no mesmo trilho.',
    hue: 160,
    chroma: 0.13,
    tituloQuadro: 'Pauta do time',
    campo1Label: 'Sprint',
    campo2Label: 'Estimativa',
    mono: true,
    etapas: ['Backlog', 'Em dev', 'Code review', 'QA', 'Deploy'],
    colunas: [
      {
        etapa: 0,
        cartoes: [
          {
            titulo: 'Migrar fila para worker',
            campo1: 'Sprint 15',
            campo2: '8 pts',
            prazo: 'seg',
          },
        ],
      },
      {
        etapa: 1,
        cartoes: [
          {
            titulo: 'Login por passkey',
            campo1: 'Sprint 14',
            campo2: '5 pts',
            prazo: 'qui',
          },
        ],
      },
      {
        etapa: 2,
        cartoes: [
          {
            titulo: 'Fuso errado no relatório',
            campo1: 'Sprint 14',
            campo2: '2 pts',
            prazo: 'há 1 dia',
            atrasado: true,
          },
        ],
      },
      { etapa: 3, cartoes: [] },
    ],
  },
  {
    chave: 'prod',
    nome: 'Produtividade',
    glifo: '●',
    descricao: 'Sua semana em quatro colunas honestas.',
    hue: 265,
    chroma: 0.13,
    tituloQuadro: 'Minha semana',
    campo1Label: 'Contexto',
    campo2Label: 'Energia',
    mono: false,
    etapas: ['Entrada', 'Hoje', 'Esta semana', 'Feito'],
    colunas: [
      {
        etapa: 0,
        cartoes: [
          { titulo: 'Marcar dentista', campo1: 'Rápida', campo2: 'Baixa', prazo: null },
        ],
      },
      {
        etapa: 1,
        cartoes: [
          { titulo: 'Treino de força', campo1: 'Saúde', campo2: 'Alta', prazo: 'hoje' },
        ],
      },
      {
        etapa: 2,
        cartoes: [
          {
            titulo: 'Capítulo 4 — curso de UX',
            campo1: 'Estudo',
            campo2: 'Alta',
            prazo: 'sex',
          },
        ],
      },
      { etapa: 3, cartoes: [] },
    ],
  },
];

export function Landing() {
  // Enquanto a sessão carrega, a página mostra o caminho público — é o caso da
  // esmagadora maioria de quem chega aqui, e evita o pisca-pisca de trocar o
  // CTA depois. Sem isso, quem já está logado veria "Entrar" por um instante.
  const { autenticado } = useSessao();

  const [oficioEmFoco, setOficioEmFoco] = useState<OficioDaVitrine>(VITRINE_DE_OFICIOS[0]);

  const planos = useQuery({ queryKey: ['planos'], queryFn: listarPlanos });
  const catalogo = planos.data ?? [];

  return (
    <div className={estilos.pagina}>
      <a href="#conteudo" className="pular-para-conteudo">
        Pular para o conteúdo
      </a>

      <header className={estilos.barra}>
        <span className={estilos.marca}>
          <span className={estilos.bolinha} aria-hidden="true" />
          <span className={estilos.wordmark}>Pautaria</span>
        </span>

        <nav className={estilos.barraLinks} aria-label="Atalhos">
          <Link to="/precos" className={estilos.linkBarra}>
            Preços
          </Link>
          {autenticado ? (
            <Link to={ROTA_DO_APP} className={estilos.linkBarra}>
              Meu quadro
            </Link>
          ) : (
            <Link to="/entrar" className={estilos.linkBarra}>
              Entrar
            </Link>
          )}
        </nav>
      </header>

      <main id="conteudo">
        {/* ── 1 · Herói ─────────────────────────────────────────────────── */}
        <section className={estilos.heroi}>
          <span className={estilos.eyebrow}>PAUTARIA · SISTEMA DE PAUTA POR OFÍCIO</span>

          <h1 className={estilos.titulo}>
            Toda pauta tem <span className={estilos.destaque}>um sotaque.</span>
          </h1>

          <p className={estilos.subtitulo}>
            Escolha o seu ofício e o quadro chega montado: as etapas certas, os campos
            com o nome que você já usa e pautas de exemplo no lugar. Nenhuma tela de
            setup no caminho.
          </p>

          <div className={estilos.acoes}>
            {/* Navegação é link, não botão: precisa abrir em outra aba, ser
                copiada e aparecer no histórico. */}
            <Link
              to={autenticado ? ROTA_DO_APP : '/criar-conta'}
              className={estilos.ctaPrincipal}
            >
              {autenticado ? 'Ir para o meu quadro' : 'Começar grátis'}
            </Link>
            <Link to="/precos" className={estilos.ctaSecundario}>
              Ver preços
            </Link>
          </div>

          <p className={estilos.notaCta}>
            Sem cartão. Do cadastro ao primeiro quadro em menos de um minuto.
          </p>
        </section>

        {/* ── 2 · O problema ────────────────────────────────────────────── */}
        <section className={estilos.problema} aria-labelledby="tit-problema">
          <h2 id="tit-problema" className={estilos.rotulo}>
            O problema
          </h2>
          <p className={estilos.frase}>
            Toda ferramenta genérica começa igual — uma tela em branco, três colunas
            chamadas <em>To do · Doing · Done</em> e a conta de inventar o resto, que
            ninguém termina de pagar às 14h de uma terça.
          </p>
        </section>

        {/* ── 3 · Os três ofícios ───────────────────────────────────────── */}
        <section className={estilos.vitrine} aria-labelledby="tit-oficios">
          <span className={estilos.rotulo}>A inversão</span>
          <h2 id="tit-oficios" className={estilos.tituloSecao}>
            O ofício é a configuração.
          </h2>
          <p className={estilos.apoio}>
            Três ofícios, três quadros diferentes. Escolha um — com o mouse ou pelo
            teclado — e o quadro logo abaixo troca de sotaque junto.
          </p>

          <div className={estilos.grade}>
            {VITRINE_DE_OFICIOS.map((oficio) => {
              const emFoco = oficio.chave === oficioEmFoco.chave;
              const accent = accentDe(oficio.hue, oficio.chroma);

              return (
                <button
                  key={oficio.chave}
                  type="button"
                  aria-pressed={emFoco}
                  className={emFoco ? estilos.tileAtivo : estilos.tile}
                  onMouseEnter={() => setOficioEmFoco(oficio)}
                  onFocus={() => setOficioEmFoco(oficio)}
                  onClick={() => setOficioEmFoco(oficio)}
                  /* Não é estilo inline: é o par (hue, chroma) do ofício virando
                     token. As regras continuam todas no CSS Module — que só usa
                     estas variáveis em :hover e no estado escolhido, para o bloco
                     nascer neutro e assumir o accent quando for a vez dele. */
                  style={
                    {
                      '--tile-ac': accent.ac,
                      '--tile-soft': accent.acSoft,
                      '--tile-deep': accent.acDeep,
                    } as CSSProperties
                  }
                >
                  <span className={estilos.glifo} aria-hidden="true">
                    {oficio.glifo}
                  </span>
                  <span className={estilos.nomeOficio}>{oficio.nome}</span>
                  <span className={estilos.descricaoOficio}>{oficio.descricao}</span>

                  <span className={estilos.blocoRotulo}>Etapas</span>
                  <span className={estilos.listaEtapas}>
                    {oficio.etapas.map((etapa) => (
                      <span
                        key={etapa}
                        className={oficio.mono ? estilos.etapaTagMono : estilos.etapaTag}
                      >
                        {etapa}
                      </span>
                    ))}
                  </span>

                  <span className={estilos.blocoRotulo}>Campos da pauta</span>
                  <span className={estilos.listaCampos}>
                    <span className={oficio.mono ? estilos.campoTagMono : estilos.campoTag}>
                      {oficio.campo1Label}
                    </span>
                    <span className={oficio.mono ? estilos.campoTagMono : estilos.campoTag}>
                      {oficio.campo2Label}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── 4 · Prova do produto ──────────────────────────────────────── */}
        <section className={estilos.prova} aria-labelledby="tit-prova">
          <span className={estilos.rotulo}>O quadro</span>
          <h2 id="tit-prova" className={estilos.tituloSecao}>
            {oficioEmFoco.tituloQuadro}
          </h2>
          <p className={estilos.apoio} aria-live="polite">
            {oficioEmFoco.nome} · campos {oficioEmFoco.campo1Label} e{' '}
            {oficioEmFoco.campo2Label} · {oficioEmFoco.etapas.length} etapas
          </p>

          {/* O accent do ofício em foco vira token aqui, e desce por herança
              para Etiqueta e Chip — os mesmos componentes do quadro de verdade,
              não uma imitação desenhada só para a landing. */}
          <div
            className={estilos.mesa}
            style={variaveisDeAccent(oficioEmFoco.hue, oficioEmFoco.chroma) as CSSProperties}
          >
            <div className={estilos.trilho}>
              {oficioEmFoco.colunas.map((coluna) => {
                const nomeEtapa = oficioEmFoco.etapas[coluna.etapa] ?? '';

                return (
                  <div key={nomeEtapa} className={estilos.coluna}>
                    <div className={estilos.cabecalhoColuna}>
                      <Etiqueta>{nomeEtapa}</Etiqueta>
                      <span className={estilos.contagem}>{coluna.cartoes.length}</span>
                    </div>

                    {coluna.cartoes.length === 0 ? (
                      <p className={estilos.colunaVazia}>solte uma pauta aqui</p>
                    ) : (
                      <div className={estilos.pilha}>
                        {coluna.cartoes.map((cartao) => (
                          <article key={cartao.titulo} className={estilos.cartao}>
                            <span className={estilos.pino} aria-hidden="true" />
                            <h3 className={estilos.tituloCartao}>{cartao.titulo}</h3>
                            <div className={estilos.chips}>
                              <Chip mono={oficioEmFoco.mono}>{cartao.campo1}</Chip>
                              <Chip variante="contorno" mono={oficioEmFoco.mono}>
                                {cartao.campo2}
                              </Chip>
                            </div>
                            {cartao.prazo === null ? (
                              <span className={estilos.semPrazo}>sem prazo</span>
                            ) : (
                              <span
                                className={
                                  cartao.atrasado ? estilos.prazoAtrasado : estilos.prazo
                                }
                              >
                                {cartao.prazo}
                              </span>
                            )}
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <p className={estilos.legenda}>
            Este quadro não foi montado por ninguém: é o que aparece na tela ao escolher
            o ofício, exemplos inclusive.
          </p>
        </section>

        {/* ── 5 · Preço em uma linha ────────────────────────────────────── */}
        <section className={estilos.preco} aria-labelledby="tit-preco">
          <h2 id="tit-preco" className={estilos.rotulo}>
            Preço
          </h2>

          {planos.isLoading ? (
            <CarregandoInline mensagem="Consultando os planos…" />
          ) : planos.error || catalogo.length === 0 ? (
            /* Erro e catálogo vazio dizem a mesma coisa a quem visita — não sei o
               preço agora — e têm a mesma próxima ação. Um alerta vermelho na
               porta do funil assustaria mais do que informa; a frase é discreta,
               honesta e leva para a página que tem a resposta. */
            <p className={estilos.precoIndisponivel}>
              Não conseguimos carregar os preços agora.{' '}
              <Link to="/precos">Ver a página de planos →</Link>
            </p>
          ) : (
            <p className={estilos.linhaPreco}>
              {catalogo.map((plano) => (
                <span key={plano.chave} className={estilos.itemPreco}>
                  <span className={estilos.nomePlano}>{plano.nome}</span>
                  <span className={estilos.valorPlano}>
                    {plano.gratuito
                      ? 'grátis'
                      : `${formatarPreco(plano.precoMensalCentavos)}/mês`}
                  </span>
                </span>
              ))}
            </p>
          )}

          <p className={estilos.apoio}>
            O grátis é permanente, não é degustação de sete dias.{' '}
            <Link to="/precos">Ver o que muda em cada plano →</Link>
          </p>
        </section>
      </main>

      {/* ── 6 · Rodapé ──────────────────────────────────────────────────── */}
      <footer className={estilos.rodape}>
        <span className={estilos.marca}>
          <span className={estilos.bolinha} aria-hidden="true" />
          <span className={estilos.wordmark}>Pautaria</span>
        </span>
        <p className={estilos.assinatura}>Toda pauta tem um sotaque.</p>

        <nav className={estilos.rodapeLinks} aria-label="Links do rodapé">
          <Link to="/entrar">Entrar</Link>
          <Link to="/criar-conta">Criar conta</Link>
          <Link to="/precos">Preços</Link>
          <Link to="/termos">Termos</Link>
          <Link to="/privacidade">Privacidade</Link>
        </nav>
      </footer>
    </div>
  );
}
