/**
 * Modo demonstração — o banco de dados que mora na memória da aba.
 *
 * Este arquivo é o espelho de `supabase/seeds/0001_oficios.sql` e de
 * `supabase/migrations/0005_planos_assinaturas.sql`: os três ofícios do
 * sistema com suas etapas, templates e exemplos, e o catálogo de planos com
 * preço e limite. Quando o seed mudar, este arquivo muda junto — é a única
 * duplicação aceita no projeto, e ela existe para que o front possa ser
 * construído e revisado antes de existir um banco.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE O ESTADO É MUTÁVEL
 *
 * Dados fixos e imutáveis mostrariam as telas, mas não a *interação*: arrastar
 * um card que volta para o lugar, arquivar uma pauta que reaparece no refetch
 * e criar uma pauta que some não são revisáveis. A revisão de uma interface de
 * quadro é a revisão do gesto, não do print. Então aqui o dado é um pequeno
 * banco em memória: as funções de escrita alteram os registros de verdade, e
 * a leitura seguinte enxerga a alteração — exatamente como o TanStack Query
 * espera após invalidar a chave.
 *
 * O estado morre com a aba. Isso é intencional: recarregar a página é o botão
 * de "restaurar demonstração", e ninguém precisa aprender outro.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O QUE ESTE ARQUIVO NÃO FAZ
 *
 * Não valida entrada e não simula erro do servidor. Quem valida é a camada de
 * serviços, antes do desvio de demonstração — de propósito, para que a mesma
 * mensagem de erro apareça com e sem backend. E não guarda nada em disco:
 * nenhum `localStorage`, nenhum token real, nenhuma credencial.
 */

import type { Session } from '@supabase/supabase-js';
import { PASSO, posicaoAoFim, posicaoEntre } from '@/utils/ordenacao';
import type {
  Assinatura,
  LimitesPlano,
  Membro,
  Oficio,
  Papel,
  Pauta,
  Perfil,
  Plano,
  PlanoCatalogo,
  Quadro,
  TemaWorkspace,
  Uso,
  Workspace,
} from '@/lib/tipos';
// Tipos das entradas dos serviços. `import type` não cria aresta de runtime,
// então o ciclo serviço → demo → serviço existe só para o compilador.
import type { NovoOficio } from '../oficios.service';
import type { CamposEditaveis, NovaPauta } from '../pautas.service';
import type { Convite, ConviteCriado } from '../membros.service';
import type {
  DadosContratacao,
  LinhaCobranca,
  RespostaCancelamento,
  RespostaContratacao,
  RespostaPortal,
} from '../assinaturas.service';

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ids no formato UUID v4, atribuídos em sequência.
 *
 * O formato importa: `zPauta` e companhia validam `.uuid()`, e um id como
 * `pauta-1` faria o schema recusar o dado da própria demonstração. A sequência
 * também importa — ids estáveis entre execuções tornam um bug reproduzível.
 */
let sequencia = 0;
function novoId(): string {
  sequencia += 1;
  return `00000000-0000-4000-8000-${sequencia.toString(16).padStart(12, '0')}`;
}

/**
 * Data (só o dia) relativa a hoje, como o banco devolveria uma coluna `date`.
 * Meio-dia local evita que a conversão para UTC empurre o prazo um dia.
 */
