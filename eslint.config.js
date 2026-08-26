// Configuração plana (flat config) do ESLint 10, substitui o antigo .eslintrc.cjs.
// As barreiras de segurança do CLAUDE.md são aplicadas aqui pelo linter.
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'supabase/functions/**'],
  },

  js.configs.recommended,
  tseslint.configs.recommended,
  {
    // Paridade com o antigo .eslintrc.cjs: só as duas regras clássicas.
    // O preset `flat.recommended` do plugin v7 traz junto as regras do React
    // Compiler (set-state-in-effect, purity, immutability…). Adotá-las é uma
    // decisão de produto separada, abrir ADR antes de ligar.
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  reactRefresh.configs.vite,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
    },
    rules: {
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],

      // ── Barreiras de segurança do CLAUDE.md, aplicadas pelo linter ────────────
      'no-restricted-globals': [
        'error',
        { name: 'eval', message: 'Proibido: superfície de execução arbitrária.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message:
            'dangerouslySetInnerHTML é vetor de XSS. Renderize texto; se precisar de HTML, sanitize e abra ADR.',
        },
        {
          selector:
            "MemberExpression[object.name='localStorage'][property.name=/^(setItem)$/]",
          message:
            'Nada sensível em localStorage (docs/11_SEGURANCA). Sessão é responsabilidade do supabase-js.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@supabase/supabase-js',
              message:
                'Componentes não falam com o backend. Importe de src/lib/*.service.ts (camada de serviços).',
            },
          ],
        },
      ],
    },
  },

  {
    // A camada de serviços é o único lugar autorizado a instanciar o cliente.
    files: ['src/lib/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },

  {
    // Um Context precisa exportar o provedor (componente) e o hook de leitura
    // juntos, separá-los em dois arquivos só para agradar o Fast Refresh
    // espalharia o contexto por metade dos imports do app. O custo real é um
    // recarregamento completo ao editar estes dois arquivos em
    // desenvolvimento, e não vale a fragmentação.
    files: ['src/context/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },

  {
    files: ['src/**/*.{test,spec}.{ts,tsx}', 'src/teste/**/*.ts'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },

  {
    // Scripts de apoio rodam em Node, fora do bundle do navegador.
    files: ['scripts/**/*.{js,mjs,cjs}', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
);
