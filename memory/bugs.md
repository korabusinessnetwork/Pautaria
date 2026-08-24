# Bugs conhecidos — Pautaria

## Objetivo
Registrar bugs conhecidos, limitações aceitas e correções feitas com trade-off, para que
ninguém redescubra do zero nem "conserte" algo que é intencional.

## Contexto
Bug não registrado é bug reencontrado. Limitação não registrada vira relatório de bug de
alguém que não sabia que era decisão. Este arquivo separa as duas coisas.

## Regras Gerais
- Toda entrada tem: sintoma, causa (se conhecida), severidade, e estado.
- Severidade: `crítico` (dado ou dinheiro em risco) · `alto` (bloqueia uso) ·
  `médio` (contorna) · `baixo` (incômodo).
- Bug corrigido não é apagado: ganha `[CORRIGIDO]` com a data e o commit/migration.
- Bug que revela lição maior sobre o sistema é **promovido** para `learnings.md`.

## Validações
- Bug crítico exige o teste que prova a correção antes de ser fechado.

## Permissões
- Aberto: qualquer pessoa registra.

## Exceções
- Bug de dependência de terceiro fica aqui com link para o issue upstream.

## Auditoria
- Autor, data e severidade obrigatórios.

## Eventos
- `bug.registered` · `bug.fixed` · `bug.promoted`

## Configurações Futuras
- Sincronizar com issues do GitHub quando o volume justificar.

## Casos de Uso
- Antes de investigar um comportamento estranho; ao planejar o próximo ciclo.

## Critérios de Aceite
- [ ] Sintoma descrito do ponto de vista de quem observa
- [ ] Severidade e estado
- [ ] Autor e data

---

## Corrigidos na fundação

### B1 — `[CORRIGIDO]` Build de produção gerava bundle vazio
*crítico · 2026-08-17 · corrigido no mesmo dia*

**Sintoma.** `npm run build` verde, bundle de 920 bytes, app inexistente.
**Causa.** `throw` no escopo do módulo com `import.meta.env` substituído em build-time →
eliminação de código morto apagou a aplicação.
**Correção.** `configuracaoOk` + tela `ConfiguracaoAusente` + plugin `exigirAmbiente` que
aborta o build de produção sem as variáveis.
**Verificação.** Build sem env deve falhar; build com env deve conter a string `sotaque`.
*Promovido para `learnings.md` A1.*

### B2 — `[CORRIGIDO]` Toda query autenticada morria com "permission denied for schema app"
*crítico · 2026-08-17*

**Causa.** `authenticated` sem `usage` no schema `app`, que as políticas de RLS precisam
para chamar `app.e_membro()`.
**Correção.** Migration 0001. *Promovido para `learnings.md` A2.*

### B3 — `[CORRIGIDO]` Onboarding falhava com violação de RLS
*alto · 2026-08-17*

**Causa.** `INSERT ... RETURNING` exige a política de SELECT, que só passa depois do
trigger `AFTER INSERT` criar o vínculo de dono.
**Correção.** Migration 0008: uuid gerado na função, sem `RETURNING`.
*Promovido para `learnings.md` A3.*

### B4 — `[CORRIGIDO]` Troca de ofício falhava com "permission denied for table pautas"
*alto · 2026-08-17*

**Causa.** `trocar_oficio_quadro` era SECURITY INVOKER e precisa escrever
`pautas.oficio_id`, coluna deliberadamente fora do grant do cliente.
**Correção.** Migration 0008: função virou SECURITY DEFINER **com bloco de autorização
explícito na entrada** (papel + workspace gravável).
**Atenção para o futuro.** Toda função DEFINER deste projeto deve abrir com esse bloco.
Se não abrir, é bug de segurança — a RLS está desligada lá dentro.

### B5 — `[CORRIGIDO]` Três testes de isolamento passavam pelo motivo errado
*crítico · 2026-08-17*

**Causa.** `\set` com aspas triplas gerava erro de sintaxe interpretado como "bloqueado";
e asserções que só verificavam exceção não detectavam RLS que esconde a linha (`USING`),
onde o comando roda e afeta zero linhas.
**Correção.** `pg_temp.linhas_afetadas()`, ids do tenant vítima capturados antes do
ataque, e um `UPDATE ... WHERE true` sem filtro como teste-canário.
*Promovido para `learnings.md` A4.*

