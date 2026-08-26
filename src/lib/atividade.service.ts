/**
 * Atividade, a leitura do `audit_log`.
 *
 * O banco já escrevia neste log desde a migration 0006 e ninguém lia. Um log
 * que só é escrito é custo de armazenamento com aparência de segurança: ele só
 * vira controle quando alguém consegue perguntar "quem cancelou a assinatura na
 * terça?" e receber resposta. Este serviço é essa pergunta.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O QUE NÃO É LIDO AQUI, E POR QUE
 *
 * A migration 0006 dá ao papel `authenticated` um grant de SELECT **por
 * coluna**: id, workspace_id, ator_id, evento, recurso, recurso_id, meta,
 * origem, criado_em. `ip_hash` ficou deliberadamente fora. Pedi-lo faria o
 * PostgREST devolver 42501 e derrubar a tela inteira, então a lista de campos
 * abaixo é explícita e final. Também não existe `select *`: além de estourar no
 * grant, `audit_log` é tabela sensível pelo CLAUDE.md, e `*` é como uma coluna
 * nova vaza para o cliente no dia em que alguém a adiciona.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `origem` É O CAMPO MAIS IMPORTANTE DESTA TELA
 *
 * O cliente não tem grant de INSERT na coluna `origem`, então todo registro
 * vindo do browser cai no default `'cliente'`. Uma linha marcada `'servidor'`
 * só pode ter sido escrita por `app.auditar()`, que é exclusiva de Edge
 * Function. Isso significa que as duas metades do feed têm valor probatório
 * diferente: `'cliente'` é o que o navegador *afirma* ter feito, `'servidor'` é
 * o que o sistema *constatou*. Numa investigação de cobrança, misturar as duas
 * sem distinção transformaria o log em decoração, qualquer usuário poderia
 * forjar `assinatura.ativada`. Por isso `origem` sobe até a UI em vez de ficar
 * no banco: a tela precisa poder mostrar a diferença.
 *
 * Quem pode ler é decidido pela RLS (dono e admin do workspace). Um membro
 * comum não recebe erro: recebe **zero linhas**. Isso é correto para o banco e
 * péssimo para a pessoa, uma lista vazia parece defeito. Cabe à tela explicar
 * o motivo antes de consultar, e é o que `Atividade.tsx` faz.
 */

import { z } from 'zod';

import { supabase } from './supabase';
import { demo, seDemo } from './demo';
import { deErroPostgrest } from './erros';
import { validarLista } from './validar';
import { ROTULO_EVENTO, type Evento } from '@/constants/eventos';

// ─────────────────────────────────────────────────────────────────────────────
// Contrato
// ─────────────────────────────────────────────────────────────────────────────

export const zOrigemAtividade = z.enum(['cliente', 'servidor']);
export type OrigemAtividade = z.infer<typeof zOrigemAtividade>;

/**
 * Uma linha do log, já em camelCase.
 *
 * `id` chega como número: a coluna é `bigint generated always as identity` e o
 * PostgREST serializa bigint como número JSON. Guardamos como string porque o
 * único uso dele na UI é chave de lista, e uma chave numérica que o JavaScript
 * poderia arredondar no futuro é um bug esperando a tabela crescer.
 */
const zAtividade = z
  .object({
    id: z.union([z.number(), z.string()]),
    workspace_id: z.string().uuid().nullable(),
    ator_id: z.string().uuid().nullable(),
    evento: z.string().min(1),
    recurso: z.string().nullable(),
    recurso_id: z.string().nullable(),
    meta: z.record(z.unknown()).nullable(),
    origem: zOrigemAtividade,
    criado_em: z.string(),
  })
  .transform((linha) => ({
    id: String(linha.id),
    workspaceId: linha.workspace_id,
    /** `null` quando o ator é o próprio sistema (webhook, reconciliação). */
    atorId: linha.ator_id,
    evento: linha.evento,
    recurso: linha.recurso,
    recursoId: linha.recurso_id,
    meta: linha.meta ?? {},
    origem: linha.origem,
    criadoEm: linha.criado_em,
  }));

export type Atividade = z.infer<typeof zAtividade>;

