/**
 * Ambiente, leitura e validação dos segredos das Edge Functions.
 *
 * Toda variável é lida por aqui, e o processo falha alto se faltar alguma. Uma
 * função que sobe com `ASAAS_API_KEY` indefinida não quebra na hora: ela quebra
 * no meio de um checkout, com o usuário na tela e uma assinatura pela metade.
 * É melhor não subir.
 *
 * Nada neste arquivo é logado. As chaves existem só em Supabase Secrets.
 */

function obrigatoria(nome: string): string {
  const valor = Deno.env.get(nome);
  if (!valor || valor.trim() === '') {
    throw new Error(
      `Variável de ambiente ausente: ${nome}. ` +
        `Configure com: supabase secrets set ${nome}='...'`,
    );
  }
  return valor.trim();
}

function opcional(nome: string, padrao: string): string {
  const valor = Deno.env.get(nome);
  return valor && valor.trim() !== '' ? valor.trim() : padrao;
}

export type Ambiente = 'sandbox' | 'producao';

/** Injetadas pelo runtime do Supabase, nunca definidas à mão. */
export const supabaseUrl = () => obrigatoria('SUPABASE_URL');
export const supabaseServiceKey = () => obrigatoria('SUPABASE_SERVICE_ROLE_KEY');
export const supabaseAnonKey = () => obrigatoria('SUPABASE_ANON_KEY');

/** Chave da API da Asaas. Só existe aqui. */
export const asaasApiKey = () => obrigatoria('ASAAS_API_KEY');

/**
 * Token combinado com a Asaas no cadastro do webhook. Ela o envia no cabeçalho
 * `asaas-access-token` a cada entrega, e é a única autenticação daquele
 * endpoint, por isso a comparação dele é feita em tempo constante.
 */
export const asaasWebhookToken = () => obrigatoria('ASAAS_WEBHOOK_TOKEN');

export function asaasAmbiente(): Ambiente {
  const valor = opcional('ASAAS_AMBIENTE', 'sandbox').toLowerCase();
  if (valor !== 'sandbox' && valor !== 'producao') {
    throw new Error(`ASAAS_AMBIENTE inválido: "${valor}". Use "sandbox" ou "producao".`);
  }
  return valor;
}

/** Base pública do app, usada para montar URLs de retorno. */
export const appUrl = () => opcional('APP_URL', 'http://localhost:5173');

/**
 * Sal do HMAC que pseudonimiza IPs no audit_log. Com um valor fixo por
 * ambiente, o mesmo IP gera sempre o mesmo hash (dá para correlacionar
 * tentativas) sem que o hash possa ser revertido para o IP (não dá para
 * localizar ninguém). Se não for configurado, deriva do service key, que já é
 * secreto e estável.
 */
export const salIp = () => opcional('IP_HASH_SAL', supabaseServiceKey().slice(0, 32));

/** Token do agendador que chama a reconciliação diária. */
export const cronToken = () => obrigatoria('CRON_TOKEN');

/**
 * Origens autorizadas a chamar as funções pelo browser. Em produção, a lista
 * exata; em desenvolvimento, o Vite local. Curinga `*` não é aceito: as funções
 * recebem credencial no cabeçalho Authorization, e `*` com credencial é a
 * receita clássica de CSRF via CORS.
 */
export function origensPermitidas(): string[] {
  const extras = opcional('ORIGENS_PERMITIDAS', '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return [appUrl(), 'http://localhost:5173', 'http://127.0.0.1:5173', ...extras];
}