### B6 — `[CORRIGIDO]` `aceitar_convite` com "column reference is ambiguous"
*médio · 2026-08-17*

**Causa.** Nome de parâmetro OUT colidindo com coluna na lista do `ON CONFLICT`.
**Correção.** `if not exists` explícito em vez de `ON CONFLICT`.
*Promovido para `learnings.md` A5.*

### B7 — `[CORRIGIDO]` Dados de demonstração vazaram para o bundle de produção
*alto · 2026-08-24*

**Sintoma.** Build verde, e ~9 KB de fixtures ("Estúdio Aurora", "Marina Alves")
publicados para todo usuário.
**Causa.** `await seDemo(() => demo.pautas(id))` constrói a closure mesmo em
produção; a referência a `demo.*` manteve `dados.ts` no grafo do bundler.
**Correção.** 47 desvios reescritos como
`import.meta.env.DEV ? await seDemo(...) : null`, que o Vite resolve em tempo de
build. Gate no CI procurando quatro marcadores em `dist/`.
*Promovido para `learnings.md` A9.*

---

## Limitações aceitas (não são bugs)

### L1 — Ordenação fracionária esgota precisão após ~50 inserções no mesmo ponto
*baixo · por desenho*

Dividir ao meio repetidamente esgota o `double` por volta da 50ª inserção **entre os dois
mesmos cards**. Inatingível no uso real de um quadro de pautas.
`precisaRenumerar()` e `renumerar()` existem e estão testados; falta ligá-los a um gatilho
automático — hoje seria intervenção manual. Registrado por honestidade.

### L2 — `[RESOLVIDO 2026-08-24]` Arquivar não tinha UI de desarquivar
*era médio*

A tela `/w/:slug/arquivadas` existe: lista, desarquiva e (com confirmação
explícita) exclui em definitivo. O drawer ainda confirma antes de arquivar —
agora por cortesia, não por falta de caminho de volta.

### L3 — Drag-and-drop não funciona por teclado
*médio · por desenho*

`draggable` do HTML5 não é acessível por teclado, e nenhuma configuração muda isso. O
caminho alternativo são as pills "MOVER PARA" do drawer, que fazem a mesma operação.
Registrado para que ninguém "conserte" adicionando `tabindex` ao card — o que daria a
impressão de acessibilidade sem entregá-la.

### L4 — Reenviar convite não existe
*baixo · por desenho*

Guardamos só o hash do token; o valor original não existe mais em lugar nenhum. Revogar e
criar outro é o caminho. Ver `decisions.md` D12.

### L5 — Sem monitoramento de erro em produção
*médio · custo, Fase 4*

`console.error` e a fronteira de erro global. Sentry adiado por custo
(`restrictions.md` § Custo). Enquanto não houver, erro de produção só aparece se o usuário
contar.

### L6 — LGPD self-service ainda não existe
*alto · Fase 4*

Exportação, exclusão com purga e registro de consentimento estão no roadmap. Até lá,
pedido de titular é atendido manualmente. Dívida consciente, registrada em
`restrictions.md` L1.

### L7 — Teste de isolamento roda em Postgres 16, produção é 15
*baixo · aceito*

`scripts/banco-efemero.sh` usa a versão instalada na máquina; o Supabase serve PG15. Nada
usado no schema é exclusivo do 16, e `supabase db reset` valida na versão real. Vale saber
que a validação local é uma aproximação.

### L8 — Realtime invalida a consulta inteira em vez de aplicar o delta
*baixo · por desenho*

Ao receber evento, o quadro refaz a consulta. É mais tráfego do que o necessário e elimina
uma classe inteira de divergência entre abas. Revisar se algum quadro passar de algumas
centenas de pautas.

---

## Riscos conhecidos, ainda não observados

### R1 — Corrida entre webhook e reconciliação no mesmo workspace
*teórico*

`aplicar_estado_assinatura` faz `select ... for update` e é uma derivação pura, então
executá-la duas vezes em paralelo converge. Não observado; registrado porque é o ponto
onde uma inconsistência de plano apareceria primeiro.

### R2 — Vercel Hobby não permite uso comercial
*administrativo*

O plano Hobby é gratuito para projetos não comerciais. No dia da primeira cobrança real, o
plano precisa mudar. Registrado aqui porque é o tipo de detalhe que só aparece quando a
conta é suspensa.
