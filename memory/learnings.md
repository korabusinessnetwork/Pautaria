# Aprendizados — Pautaria

## Objetivo
Memória viva dos erros, surpresas e insights. O que custou tempo uma vez não deve custar
duas.

## Contexto
Todo aprendizado aqui nasceu de algo que quebrou, e a maioria quebrou de forma silenciosa.
Este arquivo existe porque a lição some quando a correção é commitada.

## Regras Gerais
- Registrar **sempre que algo surpreender**, bom ou ruim — especialmente quando a falha
  passou despercebida por um tempo.
- Formato: o que aconteceu · por que aconteceu · o que mudou.
- Aprendizado validado (repetido ou confirmado por outra pessoa) é **promovido** para
  `patterns.md` — copiado, não movido. O original fica como histórico.

## Validações
- Aprendizado de incidente exige o post-mortem curto no próprio registro.

## Permissões
- Aberto: qualquer pessoa escreve.

## Exceções
- Dado sensível é anonimizado antes de entrar.

## Auditoria
- Autor e data.

## Eventos
- `learning.added` · `learning.promoted`

## Configurações Futuras
- Ritual de revisão ao fim de cada fase do roadmap.

## Casos de Uso
- Pós-incidente; quando uma correção demorou mais que o esperado; quando uma suposição
  se revelou errada.

## Critérios de Aceite
- [ ] Descreve o que aconteceu, por quê, e o que mudou
- [ ] Autor e data
- [ ] Se virou padrão ou restrição, aponta para lá

---

## A1 — Um build verde pode produzir um app morto
*2026-08-17 · fundação · **gravíssimo, e silencioso***

**O que aconteceu.** `npm run build` terminou com sucesso e gerou um bundle de **920
bytes**. O app inteiro havia desaparecido. Nenhum erro, nenhum aviso.

**Por quê.** `src/lib/supabase.ts` tinha, no escopo do módulo:

```ts
if (!url || !chaveAnon) throw new Error('Configuração ausente…');
```

O Vite substitui `import.meta.env.VITE_*` por literais **em tempo de build**. Sem `.env`,
a condição virou `if (true) throw`, e o minificador — corretamente — concluiu que todo o
resto do módulo era inalcançável e eliminou a aplicação.

**Por que é grave.** A validação foi escrita justamente para *evitar* falha silenciosa, e
produziu a pior possível: passa no CI, publica na Vercel, e o usuário recebe uma página em
branco. O sintoma não aponta para a causa em nenhum momento.

**O que mudou.**
1. `supabase.ts` não lança mais no escopo do módulo — expõe `configuracaoOk` e usa valores
   de reserva em domínio `.invalid` (RFC 2606, nunca resolve).
2. `main.tsx` renderiza `<ConfiguracaoAusente />`, que explica o que falta.
3. `vite.config.ts` ganhou o plugin `exigirAmbiente`, que **aborta o build de produção**
   sem as variáveis — e também se aparecer qualquer `VITE_*` fora das duas autorizadas.
4. A verificação passou a ser parte do gate: build sem env deve falhar; build com env deve
   conter a string `sotaque` no bundle.

**Lição generalizável.** Em código que o bundler avalia estaticamente, `throw` no topo do
módulo não é uma guarda — é uma instrução para o minificador apagar o arquivo. Guardas de
configuração pertencem ao processo de build (falha alta, cedo, na esteira) ou à UI (falha
visível, explicada), nunca ao escopo de módulo.

*Promovido para `restrictions.md` S1 (aplicação por plugin de build).*

---

## A2 — `usage` num schema não é exposição; a falta dele quebra toda a RLS
*2026-08-17 · fundação*

**O que aconteceu.** As funções de autorização foram para o schema `app` e o acesso foi
revogado de `authenticated` — parecia o mais seguro. Toda query autenticada passou a
falhar com `permission denied for schema app`.

**Por quê.** Uma política de RLS é avaliada **com os privilégios de quem consulta**. Se a
política chama `app.e_membro()`, o usuário precisa de `usage` no schema.

