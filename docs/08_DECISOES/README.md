# 08 — Decisões de arquitetura (ADRs)

> Decisão sem ADR é decisão perdida. Um ADR registra **o porquê** de uma escolha
> estrutural, no momento em que ela é tomada, com as alternativas descartadas e as
> consequências ruins — para que alguém daqui a um ano entenda sem reconstruir o
> raciocínio.

## Índice

| # | Título | Status |
|---|---|---|
| [001](./adr-001.md) | Stack: React + Vite + Supabase, com dinheiro em Edge Function | Aceito |
| [002](./adr-002.md) | O workspace é o tenant; isolamento por RLS **e** privilégio de coluna | Aceito |
| [003](./adr-003.md) | O ofício é dado, não código | Aceito |
| [004](./adr-004.md) | Asaas com fatura hospedada; sem checkout próprio | Aceito |
| [005](./adr-005.md) | Estado da assinatura derivado por uma única função | Aceito |
| [006](./adr-006.md) | Rate limiting incluído além do escopo aprovado | Aceito |
| [007](./adr-007.md) | Negar por omissão: privilégios padrão revertidos e pontes de serviço | Aceito |

## Quando escrever um ADR

Se **qualquer** item for verdadeiro:

- Muda a arquitetura geral (camadas, onde a lógica vive, front × backend)
- Muda a stack (framework, banco, provedor de auth, hosting)
- Muda o modelo de dados de forma estrutural (não é adicionar coluna — é mudar como o
  isolamento ou o relacionamento central funciona)
- Envolve trade-off que alguém vai questionar depois
- Contradiz ou substitui uma decisão já registrada
- Tem custo recorrente ou dependência de terceiro difícil de reverter
- Afeta múltiplos módulos e não se reverte com `git revert`

**Não** é ADR: nome de variável, estrutura de pasta, correção de bug, copy de botão. Isso é
`memory/patterns.md`, `memory/bugs.md` ou `memory/decisions.md`.

Regra prática: se "alguém vai perguntar por que fizemos assim daqui a 6 meses, e a resposta
não está óbvia olhando o código" for sim, é ADR.

## Ciclo de status

**Proposto** → **Aceito** → **Supersedido**.

Um ADR supersedido **não é apagado nem reescrito**: fica como registro histórico, com
`Supersedido por:` apontando o novo. Supersessão parcial é explicitada no corpo — qual
parte continua valendo e qual saiu.

Numeração sequencial, três dígitos, **imutável**. Nunca renumerar, nem quando rejeitado.

Copie de [`adr-000-template.md`](./adr-000-template.md).
