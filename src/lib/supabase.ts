/**
 * O cliente Supabase. Único ponto do front que instancia acesso ao backend.
 *
 * O ESLint proíbe importar `@supabase/supabase-js` fora de `src/lib/` (ver
 * `.eslintrc.cjs`). Não é purismo de arquitetura: é o que garante que toda
 * consulta passe por um serviço com contrato e validação, em vez de nascer
 * dentro de um `useEffect` com `select('*')` e sem tratamento de erro.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE ARQUIVO NÃO DÁ `throw` QUANDO FALTA CONFIGURAÇÃO
 *
 * A versão anterior fazia o óbvio — `if (!url) throw new Error(...)` no topo do
 * módulo — e isso destruía o build. O motivo é sutil e vale ficar registrado:
 *
 *   1. o Vite substitui `import.meta.env.VITE_*` por literais **em tempo de
 *      build**, não em runtime;
 *   2. num build sem as variáveis, a condição vira `if (true) throw ...`;
 *   3. o minificador conclui, corretamente, que todo o resto do módulo é
 *      inalcançável — e elimina o aplicativo inteiro.
 *
 * O resultado era um `npm run build` **verde** produzindo um bundle de 900
 * bytes que só sabia lançar uma exceção. Falha silenciosa, do pior tipo: passa
 * no CI e chega em produção como página branca.
 *
 * A correção tem duas metades. Aqui, nenhum `throw` no escopo do módulo — a
 * ausência de configuração vira um sinalizador que a UI sabe exibir. E em
 * `vite.config.ts`, um plugin que **falha o build de produção** quando as
 * variáveis não estão presentes. Assim o erro aparece onde deve: na esteira, em
 * voz alta, e não no navegador de um usuário.
 */

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const chaveAnon = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

/** `false` quando o app subiu sem `.env.local`. A UI mostra uma tela explicando. */
export const configuracaoOk = Boolean(url && chaveAnon);

if (!configuracaoOk) {
  console.error(
    'Pautaria: VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY não estão definidas. ' +
      'Copie .env.example para .env.local e reinicie o servidor. Veja INSTALACAO.md.',
  );
}

/**
 * Sobre a chave `anon` estar no bundle: ela é pública por design e não concede
 * acesso a nada. Quem protege os dados é a RLS — a chave apenas identifica o
 * projeto. Se a RLS estiver correta, publicá-la é inofensivo; se estiver
 * errada, nenhuma chave secreta salvaria. A `service_role`, essa sim, nunca
 * chega perto do browser: ela vive só nas Edge Functions.
 *
 * Os valores de reserva existem só para o `createClient` não estourar antes de
 * a tela de configuração aparecer. O domínio `.invalid` é reservado por norma
 * (RFC 2606) e nunca resolve — nenhuma requisição sai da máquina.
 */
export const supabase = createClient(
  url || 'https://configuracao-ausente.invalid',
  chaveAnon || 'configuracao-ausente',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // O token vem na URL após confirmação de e-mail e recuperação de senha.
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: 'pautaria.sessao',
    },
    global: {
      headers: { 'X-Client': 'pautaria-web' },
    },
    db: { schema: 'public' },
  },
);

/** URL base das Edge Functions, derivada da URL do projeto. */
export const urlFuncoes = `${url.replace(/\/$/, '')}/functions/v1`;
