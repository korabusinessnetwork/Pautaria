/**
 * Cadastro.
 *
 * Os requisitos de senha aparecem **antes** de errar, e cada um acende sozinho
 * conforme a pessoa digita. A alternativa comum, deixar enviar e devolver "a
 * senha não atende aos critérios", obriga a adivinhar qual critério faltou.
 * A lista espelha `auth.password` do `supabase/config.toml`; o servidor
 * continua sendo quem decide.
 */

import { useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';

import { cadastrar, forcaDaSenha, SENHA_MINIMA } from '@/lib/auth.service';
import { useSessao } from '@/context/SessaoContext';
import { normalizar } from '@/lib/erros';
import { Campo } from '@/components/shared/Campo';
import { Botao } from '@/components/shared/Botao';
import { Aviso } from '@/components/shared/Aviso';
import estilos from './Auth.module.css';
import { ROTA_DO_APP } from '@/constants/rotas';

const REGRAS: Array<{ rotulo: string; testa: (s: string) => boolean }> = [
  { rotulo: `pelo menos ${SENHA_MINIMA} caracteres`, testa: (s) => s.length >= SENHA_MINIMA },
  { rotulo: 'uma letra minúscula', testa: (s) => /[a-z]/.test(s) },
  { rotulo: 'uma letra maiúscula', testa: (s) => /[A-Z]/.test(s) },
  { rotulo: 'um número', testa: (s) => /[0-9]/.test(s) },
];

export function CriarConta() {
  const { autenticado } = useSessao();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const forca = useMemo(() => forcaDaSenha(senha), [senha]);

  if (autenticado) return <Navigate to={ROTA_DO_APP} replace />;

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await cadastrar({ nome, email, senha });
      setEnviado(true);
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
        {enviado ? (
          <>
            <h1 className={estilos.titulo}>Confira seu e-mail.</h1>
            <div className={estilos.sucesso}>
              Mandamos um link de confirmação para <strong>{email}</strong>. Abra o link e
              volte aqui, seu quadro leva menos de um minuto para nascer.
            </div>
            <p className={estilos.rodape}>
              <Link to="/entrar">Voltar para a entrada</Link>
            </p>
          </>
        ) : (
          <>
            <h1 className={estilos.titulo}>Comece pelo seu ofício.</h1>
            <p className={estilos.subtitulo}>
              Conta gratuita, sem cartão. Você escolhe o ofício e o quadro já vem pronto.
            </p>

            <form className={estilos.formulario} onSubmit={(e) => void enviar(e)}>
              {erro ? <Aviso erro={erro} aoFechar={() => setErro(null)} /> : null}

              <Campo
                rotulo="Seu nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                autoComplete="name"
                required
                autoFocus
                maxLength={80}
              />

              <Campo
                rotulo="E-mail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />

              <Campo
                rotulo="Senha"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="new-password"
                required
              />

              <div className={estilos.requisitos}>
                {REGRAS.map((regra) => {
                  const ok = regra.testa(senha);
                  return (
                    <span key={regra.rotulo} className={ok ? estilos.requisitoOk : undefined}>
                      {ok ? '✓' : '·'} {regra.rotulo}
                    </span>
                  );
                })}
              </div>

              <Botao
                type="submit"
                carregando={enviando}
                larguraTotal
                motivoDesabilitado={
                  forca.valida ? undefined : 'Complete os requisitos da senha para continuar.'
                }
              >
                Criar minha conta
              </Botao>
            </form>
          </>
        )}
      </div>

      <p className={estilos.rodape}>
        Já tem conta? <Link to="/entrar">Entrar</Link> · <Link to="/precos">Ver planos</Link>
      </p>
    </div>
  );
}
