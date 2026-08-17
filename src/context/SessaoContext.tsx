/**
 * Sessão — quem está logado, em todo o app.
 *
 * `carregando` existe e é usado: sem ele, a primeira renderização acontece com
 * `sessao = null` e o roteador manda o usuário já autenticado para a tela de
 * login por uma fração de segundo. É o flash de logout, e ele mina a confiança
 * mais do que qualquer bug visível — quem viu uma vez fica achando que o app
 * "desloga sozinho".
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as auth from '@/lib/auth.service';
import type { Session } from '@/lib/auth.service';
import type { Perfil } from '@/lib/tipos';

interface ValorSessao {
  sessao: Session | null;
  perfil: Perfil | null;
  carregando: boolean;
  autenticado: boolean;
  recarregarPerfil: () => Promise<void>;
  sair: () => Promise<void>;
}

const Contexto = createContext<ValorSessao | null>(null);

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [carregando, setCarregando] = useState(true);

  const recarregarPerfil = useCallback(async () => {
    try {
      setPerfil(await auth.meuPerfil());
    } catch {
      // Perfil ausente não pode impedir o app de abrir. O trigger do banco cria
      // o perfil no cadastro; se por algum motivo ele não existir, a UI cai
      // para as iniciais derivadas do e-mail e segue funcionando.
      setPerfil(null);
    }
  }, []);

  useEffect(() => {
    let ativo = true;

    void (async () => {
      const atual = await auth.sessaoAtual();
      if (!ativo) return;
      setSessao(atual);
      if (atual) await recarregarPerfil();
      if (ativo) setCarregando(false);
    })();

    // Cobre login em outra aba, expiração de token e logout remoto.
    const parar = auth.observarSessao((nova) => {
      if (!ativo) return;
      setSessao(nova);
      if (nova) void recarregarPerfil();
      else setPerfil(null);
    });

    return () => {
      ativo = false;
      parar();
    };
  }, [recarregarPerfil]);

  const sair = useCallback(async () => {
    await auth.sair();
    setSessao(null);
    setPerfil(null);
  }, []);

  const valor = useMemo<ValorSessao>(
    () => ({
      sessao,
      perfil,
      carregando,
      autenticado: Boolean(sessao),
      recarregarPerfil,
      sair,
    }),
    [sessao, perfil, carregando, recarregarPerfil, sair],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSessao(): ValorSessao {
  const valor = useContext(Contexto);
  if (!valor) {
    throw new Error('useSessao precisa estar dentro de <ProvedorSessao>.');
  }
  return valor;
}
