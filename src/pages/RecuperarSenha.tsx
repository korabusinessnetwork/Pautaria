/**
 * Recuperação de senha.
 *
 * A resposta é sempre a mesma, "se existe conta com esse e-mail, mandamos o
 * link", independentemente de a conta existir. Confirmar a existência aqui
 * transformaria o formulário num verificador de clientes: qualquer pessoa
 * poderia testar e-mails e descobrir quem usa o Pautaria.
 */

import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { pedirRecuperacao } from '@/lib/auth.service';
import { Campo } from '@/components/shared/Campo';
import { Botao } from '@/components/shared/Botao';
import estilos from './Auth.module.css';

export function RecuperarSenha() {
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    await pedirRecuperacao(email);
    setEnviando(false);
    setEnviado(true);
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
            <h1 className={estilos.titulo}>Link a caminho.</h1>
            <div className={estilos.sucesso}>
              Se existe uma conta com <strong>{email}</strong>, o link de redefinição já
              está na caixa de entrada. Ele vale por uma hora.
            </div>
            <p className={estilos.rodape}>
              <Link to="/entrar">Voltar para a entrada</Link>
            </p>
          </>
        ) : (
          <>
            <h1 className={estilos.titulo}>Esqueceu a senha?</h1>
            <p className={estilos.subtitulo}>
              Informe seu e-mail e mandamos um link para você criar uma nova.
            </p>

            <form className={estilos.formulario} onSubmit={(e) => void enviar(e)}>
              <Campo
                rotulo="E-mail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                autoFocus
              />
              <Botao type="submit" carregando={enviando} larguraTotal>
                Enviar link
              </Botao>
            </form>

            <p className={estilos.rodape}>
              <Link to="/entrar">Lembrei, quero entrar</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
