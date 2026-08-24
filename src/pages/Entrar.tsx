import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { entrar } from '@/lib/auth.service';
import { useSessao } from '@/context/SessaoContext';
import { normalizar } from '@/lib/erros';
import { Campo } from '@/components/shared/Campo';
import { Botao } from '@/components/shared/Botao';
import { Aviso } from '@/components/shared/Aviso';
import { Carregando } from '@/components/shared/Carregando';
import estilos from './Auth.module.css';
import { ROTA_DO_APP } from '@/constants/rotas';

export function Entrar() {
  const navegar = useNavigate();
  const local = useLocation();
  const { autenticado, carregando } = useSessao();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);

  if (carregando) return <Carregando />;

  // Já logado não vê tela de login: vai direto para onde queria ir.
  if (autenticado) {
    const de = (local.state as { de?: string } | null)?.de;
    return <Navigate to={de ?? ROTA_DO_APP} replace />;
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await entrar(email, senha);
      const de = (local.state as { de?: string } | null)?.de;
      navegar(de ?? ROTA_DO_APP, { replace: true });
    } catch (e) {
      setErro(normalizar(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={estilos.tela}>
      <Link to="/" className={estilos.marca}>
        <span className={estilos.bolinha} aria-hidden="true" />
        <span className={estilos.wordmark}>Pautaria</span>
      </Link>

      <div className={estilos.cartao}>
        <h1 className={estilos.titulo}>Bem-vindo de volta.</h1>
        <p className={estilos.subtitulo}>Sua pauta continua exatamente onde você deixou.</p>

        <form className={estilos.formulario} onSubmit={(e) => void enviar(e)}>
          {erro ? <Aviso erro={erro} aoFechar={() => setErro(null)} /> : null}

          <Campo
            rotulo="E-mail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            autoFocus
          />

          <Campo
            rotulo="Senha"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
            required
          />

          <Botao type="submit" carregando={enviando} larguraTotal>
            Entrar
          </Botao>
        </form>

        <p className={estilos.rodape}>
          <Link to="/recuperar-senha">Esqueci minha senha</Link>
        </p>
      </div>

      <p className={estilos.rodape}>
        Ainda não tem conta? <Link to="/criar-conta">Criar conta grátis</Link>
      </p>
    </div>
  );
}
