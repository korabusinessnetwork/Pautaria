# Restrições — Pautaria

> **Prioridade máxima.** Nada neste arquivo se flexibiliza sem ADR de exceção assinado
> pelo dono. Em conflito com qualquer outro documento, este vence.

## Objetivo
Registrar os limites inegociáveis do projeto — segurança, custo, legais, técnicos e de
produto — que qualquer decisão precisa respeitar sem exceção silenciosa.

## Contexto
O projeto está em bootstrap pré-receita e trata dado pessoal e cobrança recorrente. As
duas coisas produzem decisões que parecem locais e não são: uma variável de ambiente a
mais no front publica um segredo; um serviço pago "só para testar" vira custo fixo. Este
arquivo existe para que essas decisões precisem passar por alguém.

## Regras Gerais
- Toda restrição tem categoria: `segurança`, `custo`, `legal`, `técnica`, `produto`.
- Restrição de custo exige: valor aproximado, alternativa gratuita avaliada, e
  recomendação de timing (agora × depois). A decisão final é do dono.
- Restrições não expiram sozinhas. Saem daqui só por decisão explícita registrada.

## Validações
- Restrição legal exige referência à norma aplicável.
- Restrição de segurança exige o vetor concreto que ela fecha — "boa prática" não basta.

## Permissões
- Qualquer pessoa propõe; só o dono (Matheus) remove ou flexibiliza.

## Exceções
- Em ambiente local, uma restrição de custo pode ser suspensa com a tag `[SUSPENSA-DEV]`
  e prazo. Restrição de segurança **não** admite suspensão local.

## Auditoria
- Categoria, autor e data obrigatórios em cada entrada.

## Eventos
- `restriction.added` · `restriction.lifted` · `restriction.violated`

## Configurações Futuras
- Hook de CI que alerta quando um PR toca área com restrição ativa.

## Casos de Uso
- Antes de adicionar dependência, variável de ambiente, serviço externo ou tabela nova.
- Em revisão de código de qualquer arquivo sob `supabase/` ou `src/lib/`.

## Critérios de Aceite
- [ ] Categoria definida
- [ ] Se custo: valor aproximado + alternativa gratuita
- [ ] Se segurança: o vetor concreto que ela fecha
- [ ] Autor e data

---

## Segurança