// ─────────────────────────────────────────────────────────────────────────────
// Frase legível
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rótulos que `src/constants/eventos.ts` ainda não cobre.
 *
 * `ROTULO_EVENTO` é `Partial` de propósito, nasceu cobrindo os eventos que já
 * apareciam em tela. Este mapa é o complemento, e a fusão abaixo dá precedência
 * ao arquivo de constantes: quando um rótulo migrar para lá, ele passa a valer e
 * a linha correspondente aqui pode ser removida sem mudar nada visível.
 *
 * Prefiro esta duplicação temporária a um fallback que invente frase a partir da
 * string do evento. "membro · papel alterado" no meio de "moveu uma pauta" lê
 * como vazamento de nome de banco na interface, exatamente o que o princípio nº
 * 1 do CLAUDE.md proíbe.
 */
const COMPLEMENTO_ROTULO: Partial<Record<Evento, string>> = {
  'workspace.renomeado': 'renomeou o workspace',
  'workspace.excluido': 'excluiu o workspace',
  'oficio.criado': 'criou um ofício',
  'oficio.excluido': 'excluiu um ofício',
  'pauta.editada': 'editou uma pauta',
  'pauta.desarquivada': 'restaurou uma pauta',
  'membro.convidado': 'convidou alguém',
  'membro.papel_alterado': 'mudou o papel de alguém',
  'assinatura.ativada': 'teve a assinatura ativada',
  'cobranca.vencida': 'teve uma cobrança vencida',
  'webhook.token_invalido': 'recebeu um webhook com token inválido',
  'seguranca.rls_ausente': 'disparou um alerta de segurança',
};

/**
 * Frase legível para um evento. Nunca devolve string vazia: um item de log sem
 * texto é pior que um texto genérico, porque parece linha corrompida.
 *
 * O parâmetro é `string` e não `Evento` de propósito: o evento vem do banco, e um
 * registro gravado por uma versão mais nova do app, ou por uma Edge Function que
 * ninguém lembrou de mapear, precisa aparecer no feed em vez de sumir dele.
 */
export function descreverEvento(evento: string): string {
  const conhecido =
    ROTULO_EVENTO[evento as Evento] ?? COMPLEMENTO_ROTULO[evento as Evento];
  return conhecido ?? 'registrou uma ação';
}

/** `true` quando o registro foi escrito pelo servidor, o log confiável. */
export function confirmadoPeloServidor(item: Atividade): boolean {
  return item.origem === 'servidor';
}

// ─────────────────────────────────────────────────────────────────────────────
// Leitura
// ─────────────────────────────────────────────────────────────────────────────

export const LIMITE_PADRAO = 60;

/**
 * Teto do que uma página pede de uma vez.
 *
 * Não é otimização prematura: `audit_log` cresce a cada ação de cada membro e é
 * a única tabela do sistema sem DELETE. Sem teto, o "carregar mais" de um
 * workspace de um ano acabaria pedindo dezenas de milhares de linhas numa
 * requisição, e o navegador que travaria seria o de quem está investigando um
 * incidente, o pior momento possível.
 */
export const LIMITE_MAXIMO = 300;

/** Restringe o limite pedido à faixa aceita. Inteiro, positivo, com teto. */
export function limiteValido(limite: number): number {
  if (!Number.isFinite(limite)) return LIMITE_PADRAO;
  return Math.min(Math.max(1, Math.trunc(limite)), LIMITE_MAXIMO);
}

/**
 * Últimos registros do workspace, do mais recente para o mais antigo.
 *
 * Devolve `[]`, e não erro, para quem não é dono nem admin: a RLS filtra as
 * linhas em vez de recusar a consulta. Quem chama precisa saber a diferença
 * entre "não há atividade" e "você não pode ver a atividade", porque só a UI
 * tem contexto para explicar a segunda.
 */
export async function listarAtividade(
  workspaceId: string,
  limite: number = LIMITE_PADRAO,
): Promise<Atividade[]> {
  const teto = limiteValido(limite);

  const d = import.meta.env.DEV ? await seDemo(() => atividadeDemo().slice(0, teto)) : null;
  if (d) return d;

  const { data, error } = await supabase
    .from('audit_log')
    // Campos explícitos: `ip_hash` não tem grant e `select *` é proibido em
    // tabela sensível (CLAUDE.md).
    .select('id, workspace_id, ator_id, evento, recurso, recurso_id, meta, origem, criado_em')
    .eq('workspace_id', workspaceId)
    .order('criado_em', { ascending: false })
    .limit(teto);

  const convertido = deErroPostgrest(error);
  if (convertido) throw convertido;

  return validarLista(zAtividade, data, 'audit_log');
}

