/**
 * Tela de configuração ausente.
 *
 * Aparece quando o app subiu sem `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
 * Existe porque a alternativa é pior: sem ela, cada consulta falharia com um
 * erro de rede opaco e a pessoa passaria vinte minutos procurando o problema no
 * lugar errado.
 *
 * Em produção ninguém deveria ver isto — `vite.config.ts` recusa o build de
 * produção sem as variáveis. Esta tela é a rede de proteção do ambiente local.
 */

import estilos from './FronteiraDeErro.module.css';

export function ConfiguracaoAusente() {
  return (
    <div className={estilos.tela} role="alert">
      <div className={estilos.caixa}>
        <span className={estilos.marca}>PAUTARIA</span>
        <h1 className={estilos.titulo}>Falta configurar o ambiente.</h1>
        <p className={estilos.texto}>
          O app não encontrou <code>VITE_SUPABASE_URL</code> e{' '}
          <code>VITE_SUPABASE_ANON_KEY</code>. Sem elas não há como falar com o banco.
        </p>

        <details className={estilos.detalhes} open>
          <summary>Como resolver</summary>
          <code>
            cp .env.example .env.local
            {'\n'}
            # preencha as duas variáveis com os valores que `supabase start` imprime
            {'\n'}
            npm run dev
          </code>
        </details>

        <p className={estilos.texto}>
          O Vite só lê variáveis de ambiente ao iniciar — reinicie o servidor depois de
          preencher. Passo a passo completo em <strong>INSTALACAO.md</strong>.
        </p>
      </div>
    </div>
  );
}
