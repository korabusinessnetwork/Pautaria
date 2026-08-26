/**
 * Definir nova senha, depois do link de recuperação.
 *
 * O Supabase troca o token da URL por uma sessão automaticamente
 * (`detectSessionInUrl`), e é essa sessão que autoriza o `updateUser`. Se a
 * pessoa abrir esta rota sem vir do e-mail, não há sessão e a tela diz isso em
 * vez de deixar preencher um formulário que falharia no envio.
 */

import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { definirNovaSenha, forcaDaSenha, SENHA_MINIMA } from '@/lib/auth.service';
import { useSessao } from '@/context/SessaoContext';
import { normalizar } from '@/lib/erros';
import { Campo } from '@/components/shared/Campo';
import { Botao } from '@/components/shared/Botao';
import { Aviso } from '@/components/shared/Aviso';
import { Carregando } from '@/components/shared/Carregando';
import estilos from './Auth.module.css';

export function NovaSenha() {
  const navegar = useNavigate();
  const { autenticado, carregando } = useSessao();
  const [senha, setSenha] = useState('');
  const [repetida, setRepetida] = useState('');
  const [erro, setErro] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);

  const forca = useMemo(() => forcaDaSenha(senha), [senha]);
  const conferem = senha.length > 0 && senha === repetida;

  if (carregando) return <Carregando mensagem="Validando o link…" />;

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await definirNovaSenha(senha);
      navegar('/', { replace: true });
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
        <h1 className={estilos.titulo}>Escolha uma senha nova.</h1>

        {!autenticado ? (
          <>
            <Aviso tom="atencao" titulo="Link inválido ou expirado">
              Peça um novo link de recuperação, eles valem por uma hora.
            </Aviso>
            <p className={estilos.rodape}>
              <Link to="/recuperar-senha">Pedir novo link</Link>
            </p>
          </>
        ) : (
          <form className={estilos.formulario} onSubmit={(e) => void enviar(e)}>
            {erro ? <Aviso erro={erro} aoFechar={() => setErro(null)} /> : null}

            <Campo
              rotulo="Nova senha"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="new-password"
              required
              autoFocus
              dica={`Mínimo de ${SENHA_MINIMA} caracteres, com maiúscula, minúscula e número.`}
            />

            <Campo
              rotulo="Repita a senha"
              type="password"
              value={repetida}
              onChange={(e) => setRepetida(e.target.value)}
              autoComplete="new-password"
              required
              erro={repetida.length > 0 && !conferem ? 'As senhas não conferem.' : null}
            />

            <Botao
              type="submit"
              carregando={enviando}
              larguraTotal
              motivoDesabilitado={
                !forca.valida
                  ? `A senha precisa de ${forca.faltando.join(', ')}.`
                  : !conferem
                    ? 'Repita a mesma senha nos dois campos.'
                    : undefined
              }
            >
              Salvar e entrar
            </Botao>
          </form>
        )}
      </div>
    </div>
  );
}