function emDias(dias: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Instante relativo a agora, como o banco devolveria um `timestamptz`. */
function instanteEmDias(dias: number): string {
  return new Date(Date.now() + dias * 86_400_000).toISOString();
}

/** Cópia rasa na saída: quem consome não altera o banco sem passar por aqui. */
function copia<T>(registro: T): T {
  return { ...registro };
}

// ─────────────────────────────────────────────────────────────────────────────
// Semente — tradução literal de supabase/seeds/0001_oficios.sql
// ─────────────────────────────────────────────────────────────────────────────

interface ExemploSemente {
  etapa: number;
  titulo: string;
  campo1: string | null;
  campo2: string | null;
  prazoDias: number | null;
}

interface OficioSemente {
  chave: string;
  nome: string;
  descricao: string;
  glifo: string;
  hue: number;
  chroma: number;
  tituloQuadro: string;
  campo1Label: string;
  campo2Label: string;
  mono: boolean;
  solo: boolean;
  ordem: number;
  etapas: string[];
  templates: string[];
  exemplos: ExemploSemente[];
  /** Pautas que já nascem arquivadas — a tela de arquivadas precisa de conteúdo. */
  arquivadas: ExemploSemente[];
}

const OFICIOS_SEMENTE: OficioSemente[] = [
  {
    chave: 'mkt',
    nome: 'Marketing',
    descricao: 'Da ideia ao publicado, cada canal no seu ritmo.',
    glifo: '▲',
    hue: 45,
    chroma: 0.16,
    tituloQuadro: 'Pauta de conteúdo',
    campo1Label: 'Canal',
    campo2Label: 'Campanha',
    mono: false,
    solo: false,
    ordem: 1,
    etapas: ['Ideias', 'Roteiro', 'Produção', 'Aprovação', 'Publicado'],
    templates: ['Post carrossel', 'Reels — vídeo curto', 'Newsletter da semana'],
    exemplos: [
      { etapa: 0, titulo: 'Série: bastidores do estúdio', campo1: 'Instagram', campo2: 'Marca · mensal', prazoDias: 3 },
      { etapa: 1, titulo: 'Reels — 3 erros de quem começa', campo1: 'Instagram', campo2: 'Aquisição', prazoDias: 4 },
      { etapa: 2, titulo: 'Newsletter #42 — cases', campo1: 'E-mail', campo2: 'Retenção', prazoDias: 5 },
      { etapa: 2, titulo: 'Vídeo — tour do produto', campo1: 'YouTube', campo2: 'Lançamento', prazoDias: 10 },
      { etapa: 3, titulo: 'Carrossel — prova social', campo1: 'Instagram', campo2: 'Aquisição', prazoDias: 2 },
      { etapa: 4, titulo: 'Post — vaga de designer', campo1: 'LinkedIn', campo2: 'Marca', prazoDias: -2 },
    ],
    arquivadas: [
      { etapa: 4, titulo: 'Retrospectiva de junho', campo1: 'Blog', campo2: 'Marca', prazoDias: -21 },
      { etapa: 4, titulo: 'Reels — bastidores do lançamento', campo1: 'Instagram', campo2: 'Lançamento', prazoDias: -14 },
    ],
  },
  {
    chave: 'ti',
    nome: 'TI · Dev',
    descricao: 'Sprint, review e deploy no mesmo trilho.',
    glifo: '■',
    hue: 160,
    chroma: 0.13,
    tituloQuadro: 'Pauta do time',
    campo1Label: 'Sprint',
    campo2Label: 'Estimativa',
    mono: true,
    solo: false,
    ordem: 2,
    etapas: ['Backlog', 'Em dev', 'Code review', 'QA', 'Deploy'],
    templates: ['Bugfix', 'Feature nova', 'Refactor'],
    exemplos: [
      { etapa: 0, titulo: 'Migrar fila para worker', campo1: 'Sprint 15', campo2: '8 pts', prazoDias: 15 },
      { etapa: 1, titulo: 'Login por passkey', campo1: 'Sprint 14', campo2: '5 pts', prazoDias: 4 },
      { etapa: 2, titulo: 'Fuso errado no relatório', campo1: 'Sprint 14', campo2: '2 pts', prazoDias: 2 },
      { etapa: 3, titulo: 'Dark mode do painel', campo1: 'Sprint 14', campo2: '3 pts', prazoDias: 5 },
      { etapa: 4, titulo: 'Cache de sessão', campo1: 'Sprint 13', campo2: '1 pt', prazoDias: -3 },
    ],
    arquivadas: [
      { etapa: 4, titulo: 'Corrigir rodapé do e-mail', campo1: 'Sprint 12', campo2: '1 pt', prazoDias: -19 },
    ],
  },
  {
    chave: 'prod',
    nome: 'Produtividade',
    descricao: 'Sua semana em quatro colunas honestas.',
    glifo: '●',
    hue: 265,
    chroma: 0.13,
    tituloQuadro: 'Minha semana',
    campo1Label: 'Contexto',
    campo2Label: 'Energia',
    mono: false,
    solo: true,
    ordem: 3,
    etapas: ['Entrada', 'Hoje', 'Esta semana', 'Feito'],
    templates: ['Revisão semanal', 'Hábito novo', 'Lista de leitura'],
    exemplos: [
      { etapa: 0, titulo: 'Marcar dentista', campo1: 'Rápida', campo2: 'Baixa', prazoDias: null },
      { etapa: 1, titulo: 'Treino de força', campo1: 'Saúde', campo2: 'Alta', prazoDias: 0 },
      { etapa: 1, titulo: 'Revisar orçamento do mês', campo1: 'Casa', campo2: 'Média', prazoDias: 0 },
      { etapa: 2, titulo: 'Capítulo 4 — curso de UX', campo1: 'Estudo', campo2: 'Alta', prazoDias: 4 },
      { etapa: 3, titulo: 'Planejar viagem de setembro', campo1: 'Planejamento', campo2: null, prazoDias: -5 },
    ],
    arquivadas: [
      { etapa: 3, titulo: 'Renovar a habilitação', campo1: 'Burocracia', campo2: 'Baixa', prazoDias: -30 },
    ],
  },
];

/** Catálogo de planos — espelha o insert da migration 0005. */
const PLANOS_SEMENTE: PlanoCatalogo[] = [
  {
    chave: 'solo',
    nome: 'Solo',
    chamada: 'Para começar hoje, sem cartão.',
    precoMensalCentavos: 0,
    precoAnualCentavos: 0,
    limites: {
      max_quadros: 1,
      max_pautas_por_quadro: 40,
      max_membros: 1,
      oficios_personalizados: false,
      exportar: false,
      historico: false,
    },
    destaques: [
      '1 quadro',
      'Até 40 pautas',
      'Os 3 ofícios do sistema',
      'Quadro e tabela',
      'Troca de ofício quando quiser',
    ],
    ordem: 1,
    gratuito: true,
  },
  {
    chave: 'estudio',
    nome: 'Estúdio',
    chamada: 'Para quem vive de pauta.',
    precoMensalCentavos: 2900,
    precoAnualCentavos: 29000,
    limites: {
      max_quadros: null,
      max_pautas_por_quadro: null,
      max_membros: 1,
      oficios_personalizados: true,
      exportar: true,
      historico: true,
    },
    destaques: [
      'Quadros ilimitados',
      'Pautas ilimitadas',
      'Ofícios personalizados',
      'Exportar em CSV',
      'Histórico de movimentação',
    ],
    ordem: 2,
    gratuito: false,
  },
  {
    chave: 'time',
    nome: 'Time',
    chamada: 'Para o time inteiro no mesmo trilho.',
    precoMensalCentavos: 7900,
    precoAnualCentavos: 79000,
    limites: {
      max_quadros: null,
      max_pautas_por_quadro: null,
      max_membros: 8,
      oficios_personalizados: true,
      exportar: true,
      historico: true,
    },
    destaques: [
      'Tudo do Estúdio',
      'Até 8 membros',
      'Papéis (dono, admin, membro)',
      'Responsável por pauta',
      'Registro de auditoria',
    ],
    ordem: 3,
    gratuito: false,
  },
];

/**
 * O plano do workspace de demonstração.
 *
 * É Estúdio com três membros de propósito, e a combinação não é descuido: o
 * limite de membros do Estúdio é 1, então a tela de Equipe abre com a lista
 * cheia **e** com o botão de convidar desabilitado explicando o motivo. As duas
 * coisas que precisam ser revisadas — conteúdo e prevenção de erro — aparecem
 * na mesma tela. Trocar para 'time' aqui devolve o caminho feliz do convite.
 */
const PLANO_DEMO: Plano = 'estudio';

const NOME_WORKSPACE = 'Estúdio Aurora';
const SLUG_WORKSPACE = 'aurora';

interface MembroSemente {
  nome: string;
  iniciais: string;
  email: string;
  hue: number;
  papel: Papel;
}

const MEMBROS_SEMENTE: MembroSemente[] = [
  { nome: 'Marina Alves', iniciais: 'MA', email: 'marina@exemplo.test', hue: 45, papel: 'owner' },
  { nome: 'Rafael Lima', iniciais: 'RL', email: 'rafael@exemplo.test', hue: 200, papel: 'admin' },
  { nome: 'Bia Nunes', iniciais: 'BN', email: 'bia@exemplo.test', hue: 320, papel: 'membro' },
];

// ─────────────────────────────────────────────────────────────────────────────
// O banco em memória
// ─────────────────────────────────────────────────────────────────────────────

interface BancoDemo {
  perfil: Perfil;
  workspace: Workspace;
  membros: Membro[];
  convites: Convite[];
  oficios: Oficio[];
  quadros: Quadro[];
  /** Ativas e arquivadas na mesma lista, como a tabela `pautas` do banco. */
  pautas: Pauta[];
  assinatura: Assinatura | null;
  cobrancas: LinhaCobranca[];
}

let banco: BancoDemo | null = null;

/** O banco é montado na primeira leitura, nunca na importação do módulo. */
function bd(): BancoDemo {
  if (!banco) banco = semear();
  return banco;
}

/** Devolve a demonstração ao estado inicial sem recarregar a página. */
export function reiniciar(): void {
  banco = null;
  sequencia = 0;
}

function semear(): BancoDemo {
  const workspaceId = novoId();

  const membros: Membro[] = MEMBROS_SEMENTE.map((m) => ({
    workspaceId,
    userId: novoId(),
    papel: m.papel,
    nome: m.nome,
    iniciais: m.iniciais,
    hue: m.hue,
    email: m.email,
  }));

  const dono = membros[0] as Membro;

  const oficios: Oficio[] = OFICIOS_SEMENTE.map((s) => ({
    id: novoId(),
    workspaceId: null,
    doSistema: true,
    chave: s.chave,
    nome: s.nome,
    descricao: s.descricao,
    glifo: s.glifo,
    hue: s.hue,
    chroma: s.chroma,
    tituloQuadro: s.tituloQuadro,
    campo1Label: s.campo1Label,
    campo2Label: s.campo2Label,
    mono: s.mono,
    solo: s.solo,
    ordem: s.ordem,
    etapas: s.etapas.map((nome, i) => ({ id: novoId(), nome, ordem: i })),
    templates: s.templates.map((nome, i) => ({
      id: novoId(),
      nome,
      campo1: null,
      campo2: null,
      ordem: i,
    })),
  }));

  const quadros: Quadro[] = [];
  const pautas: Pauta[] = [];

  OFICIOS_SEMENTE.forEach((semente, indice) => {
    const oficio = oficios[indice] as Oficio;
    const quadro: Quadro = {
      id: novoId(),
      workspaceId,
      oficioId: oficio.id,
      titulo: oficio.tituloQuadro,
      arquivadoEm: null,
    };
    quadros.push(quadro);

    const primeiraEtapa = oficio.etapas[0] as { id: string };

    const monta = (
      exemplo: ExemploSemente,
      posicaoNaColuna: number,
      arquivadaEm: string | null,
      responsavelId: string | null,
    ): Pauta => ({
      id: novoId(),
      workspaceId,
      quadroId: quadro.id,
      oficioId: oficio.id,
      etapaId: (oficio.etapas[exemplo.etapa] ?? primeiraEtapa).id,
      titulo: exemplo.titulo,
      campo1: exemplo.campo1,
      campo2: exemplo.campo2,
      prazo: exemplo.prazoDias === null ? null : emDias(exemplo.prazoDias),
      responsavelId,
      posicao: (posicaoNaColuna + 1) * PASSO,
      arquivadaEm,
    });

    semente.exemplos.forEach((exemplo, i) => {
      // Ofício solo é de uma pessoa só: atribuir responsável ali seria inventar
      // uma coluna que a interface daquele ofício nem mostra.
      const responsavel = semente.solo
        ? null
        : (membros[i % membros.length] as Membro).userId;
      pautas.push(monta(exemplo, i, null, responsavel));
    });

    semente.arquivadas.forEach((exemplo, i) => {
      pautas.push(monta(exemplo, i, instanteEmDias(-(i + 2)), semente.solo ? null : dono.userId));
    });
  });

  const catalogo = PLANOS_SEMENTE.find((p) => p.chave === PLANO_DEMO) as PlanoCatalogo;

  return {
    perfil: {
      id: dono.userId,
      nome: dono.nome,
      email: dono.email,
      iniciais: dono.iniciais,
      hue: dono.hue,
    },
    workspace: {
      id: workspaceId,
      nome: NOME_WORKSPACE,
      slug: SLUG_WORKSPACE,
      plano: PLANO_DEMO,
      status: 'ativo',
      tema: {} as TemaWorkspace,
      planoExpiraEm: null,
      gravavel: true,
    },
    membros,
    convites: [
      {
        id: novoId(),
        email: 'convidado@exemplo.test',
        papel: 'membro',
        expiraEm: instanteEmDias(5),
        aceitoEm: null,
      },
    ],
    oficios,
    quadros,
    pautas,
    assinatura: {
      id: novoId(),
      plano: PLANO_DEMO,
      ciclo: 'mensal',
      status: 'ativa',
      valorCentavos: catalogo.precoMensalCentavos,
      proximaCobranca: emDias(12),
      fimPeriodo: null,
      canceladaEm: null,
    },
    cobrancas: [
      {
        id: novoId(),
        status: 'pendente',
        valorCentavos: catalogo.precoMensalCentavos,
        vencimento: emDias(12),
        pagoEm: null,
        urlFatura: 'https://exemplo.test/fatura/demo-3',
        formaPagamento: 'PIX',
      },
      {
        id: novoId(),
        status: 'recebida',
        valorCentavos: catalogo.precoMensalCentavos,
        vencimento: emDias(-18),
        pagoEm: instanteEmDias(-18),
        urlFatura: 'https://exemplo.test/fatura/demo-2',
        formaPagamento: 'PIX',
      },
      {
        id: novoId(),
        status: 'recebida',
        valorCentavos: catalogo.precoMensalCentavos,
        vencimento: emDias(-48),
        pagoEm: instanteEmDias(-46),
        urlFatura: 'https://exemplo.test/fatura/demo-1',
        formaPagamento: 'BOLETO',
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sessão e perfil
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Uma sessão com a forma que o `supabase-js` devolveria.
 *
 * Os tokens são a string `demonstracao`, e isso é seguro por construção: em
 * modo demo nenhuma chamada sai da máquina — os serviços desviam antes de
 * tocar no cliente. O `as unknown as Session` existe porque o tipo do SDK
 * carrega dezenas de campos que uma demonstração não tem como preencher com
 * honestidade; inventar valores para todos seria pior do que assumir o recorte.
 */
export function sessao(): Session {
  const b = bd();
  const agora = Math.floor(Date.now() / 1000);
  return {
    access_token: 'demonstracao',
    refresh_token: 'demonstracao',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: agora + 3600,
    user: {
      id: b.perfil.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: b.perfil.email,
      email_confirmed_at: instanteEmDias(-90),
      app_metadata: { provider: 'demonstracao', providers: ['demonstracao'] },
      user_metadata: { nome: b.perfil.nome },
      created_at: instanteEmDias(-90),
      updated_at: instanteEmDias(-1),
    },
  } as unknown as Session;
}

export function perfil(): Perfil {
  return copia(bd().perfil);
}

export function atualizarPerfil(campos: { nome?: string; iniciais?: string }): void {
  const b = bd();
  if (campos.nome !== undefined) b.perfil.nome = campos.nome.trim();
  if (campos.iniciais !== undefined) {
    b.perfil.iniciais = campos.iniciais.trim().slice(0, 2).toUpperCase();
  }
  // O membro e o perfil são a mesma pessoa: a lista da Equipe tem que acompanhar.
  const eu = b.membros.find((m) => m.userId === b.perfil.id);
  if (eu) {
    eu.nome = b.perfil.nome;
    eu.iniciais = b.perfil.iniciais;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Workspace
// ─────────────────────────────────────────────────────────────────────────────

export function workspaces(): Workspace[] {
  return [copia(bd().workspace)];
}

/**
 * Sem parâmetro de slug de propósito: existe um workspace só, e devolvê-lo
 * para qualquer URL faz com que qualquer rota `/w/:slug` digitada à mão abra
 * a demonstração em vez de um "não encontrado" que ninguém quis testar.
 */
export function porSlug(): Workspace {
  return copia(bd().workspace);
}

export function renomearWorkspace(nome: string): void {
  bd().workspace.nome = nome.trim();
}

export function salvarTema(tema: Record<string, unknown>): void {
  bd().workspace.tema = tema as TemaWorkspace;
}

/**
 * Criar workspace, na demonstração, é entrar no quadro do ofício escolhido.
 *
 * O fluxo de abertura (escolher ofício → ver quadro pronto) é o principal do
 * produto e precisa funcionar aqui inteiro. Criar um segundo tenant em memória
 * não acrescentaria nada revisável e faria a sidebar mentir sobre troca de
 * workspace.
 */
export function criarWorkspace(entrada: { nome: string; oficioChave: string }): {
  workspaceId: string;
  slug: string;
  quadroId: string;
} {
  const b = bd();
  b.workspace.nome = entrada.nome.trim();

  const oficio =
    b.oficios.find((o) => o.chave === entrada.oficioChave) ?? (b.oficios[0] as Oficio);
  const quadro =
    b.quadros.find((q) => q.oficioId === oficio.id) ??
    criarQuadro({ oficioId: oficio.id, titulo: oficio.tituloQuadro });

  return { workspaceId: b.workspace.id, slug: b.workspace.slug, quadroId: quadro.id };
}

export function uso(): Uso {
  const b = bd();
  const catalogo =
    PLANOS_SEMENTE.find((p) => p.chave === b.workspace.plano) ?? (PLANOS_SEMENTE[0] as PlanoCatalogo);

  return {
    workspaceId: b.workspace.id,
    plano: b.workspace.plano,
    planoNome: catalogo.nome,
    status: b.workspace.status,
    quadros: b.quadros.filter((q) => !q.arquivadoEm).length,
    pautas: b.pautas.filter((p) => !p.arquivadaEm).length,
    membros: b.membros.length,
    convitesAbertos: b.convites.length,
    limites: catalogo.limites as LimitesPlano,
  };
}

/** Quem entra na demonstração é o dono: nenhuma tela fica escondida. */
export function papel(): Papel {
  return 'owner';
}

// ─────────────────────────────────────────────────────────────────────────────
// Ofícios
// ─────────────────────────────────────────────────────────────────────────────

export function oficiosDoSistema(): Oficio[] {
  return bd()
    .oficios.filter((o) => o.doSistema)
    .map(copia);
}

export function oficiosDisponiveis(): Oficio[] {
  return bd().oficios.map(copia);
}

export function oficio(id: string): Oficio | null {
  const achado = bd().oficios.find((o) => o.id === id);
  return achado ? copia(achado) : null;
}

export function criarOficio(entrada: NovoOficio): Oficio {
  const b = bd();
  const novo: Oficio = {
    id: novoId(),
    workspaceId: b.workspace.id,
    doSistema: false,
    chave: entrada.chave,
    nome: entrada.nome,
    descricao: entrada.descricao ?? '',
    glifo: entrada.glifo ?? '●',
    hue: entrada.hue,
    chroma: entrada.chroma ?? 0.13,
    tituloQuadro: entrada.tituloQuadro,
    campo1Label: entrada.campo1Label,
    campo2Label: entrada.campo2Label,
    mono: entrada.mono ?? false,
    solo: entrada.solo ?? false,
    ordem: 90,
    etapas: entrada.etapas.map((nome, i) => ({ id: novoId(), nome, ordem: i })),
    templates: (entrada.templates ?? []).map((nome, i) => ({
      id: novoId(),
      nome,
      campo1: null,
      campo2: null,
      ordem: i,
    })),
  };
  b.oficios.push(novo);
  return copia(novo);
}

export function excluirOficio(id: string): void {
  const b = bd();
  const i = b.oficios.findIndex((o) => o.id === id && !o.doSistema);
  if (i >= 0) b.oficios.splice(i, 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Quadros
// ─────────────────────────────────────────────────────────────────────────────

export function quadros(): Quadro[] {
  return bd()
    .quadros.filter((q) => !q.arquivadoEm)
    .map(copia);
}

export function criarQuadro(entrada: { oficioId: string; titulo: string }): Quadro {
  const b = bd();
  const novo: Quadro = {
    id: novoId(),
    workspaceId: b.workspace.id,
    oficioId: entrada.oficioId,
    titulo: entrada.titulo.trim(),
    arquivadoEm: null,
  };
  b.quadros.push(novo);
  return copia(novo);
}

export function renomearQuadro(id: string, titulo: string): void {
  const quadro = bd().quadros.find((q) => q.id === id);
  if (quadro) quadro.titulo = titulo.trim();
}

/**
 * Troca o ofício do quadro levando as pautas junto — "a pauta viaja junto".
 * A etapa de destino é a de mesma ordem; quando o ofício novo tem menos
 * colunas, a pauta cai na última, que é onde um humano a procuraria.
 */
export function trocarOficioDoQuadro(quadroId: string, oficioId: string): void {
  const b = bd();
  const quadro = b.quadros.find((q) => q.id === quadroId);
  const destino = b.oficios.find((o) => o.id === oficioId);
  if (!quadro || !destino || destino.etapas.length === 0) return;

  const origem = b.oficios.find((o) => o.id === quadro.oficioId);
  quadro.oficioId = destino.id;

  for (const pauta of b.pautas.filter((p) => p.quadroId === quadroId)) {
    const ordemAtual = origem?.etapas.find((e) => e.id === pauta.etapaId)?.ordem ?? 0;
    const indice = Math.min(ordemAtual, destino.etapas.length - 1);
    pauta.oficioId = destino.id;
    pauta.etapaId = (destino.etapas[indice] as { id: string }).id;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pautas
// ─────────────────────────────────────────────────────────────────────────────

export function pautas(quadroId: string): Pauta[] {
  return bd()
    .pautas.filter((p) => p.quadroId === quadroId && !p.arquivadaEm)
    .sort((a, b) => a.posicao - b.posicao)
    .map(copia);
}

export function arquivadas(quadroId: string): Pauta[] {
  return bd()
    .pautas.filter((p) => p.quadroId === quadroId && p.arquivadaEm)
    .sort((a, b) => (a.arquivadaEm ?? '') < (b.arquivadaEm ?? '') ? 1 : -1)
    .map(copia);
}

export function criarPauta(entrada: NovaPauta): Pauta {
  const b = bd();
  const irmas = b.pautas
    .filter((p) => p.quadroId === entrada.quadroId && p.etapaId === entrada.etapaId && !p.arquivadaEm)
    .map((p) => p.posicao);

  const nova: Pauta = {
    id: novoId(),
    workspaceId: b.workspace.id,
    quadroId: entrada.quadroId,
    oficioId: entrada.oficioId,
    etapaId: entrada.etapaId,
    titulo: entrada.titulo.trim().slice(0, 200),
    // Campo vazio é null, nunca o traço '—': o traço é decisão de renderização.
    campo1: entrada.campo1?.trim() || null,
    campo2: entrada.campo2?.trim() || null,
    prazo: entrada.prazo || null,
    responsavelId: entrada.responsavelId ?? null,
    posicao: posicaoAoFim(entrada.irmas?.map((p) => p.posicao) ?? irmas),
    arquivadaEm: null,
  };
  b.pautas.push(nova);
  return copia(nova);
}

export function atualizarPauta(id: string, campos: CamposEditaveis): Pauta | null {
  const pauta = bd().pautas.find((p) => p.id === id);
  if (!pauta) return null;

  if (campos.titulo !== undefined) pauta.titulo = campos.titulo.trim().slice(0, 200);
  if (campos.campo1 !== undefined) pauta.campo1 = campos.campo1?.trim() || null;
  if (campos.campo2 !== undefined) pauta.campo2 = campos.campo2?.trim() || null;
  if (campos.prazo !== undefined) pauta.prazo = campos.prazo || null;
  if (campos.responsavelId !== undefined) pauta.responsavelId = campos.responsavelId;
  if (campos.etapaId !== undefined) pauta.etapaId = campos.etapaId;

  return copia(pauta);
}

export function moverPauta(entrada: {
  id: string;
  etapaId: string;
  anterior?: number;
  proxima?: number;
}): Pauta | null {
  const pauta = bd().pautas.find((p) => p.id === entrada.id);
  if (!pauta) return null;

  pauta.etapaId = entrada.etapaId;
  pauta.posicao = posicaoEntre(entrada.anterior, entrada.proxima);
  return copia(pauta);
}

export function arquivarPauta(id: string): void {
  const pauta = bd().pautas.find((p) => p.id === id);
  if (pauta) pauta.arquivadaEm = new Date().toISOString();
}

export function desarquivarPauta(id: string): void {
  const pauta = bd().pautas.find((p) => p.id === id);
  if (pauta) pauta.arquivadaEm = null;
}

export function excluirPauta(id: string): void {
  const b = bd();
  const i = b.pautas.findIndex((p) => p.id === id);
  if (i >= 0) b.pautas.splice(i, 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Membros e convites
// ─────────────────────────────────────────────────────────────────────────────

export function membros(): Membro[] {
  return bd().membros.map(copia);
}

export function convites(): Convite[] {
  return bd().convites.map(copia);
}

export function convidar(entrada: { email: string; papel: Papel }): ConviteCriado {
  const b = bd();
  const novo: Convite = {
    id: novoId(),
    email: entrada.email.trim().toLowerCase(),
    papel: entrada.papel,
    expiraEm: instanteEmDias(7),
    aceitoEm: null,
  };
  b.convites.push(novo);
  // Link sem token de verdade: em demonstração não há segredo a proteger, e um
  // token aleatório aqui daria a impressão de que existe um convite válido.
  return { id: novo.id, link: `${window.location.origin}/convite?t=demonstracao` };
}

export function revogarConvite(id: string): void {
  const b = bd();
  const i = b.convites.findIndex((c) => c.id === id);
  if (i >= 0) b.convites.splice(i, 1);
}

export function mudarPapel(userId: string, novoPapel: Papel): void {
  const membro = bd().membros.find((m) => m.userId === userId);
  if (membro) membro.papel = novoPapel;
}

export function removerMembro(userId: string): void {
  const b = bd();
  const i = b.membros.findIndex((m) => m.userId === userId);
  // O último dono não sai: é a mesma proteção do trigger `proteger_ultimo_owner`.
  const alvo = b.membros[i];
  if (!alvo) return;
  if (alvo.papel === 'owner' && b.membros.filter((m) => m.papel === 'owner').length === 1) return;
  b.membros.splice(i, 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Planos, assinatura e cobranças
// ─────────────────────────────────────────────────────────────────────────────

export function planos(): PlanoCatalogo[] {
  return PLANOS_SEMENTE.map(copia);
}

export function assinatura(): Assinatura | null {
  const a = bd().assinatura;
  // A consulta real só traz assinatura viva; a cancelada some da tela de Plano.
  if (!a || a.status === 'cancelada' || a.status === 'expirada') return null;
  return copia(a);
}

export function cobrancas(): LinhaCobranca[] {
  return bd().cobrancas.map(copia);
}

export function contratar(dados: DadosContratacao): RespostaContratacao {
  const b = bd();
  const catalogo =
    PLANOS_SEMENTE.find((p) => p.chave === dados.plano) ?? (PLANOS_SEMENTE[1] as PlanoCatalogo);
  const valor =
    dados.ciclo === 'anual' ? catalogo.precoAnualCentavos : catalogo.precoMensalCentavos;

  b.workspace.plano = dados.plano;
  b.workspace.status = 'ativo';
  b.assinatura = {
    id: novoId(),
    plano: dados.plano,
    ciclo: dados.ciclo,
    status: 'ativa',
    valorCentavos: valor,
    proximaCobranca: emDias(dados.ciclo === 'anual' ? 365 : 30),
    fimPeriodo: null,
    canceladaEm: null,
  };
  b.cobrancas.unshift({
    id: novoId(),
    status: 'pendente',
    valorCentavos: valor,
    vencimento: emDias(3),
    pagoEm: null,
    urlFatura: 'https://exemplo.test/fatura/demonstracao',
    formaPagamento: 'PIX',
  });

  return {
    assinaturaId: b.assinatura.id,
    plano: dados.plano,
    ciclo: dados.ciclo,
    valorCentavos: valor,
    // Sem URL de pagamento: em demonstração não existe fatura para abrir, e
    // mandar o navegador para um domínio inventado seria pior que não mandar.
    urlPagamento: null,
    aguardandoFatura: true,
  };
}

export function abrirFatura(): RespostaPortal {
  const b = bd();
  const a = b.assinatura;
  const emAberto = b.cobrancas.find((c) => c.status === 'pendente' || c.status === 'vencida');

  return {
    plano: a?.plano ?? b.workspace.plano,
    ciclo: a?.ciclo ?? 'mensal',
    status: a?.status ?? 'pendente',
    valorCentavos: a?.valorCentavos ?? 0,
    proximaCobranca: a?.proximaCobranca ?? null,
    fimPeriodo: a?.fimPeriodo ?? null,
    urlPagamento: emAberto?.urlFatura ?? null,
    vencimento: emAberto?.vencimento ?? null,
  };
}

export function cancelar(): RespostaCancelamento {
  const b = bd();
  if (!b.assinatura) return { cancelada: false, acessoAte: null };

  // Cancelar não corta o acesso na hora: vale até o fim do período pago.
  const acessoAte = b.assinatura.proximaCobranca;
  b.assinatura.status = 'cancelada';
  b.assinatura.canceladaEm = new Date().toISOString();
  b.assinatura.fimPeriodo = acessoAte;
  return { cancelada: true, acessoAte };
}
