/**
 * Atividade, a linha do tempo do workspace.
 *
 * Esta tela existe porque o `audit_log` já era escrito e nunca lido. Ela responde
 * a uma pergunta que só aparece em dia ruim: "quem mexeu nisso, e quando?".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DUAS DECISÕES DE PRODUTO QUE PARECEM DETALHE
 *
 * 1. **A distinção de origem é o conteúdo, não um enfeite.** A RLS deixa o feed
 *    misturar registros que o navegador afirmou ("movi uma pauta") com registros
 *    que o servidor constatou ("a cobrança foi confirmada"). Exibir os dois com
 *    o mesmo peso seria mentir por omissão: só o segundo grupo tem valor numa
 *    investigação, porque só ele não pode ser forjado por um cliente. Daí a
 *    marca visual e o filtro, quem está apurando um problema de cobrança quer
 *    exatamente as linhas de servidor, e não deveria ter que garimpá-las.
 *
 * 2. **Quem não pode ver recebe explicação, não uma lista vazia.** A RLS não
 *    recusa a consulta de um membro comum: ela devolve zero linhas. Sem
 *    tratamento, a tela diria "nada aconteceu ainda" para um workspace movimentado
 *, informação falsa com cara de bug. Por isso a permissão é checada antes de
 *    consultar, e a ausência de permissão tem texto próprio.
 */

import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { ProvedorWorkspace, useWorkspace } from '@/context/WorkspaceContext';
import * as atividadeService from '@/lib/atividade.service';
import * as membrosService from '@/lib/membros.service';
import type { Atividade as RegistroAtividade } from '@/lib/atividade.service';
import { diasAte, formatarDataLonga } from '@/utils/formato';
import { Avatar } from '@/components/shared/Avatar';
import { Botao } from '@/components/shared/Botao';
import { Aviso } from '@/components/shared/Aviso';
import { Etiqueta } from '@/components/shared/Etiqueta';
import { Carregando, CarregandoInline } from '@/components/shared/Carregando';
import { NaoEncontrado } from './NaoEncontrado';
import estilos from './Atividade.module.css';

