# 04, Modelagem

> Fonte de verdade executável: `supabase/migrations/`. Retrato consolidado e legível:
> `supabase/schema.sql` (gerado por `scripts/gerar-schema.sh`, não editar à mão).

## Mapa

```
auth.users ──1:1── profiles
     │
     └──< workspace_members >── workspaces ─────< convites
                                    │
                                    ├──< quadros ──< pautas
                                    │        │         │
                                    │        └─────────┴──> oficios ──< oficio_etapas
                                    │                          │      ├< oficio_templates
                                    │                          │      └< oficio_exemplos
                                    │                     (workspace_id NULL = sistema)
                                    │
                                    ├──< assinaturas ──< cobrancas ──> planos
                                    └──< audit_log

  sem tenant: webhook_eventos · rate_limit        (inalcançáveis pela API)
```

## Convenções

- **Português integral.** Tabelas, colunas, enums, funções.
- **`workspace_id` em toda tabela de negócio**, com índice.
- **RLS na mesma migration da tabela.** Sem exceção "por enquanto".
- **`revoke all` → `grant` explícito**, coluna a coluna onde importa.
- Timestamps `criado_em` / `atualizado_em`; o segundo mantido por trigger, nunca pelo app.
- Soft delete onde o dado é do usuário (`arquivada_em`, `arquivado_em`).

## Tabelas

### `profiles`
Espelho de exibição de `auth.users`. Nome, e-mail, iniciais e `avatar_hue` (derivada do id
no cadastro, mesma pessoa, mesma cor, em qualquer workspace). **Sem credencial e sem
CPF**: documento fiscal só trafega para a Asaas, nunca repousa aqui.

*Visibilidade:* o próprio + quem divide algum workspace (`app.compartilha_workspace`). Não
existe diretório global de usuários.

### `workspaces`, o tenant
Identidade (`nome`, `slug`, `tema`) + estado de cobrança (`plano`, `status`,
`asaas_customer_id`, `plano_expira_em`).

**As quatro colunas de cobrança ficam fora do `grant update` de `authenticated`.** Um
`update workspaces set plano='time'` recebe *permission denied* do Postgres, antes de
qualquer lógica de aplicação. É o teste do Bloco 5 de `isolamento.sql`.

`tema` é o gancho de white-label: `{ hue, nomeExibicao, logoUrl }`.

### `workspace_members`
PK composta `(workspace_id, user_id)` + papel. Dois triggers a protegem:
`proteger_ultimo_owner` (nunca deixa o tenant órfão) e `limitar_membros` (teto do plano,
contando convites em aberto).

### `convites`
Guarda `token_hash` (SHA-256), nunca o token. A coluna **não está no grant de SELECT**,
nem o dono do workspace a lê pela API. Aceitar é RPC que compara hashes.

### `oficios` + `oficio_etapas` + `oficio_templates` + `oficio_exemplos`
A configuração que vira produto. Identidade visual guardada como `(hue, chroma)` e não
como quatro strings hexadecimais, o accent é derivado, então não existe combinação "quase
certa" (ver `docs/02_DESIGN_SYSTEM`).

Dois índices únicos **parciais** garantem a chave por escopo:
```sql
unique (chave)                where workspace_id is null      -- do sistema
unique (workspace_id, chave)  where workspace_id is not null  -- do tenant
```
Um `unique (workspace_id, chave)` simples não serviria: `NULL` nunca conflita com `NULL` no
Postgres, e nada impediria dois ofícios de sistema com a chave `mkt`.

`oficio_exemplos.prazo_dias` é **relativo**, inclusive negativo. Data absoluta envelheceria,
ninguém quer estrear o produto com cinco pautas vencidas.

### `quadros` e `pautas`

A parte mais importante da modelagem. `pautas` carrega `workspace_id` e `oficio_id`
denormalizados, e três chaves estrangeiras **compostas**:

```sql
(quadro_id, workspace_id) → quadros(id, workspace_id)   -- mesma tenant do quadro
(quadro_id, oficio_id)    → quadros(id, oficio_id)      -- mesmo ofício do quadro
(etapa_id,  oficio_id)    → oficio_etapas(id, oficio_id) -- etapa daquele ofício
```

**Por que FK e não trigger.** Trigger é código: tem bug, tem janela de corrida, pode ser
desabilitado. A FK composta é uma promessa do Postgres, não existe caminho, nem via API
nem via `psql` nem via `service_role` distraída, que crie uma pauta apontando para a etapa
de outro ofício ou o quadro de outro tenant.

