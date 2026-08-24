/**
 * Sidebar — quadros, ofícios, modelos e o chip do usuário.
 *
 * A ordem das seções segue a hierarquia real do produto: primeiro **qual
 * quadro**, depois **qual ofício** aquele quadro fala. Invertê-la sugeriria que
 * o ofício é uma preferência global, quando na verdade ele pertence ao quadro —
 * dois quadros do mesmo workspace podem ter sotaques diferentes.
 *
 * O seletor de ofício é o coração da promessa "troque quando quiser". Clicar
 * num ofício diferente chama `trocar_oficio_quadro`, que remapeia as pautas
 * pela ordem das etapas dentro de uma transação — nada se perde, e a UI inteira
 * se re-tematiza porque as variáveis CSS mudam na raiz.
 *
 * Repare no que **não** existe aqui: nenhum nome de ofício escrito no código,
 * nenhuma cor fixa, nenhum `if`. A lista vem do banco e o glifo de cada item é
 * pintado com o accent do próprio ofício, não com o do tema ativo — é o que
 * deixa a troca legível antes de acontecer.
 */

import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useSessao } from '@/context/SessaoContext';
import { useLimites } from '@/hooks/useLimites';
import { criarQuadro, renomearQuadro, trocarOficioDoQuadro } from '@/lib/pautas.service';
import { normalizar } from '@/lib/erros';
import { accentDe } from '@/utils/tema';
import { Avatar } from '@/components/shared/Avatar';
import { Aviso } from '@/components/shared/Aviso';
import { SeletorQuadros, type QuadroDoSeletor } from './SeletorQuadros';
import type { Template } from '@/lib/tipos';
import { ROTA_DO_APP, rotaWorkspace } from '@/constants/rotas';
import estilos from './Sidebar.module.css';

interface Props {
  aoUsarTemplate: (template: Template) => void;
}

