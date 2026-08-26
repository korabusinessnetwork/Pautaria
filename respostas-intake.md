# Respostas do Intake, Pautaria

> Fonte de verdade das respostas da entrevista de fundação (skill `fundacao-de-projeto`,
> Fase 1). Toda substituição de placeholder na fundação saiu daqui.
> Data do intake: 2026-08-17 · Conduzido por: Claude Code · Decisor: Matheus (dono)

## Bloco 1, Produto e identidade

- **PRODUTO (nome + essência):** Pautaria, sistema de gestão de pautas cuja interface
  se adapta ao ofício de quem usa.
- **ESSENCIA (1 frase):** Toda pauta tem um sotaque: as etapas, os campos e o
  vocabulário do quadro se ajustam a como você trabalha, não o contrário.
- **PROBLEMA que resolve:** Ferramentas de quadro genéricas (Trello, Notion, Monday)
  entregam uma tela em branco e cobram do usuário o trabalho de inventar o fluxo. Quem
  faz marketing, quem faz software e quem organiza a própria semana têm ritmos
  incompatíveis, e todos recebem o mesmo "To do / Doing / Done". O resultado é um
  quadro configurado pela metade, abandonado em três semanas.
- **PROPOSTA de valor / diferencial:** O ofício é a configuração. Escolher "Marketing",
  "TI · Dev" ou "Produtividade" já entrega etapas, campos, terminologia, cor de destaque
  e templates prontos, zero configuração inicial. Novos ofícios são novas linhas no
  banco, não novas telas.
- **Existe código ou é do zero?** Do zero. Entrada: um handoff de design hi-fi
  (`design_handoff_pautaria`) com protótipo HTML completo, cores, tipografia,
  espaçamentos e interações são finais.

## Bloco 2, Público e escopo

- **PUBLICO_ALVO primário:** Profissionais e times pequenos (1–8 pessoas) de língua
  portuguesa que trabalham por pauta/fluxo: social media e agências pequenas, times de
  produto/dev enxutos, e profissionais autônomos organizando a própria semana.
- **PERSONAS (3):**
  1. *Rebeca, social media (agência de 4 pessoas)*, vive de calendário editorial,
     precisa saber o que está em aprovação hoje. Vocabulário: canal, campanha, roteiro.
  2. *Alan, tech lead (squad de 5)*, quer backlog → deploy num trilho só, sem o peso de
     um Jira. Vocabulário: sprint, estimativa, code review.
  3. *Matheus, autônomo*, usa sozinho, sem responsável nem avatar; quer a semana em
     quatro colunas honestas. Vocabulário: contexto, energia.
- **B2B / B2C / B2B2C:** B2B pequeno + B2C prosumer (autônomos). Venda self-service.
- **"Aha moment":** Na abertura, escolher o ofício e cair num quadro **já preenchido e
  já tematizado**, sem criar coluna, sem nomear campo. O segundo aha é trocar de ofício
  na sidebar e ver o workspace inteiro se re-tematizar sem reload.

## Bloco 3, Multi-tenant e white-label

- **MULTI_TENANT:** Multi-tenant desde já. O **workspace é o tenant**. Um usuário pode
  pertencer a vários workspaces com papéis distintos (`owner`, `admin`, `membro`).
- **WHITE_LABEL:** Sim. Nome, cores, glifo, títulos e vocabulário não são constantes de
  código: vêm do workspace (`workspaces.tema`) e do ofício (`oficios`). Um ofício novo é
  uma linha em `oficios` + suas etapas/templates, zero UI nova.
- **PLANOS:** 3 planos. A assinatura pertence ao **workspace**, nunca ao usuário, é o
  que torna o plano Time vendável.

  | Plano | Mensal | Anual | Quadros | Pautas/quadro | Membros | Ofícios próprios | Export |
  |---|---|---|---|---|---|---|---|
  | `solo` | R$ 0 | R$ 0 | 1 | 40 | 1 | não | não |
  | `estudio` | R$ 29,00 | R$ 290,00 | ∞ | ∞ | 1 | sim | sim |
  | `time` | R$ 79,00 | R$ 790,00 | ∞ | ∞ | 8 | sim | sim |

  Anual = 10 mensalidades (2 meses grátis). Free é trial permanente, não trial temporal.
  **Nota de produto:** o limite do `solo` é *1 quadro* (logo, um ofício ativo por vez),
  mas **trocar** o ofício do quadro é livre em qualquer plano, a troca de sotaque é o
  aha moment do produto e nunca é paywall.

## Bloco 4, Stack e arquitetura

