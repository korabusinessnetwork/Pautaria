/**
 * Arquivadas, o arquivo do quadro, e o caminho de volta.
 *
 * Esta tela existe para desfazer uma mentira da UI. No banco, arquivar sempre
 * foi reversível: `pautas.arquivada_em` volta a `null` e a pauta reaparece no
 * quadro. Mas enquanto não havia tela para ver o que estava arquivado, o drawer
 * tratava a ação como irreversível e pedia confirmação (`memory/bugs.md` L2),
 * porque uma pauta que some sem lugar para reencontrá-la é, na prática, uma
 * pauta perdida. Com o arquivo à vista, arquivar volta a ser o que o banco
 * sempre disse que era.
 *
 * A consequência de produto é a hierarquia das duas ações daqui:
 *
 * - **Desarquivar** é reversível (basta arquivar de novo) e por isso é um
 *   clique só, sem confirmação. Mas *recria uma pauta ativa*, então respeita o
 *   teto do plano, e nasce desabilitado com o motivo à vista quando não cabe.
 * - **Excluir definitivamente** é a única ação desta tela sem volta: não há
 *   lixeira depois dela. Essa sim confirma, e o texto da confirmação diz
 *   exatamente isso, com o título da pauta escrito por extenso, para que o
 *   segundo clique seja sobre uma pauta específica, não sobre "aquele botão
 *   vermelho".
 */

import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ProvedorWorkspace, useWorkspace } from '@/context/WorkspaceContext';
import * as pautasService from '@/lib/pautas.service';
import { useLimites } from '@/hooks/useLimites';
import { normalizar } from '@/lib/erros';
import { diasAte, formatarDataCurta, formatarDataLonga, pluralizar } from '@/utils/formato';
import { Botao } from '@/components/shared/Botao';
import { Aviso } from '@/components/shared/Aviso';
import { Chip } from '@/components/shared/Chip';
import { Etiqueta } from '@/components/shared/Etiqueta';
import { Carregando, CarregandoInline } from '@/components/shared/Carregando';
import { NaoEncontrado } from './NaoEncontrado';
import type { Pauta } from '@/lib/tipos';
import estilos from './Arquivadas.module.css';

export function Arquivadas() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return <NaoEncontrado />;
  return (
    <ProvedorWorkspace slug={slug}>
      <Conteudo />
    </ProvedorWorkspace>
  );
}

/**
 * "arquivada há 3 dias" responde a pergunta que a pessoa tem ("saiu do quadro
 * faz tempo?") melhor do que "17/08/2026". A data exata continua acessível no
 * `title`, para quem precisa dela.
 */
function quandoArquivada(iso: string | null): string {
  const dias = diasAte(iso);
  if (dias === null) return 'em data desconhecida';
  if (dias === 0) return 'hoje';
  if (dias === -1) return 'ontem';
  if (dias > -30) return `há ${Math.abs(dias)} dias`;
  return `em ${formatarDataCurta(iso)}`;
}

