import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { App } from './App';
import { ProvedorSessao } from './context/SessaoContext';
import { FronteiraDeErro } from './components/shared/FronteiraDeErro';
import { ConfiguracaoAusente } from './components/shared/ConfiguracaoAusente';
import { configuracaoOk } from './lib/supabase';
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

createRoot(raiz).render(
  <StrictMode>
    <FronteiraDeErro>
      {configuracaoOk ? (
        <QueryClientProvider client={cliente}>
          <BrowserRouter>
            <ProvedorSessao>
              <App />
            </ProvedorSessao>
          </BrowserRouter>
        </QueryClientProvider>
      ) : (
        // Sem configuração não adianta montar provedores: toda consulta falharia
        // com erro de rede opaco. Melhor dizer exatamente o que falta.
        <ConfiguracaoAusente />
      )}
    </FronteiraDeErro>
  </StrictMode>,
);
