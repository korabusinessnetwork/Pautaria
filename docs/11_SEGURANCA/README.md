# 11 — Plano de segurança

> Segurança aqui é **definition-of-done**, não fase final. O checklist de release ao fim
> deste documento é gate de deploy. Restrições permanentes em `memory/restrictions.md`
> (prioridade máxima).

## Princípio

> **Prevenir o erro é melhor que reportar o erro. Falhar fechado é melhor que falhar em
> silêncio.**

Toda decisão deste documento sai daí. É por isso que o limite de plano vive no banco e não
só na UI, que uma tabela nova nasce inacessível, que o build de produção falha sem
variáveis de ambiente, e que o teste de isolamento reprova o deploy.

## O que estamos protegendo

| Ativo | Por que importa | Onde vive |
|---|---|---|
| **Isolamento entre workspaces** | Vazar dado do tenant A para o B é incidente de LGPD e perda de confiança irrecuperável | RLS + FK composta + grants |
| **Integridade da cobrança** | Um usuário se dando o plano pago é receita perdida; uma cobrança duplicada é dinheiro tirado de alguém | Edge Functions + grants de coluna + idempotência |
| **Credenciais** | `service_role` derruba a RLS de todos; a chave da Asaas emite e estorna cobrança | Supabase Secrets, nunca no bundle |
| **Dado pessoal** | Nome, e-mail, CPF/CNPJ (este só em trânsito) | LGPD, base legal: execução de contrato |
| **Trilha de auditoria** | Um log que o suspeito edita não é log | `audit_log` append-only + coluna `origem` |

## Modelo de ameaças por camada

| Camada | Ameaça | Controle | Onde |
|---|---|---|---|
| Bundle | Segredo publicado no JavaScript | Tipo fechado de `ImportMetaEnv` (erro de compilação) + plugin que aborta o build + varredura no CI | `vite-env.d.ts`, `vite.config.ts`, `scripts/checar-segredos.sh` |
| Navegador | XSS | Sem `dangerouslySetInnerHTML` (ESLint), CSP sem `unsafe-inline` em script, React escapa por padrão | `.eslintrc.cjs`, `vercel.json` |
| Navegador | Clickjacking | `frame-ancestors 'none'` + `X-Frame-Options: DENY` | `vercel.json` |
| Rede | CSRF via CORS | Origem espelhada de lista fechada; **nunca** `*` com credencial | `_shared/http.ts` |
| Rede | Dado fora de contrato | Zod na entrada **e** na saída do banco | `validacao.ts`, `validar.ts` |
| Autorização | Tenant A lê tenant B | RLS em toda tabela + teste de isolamento como gate | migrations, `isolamento.sql` |
| Autorização | Escalada de privilégio de plano | Coluna `plano` fora do `grant update` | migration 0002 |
| Autorização | Tabela nova esquecida sem RLS | Privilégios padrão revertidos + `tabelas_sem_rls()` no gate e na sentinela diária | migrations 0009, 0010 |
| Dados | Query vazando coluna sensível | `grant select` por coluna (`token_hash` inalcançável) | migrations 0002, 0005, 0006 |
| Dados | Pauta apontando para tenant alheio | FK composta, não trigger | migration 0004 |
| Negócio | Limite de plano burlado pelo console | Trigger no banco + advisory lock (contagem exata) | migration 0007 |
| Negócio | Preço manipulado no checkout | O cliente diz **qual** plano, nunca **quanto** | `assinatura-criar` |
| Negócio | Assinatura duplicada por clique duplo | Índice único parcial gravado **antes** de falar com a Asaas | migration 0005 |
| Webhook | Requisição forjada | Token comparado em **tempo constante** | `seguranca.ts` |
| Webhook | Reentrega cobrando duas vezes | `UNIQUE (provedor, evento_externo_id)` + período determinístico | migration 0006 |
| Webhook | Força bruta do token | Rate limit por IP, consumido só quando o token falha | ADR-006 |
| Segredos | Convite vazado num dump | Guardamos o SHA-256, nunca o token | migration 0002 |
| Auditoria | Log forjado pelo cliente | Coluna `origem` fora do grant de INSERT | migration 0006 |
| Observabilidade | PII em log | Sem senha, token, CPF ou payload financeiro; IP só como HMAC | `seguranca.ts` |
| Credenciais | Vazamento de sessão | JWT de 1 h, refresh rotativo, reuso derruba a família de tokens | `config.toml` |
| Credenciais | Senha fraca ou vazada | Mínimo de 10 caracteres com variedade + verificação HaveIBeenPwned | `config.toml` |