function Conteudo() {
  const { workspace, quadros, quadroAtivo, oficioAtivo, gravavel, carregando, selecionarQuadro } =
    useWorkspace();
  const cliente = useQueryClient();

  const [parametros, setParametros] = useSearchParams();
  const quadroPedido = parametros.get('quadro');

  const [erro, setErro] = useState<unknown>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [devolvida, setDevolvida] = useState<string | null>(null);

  // O quadro vem da URL para que o link do arquivo seja compartilhável e para
  // que voltar do arquivo caia no mesmo quadro de onde se saiu. Id inválido não
  // quebra nada: o contexto cai no primeiro quadro do workspace.
  useEffect(() => {
    if (quadroPedido) selecionarQuadro(quadroPedido);
  }, [quadroPedido, selecionarQuadro]);

  const consultaArquivadas = useQuery({
    queryKey: ['pautas-arquivadas', quadroAtivo?.id],
    queryFn: () => pautasService.listarArquivadas(quadroAtivo!.id),
    enabled: Boolean(quadroAtivo?.id),
  });

  // As ativas não são exibidas: elas contam. O teto do plano é por quadro, e
  // desarquivar cria uma pauta ativa, sem esse número, o botão não sabe se
  // pode ser oferecido. A chave é a mesma do quadro, então o cache é o mesmo.
  const consultaAtivas = useQuery({
    queryKey: ['pautas', quadroAtivo?.id],
    queryFn: () => pautasService.listarPautas(quadroAtivo!.id),
    enabled: Boolean(quadroAtivo?.id),
  });

  const limites = useLimites(consultaAtivas.data?.length ?? 0);

  function recarregarContagens() {
    void cliente.invalidateQueries({ queryKey: ['pautas-arquivadas', quadroAtivo?.id] });
    void cliente.invalidateQueries({ queryKey: ['pautas', quadroAtivo?.id] });
    void cliente.invalidateQueries({ queryKey: ['uso', workspace?.id] });
  }

  const desarquivamento = useMutation({
    mutationFn: (pauta: Pauta) => pautasService.desarquivarPauta(pauta.id),
    onSuccess: (_resultado, pauta) => {
      setDevolvida(pauta.titulo);
      recarregarContagens();
    },
    onError: (e) => setErro(normalizar(e)),
  });

  const exclusao = useMutation({
    mutationFn: (pauta: Pauta) => pautasService.excluirPauta(pauta.id),
    onSuccess: () => {
      setConfirmandoId(null);
      recarregarContagens();
    },
    onError: (e) => setErro(normalizar(e)),
  });

  if (carregando) return <Carregando mensagem="Abrindo o arquivo…" />;
  if (!workspace) return <NaoEncontrado />;

  const arquivadas = consultaArquivadas.data ?? [];
  // Sem `?quadro=` de volta: a tela do quadro ainda não lê esse parâmetro, e um
  // link que promete abrir um quadro específico e abre outro é pior que um link
  // simples. Quando `PaginaWorkspace` passar a honrar o parâmetro, é aqui.
  const linkDoQuadro = `/w/${workspace.slug}`;

  const motivoSomenteLeitura = gravavel
    ? undefined
    : 'Este workspace está em modo somente leitura, nada pode ser alterado agora.';

  // Desarquivar recria uma pauta ativa: o veredito de criar pauta é o mesmo, e
  // a frase ganha o contexto que faltava para o motivo fazer sentido aqui.
  const motivoDesarquivar =
    motivoSomenteLeitura ??
    (limites.criarPauta.liberado
      ? undefined
      : `Desarquivar devolve a pauta ao quadro e ela volta a ocupar uma vaga. ${limites.criarPauta.motivo}`);

  return (
    <div className={estilos.tela}>
      <header className={estilos.cabecalho}>
        <Link to={linkDoQuadro} className={estilos.voltar}>
          ← Voltar ao quadro
        </Link>
        <h1 className={estilos.titulo}>Arquivadas</h1>
        <p className={estilos.subtitulo}>
          {quadroAtivo
            ? arquivadas.length === 0
              ? `Nada guardado em ${quadroAtivo.titulo}.`
              : `${pluralizar(arquivadas.length, 'pauta guardada', 'pautas guardadas')} em ${quadroAtivo.titulo}.`
            : 'Escolha um quadro para ver o arquivo dele.'}
        </p>
      </header>

      {quadros.length > 1 ? (
        <nav className={estilos.seletor} aria-label="Quadro">
          {quadros.map((quadro) => {
            const ativo = quadro.id === quadroAtivo?.id;
            return (
              <button
                key={quadro.id}
                type="button"
                className={ativo ? estilos.abaAtiva : estilos.aba}
                aria-pressed={ativo}
                onClick={() => {
                  setConfirmandoId(null);
                  setDevolvida(null);
                  selecionarQuadro(quadro.id);
                  setParametros({ quadro: quadro.id }, { replace: true });
                }}
              >
                {quadro.titulo}
              </button>
            );
          })}
        </nav>
      ) : null}

      {erro ? (
        <Aviso
          erro={erro}
          aoFechar={() => setErro(null)}
          linkPlano={`/w/${workspace.slug}/plano`}
        />
      ) : null}

      {devolvida ? (
        <Aviso tom="info" aoFechar={() => setDevolvida(null)}>
          <span>
            <strong>{devolvida}</strong> voltou para o quadro.{' '}
            <Link to={linkDoQuadro} className={estilos.linkAviso}>
              Ver no quadro →
            </Link>
          </span>
        </Aviso>
      ) : null}

      <section className={estilos.painel}>
        {!quadroAtivo ? (
          <div className={estilos.vazio}>
            <p className={estilos.vazioTitulo}>Você ainda não tem um quadro.</p>
            <p className={estilos.vazioTexto}>
              O arquivo guarda as pautas de um quadro. Crie o primeiro e ele aparece aqui.
            </p>
            <Link to={`/w/${workspace.slug}`} className={estilos.vazioAcao}>
              Ir para o quadro →
            </Link>
          </div>
        ) : consultaArquivadas.isLoading ? (
          <CarregandoInline mensagem="Procurando o que foi arquivado…" />
        ) : consultaArquivadas.isError ? (
          <div className={estilos.vazio}>
            <Aviso erro={consultaArquivadas.error} />
            <Botao variante="secundario" onClick={() => void consultaArquivadas.refetch()}>
              Tentar de novo
            </Botao>
          </div>
        ) : arquivadas.length === 0 ? (
          <div className={estilos.vazio}>
            <p className={estilos.vazioTitulo}>Nada arquivado.</p>
            <p className={estilos.vazioTexto}>
              Pautas arquivadas somem do quadro e ficam guardadas aqui. Para arquivar uma,
              abra a pauta no quadro e use <strong>Arquivar pauta</strong>, dá para trazer
              de volta a qualquer momento.
            </p>
            <Link to={linkDoQuadro} className={estilos.vazioAcao}>
              Ir para o quadro →
            </Link>
          </div>
        ) : (
          <ul className={estilos.lista}>
            {arquivadas.map((pauta) => {
              const etapa = oficioAtivo?.etapas.find((e) => e.id === pauta.etapaId);
              const confirmando = confirmandoId === pauta.id;
              const ocupada =
                (desarquivamento.isPending && desarquivamento.variables?.id === pauta.id) ||
                (exclusao.isPending && exclusao.variables?.id === pauta.id);

              return (
                <li key={pauta.id} className={estilos.item}>
                  {/* O pino continua ali, apagado: a ficha existe, mas não está
                      mais no mural. É a mesma metáfora do card, no negativo. */}
                  <span className={estilos.pino} aria-hidden="true" />

                  <div className={estilos.info}>
                    <span className={estilos.tituloPauta}>{pauta.titulo}</span>

                    {pauta.campo1 || pauta.campo2 ? (
                      <span className={estilos.chips}>
                        {pauta.campo1 ? (
                          <span title={`${oficioAtivo?.campo1Label ?? ''}: ${pauta.campo1}`}>
                            <Chip variante="preenchido" mono={oficioAtivo?.mono}>
                              {pauta.campo1}
                            </Chip>
                          </span>
                        ) : null}
                        {pauta.campo2 ? (
                          <span title={`${oficioAtivo?.campo2Label ?? ''}: ${pauta.campo2}`}>
                            <Chip variante="contorno" mono={oficioAtivo?.mono}>
                              {pauta.campo2}
                            </Chip>
                          </span>
                        ) : null}
                      </span>
                    ) : null}

                    <span className={estilos.meta}>
                      {/* A etapa de origem é para onde ela volta, por isso está
                          escrita, e não deduzida na hora de desarquivar. */}
                      <Etiqueta reta>{etapa?.nome ?? 'etapa removida'}</Etiqueta>
                      <span
                        className={estilos.quando}
                        title={formatarDataLonga(pauta.arquivadaEm)}
                      >
                        arquivada {quandoArquivada(pauta.arquivadaEm)}
                      </span>
                    </span>
                  </div>

                  {confirmando ? (
                    <div className={estilos.confirmacao}>
                      <p className={estilos.confirmacaoTexto}>
                        Excluir <strong>{pauta.titulo}</strong> apaga a pauta para sempre.
                        Não há lixeira depois desta tela e não dá para desfazer, se você
                        só quer tirá-la da frente, ela já está arquivada.
                      </p>
                      <div className={estilos.confirmacaoAcoes}>
                        <Botao
                          variante="perigo"
                          carregando={exclusao.isPending}
                          onClick={() => {
                            setErro(null);
                            exclusao.mutate(pauta);
                          }}
                        >
                          Sim, excluir para sempre
                        </Botao>
                        <Botao variante="secundario" onClick={() => setConfirmandoId(null)}>
                          Cancelar
                        </Botao>
                      </div>
                    </div>
                  ) : (
                    <div className={estilos.acoes}>
                      <Botao
                        variante="secundario"
                        carregando={ocupada}
                        motivoDesabilitado={motivoDesarquivar}
                        onClick={() => {
                          setErro(null);
                          setDevolvida(null);
                          desarquivamento.mutate(pauta);
                        }}
                      >
                        Desarquivar
                      </Botao>
                      <Botao
                        variante="perigo"
                        motivoDesabilitado={motivoSomenteLeitura}
                        onClick={() => {
                          setErro(null);
                          setConfirmandoId(pauta.id);
                        }}
                      >
                        Excluir definitivamente
                      </Botao>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