**O que mudou.** `grant usage on schema app to anon, authenticated, service_role`, com o
raciocínio no comentário da migration: `usage` não dá direito de executar função alguma —
cada `grant execute` é individual — e o schema `app` fica fora de `api.schemas`, então o
PostgREST nem publica rota para ele. A proteção real é a combinação dessas duas coisas,
não a revogação do `usage`.

**Lição.** Endurecer sem entender o mecanismo produz sistemas que não funcionam, e a
correção apressada costuma abrir mais do que o necessário. Vale gastar cinco minutos
entendendo o que cada `grant` realmente concede.

---

## A3 — `INSERT ... RETURNING` exige a política de SELECT
*2026-08-17 · fundação*

**O que aconteceu.** `criar_workspace` falhava com "new row violates row-level security
policy" na criação do workspace — sendo que a política de INSERT estava correta.

**Por quê.** O `RETURNING id` exige que a política de **SELECT** aprove a linha devolvida.
A política de SELECT de `workspaces` pede que o usuário já seja membro, e quem cria o
vínculo é um trigger `AFTER INSERT` — que só dispara no fim da instrução, depois do
RETURNING. Dependência circular em pleno caminho feliz do onboarding.

**O que mudou.** O uuid passou a ser gerado dentro da função (`gen_random_uuid()`) e o
INSERT dispensa `RETURNING`.

**Lição.** `RETURNING` numa tabela com RLS é uma leitura disfarçada de escrita. Quando um
trigger `AFTER` estabelece a permissão de leitura, os dois não podem estar na mesma
instrução.

---

## A4 — Um teste de segurança pode passar pelo motivo errado
*2026-08-17 · fundação · **o aprendizado mais importante do dia***

**O que aconteceu.** O teste de isolamento entre tenants passou com 45 asserções verdes.
Ao endurecer as asserções, três delas estavam passando por engano:

1. **`\set` com aspas triplas.** `\set uid_a '''aaa…'''` fazia `:'uid_a'` expandir para
   `'''aaa…'''`. Dois testes de fronteira "passavam" porque o SQL tinha **erro de
   sintaxe** — e o helper `recusado()` interpretava qualquer exceção como sucesso.
2. **RLS que esconde em vez de recusar.** `USING` torna a linha invisível: o UPDATE roda,
   afeta zero linhas e **não** levanta exceção. Testes de escrita cruzada baseados só em
   "levantou exceção?" nunca tocaram a fronteira.
3. **O ataque que não era ataque.** O INSERT de invasão selecionava os ids do quadro alheio
   — e a RLS já esvaziava esse SELECT. O INSERT inseria zero linhas sem erro.

**O que mudou.**
- `pg_temp.linhas_afetadas()` para distinguir "barrado por exceção" de "afetou zero linhas",
  e as asserções de escrita passaram a checar a contagem.
- Os ids do tenant vítima passam a ser capturados como superusuário **antes** do ataque:
  a Alice recebe todos os ids de graça e a barreira precisa segurar mesmo assim.
- Acrescentado o teste mais revelador do conjunto: `UPDATE ... WHERE true` deliberadamente
  sem filtro, exigindo que afete exatamente as 6 pautas dela e nenhuma das 11 do banco.
- As asserções passaram de 45 para 89, e o helper agora imprime o SQLSTATE do bloqueio.

**Lição.** Um teste de segurança que só verifica "deu erro?" confunde bloqueio com bug de
digitação. Ele precisa (a) provar o efeito, não a exceção, (b) dar ao atacante todo o
conhecimento que ele poderia ter, e (c) incluir ao menos um caso feliz — para que uma
regressão que fecha o produto junto com a brecha também reprove.

---

## A5 — Nomes de parâmetro OUT colidem com colunas em plpgsql
*2026-08-17 · fundação*

**O que aconteceu.** `aceitar_convite` falhava com `column reference "workspace_id" is
ambiguous`, sem apontar a linha.

**Por quê.** A função declara `returns table (workspace_id uuid, …)`, e a lista de
inferência do `ON CONFLICT (workspace_id, user_id)` é resolvida como referência de coluna
nua — o plpgsql não sabe se é a coluna ou o parâmetro OUT.

