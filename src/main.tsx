import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { App } from './App';
import { ProvedorSessao } from './context/SessaoContext';
import { FronteiraDeErro } from './components/shared/FronteiraDeErro';
import { AvisoConfiguracao } from './components/shared/AvisoConfiguracao';
import { configuracaoOk } from './lib/supabase';
import { estaEmDemo } from './lib/demo';
import './styles/base.css';

/**
 * Cache do servidor. `staleTime` de 30 s porque um quadro de pautas não muda a
 * cada segundo, e o Realtime já invalida quando muda de verdade — refetch
 * agressivo aqui só gastaria banda para reconfirmar o que já sabemos.
 *
 * `retry: 1` e não 3: o que costuma falhar neste app é permissão ou limite de
 * plano, e insistir três vezes numa negativa só atrasa a mensagem que o usuário
 * precisa ler.
 */
const cliente = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
    mutations: { retry: 0 },
  },
});

const raiz = document.getElementById('root');
if (!raiz) throw new Error('Elemento #root não encontrado.');

/**
 * O app **sempre** monta.
 *
 * A versão anterior trocava a árvore inteira por uma tela de configuração
 * quando faltava `.env`. Isso escondia as telas públicas — inclusive a landing,
 * que não depende de backend nenhum — e impedia trabalhar no front sem subir o
 * Supabase.
 *
 * Em produção a questão nem existe: `vite.config.ts` recusa o build sem as
 * variáveis, então `configuracaoOk` é sempre verdadeiro lá. A tela de
 * configuração sempre foi um recurso de desenvolvimento, e um recurso de
 * desenvolvimento não pode bloquear o desenvolvimento.
 *
 * Agora o aviso é uma faixa no topo: diz o que falta, oferece o modo
 * demonstração, e sai da frente. Cada tela que precisa de backend já tem seus
 * próprios estados de erro.
 */
const precisaAvisar = import.meta.env.DEV && !configuracaoOk && !estaEmDemo();

createRoot(raiz).render(
  <StrictMode>
    <FronteiraDeErro>
      <QueryClientProvider client={cliente}>
        <BrowserRouter>
          <ProvedorSessao>
            {precisaAvisar ? <AvisoConfiguracao /> : null}
            <App />
          </ProvedorSessao>
        </BrowserRouter>
      </QueryClientProvider>
    </FronteiraDeErro>
  </StrictMode>,
);
