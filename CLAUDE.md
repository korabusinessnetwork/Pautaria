# Diretrizes de Desenvolvimento — Pautaria

> Constituição do projeto. Precede qualquer preferência pessoal, hábito de stack ou
> conveniência de implementação. Gerada na fundação (skill `fundacao-de-projeto`) a
> partir de `respostas-intake.md`.

## Princípio nº 1 — INTUITIVIDADE (inegociável)

O foco principal do sistema é **entregar um quadro útil antes de o usuário configurar
qualquer coisa**. O Pautaria existe porque a tela em branco mata o quadro: se o usuário
precisa nomear colunas, inventar campos ou ler um tutorial antes de ver valor, o produto
falhou — mesmo que a feature "funcione". Em qualquer decisão, priorize este princípio
acima de conveniência técnica.

Regras práticas:

- **O ofício é a configuração.** Escolher o ofício já entrega etapas, campos,
  terminologia, accent e templates. Nenhuma tela de setup entre a escolha e o quadro.
- **Vocabulário do usuário, nunca o do banco.** A UI diz "pauta", "etapa", "prazo" —
  não "record", "status", "due_date". Rótulos de campo vêm do ofício (`Canal`,
  `Sprint`, `Contexto`), nunca de string fixa no componente.
- Estados sempre visíveis: carregando, erro, vazio e sucesso com feedback humano. Coluna
  vazia diz "solte uma pauta aqui" — não fica muda.
- **Prevenção de erro > mensagem de erro.** Botão que estouraria o limite do plano nasce
  desabilitado com o motivo à vista; não deixe o usuário clicar para receber um "não".
- Consistência total com o design system (`docs/02_DESIGN_SYSTEM/`). O handoff hi-fi é
  final: cor, tipografia, espaçamento e microinteração não são reinterpretados.
- Toda ação destrutiva (arquivar pauta, cancelar assinatura, remover membro) é
  reversível ou confirmada — nunca as duas coisas ausentes.

## Fonte de verdade (leia antes de qualquer mudança relevante)

- **`memory/`** — identidade, decisões, padrões, aprendizados, restrições e bugs.
  **Consultar antes de decisões de produto/arquitetura.** `memory/restrictions.md` tem
  prioridade máxima e só se flexibiliza por ADR de exceção.
- **`docs/`** — visão (`00_`), arquitetura (`01_`), design system (`02_`), regras de
  negócio (`03_`), modelagem (`04_`), fluxos (`05_`), componentes (`06_`), contrato das
  APIs (`07_`), ADRs (`08_`), backlog (`09_`), prompts (`10_`) e o plano de segurança
  (`11_`).
- **ADR-001** define a stack vigente. Toda decisão de arquitetura mora em
  `docs/08_DECISOES/` — decisão sem ADR é decisão perdida.
- Schema do banco: `supabase/schema.sql`. É a fonte de verdade; as migrations são o
  caminho até ele.
- Se doc e código conflitarem, **a documentação prevalece** — e deve ser corrigida
  quando estiver errada.
- **Produto = SaaS multi-tenant white-label.** O **workspace é o tenant**. Todo código
  novo assume múltiplos workspaces e identidade vinda do tenant: nada de marca, cor,
  nome de cliente, etapa ou rótulo de campo hardcodado. Um ofício novo é uma linha em
  `oficios` — nunca um `if` no componente.

## Processo de trabalho

1. **Planejar tudo antes de executar** — escopo fechado, sem retrabalho. Feature nova
   começa por `docs/03_REGRAS_DE_NEGOCIO/`, não por componente.
2. **Documentar antes de codar** (document-first): a regra de negócio e a modelagem
   existem no doc antes de existirem no código.
3. Builds multi-parte → fan-out paralelo com **dono exclusivo por arquivo** (dois
   agentes nunca tocam o mesmo arquivo). Tarefa de peça única não ganha fan-out.
4. **Sintetizar e validar no fim** — revisar cada entrega, rodar `npm run validar`
   (typecheck + lint + testes + build) antes de considerar pronto.
5. Toda tabela nova nasce com RLS na mesma migration. Tabela sem RLS não vai a produção.

## Custo — priorizar o gratuito (bootstrap pré-receita)

