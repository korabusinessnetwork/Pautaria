/**
 * Faixa de configuração ausente, o aviso que não bloqueia.
 *
 * Substituiu uma tela cheia que tomava o app inteiro quando faltava `.env`. A
 * troca veio de um problema concreto: a landing é **pública**, e a tela cheia
 * a substituía por um aviso de configuração. Quem abrisse o projeto para mexer
 * no CSS da página de vendas não conseguia vê-la.
 *
 * O raciocínio que sustenta o formato novo: em produção isto nunca aparece,
 * porque `vite.config.ts` recusa o build sem as variáveis. Logo, a tela de
 * configuração sempre foi um recurso de desenvolvimento, e um recurso de
 * desenvolvimento não deveria impedir o desenvolvimento.
 *
 * Agora o app monta normalmente. As telas públicas funcionam; as que precisam
 * de backend mostram os próprios estados de erro, que já existem em todas.
 * Este aviso fica no topo dizendo o que falta e oferecendo a saída.
 *
 * Todo o componente vive dentro de `import.meta.env.DEV`: em produção o Vite
 * troca por `false`, o ramo vira inalcançável e o minificador remove o módulo
 * do bundle publicado.
 */

import { useState } from 'react';
import { ativarDemo } from '@/lib/demo';
import estilos from './AvisoConfiguracao.module.css';

export function AvisoConfiguracao() {
  const [oculto, setOculto] = useState(false);

  if (oculto) return null;

  return (
    <div className={estilos.faixa} role="status">
      <span className={estilos.texto}>
        <strong>Sem configuração.</strong> Faltam <code>VITE_SUPABASE_URL</code> e{' '}
        <code>VITE_SUPABASE_ANON_KEY</code>, as telas públicas funcionam, as que
        precisam de banco não. Veja <strong>INSTALACAO.md</strong>.
      </span>

      <button
        type="button"
        className={estilos.acao}
        onClick={() => {
          ativarDemo();
          // Recarrega em vez de re-renderizar: `configuracaoOk` e o cliente
          // Supabase são avaliados uma vez, no carregamento do módulo. Um
          // recarregamento honesto é mais simples, e mais confiável, do que
          // reconstruir esse estado em runtime.
          window.location.reload();
        }}
      >
        Ver com dados de exemplo
      </button>

      <button
        type="button"
        className={estilos.fechar}
        onClick={() => setOculto(true)}
        aria-label="Ocultar aviso de configuração"
      >
        ✕
      </button>
    </div>
  );
}
