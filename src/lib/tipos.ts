/**
 * Tipos de domínio e contratos de dados.
 *
 * Os schemas Zod aqui não validam entrada do usuário, validam o que **volta do
 * banco** antes de chegar à UI. Parece paranoia até a primeira vez que uma
 * migration renomeia uma coluna e o app passa a renderizar `undefined` em silêncio
 * por três dias. Com o schema, a fronteira falha alto no momento exato em que o
 * contrato quebrou, e o erro aponta o campo.
 *
 * Regra de nomenclatura do projeto (CLAUDE.md): o banco fala português em
 * snake_case; a UI fala português em camelCase. A conversão acontece nos
 * `transform` deste arquivo, em nenhum outro lugar.
 */

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Enums do banco
// ─────────────────────────────────────────────────────────────────────────────
export const zPlano = z.enum(['solo', 'estudio', 'time']);
export type Plano = z.infer<typeof zPlano>;

export const zPapel = z.enum(['owner', 'admin', 'membro']);
export type Papel = z.infer<typeof zPapel>;

export const zStatusWorkspace = z.enum(['ativo', 'inadimplente', 'suspenso', 'cancelado']);
export type StatusWorkspace = z.infer<typeof zStatusWorkspace>;

export const zCiclo = z.enum(['mensal', 'anual']);
export type Ciclo = z.infer<typeof zCiclo>;

export const zStatusAssinatura = z.enum([
  'pendente', 'ativa', 'inadimplente', 'cancelada', 'expirada',
]);
export type StatusAssinatura = z.infer<typeof zStatusAssinatura>;

// ─────────────────────────────────────────────────────────────────────────────
// Perfil
// ─────────────────────────────────────────────────────────────────────────────
export const zPerfil = z
  .object({
    id: z.string().uuid(),
    nome: z.string(),
    email: z.string(),
    iniciais: z.string(),
    avatar_hue: z.number(),
  })
  .transform((p) => ({
    id: p.id,
    nome: p.nome,
    email: p.email,
    iniciais: p.iniciais,
    hue: p.avatar_hue,
  }));

export type Perfil = z.infer<typeof zPerfil>;

// ─────────────────────────────────────────────────────────────────────────────
// Workspace
// ─────────────────────────────────────────────────────────────────────────────
export const zWorkspace = z
  .object({
    id: z.string().uuid(),
    nome: z.string(),
    slug: z.string(),
    plano: zPlano,
    status: zStatusWorkspace,
    tema: z.record(z.unknown()).nullable().default({}),
    plano_expira_em: z.string().nullable(),
  })
  .transform((w) => ({
    id: w.id,
    nome: w.nome,
    slug: w.slug,
    plano: w.plano,
    status: w.status,
    tema: (w.tema ?? {}) as TemaWorkspace,
    planoExpiraEm: w.plano_expira_em,
    /** Workspace suspenso ou cancelado vira somente leitura (ver 0002). */
    gravavel: w.status === 'ativo' || w.status === 'inadimplente',
  }));

export type Workspace = z.infer<typeof zWorkspace>;

/** White-label: o que o tenant pode sobrescrever da identidade visual. */
export interface TemaWorkspace {
  logoUrl?: string | null;
  nomeExibicao?: string | null;
  hue?: number | null;
}

export const zMembro = z
  .object({
    workspace_id: z.string().uuid(),
    user_id: z.string().uuid(),
    papel: zPapel,
    profiles: z
      .object({
        nome: z.string(),
        iniciais: z.string(),
        avatar_hue: z.number(),
        email: z.string(),
      })
      .nullable(),
  })
  .transform((m) => ({
    workspaceId: m.workspace_id,
    userId: m.user_id,
    papel: m.papel,
    nome: m.profiles?.nome ?? 'Membro',
    iniciais: m.profiles?.iniciais ?? '??',
    hue: m.profiles?.avatar_hue ?? 45,
    email: m.profiles?.email ?? '',
  }));

export type Membro = z.infer<typeof zMembro>;

// ─────────────────────────────────────────────────────────────────────────────
// Ofício, a configuração que vira produto
// ─────────────────────────────────────────────────────────────────────────────
export const zEtapa = z
  .object({ id: z.string().uuid(), nome: z.string(), ordem: z.number() })
  .transform((e) => ({ id: e.id, nome: e.nome, ordem: e.ordem }));

export type Etapa = z.infer<typeof zEtapa>;

export const zTemplate = z
  .object({
    id: z.string().uuid(),
    nome: z.string(),
    campo1: z.string().nullable(),
    campo2: z.string().nullable(),
    ordem: z.number(),
  })
  .transform((t) => ({
    id: t.id,
    nome: t.nome,
    campo1: t.campo1,
    campo2: t.campo2,
    ordem: t.ordem,
  }));

export type Template = z.infer<typeof zTemplate>;

