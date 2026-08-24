# 09 — Backlog

> Ordenado por fase do roadmap (`memory/identity.md`). Limitações conhecidas com nome e
> número vivem em `memory/bugs.md`; aqui está o que ainda não existe.

## Fase 1 — Fundação + MVP monetizável · **entregue**

- [x] Fundação documental completa (`memory/`, `docs/00`→`11`, 7 ADRs)
- [x] Banco: 10 migrations, RLS em toda tabela, FKs compostas, triggers de limite
- [x] Teste de isolamento entre tenants — 89 asserções, gate de release
- [x] Edge Functions: contratar, portal, cancelar, webhook, reconciliar
- [x] Camada de serviços + validação Zod nas duas direções
- [x] UI fiel ao handoff: abertura, quadro com drag-and-drop, tabela, drawer
- [x] Auth: cadastro, login, recuperação, nova senha
- [x] Plano e cobrança: contratação, fatura em aberto, cancelamento, histórico
- [x] Equipe: convites com token hasheado, papéis, remoção
- [x] Gate de build: falha sem env, falha com `VITE_*` não autorizada
- [x] CI com validação + varredura de segredos + banco efêmero
- [x] Modo demonstração: o front roda sem backend, com dados fixos mutáveis
- [x] Landing, termos, privacidade, configurações, arquivadas e atividade
- [x] 35 testes de componente + verificação de transbordo em 390px

### Pendente para o primeiro deploy real
- [ ] Criar projeto no Supabase, `db push`, publicar funções
- [ ] Conta Asaas de produção; webhook apontado; segredos configurados
- [ ] Agendar `assinaturas-reconciliar` (pg_cron)
- [ ] Vercel: projeto, as duas variáveis, domínio
- [ ] Rodar o checklist de `docs/11_SEGURANCA` ponta a ponta
- [ ] Sair do plano Hobby da Vercel antes da primeira cobrança real (uso comercial)

## Fase 2 — Colaboração

| Item | Por quê | Tamanho |
|---|---|---|
| **Desarquivar pela UI** | O serviço já existe; falta a tela. Enquanto não houver, arquivar é tratado como irreversível e confirma | P |
| **Comentários na pauta** | O pedido mais previsível de quem usa em time | M |
| **Feed de atividade** | `audit_log` já grava; falta exibir com os rótulos de `ROTULO_EVENTO` | P |
| **Notificação de menção/atribuição** | Depende de e-mail transacional (custo — ver restrições) | M |
| **Realtime de presença** | Ver quem está no quadro agora | P |
| **Múltiplos quadros no plano pago** | O banco já permite; falta o seletor na sidebar | P |
| **Filtros salvos** | "só o que vence esta semana", "só meus" | M |

## Fase 3 — Ofícios personalizados e exportação

| Item | Por quê | Tamanho |
|---|---|---|
| **Editor de ofício** | A promessa do ADR-003 chegando ao usuário: criar etapas, rótulos, glifo e matiz pela UI | G |
| **Reordenar etapas** | A constraint já é `deferrable`; falta a interação | M |
| **Duplicar ofício do sistema** | Caminho mais provável do usuário: partir de "Marketing" e ajustar | P |
| **Exportar CSV** | Já é flag de plano (`limites.exportar`), sem implementação | P |
| **Templates com campos preenchidos** | A coluna existe em `oficio_templates`; os seeds não usam | P |
| **Importar de CSV/Trello** | Reduz o custo de trocar de ferramenta | G |
| **Logo e nome por tenant** | `workspaces.tema.logoUrl` reservado; falta upload | M |

## Fase 4 — Segurança avançada e LGPD

| Item | Por quê | Tamanho |
|---|---|---|
| **MFA/TOTP** | Suporte previsto e desligado em `config.toml`; falta inscrição, verificação e recuperação | M |
| **Sessões ativas com revogação** | "Sair de todos os dispositivos" | M |
| **Exportar meus dados (JSON)** | Portabilidade — LGPD art. 18 | M |
| **Excluir conta com purga** | Esquecimento — LGPD art. 18. Precisa decidir o que fazer com workspaces de que a pessoa é única dona | M |
| **Registro de consentimento** | Termos e privacidade com versão e data | P |
| **Retenção e anonimização de log** | Política escrita e rotina que a aplique | P |
| **Monitoramento (Sentry)** | Hoje um erro em produção só aparece se o usuário contar. Custo ~US$ 26/mês | P |

## Fase 5 — Automação

| Item | Por quê | Tamanho |
|---|---|---|
| **Regras por evento** | "pauta entrou em Aprovação → avise no canal". Os eventos `dot.case` já existem para isso | G |
| **Webhooks de saída** | Integração genérica sem construir N conectores | M |
| **API pública com token de workspace** | Depende de decidir se vira Modelo B (ADR novo) | G |
| **Renumeração automática de posição** | `precisaRenumerar` e `renumerar` existem e estão testados; falta o gatilho | P |

## Dívida técnica reconhecida

| Item | Impacto | Onde está registrado |
|---|---|---|
| `documento.ts` duplicado entre front e Edge Function | Divergência silenciosa se um lado mudar | Comentado nos dois arquivos; testes cobrem os dois |
| Realtime invalida a consulta em vez de aplicar o delta | Tráfego a mais em quadros grandes | `memory/bugs.md` L8 |
| Teste de isolamento roda em PG16, produção é PG15 | Aproximação | `memory/bugs.md` L7 |
| Sem teste de integração das Edge Functions | Exigiria mock da Asaas ou sandbox no CI | Aqui |
| CSP com `unsafe-inline` em `style-src` | Necessário para as variáveis CSS de tema em runtime | `docs/11_SEGURANCA` |
| `npm run telas` não roda no CI | Depende de um Chromium que o runner pode não ter; hoje é gate manual | Aqui |

## Ideias sem prioridade

Vistas em quadro (calendário, linha do tempo) · subtarefas · anexos · modo escuro
(o design é claro por identidade — exigiria um segundo conjunto de tokens) · app mobile ·
ofícios da comunidade · IA sugerindo pautas a partir do histórico.

## Como priorizar aqui

1. **A north star manda.** Item que reduz o tempo até o primeiro quadro útil passa na
   frente.
2. **Bloqueio de receita vem antes de conforto.** Se algo impede alguém de pagar ou de
   convidar o time, sobe.
3. **Segurança e LGPD têm data**, não prioridade relativa — são compromissos assumidos.
4. **Consultar `memory/restrictions.md` antes.** Metade das boas ideias esbarra numa
   restrição de custo ou de produto, e descobrir isso depois de começar é retrabalho.
