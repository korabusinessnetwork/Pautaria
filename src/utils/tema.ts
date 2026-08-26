/**
 * Tema, o accent do ofício, em OKLCH.
 *
 * O handoff de design define o accent como quatro derivações de um par
 * (hue, chroma):
 *
 *     --ac       oklch(60% C H)        cor base
 *     --acSoft   oklch(60% C H / .13)  fundo de chip e etiqueta
 *     --acFaint  oklch(60% C H / .07)  hover de linha, coluna em drop
 *     --acDeep   oklch(44% C H)        texto sobre acSoft
 *
 * Guardar hue e chroma no banco em vez de quatro strings hexadecimais tem uma
 * consequência prática: um ofício novo não tem como sair com paleta
 * inconsistente. Quem cadastra escolhe uma matiz; as quatro variações saem
 * corretas por construção, com a mesma luminosidade percebida dos outros
 * ofícios, que é justamente o que o OKLCH garante e o HSL não.
 *
 * O `--acDeep` em 44% de luminosidade não é escolha estética: é o que mantém
 * contraste de texto legível sobre o `--acSoft` em qualquer matiz do círculo.
 */

export interface Accent {
  ac: string;
  acSoft: string;
  acFaint: string;
  acDeep: string;
}

export function accentDe(hue: number, chroma: number): Accent {
  const h = ((hue % 360) + 360) % 360;
  const c = Math.max(0, Math.min(chroma, 0.4));
  return {
    ac: `oklch(60% ${c} ${h})`,
    acSoft: `oklch(60% ${c} ${h} / .13)`,
    acFaint: `oklch(60% ${c} ${h} / .07)`,
    acDeep: `oklch(44% ${c} ${h})`,
  };
}

/** Variáveis CSS para aplicar via `style` num contêiner. */
export function variaveisDeAccent(hue: number, chroma: number): Record<string, string> {
  const a = accentDe(hue, chroma);
  return {
    '--ac': a.ac,
    '--acSoft': a.acSoft,
    '--acFaint': a.acFaint,
    '--acDeep': a.acDeep,
  };
}

/**
 * Cor de avatar a partir da matiz do perfil. Luminosidade e croma fixos para
 * que nenhum avatar fique ilegível, a única variável é a matiz, derivada do id
 * do usuário no cadastro (trigger `ao_criar_usuario`, migration 0002).
 */
export function avatarDe(hue: number): { fundo: string; texto: string } {
  const h = ((hue % 360) + 360) % 360;
  return {
    fundo: `oklch(88% .05 ${h})`,
    texto: `oklch(38% .08 ${h})`,
  };
}

/**
 * Aplica o accent na raiz do documento.
 *
 * A troca de ofício re-tematiza o app inteiro sem recarregar nada: mudam
 * quatro variáveis CSS em `:root`, e cada componente que usa `var(--ac)` se
 * atualiza junto. É o que faz a promessa "troque de ofício quando quiser"
 * parecer instantânea, porque é.
 */
export function aplicarAccentGlobal(hue: number, chroma: number): void {
  const raiz = document.documentElement;
  for (const [chave, valor] of Object.entries(variaveisDeAccent(hue, chroma))) {
    raiz.style.setProperty(chave, valor);
  }
}