## Autenticação e sessão

```toml
jwt_expiry = 3600                    # 1 h — token vazado tem utilidade curta
enable_refresh_token_rotation = true # reuso derruba a família inteira
otp_expiry = 3600                    # link de e-mail vale 1 h, não 24
min_length = 10                      # comprimento importa mais que símbolo obrigatório
[auth.password.hibp] enabled = true  # a defesa mais eficaz contra credential stuffing
```

**Não confirmamos nem negamos e-mail.** Cadastro, login e recuperação respondem o mesmo
para conta existente e inexistente. Um formulário que distingue vira verificador de
clientes.

**Autenticação antes de renderizar**, nunca depois — `RotaProtegida` não monta a tela
protegida enquanto a sessão não é conhecida.

## Segredos

| Segredo | Onde | Nunca |
|---|---|---|
| `VITE_SUPABASE_URL` / `ANON_KEY` | bundle público | — (públicas por design) |
| `SUPABASE_SERVICE_ROLE_KEY` | runtime das Edge Functions | navegador, Vercel, git |
| `ASAAS_API_KEY` | Supabase Secrets | Vercel, `.env` do front, log |
| `ASAAS_WEBHOOK_TOKEN` | Supabase Secrets | qualquer outro lugar |
| `CRON_TOKEN` | Supabase Secrets + agendador | — |
| `IP_HASH_SAL` | Supabase Secrets | — |

**Sobre a chave `anon` estar no bundle:** ela é pública por design e não concede acesso a
nada. Quem protege os dados é a RLS. Se a RLS estiver correta, publicá-la é inofensivo; se
estiver errada, nenhuma chave secreta salvaria.

Três camadas impedem um segredo de chegar ao bundle: o tipo fechado (compilação), o plugin
de build (esteira) e `checar-segredos.sh` (CI + pré-deploy).

## Cabeçalhos HTTP

Definidos em `vercel.json`. CSP sem `unsafe-inline` em `script-src`; `unsafe-inline` em
`style-src` é necessário para as variáveis CSS de tema aplicadas em runtime — restrição
aceita e registrada.

```
Content-Security-Policy       default-src 'self'; script-src 'self'; …
                              connect-src 'self' https://*.supabase.co wss://*.supabase.co;
                              frame-ancestors 'none'; object-src 'none'
Strict-Transport-Security     max-age=63072000; includeSubDomains; preload
X-Content-Type-Options        nosniff
X-Frame-Options               DENY
Referrer-Policy               strict-origin-when-cross-origin
Permissions-Policy            camera=(), microphone=(), geolocation=(), payment=()
Cross-Origin-Opener-Policy    same-origin
```

## LGPD

**Dados tratados:** nome, e-mail, iniciais (`profiles`); CPF/CNPJ **apenas em trânsito**
para a Asaas — não repousa em nossa base; identificadores de cobrança e status.

**Base legal:** execução de contrato (art. 7º, V).

**Minimização aplicada:** não coletamos telefone obrigatório, endereço, data de nascimento
nem foto. IP é pseudonimizado por HMAC (art. 12).

**Isolamento entre tenants é requisito legal**, não só técnico — daí o gate.

**Pendências assumidas (Fase 4), registradas como dívida consciente:**
- exportação self-service dos dados;
- exclusão de conta com purga real;
- registro de consentimento e política de retenção.

Até lá, pedido de titular é atendido manualmente. Ver `memory/restrictions.md` L1.

## PCI-DSS

**Escopo: SAQ-A.** Nenhum dado de cartão é visto, transportado ou armazenado. Não existe
campo de cartão em nenhum ponto do sistema — o pagamento acontece na página hospedada pela
Asaas. Ver ADR-004.

## Resposta a incidente

1. **Detectar** — log, relato, `auditoria_rls` na reconciliação diária, ou GitHub secret
   scanning. Registrar em `memory/bugs.md` com severidade.
