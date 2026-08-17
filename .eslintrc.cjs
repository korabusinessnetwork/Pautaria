/* eslint-env node */
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', 'supabase/functions', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['react-refresh'],
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
  overrides: [
    {
      // A camada de serviços é o único lugar autorizado a instanciar o cliente.
      files: ['src/lib/**/*.ts'],
      rules: { 'no-restricted-imports': 'off' },
    },
    {
      // Um Context precisa exportar o provedor (componente) e o hook de leitura
      // juntos — separá-los em dois arquivos só para agradar o Fast Refresh
      // espalharia o contexto por metade dos imports do app. O custo real é um
      // recarregamento completo ao editar estes dois arquivos em
      // desenvolvimento, e não vale a fragmentação.
      files: ['src/context/*.tsx'],
      rules: { 'react-refresh/only-export-components': 'off' },
    },
    {
      files: ['src/**/*.{test,spec}.{ts,tsx}', 'src/teste/**/*.ts'],
      env: { node: true },
      rules: { '@typescript-eslint/no-explicit-any': 'off' },
    },
  ],
};
