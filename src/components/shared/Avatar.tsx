/**
 * Avatar — iniciais em círculo, cor derivada do perfil.
 *
 * Sem upload de foto: cor e iniciais vêm do banco (`profiles.avatar_hue`,
 * `profiles.iniciais`), com a matiz derivada do id do usuário no cadastro. O
 * mesmo membro tem sempre a mesma cor em qualquer workspace, o que é o que
 * torna o avatar reconhecível de relance num quadro cheio.
 */

import estilos from './Avatar.module.css';
import { avatarDe } from '@/utils/tema';

interface Props {
  iniciais: string;
  hue?: number;
  nome?: string;
  tamanho?: 'pequeno' | 'medio' | 'grande';
  /** Borda da cor do fundo, para a pilha sobreposta da topbar. */
  empilhado?: boolean;
}

const CLASSES = {
  pequeno: estilos.pequeno,
  medio: estilos.medio,
  grande: estilos.grande,
} as const;

export function Avatar({
  iniciais,
  hue = 45,
  nome,
  tamanho = 'pequeno',
  empilhado = false,
}: Props) {
  const cores = avatarDe(hue);

  return (
    <span
      className={`${estilos.base} ${CLASSES[tamanho]} ${empilhado ? estilos.empilhado : ''}`}
      style={{ background: cores.fundo, color: cores.texto }}
      title={nome}
      // O avatar é decorativo quando o nome já está escrito ao lado; quando não
      // está, ele carrega a informação e precisa de rótulo.
      aria-label={nome ? undefined : `Avatar de ${iniciais}`}
      role={nome ? 'presentation' : 'img'}
    >
      {iniciais.slice(0, 2).toUpperCase()}
    </span>
  );
}
