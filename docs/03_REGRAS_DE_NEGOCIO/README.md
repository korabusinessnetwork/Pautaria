# 03 — Regras de negócio

> Document-first: a regra existe aqui antes de existir no código. Cada regra aponta onde
> está implementada, para que a divergência entre doc e código seja detectável.

## RN-01 · O ofício define o quadro

Um quadro tem exatamente um ofício. Dele derivam: colunas (etapas), rótulos dos dois campos
livres, título sugerido, accent, templates, exemplos, e os modos `mono` e `solo`.

- Ofício com `workspace_id IS NULL` é **do sistema**: visível a todos, imutável pela API.
- Ofício com `workspace_id` preenchido é **do tenant**: editável por dono/admin, disponível
  nos planos Estúdio e Time.

*Implementado em:* `oficios`, `oficio_etapas`, `oficio_templates`, `oficio_exemplos`
(migration 0003) · `src/lib/oficios.service.ts`.

## RN-02 · Trocar o ofício do quadro leva as pautas junto

Ao trocar, cada pauta migra para a etapa de **mesma ordem** no novo ofício. Se o novo tem
menos colunas, as excedentes caem na última. Nenhuma pauta é criada, apagada ou perde id.

Só dono ou admin trocam, e só em workspace gravável.

**Trocar nunca é paywall** — é o aha moment do produto (`memory/restrictions.md` P1).

*Implementado em:* `public.trocar_oficio_quadro` (migration 0008), com `set constraints all
deferred` para permitir o estado intermediário. Testado no Bloco 11 de
`supabase/testes/isolamento.sql`.

## RN-03 · O workspace é o tenant

Todo dado de negócio pendura em um workspace. Um usuário pode pertencer a vários, com
papéis distintos.

| Papel | Pode |
|---|---|
| `owner` | tudo, incluindo assinatura e exclusão do workspace. Sempre ≥ 1 |
| `admin` | membros, ofícios, quadros, troca de ofício. **Não** mexe em cobrança |
| `membro` | criar, mover, editar e arquivar pautas |

Regras estruturais:
- Quem cria o workspace vira `owner` na mesma transação (trigger `ao_criar_workspace`).
- Um workspace **nunca** fica sem owner (trigger `proteger_ultimo_owner`).
- Qualquer membro pode sair sozinho; só dono/admin removem outros.
- Uma conta possui no máximo **5** workspaces (anti-abuso).

*Implementado em:* migration 0002.

## RN-04 · Estado do workspace

| Status | Lê | Escreve | Quando |
|---|---|---|---|
| `ativo` | ✓ | ✓ | normal |
| `inadimplente` | ✓ | ✓ | pagamento atrasado, dentro da tolerância de 7 dias |
| `suspenso` | ✓ | ✗ | tolerância esgotada |
| `cancelado` | ✓ | ✗ | encerrado pelo dono |

**`inadimplente` continua gravável de propósito.** Travar o trabalho de alguém por um
atraso de dois dias é desproporcional. E nenhum estado apaga dado — suspenso é somente
leitura, nunca porta fechada.

*Implementado em:* `app.workspace_gravavel` (migration 0002).

## RN-05 · Planos e limites

| | `solo` | `estudio` | `time` |
|---|---|---|---|
| Mensal | R$ 0 | R$ 29,00 | R$ 79,00 |
| Anual | — | R$ 290,00 | R$ 790,00 |
| Quadros | 1 | ∞ | ∞ |
| Pautas por quadro | 40 | ∞ | ∞ |
| Membros | 1 | 1 | 8 |
| Ofícios próprios | ✗ | ✓ | ✓ |
| Exportar | ✗ | ✓ | ✓ |

Regras de aplicação:

1. **O limite é do banco.** Triggers de `INSERT` (migration 0007). A UI desabilita o botão
   para ser gentil; o banco recusa para ser correto.
2. **A contagem é exata.** `pg_advisory_xact_lock` por workspace serializa inserções
   concorrentes do mesmo tenant — sem isso, dois cliques simultâneos furam o teto.
3. **Membros contam convites em aberto.** Senão o dono do Solo dispara oito convites e o
   limite vira decoração.
4. **Rebaixar não apaga.** Os gatilhos são só de `INSERT`. Quem tinha 200 pautas e volta
   ao Solo continua vendo, editando e apagando as 200 — só não cria a 201ª.
5. **Preço e limite são dados** (`planos`), lidos pelo front e pela Edge Function. A página
   de preços e a cobrança real não têm como divergir.
6. **Anual ≤ 12 × mensal**, garantido por CHECK.

*Implementado em:* migrations 0005 e 0007 · `src/hooks/useLimites.ts` (cortesia de UI).

## RN-06 · Assinatura

**Contratação.** Só o dono. Requer nome e CPF/CNPJ válidos (a Asaas exige para emitir).
O corpo da requisição informa **qual** plano, nunca **quanto** custa — o valor vem da
tabela dentro da Edge Function.

