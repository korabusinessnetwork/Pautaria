/**
 * O workspace — sidebar, topbar e a área que alterna entre quadro e tabela.
 *
 * Esta página é o ponto de encontro de tudo: o contexto do tenant, o hook do
 * quadro, os limites de plano e a UI do handoff. Ela própria não sabe nada
 * sobre nenhum ofício em particular — recebe `oficioAtivo` e distribui.
 *
 * Sobre o estado local `pautaAberta`: guardamos o **id**, não o objeto. Se
 * guardássemos o objeto, o drawer continuaria exibindo a versão antiga depois
 * de uma edição ou de um evento de realtime, porque a referência congelada não
 * acompanha o cache. Guardar o id e reprojetar a partir da lista mantém o
 * drawer sempre no dado corrente.
 */

import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { ProvedorWorkspace, useWorkspace } from '@/context/WorkspaceContext';
import { useQuadro } from '@/hooks/useQuadro';
import { useLimites } from '@/hooks/useLimites';
import { listarMembros } from '@/lib/membros.service';
import { Sidebar } from '@/components/workspace/Sidebar';
import { Topbar, type Visao } from '@/components/workspace/Topbar';
import { Quadro } from '@/components/quadro/Quadro';
import { Tabela } from '@/components/tabela/Tabela';
import { DrawerPauta } from '@/components/pauta/DrawerPauta';
import { Carregando, CarregandoInline } from '@/components/shared/Carregando';
import { Aviso } from '@/components/shared/Aviso';
import { NaoEncontrado } from './NaoEncontrado';
import estilos from './PaginaWorkspace.module.css';

export function PaginaWorkspace() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return <NaoEncontrado />;

  return (
    <ProvedorWorkspace slug={slug}>
      <Conteudo />
    </ProvedorWorkspace>
  );
}

function Conteudo() {
  const {
    workspace,
    quadroAtivo,
    oficioAtivo,
    carregando,
    erro,
    gravavel,
  } = useWorkspace();

  const [visao, setVisao] = useState<Visao>('quadro');
  const [pautaAbertaId, setPautaAbertaId] = useState<string | null>(null);
  const [etapaAdicionando, setEtapaAdicionando] = useState<string | null>(null);

  const quadro = useQuadro(quadroAtivo?.id ?? null, oficioAtivo, workspace?.id ?? null);
  const limites = useLimites(quadro.total);

  const consultaMembros = useQuery({
    queryKey: ['membros', workspace?.id],
    queryFn: () => listarMembros(workspace!.id),
    enabled: Boolean(workspace?.id),
  });
  const membros = useMemo(() => consultaMembros.data ?? [], [consultaMembros.data]);

  const pautaAberta = useMemo(
    () => quadro.pautas.find((p) => p.id === pautaAbertaId) ?? null,
    [quadro.pautas, pautaAbertaId],
  );

  if (carregando) return <Carregando mensagem="Abrindo sua pauta…" />;
  if (erro) {
    return (
      <div className={estilos.centro}>
        <Aviso erro={erro} titulo="Não foi possível abrir este workspace" />
      </div>
    );
  }
  if (!workspace) return <NaoEncontrado />;

  // Ofício solo esconde responsável e avatares — decisão do ofício, não do plano.
  const mostrarResponsavel = !oficioAtivo?.solo && membros.length > 1;
  const podeEditar = gravavel && limites.criarPauta.liberado;

  return (
    <div className={estilos.grade}>
      <a href="#conteudo" className="pular-para-conteudo">
        Pular para o quadro
      </a>

      <Sidebar
        aoUsarTemplate={(template) => {
          const primeira = oficioAtivo?.etapas[0];
          if (!primeira) return;
          setVisao('quadro');
          void quadro.criar({
            etapaId: primeira.id,
            titulo: template.nome,
            campo1: template.campo1,
            campo2: template.campo2,
          });
        }}
      />

      <main className={estilos.principal} id="conteudo">
        <Topbar
          total={quadro.total}
          busca={quadro.busca}
          aoBuscar={quadro.setBusca}
          visao={visao}
          aoTrocarVisao={setVisao}
          aoNovaPauta={() => {
            setVisao('quadro');
            setEtapaAdicionando(oficioAtivo?.etapas[0]?.id ?? null);
          }}
          membros={membros}
          pautasNoQuadro={quadro.total}
        />

        {/* Avisos que precedem o conteúdo: estado do workspace e teto do plano.
            Aparecem antes do quadro porque mudam o que a pessoa pode fazer nele. */}
        {!gravavel ? (
          <div className={estilos.faixa}>
            <Aviso
              tom="atencao"
              titulo={
                workspace.status === 'suspenso'
                  ? 'Workspace suspenso'
                  : 'Workspace encerrado'
              }
            >
              Você continua vendo tudo, mas não dá para editar.{' '}
              {workspace.status === 'suspenso'
                ? 'Regularize o pagamento para voltar a escrever.'
                : 'Seus dados seguem guardados.'}
            </Aviso>
          </div>
        ) : limites.pautasRestantes !== null && limites.pautasRestantes <= 5 ? (
          <div className={estilos.faixa}>
            <Aviso tom="atencao">
              {limites.pautasRestantes === 0
                ? 'Você atingiu o limite de pautas deste quadro no plano atual.'
                : `Faltam ${limites.pautasRestantes} pautas para o limite do seu plano.`}{' '}
              <a href={`/w/${workspace.slug}/plano`}>Ver planos</a>
            </Aviso>
          </div>
        ) : null}

        {quadro.erro ? (
          <div className={estilos.faixa}>
            <Aviso erro={quadro.erro} linkPlano={`/w/${workspace.slug}/plano`} />
          </div>
        ) : null}

        {quadro.carregando || !oficioAtivo ? (
          <CarregandoInline mensagem="Montando o quadro…" />
        ) : visao === 'quadro' ? (
          <Quadro
            colunas={quadro.colunas}
            oficio={oficioAtivo}
            membros={membros}
            mostrarResponsavel={mostrarResponsavel}
            podeEditar={podeEditar}
            motivoBloqueio={limites.criarPauta.motivo || 'Workspace em modo somente leitura.'}
            etapaAdicionando={etapaAdicionando}
            aoAbrirAdicao={setEtapaAdicionando}
            aoAbrirPauta={(p) => setPautaAbertaId(p.id)}
            aoCriar={async (etapaId, titulo) => {
              await quadro.criar({ etapaId, titulo });
            }}
            aoMover={quadro.mover}
          />
        ) : (
          <Tabela
            pautas={quadro.pautas}
            oficio={oficioAtivo}
            membros={membros}
            mostrarResponsavel={mostrarResponsavel}
            aoAbrirPauta={(p) => setPautaAbertaId(p.id)}
          />
        )}
      </main>

      {pautaAberta && oficioAtivo ? (
        <DrawerPauta
          pauta={pautaAberta}
          oficio={oficioAtivo}
          membros={membros}
          mostrarResponsavel={mostrarResponsavel}
          podeEditar={gravavel}
          aoFechar={() => setPautaAbertaId(null)}
          aoMover={async (etapaId) => {
            await quadro.editar(pautaAberta.id, { etapaId });
          }}
          aoEditar={async (campos) => {
            await quadro.editar(pautaAberta.id, campos);
          }}
          aoArquivar={async () => {
            await quadro.arquivar(pautaAberta.id);
            setPautaAbertaId(null);
          }}
        />
      ) : null}
    </div>
  );
}
