/**
 * Estado de carregamento.
 *
 * Sempre com texto, nunca só um spinner mudo: "Abrindo sua pauta…" diz o que
 * está acontecendo e por que a espera faz sentido. Estados visíveis são
 * requisito do princípio nº 1 (CLAUDE.md), não enfeite.
 */

import estilos from './Carregando.module.css';

export function Carregando({ mensagem = 'Carregando…' }: { mensagem?: string }) {
  return (
    <div className={estilos.tela} role="status" aria-live="polite">
      <div className={estilos.pinos} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p className={estilos.texto}>{mensagem}</p>
    </div>
  );
}

/** Versão embutida, para dentro de uma área já montada. */
export function CarregandoInline({ mensagem = 'Carregando…' }: { mensagem?: string }) {
  return (
    <div className={estilos.inline} role="status" aria-live="polite">
      <div className={estilos.pinos} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <span className={estilos.textoInline}>{mensagem}</span>
    </div>
  );
}
