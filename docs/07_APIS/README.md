# 07, Contrato das APIs

Três superfícies: **PostgREST** (dados de domínio, protegido por RLS + grants), **Edge
Functions** (tudo que envolve dinheiro) e **RPC** (operações atômicas ou que precisam de
privilégio).

## Envelope

Toda Edge Function responde no mesmo formato:

```json
{ "data": { … }, "error": null }
{ "data": null, "error": { "codigo": "plano_ja_ativo", "mensagem": "…" } }
```

`codigo` é a parte **estável** do contrato, o front decide comportamento por ele.
`mensagem` é para o humano e pode mudar sem quebrar nada. Casar erro por texto é o tipo de
acoplamento que quebra silenciosamente na primeira revisão de copy.

### Códigos e status

| Código | HTTP | Significa |
|---|---|---|
| `nao_autenticado` | 401 | sem JWT válido, ou token de webhook/cron inválido |
| `sem_permissao` | 403 | autenticado, papel insuficiente |
| `entrada_invalida` | 422 | falhou o schema Zod |
| `documento_invalido` | 422 | CPF/CNPJ com dígito errado (código próprio: o front destaca o campo) |
| `nao_encontrado` | 404 | inexistente **ou** invisível para quem pediu, não distinguimos |
| `plano_ja_ativo` | 409 | já existe assinatura viva no workspace |
| `plano_inexistente` | 422 | plano fora do catálogo, ou gratuito |
| `assinatura_inexistente` | 404 | nada a pagar ou cancelar |
| `limite_de_requisicoes` | 429 | rate limit |
| `erro_no_provedor` | 502 | a Asaas recusou ou não respondeu |
| `corpo_grande_demais` | 413 | acima de 256 KB |
| `metodo_nao_suportado` | 405 | use POST |
| `erro_interno` | 500 | falha nossa |

`erro_interno` **nunca** carrega stack trace. Vazar estrutura interna numa API de cobrança
é entregar o mapa da casa.

## CORS

Origem espelhada a partir de lista fechada (`APP_URL` + localhost + `ORIGENS_PERMITIDAS`).
Origem desconhecida não recebe cabeçalho de CORS algum.

**`Access-Control-Allow-Origin: *` seria mais simples e estaria errado:** estas funções
recebem o JWT no cabeçalho `Authorization`, e um curinga autorizaria qualquer site a fazer
o navegador de alguém logado disparar chamadas autenticadas.

---

## Edge Functions

### `POST /functions/v1/assinatura-criar` · JWT · dono

```jsonc
// entrada
{ "workspaceId": "uuid", "plano": "estudio" | "time",
  "ciclo": "mensal" | "anual", "nomeCobranca": "…",
  "documento": "CPF ou CNPJ", "telefone": "opcional" }

// saída
{ "assinaturaId": "uuid", "plano": "estudio", "ciclo": "mensal",
  "valorCentavos": 2900,
  "urlPagamento": "https://.../i/…",   // null se a Asaas ainda não gerou
  "aguardandoFatura": false }
```

**Não existe campo de valor na entrada.** O preço é lido de `planos` dentro da função,
aceitá-lo do cliente seria deixá-lo assinar o Time por um centavo.

Rate limit: 5/h por usuário. Erros: `sem_permissao`, `plano_ja_ativo`,
`documento_invalido`, `erro_no_provedor`.

### `POST /functions/v1/assinatura-portal` · JWT · dono ou admin

```jsonc
{ "workspaceId": "uuid" }
→ { "plano": "estudio", "ciclo": "mensal", "status": "inadimplente",
    "valorCentavos": 2900, "proximaCobranca": "2026-09-17",
    "fimPeriodo": "2026-09-17T00:00:00Z",
    "urlPagamento": "https://…", "vencimento": "2026-08-17" }
```

Consulta a Asaas ao vivo: fatura vencida ganha link novo quando reemitida. Rate limit 30/h.

### `POST /functions/v1/assinatura-cancelar` · JWT · dono

```jsonc
{ "workspaceId": "uuid", "motivo": "opcional" }
→ { "cancelada": true, "acessoAte": "2026-09-17T00:00:00Z" }
```

Cancela primeiro na Asaas; 404 de lá não impede o cancelamento local. Rate limit 10/h.

### `POST /functions/v1/asaas-webhook` · **sem JWT** · token próprio

Autenticação: cabeçalho `asaas-access-token`, comparado em **tempo constante**.