**O que mudou.** O `ON CONFLICT` virou um `if not exists` explícito. Evitou-se
`#variable_conflict use_column`, que resolveria este caso e esconderia o próximo.

---

## A6 — O peso das dependências é decisão de segurança, não de conveniência
*2026-08-17 · fundação*

**O que aconteceu.** A instalação inicial, com versões escolhidas por familiaridade,
trouxe 8 vulnerabilidades — uma **crítica** (RCE no Vitest) e uma **alta** (React Router).

**Por quê.** Versões pinadas por hábito e não por verificação. As correções exigiam saltos
de major (Vite 5→8, Vitest 2→4, React Router 6→7).

**O que mudou.** Todas atualizadas, `npm audit` limpo, e o salto foi feito **na fundação**
— quando custa uma tarde. Adiar teria transformado uma atualização de rotina numa
migração de semanas, com a vulnerabilidade em produção o tempo todo.

**Lição.** Num projeto que nasce hoje, "versão que eu conheço" não é critério. Rodar
`npm audit` antes do primeiro commit é o momento mais barato que existirá para consertar.

---

## A7 — O quadro precisa nascer cheio, não só configurado
*2026-08-17 · fundação · produto*

**Insight.** A primeira modelagem entregava as colunas certas e um quadro **vazio**. Isso
ainda é uma tela em branco: o usuário continua sem saber que cara tem uma pauta boa
naquele ofício.

**O que mudou.** Tabela `oficio_exemplos`, semeada no onboarding, com `prazo_dias`
relativo — inclusive negativo, para que o quadro tenha algo atrasado. Um quadro só com
prazos futuros parece um catálogo, não um trabalho em andamento.

**Lição.** "Configuração automática" e "valor imediato" não são a mesma coisa. A primeira
é meio; a segunda é a promessa.

---

## A8 — Um scanner que grita à toa deixa de ser lido
*2026-08-17 · fundação*

**O que aconteceu.** A primeira versão de `scripts/checar-segredos.sh` reprovou o próprio
repositório com três achados — todos falsos:

1. acusou `.env.example` de ser um `.env` versionado (o regex `\.env(\.|$)` casa com
   `.env.example`);
2. tratou o placeholder `$aact_hmlg_SUA_CHAVE` do INSTALACAO.md como chave real;
3. apontou `VITE_ASAAS_API_KEY` na tabela de anti-padrões de `docs/10_PROMPTS` — que a cita
   justamente para dizer *não faça isto*.

**Por que importa.** A tentação imediata é relaxar o scanner ou marcá-lo como "sabe-se que
dá falso positivo". As duas saídas levam ao mesmo lugar: as pessoas param de ler a saída, e
ele deixa de proteger exatamente no dia em que estiver certo. Um controle de segurança
ruidoso é pior que nenhum, porque dá a sensação de cobertura.

**O que mudou.** Cada checagem foi **escopada ao lugar onde o vazamento importa**:
`.env` real (excluindo o exemplo); chave da Asaas com 40+ caracteres, fora da documentação;
`VITE_*` apenas nos arquivos que alimentam o build — documentação pode nomear a variável
proibida à vontade, porque doc não vira bundle.

Dois comentários de código que soletravam a variável proibida foram reescritos: manter o
scanner simples e estrito vale mais que a conveniência de citar o nome literal. O motivo
está escrito no próprio comentário, para ninguém "consertar" de volta.

**Verificação em duas direções.** O scanner passou a ser testado nos dois sentidos: limpo
no repositório real, **e** reprovando quando um vazamento de verdade é plantado. Só a
primeira metade não prova nada — um `exit 0` fixo também passaria.

**Lição.** Precisão não é polimento de ferramenta de segurança: é o que determina se ela
será obedecida. E todo detector precisa ser testado com um positivo verdadeiro, não só com
a ausência de alarme.

---

## A9 — "O bundler elimina" é hipótese, não garantia
*2026-08-24 · front · **eu mesmo tinha afirmado o contrário***

**O que aconteceu.** Escrevi o modo demonstração atrás de `import.meta.env.DEV`
e afirmei, em commit e em comentário de código, que o Vite removeria o módulo
inteiro do bundle de produção. Ao **verificar**, os dados de demonstração
estavam lá: "Estúdio Aurora", "Marina Alves", os 973 linhas de fixtures. O chunk
do app carregava ~9 KB de dado fictício para todo usuário.

