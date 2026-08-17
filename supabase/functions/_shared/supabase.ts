/**
 * Clientes Supabase das Edge Functions.
 *
 * Dois clientes, dois propósitos, e a diferença entre eles é a linha mais
 * importante deste arquivo:
 *
 *   • `clienteDoUsuario(req)` — carrega o JWT de quem chamou e respeita a RLS.
 *     Serve para responder "quem é você?".
 *
 *   • `clienteAdmin()` — usa a `service_role`, que **ignora toda a RLS**. Serve
 *     para escrever nas tabelas financeiras, que nenhum cliente pode tocar.
 *
 * Regra de uso: toda leitura de identidade vem do primeiro; toda escrita
 * privilegiada vem do segundo, e sempre **depois** de uma verificação explícita
 * de papel. O erro clássico é usar o admin para ler o `workspaceId` que veio no
 * corpo da requisição sem conferir se quem pediu tem algo a ver com aquele
 * workspace — e aí o service_role vira uma API pública de escrever no tenant
 * dos outros. Por isso `exigirDonoDoWorkspace` existe e é chamada em toda
 * função que escreve.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAnonKey, supabaseServiceKey, supabaseUrl } from './ambiente.ts';
import { ErroApi } from './http.ts';

export type ClienteAdmin = SupabaseClient;

/** Cliente com privilégio total. Nunca deve receber input do cliente sem checagem. */
export function clienteAdmin(): ClienteAdmin {
  return createClient(supabaseUrl(), supabaseServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'X-Origem': 'edge-function' } },
  });
}

/** Cliente na identidade de quem chamou. A RLS continua valendo. */
export function clienteDoUsuario(req: Request): SupabaseClient {
  const autorizacao = req.headers.get('Authorization') ?? '';
  return createClient(supabaseUrl(), supabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: autorizacao } },
  });
}

export interface UsuarioAutenticado {
  id: string;
  email: string;
}

/**
 * Resolve o usuário do JWT. As funções de assinatura sobem com
 * `verify_jwt = true`, então um token inválido nem chega aqui — mas confiar
 * nisso e seguir sem `getUser()` deixaria a função dependente de uma linha do
 * `config.toml` para não virar um endpoint anônimo. Verificamos de novo.
 */
export async function exigirUsuario(req: Request): Promise<UsuarioAutenticado> {
  const cliente = clienteDoUsuario(req);
  const { data, error } = await cliente.auth.getUser();

  if (error || !data.user) {
    throw new ErroApi('nao_autenticado', 'Faça login para continuar.');
  }
  return { id: data.user.id, email: (data.user.email ?? '').toLowerCase() };
}

export type Papel = 'owner' | 'admin' | 'membro';

export interface WorkspaceResumo {
  id: string;
  nome: string;
  slug: string;
  plano: 'solo' | 'estudio' | 'time';
  status: 'ativo' | 'inadimplente' | 'suspenso' | 'cancelado';
  asaas_customer_id: string | null;
}

/**
 * Confirma que o usuário tem o papel exigido no workspace, e devolve o
 * workspace. Chamada obrigatória antes de qualquer escrita com o cliente admin.
 *
 * A consulta usa o cliente admin de propósito: precisamos distinguir "não é
 * membro" de "workspace não existe" para escolher a mensagem, e com o cliente
 * do usuário os dois casos seriam indistinguíveis (a RLS esconde os dois do
 * mesmo jeito). A resposta ao cliente, porém, é a mesma nos dois casos —
 * `nao_encontrado` — para não transformar esta função num verificador de
 * existência de workspaces alheios.
 */
export async function exigirPapelNoWorkspace(
  admin: ClienteAdmin,
  workspaceId: string,
  userId: string,
  papeis: Papel[],
): Promise<WorkspaceResumo> {
  const { data: vinculo, error: erroVinculo } = await admin
    .from('workspace_members')
    .select('papel')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (erroVinculo) throw new ErroApi('erro_interno', 'Falha ao verificar permissão.');
  if (!vinculo) {
    throw new ErroApi('nao_encontrado', 'Workspace não encontrado.');
  }
  if (!papeis.includes(vinculo.papel as Papel)) {
    throw new ErroApi(
      'sem_permissao',
      'Só o dono do workspace pode gerenciar a assinatura.',
    );
  }

  const { data: workspace, error } = await admin
    .from('workspaces')
    .select('id, nome, slug, plano, status, asaas_customer_id')
    .eq('id', workspaceId)
    .single();

  if (error || !workspace) {
    throw new ErroApi('nao_encontrado', 'Workspace não encontrado.');
  }
  return workspace as WorkspaceResumo;
}

/** Atalho para o caso mais comum: operações de cobrança são do dono. */
export function exigirDonoDoWorkspace(
  admin: ClienteAdmin,
  workspaceId: string,
  userId: string,
): Promise<WorkspaceResumo> {
  return exigirPapelNoWorkspace(admin, workspaceId, userId, ['owner']);
}

/** Registro de auditoria — fire-and-forget, nunca derruba a operação. */
export async function auditar(
  admin: ClienteAdmin,
  entrada: {
    workspaceId: string | null;
    atorId: string | null;
    evento: string;
    recurso?: string;
    recursoId?: string;
    meta?: Record<string, unknown>;
    ipHash?: string | null;
  },
): Promise<void> {
  try {
    const { error } = await admin.rpc('registrar_auditoria', {
      p_workspace: entrada.workspaceId,
      p_ator: entrada.atorId,
      p_evento: entrada.evento,
      p_recurso: entrada.recurso ?? null,
      p_recurso_id: entrada.recursoId ?? null,
      p_meta: entrada.meta ?? {},
      p_ip_hash: entrada.ipHash ?? null,
    });
    if (error) console.warn('[auditoria] falhou:', error.message);
  } catch (erro) {
    console.warn('[auditoria] falhou:', erro instanceof Error ? erro.message : erro);
  }
}

/**
 * Recalcula o plano do workspace a partir das assinaturas gravadas. Ponto único
 * de decisão — nenhuma Edge Function escreve `workspaces.plano` diretamente.
 */
export async function aplicarEstadoAssinatura(
  admin: ClienteAdmin,
  workspaceId: string,
): Promise<void> {
  const { error } = await admin.rpc('aplicar_estado_assinatura', {
    p_workspace: workspaceId,
  });
  if (error) {
    throw new ErroApi('erro_interno', 'Falha ao aplicar o estado da assinatura.', error);
  }
}
