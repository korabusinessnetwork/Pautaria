import '@testing-library/jest-dom/vitest';

/**
 * As variáveis de ambiente precisam existir antes de qualquer import de
 * `src/lib/supabase.ts`, que estoura no carregamento quando elas faltam.
 * Valores de teste, óbvios como tal.
 */
process.env.VITE_SUPABASE_URL ??= 'http://localhost:54321';
process.env.VITE_SUPABASE_ANON_KEY ??= 'chave-anon-de-teste';
