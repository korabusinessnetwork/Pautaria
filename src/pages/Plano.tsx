/**
 * Plano e cobrança.
 *
 * Tudo o que acontece aqui atravessa uma Edge Function. O front **lê** o estado
 * (`assinaturas`, `cobrancas`, a RLS libera para dono e admin) e **pede**
 * mudanças chamando função. Não existe caminho daqui até um UPDATE em
 * `workspaces.plano`: o grant de coluna do banco recusa (migration 0002), e o
 * teste de isolamento prova isso a cada build.
 *
 * O formulário de contratação pede nome e CPF/CNPJ porque a Asaas exige para
 * emitir a cobrança. Não pede nada de cartão, o pagamento acontece na página
 * hospedada pela Asaas, e é por isso que este arquivo não tem um único campo
 * sensível.
 */

import { useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ProvedorWorkspace, useWorkspace } from '@/context/WorkspaceContext';
import * as assinaturas from '@/lib/assinaturas.service';
import { normalizar } from '@/lib/erros';
import { formatarDataLonga, formatarDinheiro, formatarPreco } from '@/utils/formato';
import { documentoValido, mascararDocumento, mascararTelefone } from '@/utils/documento';
import { useSessao } from '@/context/SessaoContext';
import { Campo } from '@/components/shared/Campo';
import { Botao } from '@/components/shared/Botao';
import { Aviso } from '@/components/shared/Aviso';
import { Carregando } from '@/components/shared/Carregando';
import { NaoEncontrado } from './NaoEncontrado';
import type { Ciclo } from '@/lib/tipos';
import estilos from './Plano.module.css';

export function Plano() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return <NaoEncontrado />;
  return (
    <ProvedorWorkspace slug={slug}>
      <Conteudo />
    </ProvedorWorkspace>
  );
}

const ROTULO_STATUS: Record<string, string> = {
  pendente: 'aguardando pagamento',
  ativa: 'ativa',
  inadimplente: 'pagamento em atraso',
  cancelada: 'cancelada',
  expirada: 'expirada',
};