**Por quê.** O desvio nos serviços era assim:

```ts
const d = await seDemo(() => demo.pautas(quadroId));
```

`seDemo` só devolve dado quando a demonstração está ligada — mas **a closure é
construída sempre**, inclusive em produção. Para o bundler, `demo.pautas` é uma
referência viva, e uma referência viva mantém `dados.ts` inteiro no grafo. O
`import.meta.env.DEV` estava *dentro* de `seDemo`, tarde demais: quando ele é
avaliado, o mal já está feito.

A correção move a decisão para fora, onde o bundler consegue vê-la:

```ts
const d = import.meta.env.DEV ? await seDemo(() => demo.pautas(quadroId)) : null;
```

Em produção isso vira `const d = null`, a closure some, e com ela a última
referência a `demo.*`. Foram 47 desvios em 7 serviços.

**Por que dói mais que um bug comum.** O aprendizado A1 desta mesma memória é
sobre eliminação de código morto — o bug em que o minificador apagou a aplicação
inteira. Eu conhecia o mecanismo, escrevi um parágrafo explicando-o, e mesmo
assim errei o lado dele: da primeira vez o bundler removeu o que eu não queria;
desta vez manteve o que eu jurava que ele removeria. Conhecer o mecanismo não
substitui medir o resultado.

**O que mudou.** O CI agora procura quatro marcadores do modo demonstração em
`dist/` e reprova o build se achar qualquer um. É a mesma forma do gate que já
existia para "o bundle contém a aplicação" — porque o build verde não distingue
nenhum dos dois casos.

**Lição.** Toda afirmação sobre o que o bundler faz precisa de um gate que a
verifique. Se a afirmação for verdadeira, o gate custa dois segundos por build;
se for falsa, ele é a única coisa entre a suposição e a produção.

---

## A10 — Uma verificação verde pode estar medindo a coisa errada
*2026-08-24 · front · **duas falhas na mesma ferramenta***

**O que aconteceu.** Ao conferir o mobile, as capturas em 390px mostravam tudo
cortado na direita. Diagnostiquei "transbordo horizontal" e comecei a consertar
CSS. Nenhum dos defeitos existia.

**Falha 1 — a largura era mentira.** `chromium --window-size=390,900` **não**
produz um viewport de 390px: o Chromium trava a janela num mínimo de ~500px. A
página renderizava a 500 e a imagem saía com 390 de largura, recortada. Só
descobri porque instrumentei a medição e ela imprimiu `cabe em 500px` quando eu
tinha pedido 390. A correção é `Emulation.setDeviceMetricsOverride` pelo
protocolo do DevTools — o único caminho que respeita a largura pedida.

**Falha 2 — o verde vinha do vazio.** Corrigida a largura, o medidor aprovou as
13 rotas. Mas a captura da rota mais pesada saiu **em branco**: o Vite ainda
transformava módulos quando o script mediu, aos 2,2 s fixos. E uma página sem
elementos trivialmente "não transborda" — o ✓ não significava nada.

É o mesmo modo de falha do bug B1, num lugar novo: **verde por ausência de
conteúdo**. A espera fixa virou espera por sinal (o `#root` precisa ter filhos e
o corpo precisa ter texto), e não renderizar passou a ser falha explícita em vez
de aprovação silenciosa.

**O que mudou.** Captura e medição passaram a viver no mesmo script e no mesmo
viewport — uma captura feita numa largura diferente da medição é pior que
nenhuma. Com a ferramenta consertada, a medição real apontou que **não havia
transbordo em nenhuma rota**; os defeitos reais do mobile eram outros (a sidebar
empilhada ocupando 630px antes do conteúdo, e o chip do usuário sobrepondo os
links), e esses foram corrigidos.

**Lição.** Antes de consertar o que a ferramenta acusa, verifique se a
ferramenta está medindo o que você pediu. E toda checagem que pode passar sobre
um resultado vazio precisa de uma asserção de que há conteúdo — senão ela vira
um carimbo.
