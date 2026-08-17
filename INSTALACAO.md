# Instalação e configuração do ambiente

Guia do zero até o Pautaria rodando localmente com assinatura funcionando na sandbox da
Asaas. Tempo estimado: 25 minutos.

## Pré-requisitos

| Ferramenta | Versão | Por quê |
|---|---|---|
| Node.js | ≥ 20.19 | Vite 8 e o toolchain de build |
| npm | ≥ 10 | Gerenciador de pacotes do projeto |
| Supabase CLI | ≥ 1.200 | Banco local, migrations e Edge Functions |
| Docker | qualquer | O `supabase start` sobe Postgres/Auth/Storage em containers |
| Deno | ≥ 1.45 (opcional) | Só para rodar/testar Edge Function fora do CLI |

```bash
node -v                                   # deve mostrar v20.19+
npm i -g supabase                         # ou: brew install supabase/tap/supabase
supabase --version
```

---

## 1. Dependências e variáveis do front

```bash
git clone https://github.com/korabusinessnetwork/Pautaria.git
cd Pautaria
npm install
cp .env.example .env.local
```

Abra `.env.local` e preencha **apenas duas variáveis**:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<a chave anon que o `supabase start` imprime>
```

> ⚠️ **Regra que não se quebra:** toda variável `VITE_*` vai para o bundle público. Se
> você precisar de um segredo, ele pertence a `supabase secrets set`, não a este arquivo.
> `SUPABASE_SERVICE_ROLE_KEY` e `ASAAS_API_KEY` em `.env.local` são incidente de
> segurança, não configuração.

---

## 2. Banco de dados local

```bash
supabase start          # sobe Postgres, Auth, Storage, Studio (leva ~1 min na 1ª vez)
supabase db reset       # aplica supabase/migrations/ + supabase/seeds/
```

O `supabase start` imprime as URLs e chaves locais. Copie a `anon key` para
`.env.local`. O Studio fica em <http://127.0.0.1:54323>.

Verifique que os 3 ofícios do sistema foram semeados:

```bash
supabase db execute "select chave, nome, hue from public.oficios where workspace_id is null order by ordem;"
# esperado: mkt / ti / prod
```

### Conferir que a RLS está de pé

Nenhuma tabela de negócio pode aparecer com `rowsecurity = false`:

```bash
supabase db execute "select tablename, rowsecurity from pg_tables where schemaname='public' order by tablename;"
```

O teste automatizado de isolamento entre workspaces roda com:

```bash
bash scripts/testar-isolamento.sh
```

---

## 3. Asaas — conta sandbox

O Pautaria **não** processa cartão: o usuário paga numa página hospedada pela Asaas.
Precisamos só de uma chave de API e de um token de webhook.

1. Crie uma conta em <https://sandbox.asaas.com> (grátis, sem CNPJ real).
2. **Configurações → Integrações → Chave de API** → gere e copie a chave
   (`$aact_hmlg_...` no sandbox).
3. **Configurações → Integrações → Webhooks** → novo webhook:
   - **URL:** `https://<SEU-PROJETO>.supabase.co/functions/v1/asaas-webhook`
   - **Token de autenticação:** invente uma string longa e aleatória e guarde — é a
     mesma que vai em `ASAAS_WEBHOOK_TOKEN`. A Asaas a envia no cabeçalho
     `asaas-access-token`, e a função rejeita qualquer requisição sem ela.
   - **Versão da API:** v3 · **Tipo de envio:** sequencial
   - **Eventos:** `PAYMENT_CREATED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`,
     `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`, `PAYMENT_DELETED`,
     `PAYMENT_CHARGEBACK_REQUESTED`, `PAYMENT_UPDATED`

Gere um token forte assim:

```bash
openssl rand -hex 32
```

---

## 4. Segredos das Edge Functions

Nunca em arquivo versionado. Em produção:

```bash
supabase secrets set ASAAS_API_KEY='$aact_hmlg_SUA_CHAVE'
supabase secrets set ASAAS_AMBIENTE='sandbox'          # 'producao' quando for pra valer
supabase secrets set ASAAS_WEBHOOK_TOKEN='<o token do passo 3>'
supabase secrets set CRON_TOKEN="$(openssl rand -hex 32)"   # agendador da reconciliação
supabase secrets set APP_URL='https://pautaria.app'

# Opcionais
supabase secrets set IP_HASH_SAL="$(openssl rand -hex 32)"  # sal do HMAC de IP no audit_log
supabase secrets set ORIGENS_PERMITIDAS='https://app.pautaria.app'
```

| Segredo | Para quê | Se faltar |
|---|---|---|
| `ASAAS_API_KEY` | autenticar na API da Asaas | assinatura não é criada |
| `ASAAS_AMBIENTE` | escolher sandbox × produção | assume `sandbox` |
| `ASAAS_WEBHOOK_TOKEN` | **autenticar o webhook** — é a única defesa daquele endpoint | webhook responde 401 a tudo |
| `CRON_TOKEN` | autenticar o agendador da reconciliação | reconciliação responde 401 |
| `APP_URL` | montar URLs de retorno e liberar CORS | assume `localhost:5173` |
| `IP_HASH_SAL` | pseudonimizar IP no `audit_log` | deriva do service key |
| `ORIGENS_PERMITIDAS` | origens extras de CORS | só `APP_URL` e localhost |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são injetadas
automaticamente pelo runtime — **não** as defina à mão.