function Conteudo() {
  const { workspace, ehDono, carregando } = useWorkspace();
  const { perfil } = useSessao();
  const cliente = useQueryClient();

  const [ciclo, setCiclo] = useState<Ciclo>('mensal');
  const [escolhido, setEscolhido] = useState<'estudio' | 'time' | null>(null);
  const [nomeCobranca, setNomeCobranca] = useState(perfil?.nome ?? '');
  const [documento, setDocumento] = useState('');
  const [telefone, setTelefone] = useState('');
  const [erro, setErro] = useState<unknown>(null);
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false);

  const consultaPlanos = useQuery({ queryKey: ['planos'], queryFn: assinaturas.listarPlanos });

  const consultaAssinatura = useQuery({
    queryKey: ['assinatura', workspace?.id],
    queryFn: () => assinaturas.carregarAssinatura(workspace!.id),
    enabled: Boolean(workspace?.id) && ehDono,
  });

  const consultaCobrancas = useQuery({
    queryKey: ['cobrancas', workspace?.id],
    queryFn: () => assinaturas.listarCobrancas(workspace!.id),
    enabled: Boolean(workspace?.id) && ehDono,
  });

  const contratacao = useMutation({
    mutationFn: (entrada: assinaturas.DadosContratacao) => assinaturas.contratar(entrada),
    onSuccess: (resposta) => {
      void cliente.invalidateQueries({ queryKey: ['assinatura', workspace?.id] });
      if (resposta.urlPagamento) {
        // Saída para o domínio da Asaas. `assign` e não `replace` para o botão
        // "voltar" do navegador trazer a pessoa de volta ao Pautaria.
        window.location.assign(resposta.urlPagamento);
      }
    },
    onError: (e) => setErro(normalizar(e)),
  });

  const portal = useMutation({
    mutationFn: () => assinaturas.abrirFatura(workspace!.id),
    onSuccess: (resposta) => {
      if (resposta.urlPagamento) window.location.assign(resposta.urlPagamento);
      else setErro(normalizar(new Error('Ainda não há fatura em aberto para pagar.')));
    },
    onError: (e) => setErro(normalizar(e)),
  });

  const cancelamento = useMutation({
    mutationFn: () => assinaturas.cancelar(workspace!.id),
    onSuccess: () => {
      setConfirmandoCancelamento(false);
      void cliente.invalidateQueries({ queryKey: ['assinatura', workspace?.id] });
      void cliente.invalidateQueries({ queryKey: ['workspace', workspace?.slug] });
    },
    onError: (e) => setErro(normalizar(e)),
  });

  // `?? []` cria um array novo a cada render; memoizar evita que o useMemo
  // abaixo recalcule sempre e que a lista mude de identidade sem mudar de valor.
  const planos = useMemo(() => consultaPlanos.data ?? [], [consultaPlanos.data]);
  const assinatura = consultaAssinatura.data ?? null;
  const documentoOk = documentoValido(documento);

  const planoSelecionado = useMemo(
    () => planos.find((p) => p.chave === escolhido) ?? null,
    [planos, escolhido],
  );

  if (carregando) return <Carregando mensagem="Carregando o plano…" />;
  if (!workspace) return <NaoEncontrado />;

  // Cobrança é assunto do dono. Admin administra o workspace, não o contrato.
  if (!ehDono) {
    return (
      <div className={estilos.tela}>
        <Cabecalho slug={workspace.slug} />
        <div className={estilos.painel}>
          <Aviso tom="info" titulo="Só o dono cuida da assinatura">
            Peça a quem criou este workspace para mudar o plano. Você continua com acesso
            normal ao quadro.
          </Aviso>
        </div>
      </div>
    );
  }

  function enviarContratacao(evento: FormEvent) {
    evento.preventDefault();
    if (!escolhido || !workspace) return;
    setErro(null);
    contratacao.mutate({
      workspaceId: workspace.id,
      plano: escolhido,
      ciclo,
      nomeCobranca,
      documento,
      telefone,
    });
  }

  return (
    <div className={estilos.tela}>
      <Cabecalho slug={workspace.slug} />

      {erro ? (
        <div className={estilos.painel}>
          <Aviso erro={erro} aoFechar={() => setErro(null)} />
        </div>
      ) : null}

      {/* ── Estado atual ────────────────────────────────────────────────── */}
      <section className={estilos.painel}>
        <h2 className={estilos.tituloSecao}>Plano atual</h2>

        <div className={estilos.estado}>
          <div>
            <p className={estilos.planoAtual}>
              {planos.find((p) => p.chave === workspace.plano)?.nome ?? workspace.plano}
            </p>
            {assinatura ? (
              <p className={estilos.detalhe}>
                {formatarDinheiro(assinatura.valorCentavos)} ·{' '}
                {assinatura.ciclo === 'anual' ? 'por ano' : 'por mês'} ·{' '}
                {ROTULO_STATUS[assinatura.status] ?? assinatura.status}
              </p>
            ) : (
              <p className={estilos.detalhe}>Gratuito, sem cartão, sem prazo.</p>
            )}

            {workspace.planoExpiraEm ? (
              <p className={estilos.detalhe}>
                {assinatura?.canceladaEm ? 'Acesso até' : 'Renova em'}{' '}
                {formatarDataLonga(workspace.planoExpiraEm)}
              </p>
            ) : null}
          </div>

          {assinatura ? (
            <div className={estilos.acoesEstado}>
              {assinatura.status !== 'ativa' ? (
                <Botao
                  variante="principal"
                  carregando={portal.isPending}
                  onClick={() => portal.mutate()}
                >
                  Pagar fatura em aberto
                </Botao>
              ) : null}

              {confirmandoCancelamento ? (
                <div className={estilos.confirmacao}>
                  <p>
                    Você continua com o plano até{' '}
                    {formatarDataLonga(assinatura.fimPeriodo ?? workspace.planoExpiraEm)}. Nada
                    é apagado quando o período acabar, o quadro volta ao plano Solo.
                  </p>
                  <div className={estilos.confirmacaoAcoes}>
                    <Botao
                      variante="perigo"
                      carregando={cancelamento.isPending}
                      onClick={() => cancelamento.mutate()}
                    >
                      Confirmar cancelamento
                    </Botao>
                    <Botao variante="secundario" onClick={() => setConfirmandoCancelamento(false)}>
                      Manter assinatura
                    </Botao>
                  </div>
                </div>
              ) : (
                <Botao variante="perigo" onClick={() => setConfirmandoCancelamento(true)}>
                  Cancelar assinatura
                </Botao>
              )}
            </div>
          ) : null}
        </div>

        {workspace.status === 'inadimplente' ? (
          <Aviso tom="atencao" titulo="Pagamento em atraso">
            Seu quadro continua funcionando normalmente por enquanto. Regularize para não
            perder os recursos do plano.
          </Aviso>
        ) : null}
      </section>

      {/* ── Escolher plano ──────────────────────────────────────────────── */}
      {!assinatura ? (
        <section className={estilos.painel}>
          <h2 className={estilos.tituloSecao}>Mudar de plano</h2>

          <div className={estilos.alternador} role="tablist" aria-label="Ciclo de cobrança">
            <button
              type="button"
              role="tab"
              aria-selected={ciclo === 'mensal'}
              className={ciclo === 'mensal' ? estilos.abaAtiva : estilos.aba}
              onClick={() => setCiclo('mensal')}
            >
              Mensal
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={ciclo === 'anual'}
              className={ciclo === 'anual' ? estilos.abaAtiva : estilos.aba}
              onClick={() => setCiclo('anual')}
            >
              Anual · 2 meses grátis
            </button>
          </div>

          <div className={estilos.opcoes}>
            {planos
              .filter((p) => !p.gratuito)
              .map((plano) => {
                const centavos =
                  ciclo === 'anual' ? plano.precoAnualCentavos : plano.precoMensalCentavos;
                const ativo = escolhido === plano.chave;

                return (
                  <button
                    key={plano.chave}
                    type="button"
                    className={ativo ? estilos.opcaoAtiva : estilos.opcao}
                    onClick={() => setEscolhido(plano.chave as 'estudio' | 'time')}
                    aria-pressed={ativo}
                  >
                    <span className={estilos.opcaoNome}>{plano.nome}</span>
                    <span className={estilos.opcaoPreco}>
                      {formatarPreco(centavos)}
                      <span className={estilos.opcaoPeriodo}>
                        /{ciclo === 'anual' ? 'ano' : 'mês'}
                      </span>
                    </span>
                    <span className={estilos.opcaoChamada}>{plano.chamada}</span>
                  </button>
                );
              })}
          </div>

          {planoSelecionado ? (
            <form className={estilos.formulario} onSubmit={enviarContratacao}>
              <p className={estilos.explicacao}>
                Precisamos destes dados para emitir a cobrança. O pagamento acontece na
                página da Asaas, o Pautaria não recebe nem armazena dados do seu cartão.
              </p>

              <Campo
                rotulo="Nome de quem será cobrado"
                value={nomeCobranca}
                onChange={(e) => setNomeCobranca(e.target.value)}
                required
                maxLength={120}
                autoComplete="name"
              />

              <Campo
                rotulo="CPF ou CNPJ"
                value={documento}
                onChange={(e) => setDocumento(mascararDocumento(e.target.value))}
                required
                inputMode="numeric"
                erro={
                  documento.length > 0 && !documentoOk
                    ? 'Confira os dígitos, o número não fecha.'
                    : null
                }
              />

              <Campo
                rotulo="Telefone (opcional)"
                value={telefone}
                onChange={(e) => setTelefone(mascararTelefone(e.target.value))}
                inputMode="tel"
                autoComplete="tel"
                dica="A Asaas usa para avisar sobre a cobrança."
              />

              <div className={estilos.resumo}>
                <span>
                  {planoSelecionado.nome} · {ciclo === 'anual' ? 'anual' : 'mensal'}
                </span>
                <strong>
                  {formatarDinheiro(
                    ciclo === 'anual'
                      ? planoSelecionado.precoAnualCentavos
                      : planoSelecionado.precoMensalCentavos,
                  )}
                </strong>
              </div>

              <Botao
                type="submit"
                larguraTotal
                carregando={contratacao.isPending}
                motivoDesabilitado={
                  !documentoOk
                    ? 'Informe um CPF ou CNPJ válido para emitir a cobrança.'
                    : nomeCobranca.trim().length < 3
                      ? 'Informe o nome completo de quem será cobrado.'
                      : undefined
                }
              >
                Ir para o pagamento
              </Botao>
            </form>
          ) : null}
        </section>
      ) : null}

      {/* ── Histórico ───────────────────────────────────────────────────── */}
      {(consultaCobrancas.data?.length ?? 0) > 0 ? (
        <section className={estilos.painel}>
          <h2 className={estilos.tituloSecao}>Cobranças</h2>
          <div className={estilos.tabela}>
            {consultaCobrancas.data?.map((cobranca) => (
              <div key={cobranca.id} className={estilos.linhaCobranca}>
                <span>{formatarDataLonga(cobranca.vencimento)}</span>
                <span className={estilos.statusCobranca}>{cobranca.status}</span>
                <span>{formatarDinheiro(cobranca.valorCentavos)}</span>
                <span>
                  {cobranca.urlFatura ? (
                    <a href={cobranca.urlFatura} target="_blank" rel="noreferrer noopener">
                      ver fatura
                    </a>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Cabecalho({ slug }: { slug: string }) {
  return (
    <header className={estilos.cabecalho}>
      <Link to={`/w/${slug}`} className={estilos.voltar}>
        ← Voltar ao quadro
      </Link>
      <h1 className={estilos.titulo}>Plano e cobrança</h1>
    </header>
  );
}
