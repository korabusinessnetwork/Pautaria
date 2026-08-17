/**
 * Fronteira de erro global.
 *
 * Um erro de renderização em React desmonta a árvore inteira e deixa a tela
 * branca. Tela branca é o pior estado possível: o usuário não sabe se travou,
 * se perdeu o trabalho, ou se a internet caiu — e não tem o que fazer.
 *
 * Aqui ele vê o que aconteceu, tem um botão para tentar de novo e outro para
 * voltar ao começo. O detalhe técnico fica atrás de um `<details>`, disponível
 * para quem for reportar e invisível para quem não se importa.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import estilos from './FronteiraDeErro.module.css';

interface Props {
  children: ReactNode;
}

interface Estado {
  erro: Error | null;
}

export class FronteiraDeErro extends Component<Props, Estado> {
  state: Estado = { erro: null };

  static getDerivedStateFromError(erro: Error): Estado {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo): void {
    // Sem serviço de monitoramento na fase bootstrap (ver memory/restrictions).
    // O console é o destino; quando entrar um Sentry, é esta linha que muda.
    console.error('[fronteira-de-erro]', erro.message, info.componentStack);
  }

  render(): ReactNode {
    const { erro } = this.state;
    if (!erro) return this.props.children;

    return (
      <div className={estilos.tela} role="alert">
        <div className={estilos.caixa}>
          <span className={estilos.marca}>PAUTARIA</span>
          <h1 className={estilos.titulo}>Algo quebrou por aqui.</h1>
          <p className={estilos.texto}>
            Não é você — foi a gente. Suas pautas estão salvas; nada do que você
            escreveu se perdeu.
          </p>

          <div className={estilos.acoes}>
            <button
              type="button"
              className={estilos.principal}
              onClick={() => this.setState({ erro: null })}
            >
              Tentar de novo
            </button>
            <button
              type="button"
              className={estilos.secundario}
              onClick={() => {
                window.location.href = '/';
              }}
            >
              Voltar ao início
            </button>
          </div>

          <details className={estilos.detalhes}>
            <summary>Detalhe técnico</summary>
            <code>{erro.message}</code>
          </details>
        </div>
      </div>
    );
  }
}