### S1 — Só duas variáveis `VITE_*` existem
`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Qualquer terceira é bug de segurança.
**Vetor:** tudo que começa com `VITE_` é embutido literalmente no JavaScript público; um
`VITE_ASAAS_API_KEY` seria lido por qualquer visitante em segundos.
**Como está aplicada:** tipo fechado em `src/vite-env.d.ts` (erro de compilação), plugin
`exigirAmbiente` em `vite.config.ts` (build abortado) e `scripts/checar-segredos.sh` (CI).
*Categoria: segurança · Matheus · 2026-08-17*

### S2 — `service_role` nunca no navegador
A chave com bypass de RLS existe apenas em Edge Function.
**Vetor:** ela deriva todas as políticas de RLS como se não existissem — um vazamento dela
expõe o banco inteiro de todos os tenants.
*Categoria: segurança · Matheus · 2026-08-17*

### S3 — A credencial da Asaas vive só em Supabase Secrets
Não na Vercel, não em `.env` do front, não em log.
**Vetor:** com a chave da Asaas se emite e se estorna cobrança em nome da conta.
*Categoria: segurança · Matheus · 2026-08-17*

### S4 — RLS é definition-of-done de tabela
Tabela nova nasce com RLS e políticas na **mesma migration**. Tabela sem RLS não vai a
produção — `app.tabelas_sem_rls()` reprova o gate.
**Vetor:** sem RLS, `anon` lê a tabela inteira pela API REST do PostgREST.
*Categoria: segurança · Matheus · 2026-08-17*

### S5 — Nenhuma escrita de cobrança pelo cliente
`assinaturas`, `cobrancas`, `webhook_eventos` e as colunas `plano`/`status`/
`plano_expira_em` de `workspaces` não têm grant de escrita para `authenticated`.
**Vetor:** o ataque mais óbvio de um SaaS é o usuário se dar o plano pago.
*Categoria: segurança · Matheus · 2026-08-17*

### S6 — Webhook autenticado em tempo constante e idempotente
Comparação byte a byte de tempo fixo + `UNIQUE` por id de evento.
**Vetor:** comparação com `===` vaza o token por medição de tempo; sem idempotência, uma
reentrega da Asaas estende o período pago duas vezes.
*Categoria: segurança · Matheus · 2026-08-17*

### S7 — Nada de dado de cartão em nenhum ponto do sistema
Sem checkout próprio, sem tokenização, sem campo de cartão. O pagamento acontece na página
hospedada pela Asaas.
**Vetor:** um campo de cartão nosso arrastaria o projeto para fora do SAQ-A do PCI-DSS e
criaria o pior tipo de incidente possível para um produto deste porte.
*Categoria: segurança/legal · Matheus · 2026-08-17*

### S8 — Sem log de dado pessoal ou financeiro em claro
Nem senha, nem token, nem CPF/CNPJ, nem payload de pagamento. IP só como HMAC.
*Categoria: segurança/legal · Matheus · 2026-08-17*

### S9 — `select *` proibido em tabela sensível
`profiles`, `assinaturas`, `cobrancas`, `audit_log`, `webhook_eventos` — sempre campos
explícitos. Onde a coluna é realmente sensível (`convites.token_hash`), o grant de coluna
já a torna inalcançável.
*Categoria: segurança · Matheus · 2026-08-17*

## Legais

### L1 — LGPD aplicável
Tratamos nome, e-mail e CPF/CNPJ (este último apenas trafegando para a Asaas, nunca
armazenado por nós). Base legal: execução de contrato.
**Pendências assumidas para a Fase 4:** exportação self-service, exclusão com purga e
registro de consentimento. Enquanto não existirem, atendimento a pedido de titular é
manual — e essa é uma dívida consciente, não um esquecimento.
*Categoria: legal · Matheus · 2026-08-17*

### L2 — Isolamento entre tenants é requisito legal, não só técnico
Um vazamento de dado do workspace A para o B é incidente de LGPD, com dever de
comunicação. Por isso o teste de isolamento é gate de release e não sugestão.
*Categoria: legal · Matheus · 2026-08-17*

## Custo (fase bootstrap pré-receita)

**Regra:** tudo pago é adiado por padrão. Ao esbarrar num custo, apresentar valor
aproximado, alternativa gratuita, impacto e recomendação — o dono decide.

### Aprovado
| Serviço | Custo | Observação |
|---|---|---|
| Supabase Free | R$ 0 | 500 MB de banco, 50 mil MAU. Suficiente até ~centenas de workspaces |
| Vercel Hobby | R$ 0 | Front estático. Atenção ao limite de uso comercial do plano Hobby |
| GitHub Free | R$ 0 | Repo privado, Actions, secret scanning, Dependabot |
| Asaas | **sem mensalidade** | Cobra por transação liquidada. Só há custo quando há receita — foi o motivo da escolha |

### Adiado
| Item | Custo estimado | Alternativa gratuita em uso | Quando revisar |
|---|---|---|---|
| Sentry (monitoramento) | ~US$ 26/mês | `console.error` + fronteira de erro global | Ao passar de ~50 workspaces pagantes |
| WAF pago / Cloudflare Pro | ~US$ 20/mês | Rate limit próprio nas Edge Functions + CSP | Se houver abuso real medido |
| Pentest contratado | R$ 8–25 mil | Teste de isolamento automatizado + `npm audit` + revisão | Antes de vender para cliente com due diligence |
| E-mail transacional próprio (Resend/Postmark) | ~US$ 20/mês | E-mails do Supabase Auth | Quando precisar de e-mail de produto, não só de auth |
| Domínio + certificado | ~R$ 60/ano | domínio `.vercel.app` | No lançamento público |

*Categoria: custo · Matheus · 2026-08-17*

## Técnicas

### T1 — Dependência crítica com versão fixada
Sem `latest`, sem `^` em biblioteca que toca autenticação, dados ou build. Atualização é
ato deliberado, com `npm audit` limpo depois.
*Categoria: técnica · Matheus · 2026-08-17*

### T2 — Nenhum componente importa o cliente Supabase
Todo acesso a backend passa por `src/lib/*.service.ts`. Aplicado pelo ESLint
(`no-restricted-imports`), não por combinado verbal.
*Categoria: técnica · Matheus · 2026-08-17*

### T3 — CSS fora do JSX
CSS Modules co-localizados. Estilo inline no componente quebra o white-label, que depende
de trocar tokens sem tocar em marcação.
*Categoria: técnica · Matheus · 2026-08-17*

### T4 — Sem `any`, sem `dangerouslySetInnerHTML`
Ambos barrados pelo ESLint. O segundo é o vetor de XSS mais comum em React.
*Categoria: técnica/segurança · Matheus · 2026-08-17*

## Produto

### P1 — Trocar de ofício nunca é paywall
É o aha moment do produto. Limitar quantos quadros existem é legítimo; cobrar para trocar
o sotaque de um quadro seria cobrar pela única coisa que torna o Pautaria diferente.
*Categoria: produto · Matheus · 2026-08-17*

### P2 — Nada de marca, cor, etapa ou rótulo hardcodado
Um ofício novo é um `INSERT`. Um `if (oficio === 'ti')` em componente é regressão de
arquitetura, não atalho.
*Categoria: produto · Matheus · 2026-08-17*

### P3 — Rebaixar plano não apaga dado
Os gatilhos de limite são todos de `INSERT`. Quem tinha 200 pautas e volta ao Solo
continua vendo, editando e apagando as 200 — só não cria a 201ª.
*Categoria: produto/ético · Matheus · 2026-08-17*

### P4 — Cancelamento em um clique, com acesso até o fim do período pago
Sem fluxo de retenção, sem telefone, sem "fale com o suporte".
*Categoria: produto/ético · Matheus · 2026-08-17*