// ─────────────────────────────────────────────────────────────────────────────
// Modo demonstração
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O feed fixo da demonstração.
 *
 * Vive aqui, e não em `src/lib/demo/dados.ts`, porque `audit_log` não é estado
 * do produto: nada nesta tela escreve, então não há interação para simular
 * contra um banco em memória. Uma lista derivada dos membros já semeados
 * entrega o que a demonstração precisa entregar, nomes e cores reais de avatar,
 * e a mistura de `cliente` e `servidor` que é o ponto da tela.
 *
 * A composição é deliberada: os eventos de cobrança são os de origem
 * `'servidor'`, como aconteceria de verdade (só `app.auditar()`, chamada por
 * Edge Function, marca assim). Se todos fossem iguais, a marcação visual que
 * esta tela existe para exibir nunca apareceria em revisão.
 */
interface SementeAtividade {
  evento: Evento;
  recurso: string | null;
  origem: OrigemAtividade;
  /** Quantos minutos atrás. Negativo é passado. */
  minutos: number;
  /** Índice em `demo.membros()`; `null` = o sistema, sem ator. */
  ator: number | null;
  meta?: Record<string, unknown>;
}

const SEMENTE: SementeAtividade[] = [
  { evento: 'pauta.movida', recurso: 'pauta', origem: 'cliente', minutos: 8, ator: 2, meta: { de: 'Ideia', para: 'Em produção' } },
  { evento: 'pauta.criada', recurso: 'pauta', origem: 'cliente', minutos: 41, ator: 1 },
  { evento: 'pauta.editada', recurso: 'pauta', origem: 'cliente', minutos: 96, ator: 2, meta: { campos: ['titulo', 'prazo'] } },
  { evento: 'cobranca.confirmada', recurso: 'cobranca', origem: 'servidor', minutos: 300, ator: 0, meta: { ciclo: 'mensal' } },
  { evento: 'pauta.arquivada', recurso: 'pauta', origem: 'cliente', minutos: 1_500, ator: 0 },
  { evento: 'membro.entrou', recurso: 'membro', origem: 'cliente', minutos: 1_610, ator: 2 },
  { evento: 'membro.convidado', recurso: 'convite', origem: 'cliente', minutos: 1_680, ator: 0 },
  { evento: 'assinatura.ativada', recurso: 'assinatura', origem: 'servidor', minutos: 2_900, ator: 0, meta: { plano: 'estudio' } },
  { evento: 'assinatura.contratada', recurso: 'assinatura', origem: 'cliente', minutos: 2_940, ator: 0, meta: { plano: 'estudio' } },
  { evento: 'webhook.token_invalido', recurso: 'webhook', origem: 'servidor', minutos: 4_400, ator: null },
  { evento: 'quadro.oficio_trocado', recurso: 'quadro', origem: 'cliente', minutos: 5_900, ator: 1 },
  { evento: 'membro.entrou', recurso: 'membro', origem: 'cliente', minutos: 6_100, ator: 1 },
  { evento: 'quadro.criado', recurso: 'quadro', origem: 'cliente', minutos: 7_400, ator: 0 },
  { evento: 'workspace.criado', recurso: 'workspace', origem: 'cliente', minutos: 7_410, ator: 0 },
];

function atividadeDemo(): Atividade[] {
  const membros = demo.membros();
  const workspaceId = demo.porSlug().id;
  const agora = Date.now();

  return SEMENTE.map((s, i) => ({
    // Sequência decrescente: o mais recente tem o maior id, como uma identity.
    id: String(SEMENTE.length - i),
    workspaceId,
    atorId: s.ator === null ? null : (membros[s.ator]?.userId ?? null),
    evento: s.evento,
    recurso: s.recurso,
    recursoId: null,
    meta: s.meta ?? {},
    origem: s.origem,
    criadoEm: new Date(agora - s.minutos * 60_000).toISOString(),
  }));
}