export const zOficio = z
  .object({
    id: z.string().uuid(),
    workspace_id: z.string().uuid().nullable(),
    chave: z.string(),
    nome: z.string(),
    descricao: z.string(),
    glifo: z.string(),
    hue: z.number(),
    chroma: z.coerce.number(),
    titulo_quadro: z.string(),
    campo1_label: z.string(),
    campo2_label: z.string(),
    mono: z.boolean(),
    solo: z.boolean(),
    ordem: z.number(),
    oficio_etapas: z.array(z.object({
      id: z.string().uuid(), nome: z.string(), ordem: z.number(),
    })).default([]),
    oficio_templates: z.array(z.object({
      id: z.string().uuid(), nome: z.string(),
      campo1: z.string().nullable(), campo2: z.string().nullable(),
      ordem: z.number(),
    })).default([]),
  })
  .transform((o) => ({
    id: o.id,
    workspaceId: o.workspace_id,
    /** `true` quando é um dos ofícios do sistema (imutável pela API). */
    doSistema: o.workspace_id === null,
    chave: o.chave,
    nome: o.nome,
    descricao: o.descricao,
    glifo: o.glifo,
    hue: o.hue,
    chroma: o.chroma,
    tituloQuadro: o.titulo_quadro,
    campo1Label: o.campo1_label,
    campo2Label: o.campo2_label,
    mono: o.mono,
    solo: o.solo,
    ordem: o.ordem,
    etapas: [...o.oficio_etapas].sort((a, b) => a.ordem - b.ordem),
    templates: [...o.oficio_templates].sort((a, b) => a.ordem - b.ordem),
  }));

export type Oficio = z.infer<typeof zOficio>;

// ─────────────────────────────────────────────────────────────────────────────
// Quadro e pauta
// ─────────────────────────────────────────────────────────────────────────────
export const zQuadro = z
  .object({
    id: z.string().uuid(),
    workspace_id: z.string().uuid(),
    oficio_id: z.string().uuid(),
    titulo: z.string(),
    arquivado_em: z.string().nullable(),
  })
  .transform((q) => ({
    id: q.id,
    workspaceId: q.workspace_id,
    oficioId: q.oficio_id,
    titulo: q.titulo,
    arquivadoEm: q.arquivado_em,
  }));

export type Quadro = z.infer<typeof zQuadro>;

export const zPauta = z
  .object({
    id: z.string().uuid(),
    workspace_id: z.string().uuid(),
    quadro_id: z.string().uuid(),
    oficio_id: z.string().uuid(),
    etapa_id: z.string().uuid(),
    titulo: z.string(),
    campo1: z.string().nullable(),
    campo2: z.string().nullable(),
    prazo: z.string().nullable(),
    responsavel_id: z.string().uuid().nullable(),
    posicao: z.number(),
    arquivada_em: z.string().nullable(),
  })
  .transform((p) => ({
    id: p.id,
    workspaceId: p.workspace_id,
    quadroId: p.quadro_id,
    oficioId: p.oficio_id,
    etapaId: p.etapa_id,
    titulo: p.titulo,
    campo1: p.campo1,
    campo2: p.campo2,
    prazo: p.prazo,
    responsavelId: p.responsavel_id,
    posicao: p.posicao,
    arquivadaEm: p.arquivada_em,
  }));

export type Pauta = z.infer<typeof zPauta>;

// ─────────────────────────────────────────────────────────────────────────────
// Planos e assinatura
// ─────────────────────────────────────────────────────────────────────────────
export interface LimitesPlano {
  max_quadros: number | null;
  max_pautas_por_quadro: number | null;
  max_membros: number | null;
  oficios_personalizados: boolean;
  exportar: boolean;
  historico: boolean;
}

export const zPlanoCatalogo = z
  .object({
    chave: zPlano,
    nome: z.string(),
    chamada: z.string(),
    preco_mensal_centavos: z.number(),
    preco_anual_centavos: z.number(),
    limites: z.record(z.unknown()),
    destaques: z.array(z.string()),
    ordem: z.number(),
  })
  .transform((p) => ({
    chave: p.chave,
    nome: p.nome,
    chamada: p.chamada,
    precoMensalCentavos: p.preco_mensal_centavos,
    precoAnualCentavos: p.preco_anual_centavos,
    limites: p.limites as unknown as LimitesPlano,
    destaques: p.destaques,
    ordem: p.ordem,
    gratuito: p.preco_mensal_centavos === 0,
  }));

export type PlanoCatalogo = z.infer<typeof zPlanoCatalogo>;

export const zAssinatura = z
  .object({
    id: z.string().uuid(),
    plano: zPlano,
    ciclo: zCiclo,
    status: zStatusAssinatura,
    valor_centavos: z.number(),
    proxima_cobranca: z.string().nullable(),
    fim_periodo: z.string().nullable(),
    cancelada_em: z.string().nullable(),
  })
  .transform((a) => ({
    id: a.id,
    plano: a.plano,
    ciclo: a.ciclo,
    status: a.status,
    valorCentavos: a.valor_centavos,
    proximaCobranca: a.proxima_cobranca,
    fimPeriodo: a.fim_periodo,
    canceladaEm: a.cancelada_em,
  }));

export type Assinatura = z.infer<typeof zAssinatura>;

/** Uso corrente vs. limites, alimenta os avisos da UI antes do clique. */
export const zUso = z
  .object({
    workspace_id: z.string().uuid(),
    plano: zPlano,
    plano_nome: z.string(),
    status: zStatusWorkspace,
    quadros: z.coerce.number(),
    pautas: z.coerce.number(),
    membros: z.coerce.number(),
    convites_abertos: z.coerce.number(),
    limites: z.record(z.unknown()),
  })
  .transform((u) => ({
    workspaceId: u.workspace_id,
    plano: u.plano,
    planoNome: u.plano_nome,
    status: u.status,
    quadros: u.quadros,
    pautas: u.pautas,
    membros: u.membros,
    convitesAbertos: u.convites_abertos,
    limites: u.limites as unknown as LimitesPlano,
  }));

export type Uso = z.infer<typeof zUso>;