**Bônus.** `workspace_id` na própria linha deixa a política de RLS ser um teste direto, sem
JOIN, na tabela mais consultada do sistema. E a FK acima é o que garante que essa coluna
não mente.

As três são `DEFERRABLE`, o que permite a `trocar_oficio_quadro` reescrever quadro e pautas
numa transação sem estado intermediário inválido.

`posicao double precision`: ordenação fracionária (ver `memory/patterns.md` PD3).

### `planos`, `assinaturas`, `cobrancas`

`planos` é catálogo: preço e `limites` como JSONB. Fonte única lida pelo front **e** pela
Edge Function, a página de preços e a cobrança real não têm como divergir.

`assinaturas.valor_centavos` é **congelado na contratação**: mudar a tabela amanhã não
altera retroativamente um contrato vigente. Índice único parcial garante no máximo uma
assinatura viva por workspace, e é ele que funciona como trava contra clique duplo no
checkout.

`cobrancas` guarda id, status, valor, vencimento e URL da fatura. **Não guarda** número de
cartão, bandeira, titular, CVV, linha digitável ou QR de Pix. É isso que mantém o projeto
no SAQ-A do PCI-DSS.

Nenhuma das duas tem política de escrita para `authenticated`. Se um dia aparecer uma, é
regressão de segurança.

### `webhook_eventos`, `rate_limit`, `audit_log`

As três de defesa. As duas primeiras têm RLS ligada e **zero políticas**, que no Postgres
significa "nega tudo". Só `service_role` alcança.

`audit_log` é append-only pela **ausência deliberada** de políticas de UPDATE e DELETE. A
coluna `origem` (`cliente` | `servidor`) fica fora do grant de INSERT do cliente: uma linha
marcada `servidor` só pode ter vindo de Edge Function. Sem isso o log seria decorativo,
qualquer usuário forjaria `assinatura.ativada`.

## View

`v_uso_workspace`, uso corrente vs. limites, para a UI desabilitar antes do clique.
Declarada com `security_invoker = true`: **sem isso ela rodaria com os privilégios de quem
a criou e devolveria o uso de todos os tenants.** Testado no Bloco 3 de `isolamento.sql`.

## Funções de autorização (`app`)

Todas `SECURITY DEFINER` com `search_path = ''` e nomes qualificados. O search_path vazio é
obrigatório: sem ele, um schema plantado no caminho de busca sequestraria a resolução de
nomes dentro de uma função com privilégio elevado.

| Função | Responde |
|---|---|
| `e_membro(ws)` | pertenço a este workspace? |
| `tem_papel(ws, papéis[])` | tenho algum destes papéis? |
| `workspace_gravavel(ws)` | posso escrever (estado do tenant)? |
| `compartilha_workspace(user)` | dividimos algum workspace? |
| `oficio_visivel/editavel(of)` | escopo do ofício |
| `limite_plano(ws, chave)` | limite numérico (`NULL` = ilimitado) |
| `recurso_liberado(ws, chave)` | flag booleana do plano |
| `aplicar_estado_assinatura(ws)` | **único escritor de `workspaces.plano`** |
| `tabelas_sem_rls()` | gate: qualquer linha reprova o deploy |

São `SECURITY DEFINER` também para evitar recursão: as políticas de `workspace_members` não
podem consultar `workspace_members` diretamente.

## Migrations

| # | Conteúdo |
|---|---|
| 0001 | schema `app`, enums, utilitários |
| 0002 | profiles, workspaces, members, convites + authz + RLS |
| 0003 | ofícios, etapas, templates, exemplos + RLS |
| 0004 | quadros, pautas + FKs compostas + RLS |
| 0005 | planos, assinaturas, cobranças + RLS |
| 0006 | audit_log, webhook_eventos, rate_limit + RLS |
| 0007 | triggers de limite de plano + `v_uso_workspace` |
| 0008 | RPCs (`criar_workspace`, `aceitar_convite`, `trocar_oficio_quadro`) + estado da assinatura |
| 0009 | endurecimento (privilégios padrão negados) + realtime |
| 0010 | pontes de serviço em `public`, só para `service_role` |

## Como validar

```bash
bash scripts/banco-efemero.sh      # Postgres descartável: migrations + seeds + isolamento
bash scripts/testar-isolamento.sh  # contra um Supabase já rodando
bash scripts/gerar-schema.sh       # regenera schema.sql após adicionar migration
```
