/// <reference types="vite/client" />

/**
 * Tipagem das variáveis de ambiente do front.
 *
 * A interface é fechada de propósito: declarar só as duas variáveis legítimas
 * faz o TypeScript recusar qualquer outra — a chave da Asaas, por exemplo — na
 * hora de escrever, e não na revisão de código. É a regra de segurança do
 * CLAUDE.md transformada em erro de compilação.
 *
 * (Este comentário evita soletrar um nome de variável proibido de propósito:
 * `scripts/checar-segredos.sh` varre os arquivos que alimentam o build atrás de
 * qualquer `VITE_` fora da lista, e não sabe distinguir comentário de código.
 * Manter o scanner simples e estrito vale mais que a conveniência de citar o
 * nome aqui.)
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}
