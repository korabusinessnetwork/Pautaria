/**
 * Destino, para onde vai quem entra na raiz.
 *
 * A decisão depende de dados (o usuário já tem workspace?) e por isso não cabe
 * num `<Navigate>` estático no roteador. Sem workspace → abertura, para escolher
 * o ofício. Com workspace → o quadro do primeiro.
 *
 * Um usuário sem workspace nunca vê uma tela vazia dizendo "crie seu primeiro
 * projeto": ele vê a escolha de ofício, que é a tela que entrega valor.
 */

import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { listarMeusWorkspaces } from '@/lib/workspaces.service';
import { Carregando } from '@/components/shared/Carregando';
import { Aviso } from '@/components/shared/Aviso';

export function Destino() {
  const consulta = useQuery({
    queryKey: ['workspaces', 'meus'],
    queryFn: listarMeusWorkspaces,
  });

  if (consulta.isLoading) return <Carregando mensagem="Procurando suas pautas…" />;

  if (consulta.error) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <Aviso erro={consulta.error} titulo="Não conseguimos carregar seus workspaces" />
      </div>
    );
  }

  const primeiro = consulta.data?.[0];
  if (!primeiro) return <Navigate to="/comecar" replace />;

  return <Navigate to={`/w/${primeiro.slug}`} replace />;
}
