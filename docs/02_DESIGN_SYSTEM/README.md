# 02, Design System

> Handoff **hi-fi**: cor, tipografia, espaçamento e microinteração são finais. Recriar
> fielmente, não reinterpretar. Fonte: `design_handoff_pautaria/Pautaria.dc.html`.
> Implementação: `src/styles/tokens.css` + CSS Modules co-localizados.

## Conceito visual

**Studio pinboard.** Papel quente em vez de branco. Cards como fichas alfinetadas, com um
pino visível. Etiquetas de etapa como fita adesiva levemente torta. Grade de pontos ao
fundo, quase invisível.

Três detalhes carregam a metáfora inteira, e são os primeiros a se perder numa "limpeza"
de CSS:

| Detalhe | Valor | Se remover |
|---|---|---|
| Pino do card | círculo 7px accent, `top: -3px`, centrado | vira retângulo genérico |
| Etiqueta torta | `rotate(-1.2deg)`, `border-radius: 3px` | vira pílula de dashboard |
| Papel quente | `#F2EFE7`, nunca `#FFFFFF` | vira mais um app de produtividade |

## Cor

### Base, nunca cinza neutro

```
fundo       #F2EFE7   papel
sidebar     #EEEAE0   um tom abaixo
superfície  #FBFAF6   painéis
card        #FFFDF8   o mais claro: o card "levanta" do papel
tinta       #1F1B16   texto
```

Bordas e texto secundário são **sempre a tinta com alfa**, nunca um cinza próprio. Um
cinza neutro sobre papel quente parece sujo.

```
borda            rgba(31,27,22, .10 / .11 / .14 / .16)
texto secundário rgba(31,27,22, .38 / .42 / .50 / .58 / .62 / .72)
```

### Accent, derivado do ofício, em OKLCH

O accent **não é escolhido**: é calculado a partir de `(hue, chroma)` guardados na tabela
`oficios`.

```
--ac       oklch(60% C H)        base: botão, pino, foco
--acSoft   oklch(60% C H / .13)  fundo de chip e etiqueta
--acFaint  oklch(60% C H / .07)  hover de linha, coluna em drop
--acDeep   oklch(44% C H)        texto sobre acSoft
```

| Ofício | H | C |
|---|---|---|
| Marketing | 45 | .16 |
| TI · Dev | 160 | .13 |
| Produtividade | 265 | .13 |

**Por que OKLCH e não HSL.** Em OKLCH, 60% de luminosidade é 60% em qualquer matiz. Em
HSL, um amarelo a 60% é muito mais claro que um azul a 60%, o que faria cada ofício novo
exigir ajuste manual para não ficar ilegível. Aqui um ofício novo é uma matiz, e as quatro
variações saem corretas por construção. O `44%` do `--acDeep` é o que mantém contraste de
texto sobre `--acSoft` em todo o círculo cromático.

Implementação: `src/utils/tema.ts` (`accentDe`, `aplicarAccentGlobal`), testado em
`tema.test.ts`.

### Semânticos, fora do accent

Perigo e atraso têm cor própria, porque uma ação destrutiva precisa ler como destrutiva
mesmo num ofício de matiz avermelhada.

```
--perigo        oklch(55% .19 25)
--perigo-forte  oklch(48% .19 25)
--atencao       oklch(65% .14 75)
--sucesso       oklch(58% .13 150)
```

## Tipografia

| Papel | Fonte | Uso |
|---|---|---|
| Display | **Space Grotesk** 500/600/700 | títulos, nomes de plano, preços |
| UI | **Instrument Sans** 400/500/600 | todo o resto |
| Mono | `ui-monospace` | etiquetas de etapa, eyebrow, e chips do ofício `mono` |

Escala: `56 · 23 · 21 · 20 · 16.5 · 14 · 13.5 · 13 · 12.5 · 12 · 11.5 · 11 · 10.5 · 10`.

**Os meios-pixels são intencionais.** `11.5` e `12.5` estão no design original; arredondar
para inteiro altera o ritmo vertical do card.

Letter-spacing com função:
```
--ls-eyebrow    .22em   "PAUTARIA · SISTEMA DE PAUTA POR OFÍCIO"
--ls-rotulo     .18em   "OFÍCIO", "MOVER PARA"
--ls-cabecalho  .14em   cabeçalho da tabela
--ls-etiqueta   .12em   etiqueta de etapa
--ls-titulo    -.02em   H1 de 56px
```

## Raio

```
16  tiles da abertura
14  painéis, tabela, coluna
12  cards
11  colunas do kanban
10  botões e inputs
 3  etiqueta de fita  ← não arredondar
999 pills
```

## Espaçamento

`5 · 6 · 9 · 10 · 14 · 16 · 22 · 26 · 40`

Layout: sidebar `230px` · coluna do kanban `266px` · drawer `340px` · grade de pontos a
cada `22px`.

## Sombra

Deslocamento negativo grande e opacidade baixa, o card levanta do papel sem ganhar
contorno escuro.

```
--sombra-card        0 1px 2px rgba(31,27,22,.06)
--sombra-card-hover  0 10px 22px -14px rgba(31,27,22,.4)
--sombra-drawer      -16px 0 40px -24px rgba(31,27,22,.35)
```

## Movimento

| Elemento | Duração | Transformação |
|---|---|---|
| Card (hover) | .15s | `translateY(-2px) rotate(-.3deg)` |
| Tile (hover) | .18s | `translateY(-4px) rotate(±.5deg)` |
| Drawer | .22s | slide da direita |
| Entrada de página | .5s escalonado (0 / .12s / .2s) | fade + rise |

A alternância de sentido na rotação dos tiles é proposital: uma fileira que gira toda para
o mesmo lado parece um carrossel.

**`prefers-reduced-motion`** zera as três durações. Não é acessibilidade decorativa: as
animações incluem rotação e deslocamento, que são exatamente os gatilhos de desconforto
vestibular.

## Estados obrigatórios

Todo componente que carrega dado tem os quatro. Ausência de qualquer um é bug de UX.

| Estado | Regra | Exemplo real |
|---|---|---|
| Carregando | com texto, nunca spinner mudo | "Abrindo sua pauta…" |
| Vazio | ensina a próxima ação | "solte uma pauta aqui" |
| Erro | mensagem humana + próxima ação | "Seu plano atingiu o limite. **Ver planos →**" |
| Sucesso | feedback visível | "Copiado ✓" |

O indicador de carregamento são **três pinos pulsando**, o mesmo pino de 7px do card. Um
spinner genérico seria mais rápido de escrever e não pertenceria a este produto.

## Foco

```css
outline: 2px solid var(--ac);
outline-offset: 2px;
```

O anel segue o accent do ofício: coerente com o tema e nunca invisível. Remover outline
"porque fica feio" é tirar o corrimão da escada.

## White-label

O design system é **único**; o que varia por tenant é o preenchimento dos tokens.

- `workspaces.tema.hue` sobrescreve a matiz do ofício → cliente com marca própria mantém a
  cor dele mesmo trocando de ofício.
- `workspaces.tema.nomeExibicao` substitui o wordmark da sidebar.
- `workspaces.tema.logoUrl` reservado para a Fase 3.

Nenhum componente lê "Pautaria" de uma constante, lê do tenant, com reserva.
