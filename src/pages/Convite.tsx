/**
 * Aceitar convite.
 *
 * O token vem na querystring (`/convite?t=…`) e é trocado por um vínculo via
 * RPC. Aceita automaticamente ao abrir: a pessoa já clicou uma vez, no e-mail —
 * pedir um segundo clique para confirmar o que ela acabou de decidir é atrito
 * sem função.
 *
 * A mensagem de erro é deliberadamente única para todos os casos (token
 * inexistente, expirado, já usado, e-mail diferente). Distinguir os casos
 * ensinaria a sondar tokens — e a RPC do banco já se comporta assim
 * (migration 0008).
 */

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { aceitarConvite } from '@/lib/membros.service';
import { normalizar } from '@/lib/erros';
import { Carregando } from '@/components/shared/Carregando';
import { Aviso } from '@/components/shared/Aviso';
import estilos from './Auth.module.css';

export function Convite() {
  const [parametros] = useSearchParams();
  const navegar = useNavigate();
  const token = parametros.get('t') ?? '';
  const [erro, setErro] = useState<unknown>(null);
  const jaTentou = useRef(false);

  useEffect(() => {
    // StrictMode monta o efeito duas vezes em desenvolvimento; sem esta trava
    // o convite seria consumido duas vezes e a segunda falharia com "inválido".
    if (jaTentou.current) return;
    jaTentou.current = true;

    if (!token) {
      setErro(normalizar(new Error('Convite sem token.')));
      return;
    }

    void (async () => {
      try {
        const { slug } = await aceitarConvite(token);
        navegar(`/w/${slug}`, { replace: true });
      } catch (e) {
        setErro(normalizar(e));
      }
    })();
  }, [token, navegar]);

  if (!erro) return <Carregando mensagem="Entrando no workspace…" />;

  return (
    <div className={estilos.tela}>
      <Link to="/" className={estilos.marca}>
        <span className={estilos.bolinha} aria-hidden="true" />
        <span className={estilos.wordmark}>Pautaria</span>
      </Link>

      <div className={estilos.cartao}>
        <h1 className={estilos.titulo}>Convite não aceito.</h1>
        <Aviso erro={erro} />
        <p className={estilos.subtitulo}>
          Convites valem por sete dias e só funcionam para o e-mail que os recebeu. Peça
          um novo a quem administra o workspace.
        </p>
        <p className={estilos.rodape}>
          <Link to="/">Ir para as minhas pautas</Link>
        </p>
      </div>
    </div>
  );
}
