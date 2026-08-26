# Pautaria

**Toda pauta tem um sotaque.**

Sistema de gestão de pautas cuja interface se adapta ao **ofício** de quem usa. Escolher
"Marketing", "TI · Dev" ou "Produtividade" já entrega etapas, campos, terminologia, cor
de destaque e templates prontos, sem tela de configuração no meio do caminho.

> Ferramentas de quadro genéricas entregam uma tela em branco e cobram do usuário o
> trabalho de inventar o fluxo. O Pautaria inverte isso: o ofício **é** a configuração.

## Visão de 30 segundos

| | |
|---|---|
| **O que é** | SaaS multi-tenant de quadros (kanban + tabela) configurados por ofício |
| **Para quem** | Profissionais e times de 1–8 pessoas: social media, squads de produto, autônomos |
| **Modelo** | Assinatura recorrente via **Asaas**. `solo` grátis · `estudio` R$ 29/mês · `time` R$ 79/mês |
| **Stack** | React 18 + Vite 8 + TypeScript · Supabase (Auth/RLS/Realtime) · Edge Functions (Deno) · Vercel |
| **Tenant** | O **workspace** é o tenant. A assinatura pertence ao workspace, nunca ao usuário |

## Como o produto se adapta

Todo o comportamento deriva de linhas no banco, não de `if` no código:

```
oficio ──┬── identidade visual   (glifo, hue, chroma → accent OKLCH)
         ├── titulo do quadro    ("Pauta de conteúdo", "Pauta do time", "Minha semana")
         ├── etapas              (colunas do kanban, ordenadas)
         ├── campo1 / campo2     (rótulos dos campos livres do card)
         ├── templates           (pautas de 1 clique)
         └── modo                (mono: chips em fonte monoespaçada · solo: esconde responsável)
```

Um ofício novo é uma linha em `oficios` + suas etapas e templates. **Zero UI nova.**

## Rodando localmente

Passo a passo completo, incluindo Supabase, Edge Functions e sandbox da Asaas, em
**[INSTALACAO.md](./INSTALACAO.md)**. Versão curta:

```bash
npm install
cp .env.example .env.local     # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
supabase start && supabase db reset
npm run dev
```

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento (Vite) |
| `npm run build` | Typecheck + build de produção |
| `npm test` | Testes (Vitest) |
| `npm run lint` | ESLint, zero warning tolerado |
| `npm run validar` | **Gate de release:** lint + typecheck + testes + build |
| `npm run seguranca:audit` | `npm audit` a partir de severidade alta |
| `npm run seguranca:segredos` | Varre o repositório por segredo vazado |
| `npm run db:reset` | Recria o banco local a partir das migrations + seeds |
| `npm run fn:deploy` | Publica as Edge Functions |

## Mapa do repositório

```
CLAUDE.md              Constituição do projeto, leia antes de mudar qualquer coisa
respostas-intake.md    O que foi decidido na fundação, e por quê

memory/                Governança: identidade, decisões, padrões, restrições, bugs
docs/00_ … 11_         Documentação document-first, visão → segurança
  08_DECISOES/         ADRs: toda decisão de arquitetura, com alternativas descartadas
  11_SEGURANCA/        Modelo de ameaças + checklist de release (gate de deploy)

supabase/
  schema.sql           Fonte de verdade do banco (o alvo das migrations)
  migrations/          Migrations versionadas, RLS na mesma migration da tabela
  functions/           Edge Functions (Deno): tudo que envolve dinheiro
  seeds/               Ofícios do sistema e dados de exemplo

src/
  lib/                 CAMADA DE SERVIÇOS, único ponto que fala com o backend
  context/             Sessão, workspace e tema (estado global de UI)
  hooks/               Hooks de dados e de regra de plano
  components/          UI por feature + shared/
  pages/               Rotas
  styles/              Tokens e CSS Modules (CSS sempre fora do JSX)
```

## Segurança em uma tela

O perímetro sensível é pequeno de propósito:

- **Nada de dinheiro roda no browser.** Criar, cancelar e reconciliar assinatura são
  Edge Functions. O front só lê o estado resultante.
- **A chave da Asaas existe só em Supabase Secrets**, nunca na Vercel, nunca no bundle.
- **RLS em toda tabela de negócio**, com teste automatizado de isolamento entre dois
  workspaces como gate de release.
- **Limite de plano é regra de banco** (trigger), não só de UI. A UI desabilita para ser
  gentil; o banco recusa para ser correto.
- **Webhook da Asaas** verifica token em tempo constante e é idempotente por ID de
  evento, reentrega não cobra nem ativa duas vezes.

Plano completo, modelo de ameaças e checklist de release: **[docs/11_SEGURANCA](./docs/11_SEGURANCA/README.md)**.

## Licença

Proprietário, Kora Business Network. Todos os direitos reservados.