export function Atividade() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return <NaoEncontrado />;
  return (
    <ProvedorWorkspace slug={slug}>
      <Conteudo />
    </ProvedorWorkspace>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Apresentação de data e hora
// ─────────────────────────────────────────────────────────────────────────────

const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

/**
 * Chave de agrupamento por dia **local**.
 *
 * `iso.slice(0, 10)` seria mais curto e estaria errado: a fatia é a data em UTC,
 * e no Brasil (UTC-3) tudo que acontece depois das 21h cairia no dia seguinte.
 * Numa tela cujo primeiro título é "hoje", isso significa ver a ação que você
 * acabou de fazer listada em amanhã.
 */
function chaveDoDia(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function tituloDoDia(iso: string): string {
  const dias = diasAte(iso);
  if (dias === 0) return 'hoje';
  if (dias === -1) return 'ontem';
  return formatarDataLonga(iso);
}

// ─────────────────────────────────────────────────────────────────────────────
// Conteúdo
// ─────────────────────────────────────────────────────────────────────────────

type Filtro = 'tudo' | 'servidor';

interface Ator {
  nome: string;
  iniciais: string;
  hue: number;
}

interface ItemExibido {
  registro: RegistroAtividade;
  ator: Ator;
}

interface GrupoDoDia {
  chave: string;
  titulo: string;
  itens: ItemExibido[];
}

/** Ator de um registro cujo autor não é (ou não é mais) um membro visível. */
const ATOR_SISTEMA: Ator = { nome: 'O sistema', iniciais: 'SI', hue: 265 };
const ATOR_DESCONHECIDO: Ator = { nome: 'Alguém que já saiu', iniciais: '??', hue: 45 };

function Conteudo() {
  const { workspace, podeAdministrar, carregando } = useWorkspace();
  const [limite, setLimite] = useState(atividadeService.LIMITE_PADRAO);
  const [filtro, setFiltro] = useState<Filtro>('tudo');

  // A consulta só é habilitada para quem a RLS deixaria ler. Não é redundância
  // com o banco: é evitar uma requisição cujo resultado seria um vazio enganoso.
  const habilitada = Boolean(workspace?.id) && podeAdministrar;

  const consulta = useQuery({
    queryKey: ['atividade', workspace?.id, limite],
    queryFn: () => atividadeService.listarAtividade(workspace!.id, limite),
    enabled: habilitada,
    // "Carregar mais" muda a chave da consulta. Sem isto, a lista sumiria e
    // voltaria maior a cada clique, a pessoa perderia o lugar onde estava
    // lendo, que é o oposto do que um botão de "mais" promete.
    placeholderData: keepPreviousData,
  });

  // Mesma chave de cache que a tela de Equipe usa: o feed reaproveita a lista já
  // carregada em vez de buscar perfis de novo.
  const consultaMembros = useQuery({
    queryKey: ['membros', workspace?.id],
    queryFn: () => membrosService.listarMembros(workspace!.id),
    enabled: habilitada,
  });

  const porId = useMemo(() => {
    const mapa = new Map<string, Ator>();
    for (const m of consultaMembros.data ?? []) {
      mapa.set(m.userId, { nome: m.nome, iniciais: m.iniciais, hue: m.hue });
    }
    return mapa;
  }, [consultaMembros.data]);

  const registros = useMemo(() => {
    const todos = consulta.data ?? [];
    return filtro === 'servidor'
      ? todos.filter(atividadeService.confirmadoPeloServidor)
      : todos;
  }, [consulta.data, filtro]);

  const grupos = useMemo<GrupoDoDia[]>(() => {
    const lista: GrupoDoDia[] = [];
    for (const registro of registros) {
      const chave = chaveDoDia(registro.criadoEm);
      const ator = registro.atorId
        ? (porId.get(registro.atorId) ?? ATOR_DESCONHECIDO)
        : ATOR_SISTEMA;

      const ultimo = lista[lista.length - 1];
      if (ultimo && ultimo.chave === chave) {
        ultimo.itens.push({ registro, ator });
      } else {
        lista.push({ chave, titulo: tituloDoDia(registro.criadoEm), itens: [{ registro, ator }] });
      }
    }
    return lista;
  }, [registros, porId]);

  if (carregando) return <Carregando mensagem="Abrindo o histórico…" />;
  if (!workspace) return <NaoEncontrado />;

  const total = consulta.data?.length ?? 0;
  const podeCarregarMais = total >= limite;
  const noTeto = limite >= atividadeService.LIMITE_MAXIMO;

  return (
    <div className={estilos.tela}>
      <header className={estilos.cabecalho}>
        <Link to={`/w/${workspace.slug}`} className={estilos.voltar}>
          ← Voltar ao quadro
        </Link>
        <h1 className={estilos.titulo}>Atividade</h1>
        <p className={estilos.subtitulo}>
          O que aconteceu neste workspace, do mais recente para o mais antigo.
        </p>
      </header>

      {!podeAdministrar ? (
        <section className={estilos.painel}>
          <Aviso tom="info" titulo="Só o dono e os admins veem o histórico.">
            <span>
              O registro de atividade guarda quem fez o quê, inclusive em cobrança e
              equipe. Por isso ele fica com quem administra o workspace. Se você precisa
              consultar alguma coisa aqui, peça a quem administra.
            </span>
            <Link to={`/w/${workspace.slug}`} className={estilos.acaoVazio}>
              Voltar ao quadro →
            </Link>
          </Aviso>
        </section>
      ) : (
        <>
          <section className={estilos.painel}>
            <div className={estilos.barra}>
              <div className={estilos.filtros} role="group" aria-label="Filtrar por origem">
                <Botao
                  variante={filtro === 'tudo' ? 'principal' : 'secundario'}
                  aria-pressed={filtro === 'tudo'}
                  onClick={() => setFiltro('tudo')}
                >
                  Tudo
                </Botao>
                <Botao
                  variante={filtro === 'servidor' ? 'principal' : 'secundario'}
                  aria-pressed={filtro === 'servidor'}
                  onClick={() => setFiltro('servidor')}
                >
                  Só o que o servidor confirmou
                </Botao>
              </div>

              <p className={estilos.legenda}>
                <span className={estilos.marca}>
                  <Etiqueta reta>servidor</Etiqueta>
                </span>
                marca o que foi registrado pelo próprio sistema. O resto foi informado
                pelo navegador de quem agiu.
              </p>
            </div>

            {consulta.isPending ? (
              <CarregandoInline mensagem="Reunindo o histórico…" />
            ) : null}

            {consulta.isError ? (
              <div className={estilos.erro}>
                <Aviso erro={consulta.error} linkPlano={`/w/${workspace.slug}/plano`} />
                <Botao variante="secundario" onClick={() => void consulta.refetch()}>
                  Tentar de novo
                </Botao>
              </div>
            ) : null}

            {consulta.isSuccess && grupos.length === 0 ? (
              <div className={estilos.vazio}>
                {filtro === 'servidor' && total > 0 ? (
                  <>
                    <p className={estilos.vazioTitulo}>
                      Nada foi registrado pelo servidor ainda.
                    </p>
                    <p className={estilos.vazioTexto}>
                      Estes registros aparecem quando há cobrança, mudança de plano ou
                      alerta de segurança. Enquanto isso, veja tudo o que aconteceu.
                    </p>
                    <Botao variante="secundario" onClick={() => setFiltro('tudo')}>
                      Mostrar tudo
                    </Botao>
                  </>
                ) : (
                  <>
                    <p className={estilos.vazioTitulo}>Ainda não há nada para contar.</p>
                    <p className={estilos.vazioTexto}>
                      Assim que alguém criar ou mover uma pauta, a ação aparece aqui com
                      autor e horário. Comece pelo quadro.
                    </p>
                    <Link to={`/w/${workspace.slug}`} className={estilos.acaoVazio}>
                      Ir para o quadro →
                    </Link>
                  </>
                )}
              </div>
            ) : null}

            {grupos.map((grupo) => (
              <section key={grupo.chave} className={estilos.dia}>
                <h2 className={estilos.tituloDia}>{grupo.titulo}</h2>
                <ol className={estilos.linha}>
                  {grupo.itens.map((item) => (
                    <ItemAtividade key={item.registro.id} item={item} />
                  ))}
                </ol>
              </section>
            ))}

            {consulta.isSuccess && podeCarregarMais ? (
              <div className={estilos.rodape}>
                <Botao
                  variante="secundario"
                  carregando={consulta.isFetching}
                  motivoDesabilitado={
                    noTeto
                      ? `Esta tela mostra no máximo ${atividadeService.LIMITE_MAXIMO} registros de uma vez. Para ir mais fundo no histórico, fale com o suporte.`
                      : undefined
                  }
                  onClick={() =>
                    setLimite((atual) =>
                      atividadeService.limiteValido(atual + atividadeService.LIMITE_PADRAO),
                    )
                  }
                >
                  Carregar mais
                </Botao>
              </div>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Item
// ─────────────────────────────────────────────────────────────────────────────

function ItemAtividade({ item }: { item: ItemExibido }) {
  const { registro, ator } = item;
  const doServidor = atividadeService.confirmadoPeloServidor(registro);
  const detalhes = Object.entries(registro.meta);
  const quando = new Date(registro.criadoEm);

  return (
    <li className={`${estilos.item} ${doServidor ? estilos.itemServidor : ''}`}>
      <span className={estilos.pino} aria-hidden="true" />

      <Avatar iniciais={ator.iniciais} hue={ator.hue} nome={ator.nome} tamanho="medio" />

      <div className={estilos.corpo}>
        <p className={estilos.frase}>
          <strong className={estilos.ator}>{ator.nome}</strong>{' '}
          {atividadeService.descreverEvento(registro.evento)}
          {doServidor ? (
            <>
              <span className={estilos.marca}>
                <Etiqueta>servidor</Etiqueta>
              </span>
              <span className="apenas-leitor">
                Registrado pelo servidor, não pode ter sido forjado pelo navegador.
              </span>
            </>
          ) : null}
        </p>

        {detalhes.length > 0 ? (
          <details className={estilos.detalhes}>
            <summary className={estilos.detalhesResumo}>Detalhes</summary>
            <dl className={estilos.detalhesLista}>
              {detalhes.map(([chave, valor]) => (
                <div key={chave} className={estilos.detalhesLinha}>
                  <dt className={estilos.detalhesChave}>{chave}</dt>
                  <dd className={estilos.detalhesValor}>
                    {typeof valor === 'string' ? valor : JSON.stringify(valor)}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        ) : null}
      </div>

      {/* `title` traz a data completa: a coluna mostra só a hora, e "14:32" sem
          contexto é ambíguo depois que o item sai do grupo "hoje". */}
      <time className={estilos.hora} dateTime={registro.criadoEm} title={quando.toLocaleString('pt-BR')}>
        {HORA.format(quando)}
      </time>
    </li>
  );
}
