/**
 * Configurações, o workspace, a pessoa e a identidade visual do tenant.
 *
 * Três coisas de escopos diferentes convivem nesta tela, e a separação em
 * painéis é o que impede a confusão mais cara aqui: **perfil é da pessoa,
 * identidade é do tenant**. Trocar o nome no painel do meio muda o avatar em
 * todos os workspaces em que ela entra; trocar a matiz no painel de baixo muda
 * a cor deste workspace para todo mundo que trabalha nele. Os textos dizem isso
 * antes do clique, descobrir depois seria descobrir errado.
 *
 * O ofício continua sendo a configuração (CLAUDE.md, princípio nº 1): nada aqui
 * é obrigatório, e o workspace já chega funcionando sem que ninguém visite esta
 * tela. Ela existe para quem *quer* mexer, não para quem *precisa*.
 *
 * A matiz do tenant é o gancho de white-label do ADR-002: `workspaces.tema` é
 * um JSONB que o dono do workspace escreve (o grant de coluna barra `plano` e
 * `status`, não `tema`), e o `WorkspaceContext` já dá precedência a
 * `tema.hue` sobre a matiz do ofício. Esta tela é só a alavanca, o mecanismo
 * já existia, e é por isso que salvar aqui re-tematiza o app inteiro sem
 * recarregar nada.
 */

import { useId, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { ProvedorWorkspace, useWorkspace } from '@/context/WorkspaceContext';
import { useSessao } from '@/context/SessaoContext';
import * as workspacesService from '@/lib/workspaces.service';
import * as authService from '@/lib/auth.service';
import { normalizar } from '@/lib/erros';
import { accentDe } from '@/utils/tema';
import { Avatar } from '@/components/shared/Avatar';
import { Botao } from '@/components/shared/Botao';
import { Campo } from '@/components/shared/Campo';
import { Aviso } from '@/components/shared/Aviso';
import { Carregando } from '@/components/shared/Carregando';
import { Etiqueta } from '@/components/shared/Etiqueta';
import { Chip } from '@/components/shared/Chip';
import { NaoEncontrado } from './NaoEncontrado';
import estilos from './Configuracoes.module.css';

export function Configuracoes() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return <NaoEncontrado />;
  return (
    <ProvedorWorkspace slug={slug}>
      <Conteudo />
    </ProvedorWorkspace>
  );
}

/** Espelha o limite de `criarWorkspace`, o banco recusa acima disso. */
const MAX_NOME = 60;

/**
 * A faixa colorida do seletor de matiz, gerada a partir do **croma do ofício**
 * em vez de fixada no CSS.
 *
 * Um arco-íris cravado na folha de estilo mentiria para metade dos ofícios: um
 * ofício de croma baixo mostraria uma faixa vibrante e entregaria um accent
 * discreto. Derivando do croma, o que a pessoa arrasta é a cor que ela vai
 * receber.
 */
function faixaDeMatiz(chroma: number): string {
  const paradas: string[] = [];
  for (let matiz = 0; matiz <= 360; matiz += 20) {
    paradas.push(`oklch(60% ${chroma} ${matiz})`);
  }
  return `linear-gradient(to right, ${paradas.join(', ')})`;
}