export function Sidebar({ aoUsarTemplate }: Props) {
  const navegar = useNavigate();
  const { perfil, sair } = useSessao();
  const {
    workspace,
    quadros,
    quadroAtivo,
    oficios,
    oficioAtivo,
    uso,
    podeAdministrar,
    gravavel,
    selecionarQuadro,
    recarregar,
  } = useWorkspace();
  const limites = useLimites();
  const [trocando, setTrocando] = useState<string | null>(null);
  const [erro, setErro] = useState<unknown>(null);

  async function trocarOficio(oficioId: string) {
    if (!quadroAtivo || oficioId === oficioAtivo?.id) return;
    setErro(null);
    setTrocando(oficioId);
    try {
      await trocarOficioDoQuadro(quadroAtivo.id, oficioId);
      await recarregar();
    } catch (e) {
      setErro(normalizar(e));
    } finally {
      setTrocando(null);
    }
  }

  /**
   * O seletor pede o ofício de cada quadro para pintar o glifo com o accent
   * certo. O contexto entrega as duas listas separadas, então o casamento
   * acontece aqui — e não dentro do seletor, que assim continua sendo um
   * componente de props puras, testável sem contexto.
   */
  const quadrosDoSeletor = useMemo<QuadroDoSeletor[]>(
    () =>
      quadros.map((quadro) => {
        const oficio = oficios.find((o) => o.id === quadro.oficioId);
        return {
          id: quadro.id,
          titulo: quadro.titulo,
          oficio: oficio
            ? {
                nome: oficio.nome,
                glifo: oficio.glifo,
                hue: oficio.hue,
                chroma: oficio.chroma,
              }
            : null,
        };
      }),
    [quadros, oficios],
  );

  const planoRotulo = uso?.planoNome ?? 'Solo';
  const slug = workspace?.slug ?? '';

  return (
    <aside className={estilos.sidebar}>
      <Link to={ROTA_DO_APP} className={estilos.marca}>
        <span className={estilos.bolinha} aria-hidden="true" />
        <span className={estilos.wordmark}>
          {workspace?.tema?.nomeExibicao || 'Pautaria'}
        </span>
      </Link>

      <SeletorQuadros
        quadros={quadrosDoSeletor}
        quadroAtivoId={quadroAtivo?.id ?? null}
        aoSelecionar={selecionarQuadro}
        aoCriar={async (titulo) => {
          if (!workspace || !oficioAtivo) return;
          await criarQuadro({
            workspaceId: workspace.id,
            oficioId: oficioAtivo.id,
            titulo,
          });
          await recarregar();
        }}
        aoRenomear={async (quadroId, titulo) => {
          await renomearQuadro(quadroId, titulo);
          await recarregar();
        }}
        podeAdministrar={podeAdministrar && gravavel}
        limiteCriar={limites.criarQuadro}
      />

      <nav className={estilos.secao} aria-label="Ofício do quadro">
        <span className={estilos.rotuloSecao}>OFÍCIO</span>
        {oficios.map((oficio) => {
          const accent = accentDe(oficio.hue, oficio.chroma);
          const ativo = oficio.id === oficioAtivo?.id;

          return (
            <button
              key={oficio.id}
              type="button"
              className={ativo ? estilos.itemAtivo : estilos.item}
              onClick={() => void trocarOficio(oficio.id)}
              disabled={!podeAdministrar || !gravavel || trocando !== null}
              title={
                !podeAdministrar
                  ? 'Só dono ou admin trocam o ofício do quadro.'
                  : !gravavel
                    ? 'Workspace em modo somente leitura.'
                    : `Usar o ofício ${oficio.nome}`
              }
              aria-current={ativo ? 'true' : undefined}
            >
              <span className={estilos.glifo} style={{ color: accent.ac }} aria-hidden="true">
                {oficio.glifo}
              </span>
              <span className={estilos.itemNome}>{oficio.nome}</span>
              {trocando === oficio.id ? <span className={estilos.girando} /> : null}
            </button>
          );
        })}
      </nav>

      {oficioAtivo ? (
        <nav className={estilos.secao} aria-label="Modelos de pauta">
          <span className={estilos.rotuloSecao}>
            MODELOS · {oficioAtivo.nome.toUpperCase()}
          </span>
          {oficioAtivo.templates.map((template) => (
            <button
              key={template.id}
              type="button"
              className={estilos.template}
              onClick={() => aoUsarTemplate(template)}
              disabled={!gravavel}
            >
              <span className={estilos.mais} aria-hidden="true">
                +
              </span>
              <span className={estilos.templateNome}>{template.nome}</span>
            </button>
          ))}
        </nav>
      ) : null}

      {erro ? (
        <div className={estilos.erro}>
          <Aviso erro={erro} aoFechar={() => setErro(null)} />
        </div>
      ) : null}

      <div className={estilos.espacador} />

      <nav className={estilos.secaoBaixa} aria-label="Gestão do workspace">
        <Link to={rotaWorkspace.arquivadas(slug)} className={estilos.linkBaixo}>
          Arquivadas
        </Link>
        {/* Atividade e cobrança leem dado que a RLS só libera para dono e admin.
            Esconder o link em vez de deixar a tela explicar evita oferecer um
            caminho que termina em "você não tem permissão". */}
        {podeAdministrar ? (
          <Link to={rotaWorkspace.atividade(slug)} className={estilos.linkBaixo}>
            Atividade
          </Link>
        ) : null}
        <Link to={rotaWorkspace.equipe(slug)} className={estilos.linkBaixo}>
          Equipe
        </Link>
        <Link to={rotaWorkspace.configuracoes(slug)} className={estilos.linkBaixo}>
          Configurações
        </Link>
        <Link to={rotaWorkspace.plano(slug)} className={estilos.linkBaixo}>
          Plano e cobrança
        </Link>
      </nav>

      <div className={estilos.usuario}>
        <Avatar
          iniciais={perfil?.iniciais ?? '??'}
          hue={perfil?.hue}
          tamanho="grande"
          nome={perfil?.nome}
        />
        <span className={estilos.usuarioTexto}>
          <span className={estilos.usuarioNome}>{perfil?.nome ?? 'Você'}</span>
          <span className={estilos.usuarioPlano}>Plano {planoRotulo}</span>
        </span>
        <button
          type="button"
          className={estilos.sair}
          onClick={() => {
            void sair().then(() => navegar('/entrar', { replace: true }));
          }}
          title="Sair da conta"
          aria-label="Sair da conta"
        >
          ⏻
        </button>
      </div>
    </aside>
  );
}
