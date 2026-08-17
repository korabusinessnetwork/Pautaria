# 01 — Arquitetura

> Decisões registradas em `docs/08_DECISOES/`. Este documento descreve o sistema como ele
> é; os ADRs explicam por que ele é assim.

## Modelo

**SPA + BaaS (Modelo A)**, com uma exceção deliberada: **toda lógica de dinheiro roda em
Edge Function**, nunca no navegador.

```
┌──────────────────────────────────────────────────────────────────────┐
│  NAVEGADOR                                                           │
│                                                                      │
│  React 18 + Vite 8 + TS                                              │
│    pages/ components/          ← nunca falam com o backend           │
│    context/ hooks/             ← estado de UI e de servidor          │
│    lib/*.service.ts            ← CAMADA DE SERVIÇOS (fronteira)      │
│         │                                                            │
│         ├── supabase-js ────────────── leitura e escrita de domínio  │
│         └── fetch(/functions/v1) ───── operações de dinheiro         │
└─────────┼───────────────────────────────────┼────────────────────────┘
          │  JWT do usuário                   │  JWT do usuário
          ▼                                   ▼
┌──────────────────────┐          ┌─────────────────────────────────┐
│  POSTGREST           │          │  EDGE FUNCTIONS (Deno)          │
│  ↓ RLS + GRANTS      │          │  service_role · ignora RLS      │
│                      │          │                                 │
│  Postgres            │◄─────────┤  assinatura-criar/portal/       │
│   tabelas + policies │          │  cancelar · asaas-webhook ·     │
│   triggers de limite │          │  assinaturas-reconciliar        │
│   funções de authz   │          │           │                     │
└──────────────────────┘          └───────────┼─────────────────────┘
                                              ▼
                                  ┌─────────────────────┐
                                  │  ASAAS (v3)         │
                                  │  fatura hospedada   │
                                  └─────────────────────┘
```

**Vercel** serve o front estático. **Supabase** hospeda banco, auth e funções. A credencial
da Asaas existe apenas em Supabase Secrets — não passa pela Vercel em momento algum.

## As quatro fronteiras

### 1. Componente ↔ backend: a camada de serviços

Nenhum componente importa `@supabase/supabase-js`. A regra é aplicada pelo ESLint
(`no-restricted-imports`), com exceção apenas para `src/lib/**`. Até o tipo `Session` é
reexportado por `auth.service.ts`.

O ganho não é purismo: é que trocar de provedor no futuro mexe em um diretório, e que toda
consulta passa por um lugar onde há contrato, validação e tratamento de erro.

### 2. Cliente ↔ banco: RLS + privilégios de coluna

Duas camadas que se cobrem:

- **RLS** decide *quais linhas* — `app.e_membro(workspace_id)`.
- **GRANT de coluna** decide *quais colunas* — `plano`, `status` e `asaas_customer_id`
  ficam fora do `grant update` de `authenticated`.

Uma política frouxa não vira escalada de privilégio, porque o Postgres recusa a coluna
antes de avaliar a linha. E os privilégios padrão do schema foram revertidos (migration
0009): **tabela nova nasce inacessível** até alguém escrever grants conscientemente.

### 3. Navegador ↔ dinheiro: as Edge Functions

O front **lê** `assinaturas` e `cobrancas` (RLS libera para dono e admin) e **pede**
mudanças chamando função. Não existe caminho do browser até uma escrita de cobrança — o
banco recusaria de qualquer forma, e o teste de isolamento prova isso a cada build.

### 4. Interno ↔ exposto: o schema `app`

Funções de autorização e regra vivem em `app`, que fica fora de `api.schemas` no
`config.toml` — o PostgREST nem publica rota para ele. O que as Edge Functions precisam
alcançar recebe uma **ponte nominal** em `public`, com `grant execute` só para
`service_role` (migration 0010).

Expor uma função interna passa a exigir escrever uma ponte, de propósito.

## Onde cada tipo de regra vive

| Tipo de regra | Onde | Por quê |
|---|---|---|
| Limite de plano | **trigger no banco** (0007) | O cliente é código na máquina do usuário |
| Autorização por papel | **RLS + funções `app.*`** | Precisa valer para toda query, não só para as que a UI faz |
| Integridade estrutural | **FK composta** (0004) | Promessa do Postgres, não código sujeito a bug |
| Estado da assinatura | **uma função** (`aplicar_estado_assinatura`) | Um único escritor de `workspaces.plano` |
| Cobrança | **Edge Function** | Precisa da chave da Asaas, que não pode existir no browser |
| Aparência e vocabulário | **tabela `oficios`** | Ofício novo é INSERT, não deploy |
| Cortesia de UI (botão desabilitado) | **`useLimites`** | Prevenir o erro; não é a garantia |

A última linha merece ênfase: `useLimites` **não aplica limite nenhum**. Ele existe para
que o usuário não clique num botão que não vai funcionar. Quem recusa é o banco.

## Estado no front

| Categoria | Ferramenta | Regra |
|---|---|---|
| Servidor | TanStack Query | Nunca duplicado em estado global manual |
| UI global | Context (`Sessao`, `Workspace`) | Sessão, tenant, tema |
| Local | `useState` | Elevar só com mais de um consumidor real |

O tema é o caso especial: o accent do ofício vira quatro variáveis CSS aplicadas em
`document.documentElement`. Trocar de ofício muda quatro strings e o app inteiro se
re-tematiza — sem prop drilling, sem re-render em cascata.

## Fluxo de dados de uma pauta movida

```
usuário arrasta o card
  └─ useQuadro.mover()
      ├─ onMutate       → cache atualizado ANTES da rede (gesto direto)
      ├─ pautas.service.moverPauta()
      │     └─ UPDATE pautas SET etapa_id, posicao
      │           ├─ GRANT de coluna: etapa_id e posicao são graváveis
      │           ├─ RLS: app.workspace_gravavel(workspace_id)
      │           └─ FK composta: a etapa é do ofício do quadro
      ├─ onError        → rollback com o estado exato de antes
      └─ Realtime       → outras abas invalidam e recarregam
```

## Fluxo de dados de um pagamento confirmado

```
Asaas → POST /functions/v1/asaas-webhook
  ├─ token verificado em tempo constante        (falha → 401 + rate limit no IP)
  ├─ evento gravado em webhook_eventos          (duplicado → 200, sem efeito)
  ├─ FATO: cobranca upsert (status confirmada)
  ├─ FATO: assinatura ativa, período estendido
  └─ DERIVAÇÃO: aplicar_estado_assinatura()     ← único escritor de workspaces.plano
        └─ workspace.plano = 'estudio', status = 'ativo', expira em ...
```

A separação entre gravar fatos e derivar estado é o que torna o reprocessamento inofensivo
e a reconciliação diária desnecessária de coordenar com o webhook.

## Ambientes

| | Local | Produção |
|---|---|---|
| Front | Vite dev server | Vercel (estático + headers de segurança) |
| Banco | `supabase start` (Docker) | Supabase (PG15) |
| Funções | `supabase functions serve` | Supabase Edge Runtime |
| Asaas | sandbox | produção |
| Segredos | `supabase/.env` (gitignored) | `supabase secrets set` |

## Migração futura para o Modelo B

Se um dia a escala justificar uma API própria, o caminho já está preparado: a camada de
serviços é a única coisa que fala com o backend. Trocar `supabase-js` por `fetch('/api')`
mexe em `src/lib/`, não na UI. A migração seria um ADR que supersede parcialmente o ADR-001.