Para desenvolvimento local das funções, crie `supabase/.env` (já ignorado pelo git):

```env
ASAAS_API_KEY=$aact_hmlg_SUA_CHAVE
ASAAS_AMBIENTE=sandbox
ASAAS_WEBHOOK_TOKEN=um-token-local-qualquer
APP_URL=http://localhost:5173
```

```bash
npm run fn:serve        # supabase functions serve --env-file supabase/.env
```

---

## 5. Subir o app

```bash
npm run dev
```

<http://localhost:5173>. Crie uma conta, escolha um ofício, e o quadro nasce populado.

---

## 6. Testar o ciclo de assinatura ponta a ponta

1. No app: **Plano → Assinar Estúdio**. A Edge Function `assinatura-criar` cria o
   cliente e a assinatura na Asaas e devolve a URL da fatura.
2. Você é levado à página hospedada da Asaas. No sandbox, pague com o cartão de teste
   `5162 3062 0000 0000` (validade futura, CVV `318`) ou marque o boleto como pago pelo
   painel do sandbox.
3. A Asaas dispara `PAYMENT_CONFIRMED` → `asaas-webhook` valida o token, grava o evento
   em `webhook_eventos` (idempotente) e ativa o plano do workspace.
4. Confira:

```bash
supabase db execute "select w.nome, w.plano, a.status, a.ciclo, a.proxima_cobranca
                     from workspaces w join assinaturas a on a.workspace_id = w.id;"
```

### Simular o webhook sem sair do terminal

```bash
curl -X POST http://127.0.0.1:54321/functions/v1/asaas-webhook \
  -H 'Content-Type: application/json' \
  -H 'asaas-access-token: um-token-local-qualquer' \
  -d '{
        "id": "evt_teste_001",
        "event": "PAYMENT_CONFIRMED",
        "payment": {
          "id": "pay_teste_001",
          "subscription": "sub_teste_001",
          "customer": "cus_teste_001",
          "value": 29.00,
          "status": "CONFIRMED",
          "dueDate": "2026-09-17",
          "billingType": "PIX"
        }
      }'
```

Reenvie o **mesmo** `id` e confirme que a segunda chamada responde `duplicado: true` sem
alterar nada — é a prova de que a idempotência está funcionando.

---

## 7. Deploy

### Supabase (banco + funções)

```bash
supabase link --project-ref <SEU-PROJECT-REF>
supabase db push
supabase functions deploy asaas-webhook --no-verify-jwt   # público: a Asaas não tem JWT
supabase functions deploy assinatura-criar
supabase functions deploy assinatura-portal
supabase functions deploy assinatura-cancelar
supabase functions deploy assinaturas-reconciliar --no-verify-jwt
```

> `--no-verify-jwt` no webhook é **obrigatório e seguro**: quem chama é a Asaas, que não
> possui JWT do Supabase. A autenticação dele é o `asaas-access-token`, verificado em
> tempo constante dentro da função. As demais funções exigem JWT e **devem** ser
> publicadas sem essa flag.

Agende a reconciliação diária (Supabase → Database → Cron, ou `pg_cron`):

```sql
select cron.schedule(
  'reconciliar-assinaturas', '0 6 * * *',
  $$ select net.http_post(
       url := 'https://<SEU-PROJETO>.supabase.co/functions/v1/assinaturas-reconciliar',
       headers := jsonb_build_object('x-cron-token', '<CRON_TOKEN>')
     ) $$
);
```

### Vercel (front)

```bash
vercel link
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
vercel --prod
```

Só essas duas variáveis. Se alguém propuser adicionar uma terceira, leia o alerta do
passo 1 antes.

---

## Antes de qualquer deploy

Rode o gate e o checklist:

```bash
npm run validar              # lint + typecheck + testes + build
npm run seguranca:audit
npm run seguranca:segredos
bash scripts/testar-isolamento.sh
```

E percorra `docs/11_SEGURANCA/README.md` § *Checklist de release*.

---

## Problemas comuns

| Sintoma | Causa provável | Correção |
|---|---|---|
| `supabase start` trava | Docker não está rodando | Suba o Docker Desktop/daemon e repita |
| App abre em branco, console diz "Missing Supabase env" | `.env.local` ausente ou não recarregado | Preencha e **reinicie** o `npm run dev` (Vite só lê env no boot) |
| Toda query volta vazia mesmo com dados no banco | RLS funcionando e usuário sem vínculo | Confirme a linha em `workspace_members` para esse usuário |
| Webhook responde 401 | Token divergente entre Asaas e `ASAAS_WEBHOOK_TOKEN` | Regenere e atualize nos dois lados |
| Webhook responde 200 mas nada muda | Evento repetido (idempotência) | Confira `webhook_eventos`; use um `id` novo no teste |
| `assinatura-criar` responde `documento_invalido` | CPF/CNPJ reprovado na validação de dígito | A Asaas exige documento válido; no sandbox use um gerador de CPF válido |
| Fonte não carrega e o console reclama de CSP | `font-src`/`style-src` alterados | Veja `vercel.json` → `Content-Security-Policy` |