```jsonc
// entrada (payload da Asaas, campos extras permitidos)
{ "id": "evt_…", "event": "PAYMENT_CONFIRMED",
  "payment": { "id": "pay_…", "subscription": "sub_…", "value": 29.0,
               "dueDate": "2026-08-17", "invoiceUrl": "https://…" } }

// saída
{ "duplicado": false, "evento": "PAYMENT_CONFIRMED",
  "acao": "confirmada", "assinaturaId": "uuid" }
```

Semântica de resposta:

| Situação | HTTP | Por quê |
|---|---|---|
| processado | 200 | — |
| já processado | 200 `{duplicado:true}` | retentar nunca mudaria o resultado |
| evento desconhecido / cobrança avulsa | 200 `{ignorado:…}` | não nos diz respeito |
| token inválido | 401 | + rate limit no IP |
| falha nossa | 500 | para a Asaas insistir; `processado_em` fica nulo |

> `verify_jwt = false` aqui é obrigatório e seguro: quem chama é a Asaas, que não possui
> JWT do Supabase. Mudar qualquer outra função para `false` sem mecanismo equivalente é
> vulnerabilidade.

### `POST /functions/v1/assinaturas-reconciliar` · **sem JWT** · `x-cron-token`

```jsonc
→ { "avaliados": 12, "mudancas": [{ "workspaceId": "…", "de": "estudio/ativo",
                                    "para": "solo/ativo" }],
    "falhas": [], "baldesRemovidos": 340, "tabelasSemRls": [] }
```

`tabelasSemRls` não vazio é **alerta de segurança**: alguma tabela entrou em produção sem
RLS. Lote máximo de 500 por execução; falha em um workspace não interrompe os outros.

---

## RPC (PostgREST → `public`)

| Função | Quem | Para quê |
|---|---|---|
| `criar_workspace(nome, oficio_chave, semear)` | `authenticated` | onboarding atômico |
| `aceitar_convite(token)` | `authenticated` | entrar num workspace |
| `trocar_oficio_quadro(quadro, oficio)` | `authenticated` (dono/admin) | trocar o sotaque |

`criar_workspace` é **SECURITY INVOKER** de propósito, não precisa de privilégio extra e
mantém RLS e limites de plano valendo. As outras duas são DEFINER, e por isso abrem com um
bloco de autorização explícito. Toda função DEFINER deste projeto deve abrir assim; se não
abrir, é bug de segurança.

### Pontes de serviço (só `service_role`)

`consumir_rate_limit` · `registrar_auditoria` · `aplicar_estado_assinatura` ·
`faxina_operacional` · `auditoria_rls`.

Existem em `public` porque o PostgREST só enxerga `public`, e o schema `app` fica fora da
API de propósito. A rota existe; a permissão não. `anon` e `authenticated` recebem 403 do
Postgres, verificado no Bloco 6 do teste de isolamento.

---

## PostgREST, acesso direto (protegido por RLS)

| Tabela | `anon` | `authenticated` |
|---|---|---|
| `planos` | select | select |
| `profiles` | — | select (próprio + quem divide workspace) · insert/update próprio |
| `workspaces` | — | select · insert · update **(só `nome` e `tema`)** · delete (dono) |
| `workspace_members` | — | select · insert · update · delete |
| `convites` | — | select **sem `token_hash`** · insert · delete |
| `oficios` + filhos | — | select · escrita só em ofício próprio |
| `quadros` | — | select · insert · update · delete (dono/admin) |
| `pautas` | — | select · insert · update **(sem `workspace_id`/`oficio_id`)** · delete |
| `assinaturas` | — | **select apenas** (dono/admin) |
| `cobrancas` | — | **select apenas** (dono/admin) |
| `audit_log` | — | select (dono/admin) · insert **sem `origem`/`ip_hash`** |
| `webhook_eventos` | — | **nada** |
| `rate_limit` | — | **nada** |
| `v_uso_workspace` | — | select (`security_invoker`) |

As colunas em negrito são o ponto: a restrição é de **privilégio de coluna**, não de
convenção. Elas são verificadas por `has_column_privilege` no Bloco 1 do teste de
isolamento, a cada execução do gate.

## Realtime

Publicação `supabase_realtime` inclui apenas `pautas` e `quadros`, com `REPLICA IDENTITY
FULL` (o payload carrega os valores antigos, para a UI saber de qual etapa a pauta saiu).

`assinaturas`, `cobrancas`, `audit_log` e `profiles` ficam **fora**: assinar tabela
financeira por websocket amplia superfície sem ganho de produto.
