import { Navigate, Route, Routes } from 'react-router-dom';

import { RotaProtegida } from './components/shared/RotaProtegida';
import { Entrar } from './pages/Entrar';
import { CriarConta } from './pages/CriarConta';
import { RecuperarSenha } from './pages/RecuperarSenha';
import { NovaSenha } from './pages/NovaSenha';
import { Landing } from './pages/Landing';
import { Legal } from './pages/Legal';
import { Abertura } from './pages/Abertura';
import { PaginaWorkspace } from './pages/PaginaWorkspace';
import { Precos } from './pages/Precos';
import { Plano } from './pages/Plano';
import { Equipe } from './pages/Equipe';
import { Configuracoes } from './pages/Configuracoes';
import { Arquivadas } from './pages/Arquivadas';
import { Atividade } from './pages/Atividade';
import { Convite } from './pages/Convite';
import { Destino } from './pages/Destino';
import { NaoEncontrado } from './pages/NaoEncontrado';

/**
 * Rotas.
 *
 * A raiz `/` é a **landing pública** — a porta do funil, sem sessão. A entrada
 * do aplicativo é `/app`, que não renderiza tela: é `Destino`, que decide para
 * onde mandar quem chega (sem workspace → abertura; com workspace → o quadro).
 * Essa decisão precisa de dados e por isso não cabe num `<Navigate>` estático.
 *
 * A separação entre as duas é recente e cobra atenção: qualquer redirecionamento
 * pós-login que aponte para `/` devolve o usuário autenticado para a página de
 * vendas — e, vindo de `Entrar`, cria um laço. Por isso os destinos vivem em
 * `src/constants/rotas.ts` e não como literais espalhados.
 *
 * Toda rota de dentro passa por `RotaProtegida`, que **verifica a sessão antes
 * de renderizar** — nunca depois. Renderizar primeiro e redirecionar em
 * `useEffect` mostraria o quadro por um instante para quem não deveria vê-lo.
 */
export function App() {
  return (
    <Routes>
      {/* ── Públicas ─────────────────────────────────────────────────────── */}
      <Route path="/" element={<Landing />} />
      <Route path="/entrar" element={<Entrar />} />
      <Route path="/criar-conta" element={<CriarConta />} />
      <Route path="/recuperar-senha" element={<RecuperarSenha />} />
      <Route path="/nova-senha" element={<NovaSenha />} />
      <Route path="/precos" element={<Precos />} />
      <Route path="/termos" element={<Legal documento="termos" />} />
      <Route path="/privacidade" element={<Legal documento="privacidade" />} />

      {/* ── Protegidas ───────────────────────────────────────────────────── */}
      <Route
        path="/app"
        element={
          <RotaProtegida>
            <Destino />
          </RotaProtegida>
        }
      />
      <Route
        path="/comecar"
        element={
          <RotaProtegida>
            <Abertura />
          </RotaProtegida>
        }
      />
      <Route
        path="/convite"
        element={
          <RotaProtegida>
            <Convite />
          </RotaProtegida>
        }
      />
      <Route
        path="/w/:slug"
        element={
          <RotaProtegida>
            <PaginaWorkspace />
          </RotaProtegida>
        }
      />
      <Route
        path="/w/:slug/plano"
        element={
          <RotaProtegida>
            <Plano />
          </RotaProtegida>
        }
      />
      <Route
        path="/w/:slug/equipe"
        element={
          <RotaProtegida>
            <Equipe />
          </RotaProtegida>
        }
      />
      <Route
        path="/w/:slug/configuracoes"
        element={
          <RotaProtegida>
            <Configuracoes />
          </RotaProtegida>
        }
      />
      <Route
        path="/w/:slug/arquivadas"
        element={
          <RotaProtegida>
            <Arquivadas />
          </RotaProtegida>
        }
      />
      <Route
        path="/w/:slug/atividade"
        element={
          <RotaProtegida>
            <Atividade />
          </RotaProtegida>
        }
      />

      <Route path="/404" element={<NaoEncontrado />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}