Ordem: grava a assinatura local como `pendente` (o índice único parcial funciona como
trava contra clique duplo) → cria cliente e assinatura na Asaas → vincula os ids. Falha na
Asaas desfaz a linha local.

**O plano não é liberado na contratação.** Quem libera é o webhook, ao confirmar o
pagamento. Liberar antes daria o produto de graça a quem só gera boleto.

**Ciclo de vida:**

```
pendente ──confirmado──► ativa ──vencimento──► inadimplente ──+7 dias──► expirada → solo
    │                      │                        │
    └──── cancelada ◄──────┴────────────────────────┘
              │
              └─ mantém o plano até fim_periodo, depois → solo
```

**Cancelamento.** Só o dono, em um clique, sem retenção. O acesso vale até `fim_periodo`.

**Estado derivado.** `app.aplicar_estado_assinatura` é a **única** função do sistema que
escreve `workspaces.plano`. Webhook, cancelamento e reconciliação gravam fatos e chamam
ela. Testado ramo a ramo no Bloco 13 de `isolamento.sql`.

*Implementado em:* migrations 0005 e 0008 · `supabase/functions/assinatura-*`.

## RN-07 · Webhook da Asaas

Autenticado por `asaas-access-token`, comparado em **tempo constante**. Idempotente por id
de evento.

| Evento | Cobrança | Assinatura | Estende período |
|---|---|---|---|
| `PAYMENT_CREATED` / `PAYMENT_UPDATED` | pendente | — | — |
| `PAYMENT_CONFIRMED` | confirmada | ativa | ✓ |
| `PAYMENT_RECEIVED` | recebida | ativa | ✓ |
| `PAYMENT_OVERDUE` | vencida | inadimplente | — |
| `PAYMENT_REFUNDED` | estornada | cancelada | — |
| `PAYMENT_CHARGEBACK_REQUESTED` | chargeback | cancelada | — |
| `PAYMENT_DELETED` | removida | — | — |
| `SUBSCRIPTION_DELETED` | — | cancelada | — |

Semântica de resposta — importa mais do que parece:
- **200** para evento já processado, desconhecido, ou de cobrança avulsa. Devolver erro
  faria a Asaas retentar para sempre algo que nunca vai mudar de estado.
- **500** para falha nossa, para que a Asaas insista.
- **401** para token inválido, com rate limit no IP.

*Implementado em:* `supabase/functions/asaas-webhook/`.

## RN-08 · Reconciliação diária

Webhook é entrega melhor-esforço. Uma vez por dia, a reconciliação varre assinaturas com
período expirado e workspaces com `plano_expira_em` no passado, e manda o banco recalcular.

Como `aplicar_estado_assinatura` é derivação pura, rodá-la sem necessidade não tem efeito
— o que torna a reconciliação segura de repetir e dispensa coordená-la com o webhook.

Também: faxina dos baldes de rate limit e **sentinela de RLS** — se alguma tabela entrou em
produção sem RLS, o alerta sai aqui.

*Implementado em:* `supabase/functions/assinaturas-reconciliar/`.

## RN-09 · Pautas

- Título obrigatório, 1 a 200 caracteres.
- Campos livres opcionais, até 60 caracteres. **Vazio é `NULL`**, nunca o traço `—` — o
  traço é decisão de renderização e não pode virar conteúdo salvo.
- Responsável precisa ser membro do workspace. Sair do workspace **não** apaga as pautas:
  elas ficam sem responsável.
- Ordem por `posicao` fracionária; mover é UPDATE de uma linha.
- Arquivar é `arquivada_em`, não `DELETE`. A pauta some do quadro e o dado continua.
- A etapa sempre pertence ao ofício do quadro — garantido por FK composta, não por trigger.

*Implementado em:* migration 0004 · `src/lib/pautas.service.ts`.

## RN-10 · Convites

- Só dono/admin criam. Papel `owner` não se concede por convite.
- Validade de 7 dias, um convite em aberto por e-mail e workspace.
- **Guardamos o SHA-256 do token, nunca o token.** O link aparece uma vez na tela.
- Aceitar exige que o e-mail da conta autenticada bata com o convidado.
- Mensagem de erro única para inexistente, expirado, já usado ou e-mail diferente —
  distinguir ensinaria a sondar tokens.
- O limite de membros do plano continua valendo no aceite.

*Implementado em:* migrations 0002 e 0008 · `src/lib/membros.service.ts`.

## RN-11 · Auditoria

Append-only: sem política de UPDATE e sem política de DELETE, para ninguém.

A coluna `origem` separa o que o servidor afirma do que o cliente afirma. O cliente não
recebe grant nessa coluna, então todo INSERT vindo do browser cai em `'cliente'`. Uma linha
`'servidor'` só pode ter vindo de Edge Function.

Sem PII em claro. IP apenas como HMAC-SHA256 com sal do servidor.

*Implementado em:* migration 0006.