2. **Conter** — revogar a chave vazada (`supabase secrets set` com valor novo + rotação na
   Asaas), desabilitar a função afetada, ou suspender o tenant.
3. **Corrigir** — patch **com o teste que prova a correção**. Sem o teste, o incidente não
   está fechado.
4. **Registrar** — post-mortem curto em `memory/learnings.md`. Se muda política, abrir ADR.
5. **Prevenir** — o aprendizado vira restrição ou padrão, para não repetir.

**Se a chave da Asaas vazar:** rotacione no painel da Asaas primeiro (invalida a antiga),
depois `supabase secrets set`, depois redeploy das funções. Nessa ordem — o contrário
deixaria uma janela com a chave antiga válida e a nova em uso.

## Checklist de release — gate de deploy

### Automatizado
```bash
npm run validar              # lint + typecheck + testes + build
npm run seguranca:audit      # npm audit, severidade alta+
npm run seguranca:segredos   # varredura de segredo vazado
bash scripts/banco-efemero.sh   # migrations + seeds + isolamento (Postgres descartável)
```

- [ ] `npm run validar` passa, zero warning
- [ ] `npm audit` sem vulnerabilidade alta ou crítica
- [ ] Nenhum segredo encontrado; apenas as duas `VITE_*` autorizadas
- [ ] **Teste de isolamento: 89 asserções verdes**, incluindo `app.tabelas_sem_rls()` vazio

### Manual — banco
- [ ] Tabela nova tem RLS **e** políticas na mesma migration
- [ ] Tabela nova tem `revoke all` + grants nominais
- [ ] Coluna sensível nova ficou fora do grant de SELECT/UPDATE do cliente
- [ ] Função `SECURITY DEFINER` nova **abre com bloco de autorização explícito**
- [ ] Função nova em `public` tem `revoke all from public` antes do grant
- [ ] `bash scripts/gerar-schema.sh` rodado e `schema.sql` commitado

### Manual — aplicação
- [ ] Nenhum componente importa `@supabase/supabase-js` (ESLint garante)
- [ ] Nenhum `select *` em tabela sensível
- [ ] Toda entrada validada por Zod antes de tocar o banco
- [ ] Rota protegida verifica auth **antes** de renderizar
- [ ] Nenhum `console.log` de senha, token, CPF ou payload financeiro
- [ ] Ação destrutiva nova é reversível **ou** confirmada

### Manual — infraestrutura
- [ ] Segredos configurados em Supabase Secrets, nenhum na Vercel além das duas `VITE_*`
- [ ] `verify_jwt = true` em toda função que o app chama
- [ ] Webhook da Asaas apontando para a URL certa, com o token em acordo dos dois lados
- [ ] Reconciliação diária agendada e respondendo
- [ ] Cabeçalhos de segurança conferidos em produção (`curl -I`)

### Após o deploy
- [ ] Login, criação de workspace e criação de pauta funcionam
- [ ] `curl` no webhook com token inválido devolve **401**
- [ ] Reenvio do mesmo evento devolve `duplicado: true` sem efeito
- [ ] Nenhuma tabela nova em `auditoria_rls()`

## Roadmap de segurança

| Fase | Item | Por que ainda não |
|---|---|---|
| 4 | MFA/TOTP (obrigatório para dono do Time) | Fora do escopo aprovado da v1. Suporte já previsto em `config.toml`, desligado — ligar antes da UI criaria funcionalidade sem porta de entrada |
| 4 | Sessões ativas com revogação | Idem |
| 4 | LGPD self-service completo | Idem; hoje é manual |
| 4 | Monitoramento (Sentry) | Custo — ver `memory/restrictions.md` |
| 5 | Rotação automática de segredos | Volume ainda não justifica |
| 5 | Pentest contratado | Custo; revisar antes de cliente com due diligence |

## Verificação independente

Nada aqui vale por estar escrito. O que sustenta este documento:

- **89 asserções** em `supabase/testes/isolamento.sql`, rodando contra um Postgres real,
  encenando o ataque em vez de conferir configuração.
- **61 testes** de funções puras (`npm test`).
- **3 varreduras** automatizadas (`audit`, `segredos`, `tabelas_sem_rls`).
- **Um build que se recusa a publicar** sem configuração, ou com `VITE_*` não autorizada.
