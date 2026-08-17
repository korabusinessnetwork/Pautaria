import { Navigate, Route, Routes } from 'react-router-dom';

import { RotaProtegida } from './components/shared/RotaProtegida';
import { Entrar } from './pages/Entrar';
import { CriarConta } from './pages/CriarConta';
import { RecuperarSenha } from './pages/RecuperarSenha';
import { NovaSenha } from './pages/NovaSenha';
import { Abertura } from './pages/Abertura';
import { PaginaWorkspace } from './pages/PaginaWorkspace';
import { Precos } from './pages/Precos';
import { Plano } from './pages/Plano';
import { Equipe } from './pages/Equipe';
import { Convite } from './pages/Convite';
import { Destino } from './pages/Destino';
import { NaoEncontrado } from './pages/NaoEncontrado';

/**
 * Rotas.
 *
 * `/` não renderiza tela: é `Destino`, que decide para onde mandar quem chega.
 * Sem workspace → abertura (escolha do ofício). Com workspace → o quadro. Essa
 * decisão precisa de dados e por isso não cabe num `<Navigate>` estático.
 *
 * Toda rota de dentro passa por `RotaProtegida`, que **verifica a sessão antes
 * de renderizar** — nunca depois. Renderizar primeiro e redirecionar em
 * `useEffect` mostraria o quadro por um instante para quem não deveria vê-lo.
 */
export function App() {
  return (
    <Routes>
      {/* Públicas */}
      <Route path="/entrar" element={<Entrar />} />
      <Route path="/criar-conta" element={<CriarConta />} />
      <Route path="/recuperar-senha" element={<RecuperarSenha />} />
      <Route path="/nova-senha" element={<NovaSenha />} />
      <Route path="/precos" element={<Precos />} />

      {/* Protegidas */}
      <Route
        path="/"
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

      <Route path="/404" element={<NaoEncontrado />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}
