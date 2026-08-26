// `defineConfig` vem de `vitest/config` e não de `vite`: é a versão que conhece
// o bloco `test`. Importar de `vite` compila, mas o TypeScript recusa a
// configuração de teste como propriedade desconhecida, e desligar o erro
// esconderia um `test` que o Vitest talvez nem estivesse lendo.
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
/**
 * Recusa o build de produção sem as variáveis do Supabase.
 *
 * Sem este plugin, `npm run build` sem `.env` termina com sucesso e produz um
 * bundle que não funciona, o app depende de valores que o Vite substitui em
 * tempo de build, e ausentes eles viram `undefined` no código publicado. Um
 * build verde que gera página branca é a pior combinação possível: ninguém vai
 * procurar o problema na esteira.
 *
 * Vale só para produção. Em desenvolvimento o app sobe e mostra a tela de
 * `ConfiguracaoAusente`, que ensina como resolver.
 */
function exigirAmbiente(): Plugin {
  const OBRIGATORIAS = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];

  return {
    name: 'pautaria:exigir-ambiente',
    apply: 'build',
    configResolved(config) {
      if (config.mode !== 'production') return;

      const faltando = OBRIGATORIAS.filter((nome) => !config.env[nome]);
      if (faltando.length > 0) {
        throw new Error(
          `Build de produção abortado: falta ${faltando.join(' e ')}.\n` +
            'Defina as variáveis no ambiente de build do host ' +
            '(Cloudflare: Settings → Build → Variables and Secrets) ' +
            'ou em .env.production.local. Veja INSTALACAO.md.',
        );
      }

      // Barreira de segurança: qualquer variável do prefixo público além das
      // duas legítimas vai parar no bundle. Se alguém adicionar a chave da
      // Asaas para "resolver rápido", o build para aqui em vez de publicá-la.
      const intrusas = Object.keys(config.env).filter(
        (nome) => nome.startsWith('VITE_') && !OBRIGATORIAS.includes(nome),
      );
      if (intrusas.length > 0) {
        throw new Error(
          `Build abortado: variáveis VITE_* não autorizadas (${intrusas.join(', ')}).\n` +
            'Tudo que começa com VITE_ é embutido no JavaScript público. ' +
            'Segredos pertencem a `supabase secrets set`, não ao front.',
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), exigirAmbiente()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // `sourcemap: false` em produção: um sourcemap público entrega a estrutura
    // interna do app de graça a quem for procurar brecha. Para depurar produção,
    // gere o mapa localmente com o mesmo commit.
    sourcemap: false,
    target: 'es2022',
    rollupOptions: {
      output: {
        // Separa o que muda pouco (bibliotecas) do que muda a cada deploy
        // (nosso código), para o cache do navegador sobreviver aos releases.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router)/.test(id)) return 'react';
          if (/[\\/]node_modules[\\/](@supabase|@tanstack)/.test(id)) return 'dados';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/teste/setup.ts'],
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
