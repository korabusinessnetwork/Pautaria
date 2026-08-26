/**
 * Criação inline de pauta, Enter cria, Esc cancela.
 *
 * O input não some depois de criar: ele limpa e continua focado, para quem
 * chegou com cinco ideias na cabeça despejar as cinco sem tocar no mouse.
 * Fechar depois de cada item transformaria "anotar o que pensei" em cinco
 * ciclos de clicar-digitar-clicar.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import estilos from './NovaPautaInline.module.css';

interface Props {
  aoConfirmar: (titulo: string) => Promise<void>;
  aoCancelar: () => void;
}

export function NovaPautaInline({ aoConfirmar, aoCancelar }: Props) {
  const [valor, setValor] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  async function confirmar() {
    const titulo = valor.trim();
    if (!titulo) return aoCancelar();

    setSalvando(true);
    setErro(null);
    try {
      await aoConfirmar(titulo);
      setValor('');
      ref.current?.focus();
    } catch (e) {
      // O erro fica no input, não num toast que some: quem acabou de digitar
      // precisa ver o motivo ao lado do que digitou (limite de plano, em geral).
      setErro(e instanceof Error ? e.message : 'Não foi possível criar a pauta.');
    } finally {
      setSalvando(false);
    }
  }

  function aoTeclar(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === 'Enter') {
      evento.preventDefault();
      void confirmar();
    } else if (evento.key === 'Escape') {
      evento.preventDefault();
      aoCancelar();
    }
  }

  return (
    <div className={estilos.caixa}>
      <input
        ref={ref}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={aoTeclar}
        onBlur={() => {
          if (!valor.trim() && !salvando) aoCancelar();
        }}
        placeholder="Título da pauta ⏎"
        className={estilos.input}
        disabled={salvando}
        maxLength={200}
        aria-label="Título da nova pauta"
      />
      {erro ? (
        <span className={estilos.erro} role="alert">
          {erro}
        </span>
      ) : (
        <span className={estilos.dica}>Enter cria · Esc cancela</span>
      )}
    </div>
  );
}