Enquanto o projeto está em construção/pré-receita, **use sempre meios gratuitos**. Toda
implementação que exija investimento é **adiada por padrão**, salvo decisão explícita do
dono. Ao esbarrar em algo pago, apresente: custo aproximado, alternativa gratuita,
impacto e recomendação (agora × depois) — o dono decide. Detalhes e o inventário atual
em `memory/restrictions.md`.

Aprovado hoje: Supabase Free, Vercel Hobby, GitHub Free, Asaas (sem mensalidade — custo
só por transação liquidada). Adiado: Sentry, WAF pago, pentest contratado.

## Segurança (obrigatório em todo código novo)

Segurança aqui é **definition-of-done**, não fase final. Plano completo em
`docs/11_SEGURANCA/`; o checklist de release é gate de deploy.

- **Nunca** hardcodar chave, URL de API, secret ou senha — só `import.meta.env.VITE_*`
  no front, e lá só cabem `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. **Qualquer
  outra variável `VITE_*` é bug de segurança**: tudo que começa com `VITE_` vai para o
  bundle público.
- **Nunca** expor `service_role` (ou qualquer credencial com bypass de RLS) a código que
  roda no navegador. Ela existe só em Edge Function.
- **A credencial da Asaas vive apenas em Supabase Secrets.** Não na Vercel, não no
  `.env` do front, não em log.
- **Nunca** `select *` em tabela sensível (`profiles`, `assinaturas`, `cobrancas`,
  `audit_log`, `webhook_eventos`) — sempre campos explícitos.
- **Sempre** validar input com Zod na fronteira, antes de qualquer operação no banco.
  Dado fora do contrato é rejeitado explicitamente, não "corrigido" no meio do caminho.
- **Nunca** logar senha, token, CPF/CNPJ ou payload financeiro em texto claro.
- **Sempre** verificar autenticação antes de renderizar rota protegida — e autorização
  (papel no workspace) antes de qualquer escrita.
- **Lógica de dinheiro não roda no cliente.** Criar/cancelar assinatura, aplicar plano e
  processar webhook são Edge Functions. O front só *lê* o estado resultante.
- Limite de plano é regra de **banco** (trigger + RLS), não só de UI. A UI desabilita
  para ser gentil; o banco recusa para ser correto.
- Ao criar tabela ou função nova, **avise explicitamente** que a RLS precisa ser
  configurada e validada — não assuma que alguém lembra depois.

## Padrões de código

- Componentes React em arquivos separados, um componente por arquivo, **CSS fora do
  JSX** (CSS Modules co-localizado) — estilo desacoplado da marcação, para white-label.
- Nomes de **domínio em português** (`criarPauta`, `moverPauta`, `oficio`, `quadro`);
  padrões técnicos em inglês (`handleSubmit`, `useEffect`, `onDragStart`). O schema do
  banco é integralmente em português.
- **Camada de serviços obrigatória:** nenhum componente importa o cliente Supabase
  direto. Todo acesso a backend passa por `src/lib/*.service.ts`. Trocar de provedor
  deve mexer só ali.
- **Envelope de resposta consistente:** `{ data, error }` com código de erro estável
  (string) + mensagem legível em português. Falha nunca é silenciada.
- Erros de backend sempre tratados com checagem de `.error`; erro inesperado sobe para a
  fronteira de erro global (`ErrorBoundary`).
- **Eventos de domínio em `dot.case`**, substantivo + passado: `pauta.criada`,
  `pauta.movida`, `assinatura.ativada`, `membro.removido`. Constantes em
  `src/constants/eventos.ts`.
- Log de atividade é **fire-and-forget** — nunca bloqueia nem derruba a operação
  principal.
- Estado: servidor via TanStack Query (nunca duplicado em estado global manual); UI
  global via Context (sessão, workspace, tema); local no componente. Elevar estado só
  com mais de um consumidor real.
- Funções puras (`src/utils/`) nascem com teste. Rode `npm test` antes de commitar.
- Dependência crítica com versão fixada — sem `latest`, sem `^` em lib de segurança.

## Stack

- React 18 + Vite 8 + TypeScript (strict)
- React Router v7 · TanStack Query v5 · Zod
- Supabase: Auth, Postgres com RLS, Realtime
- Supabase Edge Functions (Deno) — toda lógica sensível (Asaas, planos, webhook)
- Asaas — assinaturas recorrentes (sem checkout próprio; página hospedada)
- CSS Modules + tokens em `src/styles/tokens.css`
- Vitest + Testing Library
- Deploy: Vercel (front estático) + Supabase (dados e funções)