- **STACK:** React 18 + Vite 8 + TypeScript + React Router v7 + TanStack Query + Zod +
  Supabase (Auth, Postgres, RLS, Realtime) + Supabase Edge Functions (Deno) + Asaas.
- **MODELO_ARQUITETURA:** Modelo A (SPA + BaaS) com exceção explícita: **toda lógica de
  dinheiro vive em Edge Function**, nunca no browser.
- **TEM_UI:** Sim, design hi-fi fechado, recriado com CSS Modules + tokens.
- **DEPLOY:** Front estático na Vercel. Banco, Auth e Edge Functions no Supabase.
  A credencial da Asaas existe **apenas** em Supabase Secrets, nunca na Vercel, nunca
  no bundle do browser.
- **SCHEMA_PATH:** `supabase/schema.sql`
- **ENV_PREFIX:** `import.meta.env.VITE_*` (somente `VITE_SUPABASE_URL` e
  `VITE_SUPABASE_ANON_KEY`; qualquer outra var no front é bug)
- **TEST_CMD:** `npm test`

## Bloco 5, Segurança e compliance

- **Trata dado pessoal/financeiro/de menores?** Dado pessoal (nome, e-mail, CPF/CNPJ para
  emissão da cobrança) e dado financeiro **por referência**, o Pautaria nunca vê,
  transporta ou armazena número de cartão. O usuário paga na página hospedada da Asaas;
  guardamos apenas identificadores (`asaas_customer_id`, `asaas_payment_id`) e status.
  Não há público de menores.
- **COMPLIANCE:** LGPD. PCI-DSS fora de escopo por construção (SAQ-A: nenhum dado de
  cartão trafega ou repousa em infraestrutura nossa).
- **Nível de isolamento entre clientes:** Rígido. RLS em **toda** tabela de negócio, com
  teste automatizado de isolamento entre dois workspaces como gate de release.
- **Escopo de segurança aprovado para a v1 (decisão do dono):** *Base obrigatória*,
  RLS + teste de isolamento; Zod em toda fronteira; webhook Asaas com verificação de
  token em tempo constante + idempotência por evento; nenhum segredo no front; CSP e
  cabeçalhos de segurança; audit log append-only; `.env` fora do git + secret scanning.
  - *Incluído além do escopo, por custo marginal zero:* rate limiting nas Edge Functions
    (o webhook e o checkout são endpoints públicos; deixá-los sem limite anularia os
    controles acima). Registrado em ADR-006.
  - *Adiado e documentado no roadmap:* MFA/TOTP, gestão de sessões ativas e a esteira
    completa de LGPD (exportação, purga, registro de consentimento), ver
    `docs/11_SEGURANCA/README.md` §Roadmap.

## Bloco 6, Custo

- **FASE_CUSTO:** Bootstrap pré-receita, tudo em tier gratuito por padrão.
- **Serviços pagos já aprovados:** Asaas (sem mensalidade; cobra por transação
  liquidada, só há custo quando há receita). Supabase Free, Vercel Hobby, GitHub Free.
  Sentry, WAF pago e pentest contratado: adiados por padrão.

## Bloco 7, Design

- **Identidade visual definida?** Sim, fechada e hi-fi. Base papel quente (`#F2EFE7`),
  tinta `#1F1B16`, superfícies `#FBFAF6`/`#FFFDF8`; accent em OKLCH derivado do ofício
  (`oklch(60% C H)` + variantes soft/faint/deep). Space Grotesk (display), Instrument
  Sans (UI), `ui-monospace` (etiquetas e chips de TI).
- **Referências / tom visual:** "Studio pinboard", papel quente, cards como fichas
  alfinetadas (pino de 7px no topo), etiquetas de etapa como fita adesiva torta
  (`rotate(-1.2deg)`), grade de pontos ao fundo.
- **Contexto de uso crítico:** Desktop primeiro (quadro kanban com drag-and-drop);
  mobile precisa ler e mover pauta sem drag.
- **PRINCIPIO_N1:** INTUITIVIDADE, usar sem treinamento e sem configurar nada antes de
  ver valor.

## Roadmap inicial

- **FASE_ATUAL:** Fase 1, Fundação + MVP monetizável (auth, workspace, quadro/tabela,
  ofícios, assinatura Asaas ativa, limites de plano aplicados no banco).
- **Próximas fases:**
  - Fase 2, Colaboração: convites, papéis na UI, realtime multi-usuário, comentários.
  - Fase 3, Ofícios personalizados (editor de etapas/campos/templates) e export.
  - Fase 4, Segurança avançada: MFA/TOTP, sessões ativas, LGPD self-service completo.
  - Fase 5, Automação por evento (`pauta.movida` → notificação/integração).
