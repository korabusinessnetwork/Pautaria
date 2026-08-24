import { Link } from 'react-router-dom';
import estilos from './Auth.module.css';
import { ROTA_DO_APP } from '@/constants/rotas';

export function NaoEncontrado() {
  return (
    <div className={estilos.tela}>
      <Link to="/" className={estilos.marca}>
        <span className={estilos.bolinha} aria-hidden="true" />
        <span className={estilos.wordmark}>Pautaria</span>
      </Link>

      <div className={estilos.cartao}>
        <h1 className={estilos.titulo}>Essa pauta não existe.</h1>
        <p className={estilos.subtitulo}>
          O endereço pode ter mudado, ou você não tem acesso a este workspace. As duas
          coisas levam de volta para o mesmo lugar.
        </p>
        <p className={estilos.rodape}>
          <Link to={ROTA_DO_APP}>Voltar para as minhas pautas</Link>
        </p>
      </div>
    </div>
  );
}
