# 06, Componentes

> Um componente por arquivo, CSS Module co-localizado, **CSS sempre fora do JSX**.
> Nome do arquivo = nome do componente. Estilo em `Componente.module.css` ao lado.

## Inventário

### `components/shared/`, a base

| Componente | Papel | Detalhe que importa |
|---|---|---|
| `FronteiraDeErro` | captura erro de renderização | Sem ela, um erro deixa tela branca, o pior estado possível |
| `ConfiguracaoAusente` | app sem `.env` | Existe por causa do bug B1 (`memory/bugs.md`) |
| `RotaProtegida` | autenticação **antes** de renderizar | Verificar em `useEffect` mostraria a tela protegida por um frame |
| `Carregando` | estado de espera | Três pinos pulsando, o mesmo pino do card, não um spinner genérico |
| `Botao` | ação | `motivoDesabilitado` vira `title` **e** `aria-describedby` |
| `Campo` | entrada de formulário | `useId` liga rótulo, dica e erro, nunca esquecido |
| `Aviso` | erro, atenção, informação | Aceita `ErroApp`; em limite de plano oferece "Ver planos →" |
| `Chip` | campo livre da pauta | `mono` vem do ofício, não de `if` no componente |
| `Etiqueta` | etapa, "fita adesiva" | `rotate(-1.2deg)` e `radius: 3px`, não arredondar |
| `Avatar` | pessoa | Cor derivada de `profiles.avatar_hue`, estável em qualquer workspace |

### `components/workspace/`

| Componente | Papel |
|---|---|
| `Sidebar` | ofícios (com troca), modelos, atalhos, chip do usuário |
| `Topbar` | título do ofício, contador, busca, Quadro⇄Tabela, nova pauta, avatares |

### `components/quadro/`

| Componente | Papel |
|---|---|
| `Quadro` | colunas, arrasto HTML5, cálculo do índice de destino |
| `PautaCard` | a ficha: pino, título, chips, prazo, responsável |
| `NovaPautaInline` | Enter cria e **mantém o foco**; Esc cancela |

### `components/tabela/` e `components/pauta/`

| Componente | Papel |
|---|---|
| `Tabela` | mesma pauta, densa; ordenada por etapa e depois por prazo |
| `DrawerPauta` | detalhe, edição no lugar, MOVER PARA, arquivar |

## Regras de composição

### 1. Nenhum componente conhece um ofício

Zero ocorrências de `'Marketing'`, `'mkt'`, `'Canal'` ou `hue === 45` em `src/components/`.
Tudo vem de `oficio.*`. Se um `if (oficio.chave === ...)` aparecer, é regressão de
arquitetura, a promessa de "ofício novo = INSERT" morre ali.

```tsx
// ✗                                    // ✓
{oficio.chave === 'ti' && <ChipMono/>}  <Chip mono={oficio.mono}>{pauta.campo1}</Chip>
<span>Canal</span>                      <span>{oficio.campo1Label}</span>
```

### 2. Nenhum componente fala com o backend

ESLint barra `@supabase/supabase-js` fora de `src/lib/`. Dados chegam por hook
(`useQuadro`, `useLimites`) ou contexto.

### 3. Estado do servidor não vira `useState`

`useQuery` guarda; `useState` só para estado de interface (drawer aberto, coluna em edição,
termo de busca).

**Exceção que vale explicar:** `PaginaWorkspace` guarda o **id** da pauta aberta, não o
objeto. Guardar o objeto congelaria a referência, e o drawer continuaria exibindo a versão
antiga depois de uma edição ou de um evento de realtime.

### 4. Todo estado visível

Carregando, vazio, erro e sucesso. Coluna vazia diz "solte uma pauta aqui", não fica muda.

### 5. Ação destrutiva confirma ou é reversível

Arquivar confirma (não há UI de desarquivar ainda). Cancelar assinatura confirma e diz até
quando o acesso vale.

## Acessibilidade

| Ponto | Como |
|---|---|
| Foco visível | anel de 2px na cor do ofício, nunca removido |
| Pular para o conteúdo | primeiro Tab da página do workspace |
| Drawer | `role="dialog"` + `aria-modal`, foco entra e **volta** ao fechar, Esc fecha |
| Arrasto | equivalente por teclado nas pills MOVER PARA |
| Tabela | `role="table"/"row"/"cell"`, linha focável, Enter e Espaço abrem |
| Formulários | `useId` liga rótulo, dica e erro |
| Movimento | `prefers-reduced-motion` zera as transições |
| Contraste | `--acDeep` em 44% garante texto legível sobre `--acSoft` em qualquer matiz |

**Limitação registrada:** `draggable` do HTML5 não é acessível por teclado, e nenhuma
configuração muda isso. Por isso o caminho alternativo existe no drawer, e por isso o card
**não** recebe `tabindex`, que daria impressão de acessibilidade sem entregá-la
(`memory/bugs.md` L3).

## Como criar um componente novo

1. `src/components/{feature}/Nome.tsx` + `Nome.module.css`.
2. Estilo só por token (`var(--ac)`, `var(--txt-13)`), nunca hexadecimal ou pixel solto.
3. Dados por prop ou hook; jamais consulta direta.
4. Rótulo vem do ofício ou do tenant, nunca de string fixa.
5. Os quatro estados.
6. `npm run validar` antes de commitar.