function Conteudo() {
  const { workspace, oficioAtivo, oficios, podeAdministrar, ehDono, gravavel, carregando } =
    useWorkspace();
  const { perfil, recarregarPerfil } = useSessao();
  const cliente = useQueryClient();
  const navegar = useNavigate();

  const idMatiz = useId();
  const idGrau = `${idMatiz}-grau`;

  // Rascunhos: `null` significa "ainda não editei", e a exibição cai no valor
  // salvo. É o que evita um `useEffect` de sincronização, e, com ele, o
  // pisca-pisca clássico de o campo voltar ao valor antigo enquanto a consulta
  // revalida depois de salvar.
  const [rascunhoNome, setRascunhoNome] = useState<string | null>(null);
  const [rascunhoNomePerfil, setRascunhoNomePerfil] = useState<string | null>(null);
  const [rascunhoIniciais, setRascunhoIniciais] = useState<string | null>(null);
  const [rascunhoMatiz, setRascunhoMatiz] = useState<number | null>(null);
  const [confirmacaoExclusao, setConfirmacaoExclusao] = useState('');

  const [salvouNome, setSalvouNome] = useState(false);
  const [salvouPerfil, setSalvouPerfil] = useState(false);
  const [salvouTema, setSalvouTema] = useState(false);

  const [erroNome, setErroNome] = useState<unknown>(null);
  const [erroPerfil, setErroPerfil] = useState<unknown>(null);
  const [erroTema, setErroTema] = useState<unknown>(null);
  const [erroExclusao, setErroExclusao] = useState<unknown>(null);

  const renomeacao = useMutation({
    mutationFn: (nome: string) => workspacesService.renomearWorkspace(workspace!.id, nome),
    onSuccess: () => {
      setSalvouNome(true);
      void cliente.invalidateQueries({ queryKey: ['workspace', workspace?.slug] });
      void cliente.invalidateQueries({ queryKey: ['workspaces', 'meus'] });
    },
    onError: (e) => setErroNome(normalizar(e)),
  });

  const atualizacaoPerfil = useMutation({
    mutationFn: (campos: { nome: string; iniciais: string }) =>
      authService.atualizarPerfil(campos),
    onSuccess: async () => {
      setSalvouPerfil(true);
      // O perfil não é uma consulta do TanStack Query: mora no contexto de
      // sessão, então quem recarrega é ele.
      await recarregarPerfil();
      void cliente.invalidateQueries({ queryKey: ['membros', workspace?.id] });
    },
    onError: (e) => setErroPerfil(normalizar(e)),
  });

  const salvamentoTema = useMutation({
    mutationFn: (matiz: number | null) =>
      // O tema é gravado inteiro: preservar as outras chaves (`nomeExibicao`,
      // `logoUrl`) é obrigatório porque o UPDATE substitui o JSONB, não faz
      // merge. Escrever só `{ hue }` apagaria o resto em silêncio.
      workspacesService.salvarTema(workspace!.id, {
        ...(workspace!.tema ?? {}),
        hue: matiz,
      }),
    onSuccess: () => {
      setSalvouTema(true);
      void cliente.invalidateQueries({ queryKey: ['workspace', workspace?.slug] });
    },
    onError: (e) => setErroTema(normalizar(e)),
  });

  const exclusao = useMutation({
    mutationFn: () => workspacesService.excluirWorkspace(workspace!.id),
    onSuccess: () => {
      cliente.removeQueries({ queryKey: ['workspace', workspace?.slug] });
      void cliente.invalidateQueries({ queryKey: ['workspaces', 'meus'] });
      // `/` é o Destino: ele decide entre a abertura e outro workspace. Um
      // `<Navigate>` para o quadro mandaria a pessoa para o que ela acabou de
      // apagar.
      navegar('/', { replace: true });
    },
    onError: (e) => setErroExclusao(normalizar(e)),
  });

  if (carregando) return <Carregando mensagem="Abrindo as configurações…" />;
  if (!workspace) return <NaoEncontrado />;

  const nome = rascunhoNome ?? workspace.nome;
  const nomePerfil = rascunhoNomePerfil ?? perfil?.nome ?? '';
  const iniciais = rascunhoIniciais ?? perfil?.iniciais ?? '';

  // A matiz do ofício é o piso: sem escolha do tenant, é ela que o app usa.
  const oficioBase = oficioAtivo ?? oficios[0] ?? null;
  const matizSalva = typeof workspace.tema?.hue === 'number' ? workspace.tema.hue : null;
  const matizExibida = rascunhoMatiz ?? matizSalva ?? oficioBase?.hue ?? 0;

  const accent = accentDe(matizExibida, oficioBase?.chroma ?? 0);
  const estiloPrevia = {
    '--ac': accent.ac,
    '--acSoft': accent.acSoft,
    '--acFaint': accent.acFaint,
    '--acDeep': accent.acDeep,
    '--faixa': faixaDeMatiz(oficioBase?.chroma ?? 0),
  } as CSSProperties;

  const motivoSomenteLeitura = !podeAdministrar
    ? 'Só o dono ou um admin mudam a configuração do workspace.'
    : !gravavel
      ? 'Este workspace está em modo somente leitura. Regularize o plano para voltar a editar.'
      : undefined;

  function salvarNome(evento: FormEvent) {
    evento.preventDefault();
    setErroNome(null);
    renomeacao.mutate(nome.trim());
  }

  function salvarPerfil(evento: FormEvent) {
    evento.preventDefault();
    setErroPerfil(null);
    atualizacaoPerfil.mutate({ nome: nomePerfil.trim(), iniciais: iniciais.trim() });
  }

  return (
    <div className={estilos.tela}>
      <header className={estilos.cabecalho}>
        <Link to={`/w/${workspace.slug}`} className={estilos.voltar}>
          ← Voltar ao quadro
        </Link>
        <h1 className={estilos.titulo}>Configurações</h1>
        <p className={estilos.subtitulo}>
          Nada aqui é obrigatório, seu quadro já funciona do jeito que está.
        </p>
      </header>

      {/* ── Workspace ───────────────────────────────────────────────────── */}
      <section className={estilos.painel}>
        <h2 className={estilos.tituloSecao}>Workspace</h2>

        {erroNome ? <Aviso erro={erroNome} aoFechar={() => setErroNome(null)} /> : null}

        <form className={estilos.formulario} onSubmit={salvarNome}>
          <Campo
            rotulo="Nome do workspace"
            value={nome}
            onChange={(e) => {
              setRascunhoNome(e.target.value);
              setSalvouNome(false);
            }}
            maxLength={MAX_NOME}
            disabled={Boolean(motivoSomenteLeitura)}
            autoComplete="off"
            dica="Aparece na sua lista de workspaces e no convite que você envia."
          />

          <div className={estilos.acoes}>
            <Botao
              type="submit"
              carregando={renomeacao.isPending}
              motivoDesabilitado={
                motivoSomenteLeitura ??
                (nome.trim().length === 0
                  ? 'O workspace precisa de um nome.'
                  : nome.trim() === workspace.nome
                    ? 'O nome ainda é o mesmo.'
                    : undefined)
              }
            >
              Salvar nome
            </Botao>
            {salvouNome ? (
              <span className={estilos.salvo} role="status">
                Salvo ✓
              </span>
            ) : null}
          </div>
        </form>

        <div className={estilos.endereco}>
          <span className={estilos.enderecoRotulo}>Endereço</span>
          <code className={estilos.enderecoValor}>/w/{workspace.slug}</code>
          <p className={estilos.nota}>
            O endereço não muda junto com o nome, e isso é de propósito: convites já
            enviados, favoritos do time e abas abertas apontam para ele. Renomear o
            workspace é cosmético; trocar o endereço quebraria todos esses links de uma
            vez só.
          </p>
        </div>
      </section>

      {/* ── Perfil ──────────────────────────────────────────────────────── */}
      <section className={estilos.painel}>
        <h2 className={estilos.tituloSecao}>Seu perfil</h2>
        <p className={estilos.explicacao}>
          Vale para você em todos os workspaces, é assim que o time te reconhece no
          quadro.
        </p>

        {erroPerfil ? <Aviso erro={erroPerfil} aoFechar={() => setErroPerfil(null)} /> : null}

        <div className={estilos.perfil}>
          <div className={estilos.previaAvatar}>
            <Avatar
              iniciais={iniciais.trim() || '?'}
              hue={perfil?.hue}
              nome={nomePerfil || 'Prévia do seu avatar'}
              tamanho="grande"
            />
            <span className={estilos.previaRotulo}>prévia</span>
          </div>

          <form className={estilos.formulario} onSubmit={salvarPerfil}>
            <Campo
              rotulo="Seu nome"
              value={nomePerfil}
              onChange={(e) => {
                setRascunhoNomePerfil(e.target.value);
                setSalvouPerfil(false);
              }}
              maxLength={80}
              autoComplete="name"
            />

            <Campo
              rotulo="Iniciais"
              value={iniciais}
              onChange={(e) => {
                // Caixa alta na digitação, e não só no salvamento: o avatar ao
                // lado mostra maiúsculas de qualquer jeito, e um campo que
                // discorda da prévia parece defeito.
                setRascunhoIniciais(e.target.value.toUpperCase().slice(0, 2));
                setSalvouPerfil(false);
              }}
              maxLength={2}
              autoComplete="off"
              dica="Duas letras, no máximo. São elas que aparecem no seu avatar."
            />

            <div className={estilos.acoes}>
              <Botao
                type="submit"
                carregando={atualizacaoPerfil.isPending}
                motivoDesabilitado={
                  nomePerfil.trim().length === 0
                    ? 'Informe como você quer ser chamado.'
                    : iniciais.trim().length === 0
                      ? 'As iniciais alimentam seu avatar, informe pelo menos uma letra.'
                      : nomePerfil.trim() === perfil?.nome && iniciais.trim() === perfil?.iniciais
                        ? 'Nada mudou por aqui.'
                        : undefined
                }
              >
                Salvar perfil
              </Botao>
              {salvouPerfil ? (
                <span className={estilos.salvo} role="status">
                  Salvo ✓
                </span>
              ) : null}
            </div>
          </form>
        </div>
      </section>

      {/* ── Identidade visual ───────────────────────────────────────────── */}
      <section className={estilos.painel} style={estiloPrevia}>
        <h2 className={estilos.tituloSecao}>Identidade visual</h2>
        <p className={estilos.explicacao}>
          A matiz escolhida aqui substitui a cor do ofício em todo o workspace: o quadro
          continua podendo trocar de ofício, e a cor continua sendo a sua.
        </p>

        {erroTema ? <Aviso erro={erroTema} aoFechar={() => setErroTema(null)} /> : null}

        {!oficioBase ? (
          <Aviso tom="info" titulo="Ainda não há um ofício para colorir">
            Crie um quadro primeiro, a cor da marca entra por cima da cor do ofício, e
            por enquanto não há uma para substituir.
          </Aviso>
        ) : (
          <>
            {matizSalva === null ? (
              <p className={estilos.padrao}>
                Hoje este workspace usa a cor do ofício <strong>{oficioBase.nome}</strong>.
                Arraste o seletor para adotar a cor da sua marca.
              </p>
            ) : null}

            <div className={estilos.matiz}>
              <label htmlFor={idMatiz} className={estilos.rotuloMatiz}>
                Matiz da marca
              </label>
              <input
                id={idMatiz}
                type="range"
                min={0}
                max={360}
                step={1}
                value={matizExibida}
                className={estilos.faixa}
                disabled={Boolean(motivoSomenteLeitura)}
                aria-describedby={idGrau}
                onChange={(e) => {
                  setRascunhoMatiz(Number(e.target.value));
                  setSalvouTema(false);
                }}
              />
              {/* `output` com `aria-live` implícito: quem navega por teclado
                  ouve a matiz mudar, já que a prévia ao lado é só visual. */}
              <output htmlFor={idMatiz} id={idGrau} className={estilos.grau}>
                {matizExibida}°
              </output>
            </div>

            <div className={estilos.previa} aria-hidden="true">
              <div className={estilos.previaCard}>
                <span className={estilos.pino} />
                <span className={estilos.previaTitulo}>{oficioBase.tituloQuadro}</span>
                <div className={estilos.previaLinha}>
                  {oficioBase.etapas[0] ? (
                    <Etiqueta>{oficioBase.etapas[0].nome}</Etiqueta>
                  ) : null}
                  <Chip mono={oficioBase.mono}>{oficioBase.campo1Label}</Chip>
                </div>
              </div>
              <span className={estilos.previaBotao}>Nova pauta</span>
            </div>

            <div className={estilos.acoes}>
              <Botao
                carregando={salvamentoTema.isPending}
                onClick={() => {
                  setErroTema(null);
                  salvamentoTema.mutate(matizExibida);
                }}
                motivoDesabilitado={
                  motivoSomenteLeitura ??
                  (rascunhoMatiz === null || rascunhoMatiz === matizSalva
                    ? 'Arraste o seletor para escolher uma matiz diferente.'
                    : undefined)
                }
              >
                Salvar cor
              </Botao>

              <Botao
                variante="secundario"
                onClick={() => {
                  setErroTema(null);
                  setRascunhoMatiz(null);
                  // Só vai ao banco se havia matiz gravada; largar o rascunho
                  // já basta quando a pessoa só brincou com o seletor.
                  if (matizSalva !== null) salvamentoTema.mutate(null);
                }}
                motivoDesabilitado={
                  motivoSomenteLeitura ??
                  (matizSalva === null && rascunhoMatiz === null
                    ? 'Este workspace já usa a cor do ofício.'
                    : undefined)
                }
              >
                Voltar ao padrão do ofício
              </Botao>

              {salvouTema ? (
                <span className={estilos.salvo} role="status">
                  Salvo ✓
                </span>
              ) : null}
            </div>
          </>
        )}
      </section>

      {/* ── Zona de perigo ──────────────────────────────────────────────── */}
      {ehDono ? (
        <section className={`${estilos.painel} ${estilos.painelPerigo}`}>
          <h2 className={estilos.tituloPerigo}>Zona de perigo</h2>
          <p className={estilos.explicacao}>
            Excluir este workspace apaga em cascata os quadros, as pautas, os convites e
            todo mundo que trabalha nele. Não há lixeira, não há backup para pedir e não
            há como desfazer.
          </p>

          {erroExclusao ? (
            <Aviso erro={erroExclusao} aoFechar={() => setErroExclusao(null)} />
          ) : null}

          {/* Digitar o nome não é burocracia: é o que separa "eu quis apagar
              este workspace" de um clique errado no painel errado. */}
          <Campo
            rotulo={`Para confirmar, digite: ${workspace.nome}`}
            value={confirmacaoExclusao}
            onChange={(e) => setConfirmacaoExclusao(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />

          <div className={estilos.acoes}>
            <Botao
              variante="perigo"
              carregando={exclusao.isPending}
              onClick={() => {
                setErroExclusao(null);
                exclusao.mutate();
              }}
              motivoDesabilitado={
                confirmacaoExclusao.trim() !== workspace.nome
                  ? `Digite ${workspace.nome} no campo acima para liberar a exclusão.`
                  : undefined
              }
            >
              Excluir este workspace
            </Botao>
          </div>
        </section>
      ) : null}
    </div>
  );
}
