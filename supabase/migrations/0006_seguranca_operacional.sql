-- ═══════════════════════════════════════════════════════════════════════════
-- 0006, Segurança operacional: auditoria, idempotência de webhook, rate limit
--
-- Três tabelas que não pertencem ao domínio do produto, e sim à sua defesa:
--   • audit_log, o que aconteceu, quem fez, quando (append-only)
--   • webhook_eventos, a trava de idempotência da Asaas
--   • rate_limit, o balde que segura abuso nas Edge Functions
--
-- Nenhuma das três é escrita livremente pelo cliente. `webhook_eventos` e
-- `rate_limit` sequer são legíveis: têm RLS ligada e **zero políticas**, que no
-- Postgres significa "nega tudo". Só `service_role`, que ignora RLS por
-- definição, alcança essas linhas.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- audit_log, append-only
--
-- `origem` separa o que o servidor afirma do que o cliente afirma. O cliente
-- não recebe grant na coluna `origem`, então todo INSERT vindo do browser cai
-- no default 'cliente'. Uma linha marcada 'servidor' só pode ter sido escrita
-- por uma Edge Function. Sem essa distinção, o log seria decorativo: qualquer
-- usuário poderia forjar "assinatura.ativada" e o registro não valeria nada
-- numa investigação.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.audit_log (
  id            bigint generated always as identity primary key,
  workspace_id  uuid references public.workspaces(id) on delete set null,
  ator_id       uuid references auth.users(id) on delete set null,

  -- Evento de domínio em dot.case, substantivo no passado (CLAUDE.md).
  evento        text not null
                  check (evento ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),

  recurso       text check (char_length(recurso) <= 40),
  recurso_id    text check (char_length(recurso_id) <= 64),

  -- Contexto do evento. NUNCA dado pessoal ou financeiro em texto claro:
  -- id de referência, contadores, nomes de campo. Ver docs/11_SEGURANCA.
  meta          jsonb not null default '{}'::jsonb
                  check (jsonb_typeof(meta) = 'object'),

  origem        text not null default 'cliente' check (origem in ('cliente', 'servidor')),

  -- IP pseudonimizado (HMAC com sal do servidor), nunca o IP em claro:
  -- serve para correlacionar tentativas sem virar um cadastro de localização.
  ip_hash       text check (char_length(ip_hash) = 64),

  criado_em     timestamptz not null default now()
);

comment on table public.audit_log is
  'Registro append-only. Sem UPDATE e sem DELETE para ninguém, nem para o dono.';
comment on column public.audit_log.origem is
  'servidor = escrito por Edge Function. cliente = afirmado pelo browser (não confiável).';
comment on column public.audit_log.ip_hash is
  'HMAC-SHA256 do IP. Pseudonimização: correlaciona sem identificar (LGPD art. 12).';

create index audit_log_workspace_idx on public.audit_log (workspace_id, criado_em desc);
create index audit_log_evento_idx on public.audit_log (evento, criado_em desc);
create index audit_log_ator_idx on public.audit_log (ator_id, criado_em desc);


-- ─────────────────────────────────────────────────────────────────────────────
-- webhook_eventos, idempotência e perícia
--
-- A Asaas reentrega eventos: por retentativa após timeout, por reprocessamento
-- manual no painel, por instabilidade de rede. Sem esta tabela, uma reentrega
-- de PAYMENT_CONFIRMED estenderia o período pago duas vezes.
--
-- O UNIQUE em (provedor, evento_externo_id) é a trava: a Edge Function tenta
-- inserir antes de processar; violação de unicidade significa "já vi este
-- evento" e a função responde 200 sem efeito colateral. O 200 é intencional,
-- devolver erro faria a Asaas insistir para sempre num evento já resolvido.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.webhook_eventos (
  id                 uuid primary key default gen_random_uuid(),
  provedor           text not null default 'asaas',
  evento_externo_id  text not null,
  tipo               text not null,

  -- Payload íntegro para perícia. É por isso que esta tabela é ilegível pela
  -- API: ela contém dados do cliente vindos da Asaas.
  payload            jsonb not null,

  recebido_em        timestamptz not null default now(),
  processado_em      timestamptz,
  erro               text,
  tentativas         smallint not null default 0,

  unique (provedor, evento_externo_id)
);

comment on table public.webhook_eventos is
  'Trava de idempotência do webhook + trilha de perícia. Sem acesso pela API.';

create index webhook_eventos_pendentes_idx
  on public.webhook_eventos (recebido_em)
  where processado_em is null;


-- ─────────────────────────────────────────────────────────────────────────────
-- rate_limit, balde de janela fixa
--
-- Simples de propósito: janela fixa em vez de sliding window ou token bucket.
-- A imprecisão nas bordas da janela é irrelevante para o que precisamos
-- (impedir enumeração e flood), e a implementação cabe em um UPSERT, sem
-- Redis, sem serviço pago, dentro do tier gratuito.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.rate_limit (
  chave          text primary key,
  janela_inicio  timestamptz not null default now(),
  contagem       integer not null default 0,
  expira_em      timestamptz not null
);

comment on table public.rate_limit is
  'Balde de janela fixa para as Edge Functions. Chave = escopo:identificador.';

create index rate_limit_expira_idx on public.rate_limit (expira_em);


-- ═══════════════════════════════════════════════════════════════════════════
-- Funções
-- ═══════════════════════════════════════════════════════════════════════════

-- Consome uma unidade do balde e diz se a requisição passa.
-- Atômica: o `insert ... on conflict do update ... returning` resolve concorrência
-- sem SELECT-then-UPDATE, que teria corrida entre duas invocações simultâneas.
create or replace function app.consumir_rate_limit(
  p_chave    text,
  p_limite   integer,
  p_janela_s integer
)
returns table (permitido boolean, restante integer, reinicia_em timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agora timestamptz := now();
  v_contagem integer;
  v_expira timestamptz;
begin
  insert into public.rate_limit as r (chave, janela_inicio, contagem, expira_em)
  values (p_chave, v_agora, 1, v_agora + make_interval(secs => p_janela_s))
  on conflict (chave) do update
    set contagem = case
                     when r.expira_em <= v_agora then 1
                     else r.contagem + 1
                   end,
        janela_inicio = case
                          when r.expira_em <= v_agora then v_agora
                          else r.janela_inicio
                        end,
        expira_em = case
                      when r.expira_em <= v_agora
                        then v_agora + make_interval(secs => p_janela_s)
                      else r.expira_em
                    end
  returning r.contagem, r.expira_em into v_contagem, v_expira;

  return query
    select v_contagem <= p_limite,
           greatest(p_limite - v_contagem, 0),
           v_expira;
end;
$$;

comment on function app.consumir_rate_limit(text, integer, integer) is
  'Consome 1 do balde de janela fixa. Atômica, segura contra invocações simultâneas.';


-- Faxina dos baldes vencidos. Chamada pela reconciliação diária; sem ela a
-- tabela cresceria para sempre.
create or replace function app.limpar_rate_limit()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_removidos integer;
begin
  delete from public.rate_limit where expira_em < now() - interval '1 hour';
  get diagnostics v_removidos = row_count;
  return v_removidos;
end;
$$;


-- Registro de auditoria pelo servidor. `origem = 'servidor'` só se alcança por
-- aqui (ou por service_role direto), nunca pelo browser.
create or replace function app.auditar(
  p_workspace uuid,
  p_ator      uuid,
  p_evento    text,
  p_recurso   text default null,
  p_recurso_id text default null,
  p_meta      jsonb default '{}'::jsonb,
  p_ip_hash   text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log
    (workspace_id, ator_id, evento, recurso, recurso_id, meta, origem, ip_hash)
  values
    (p_workspace, p_ator, p_evento, p_recurso, p_recurso_id,
     coalesce(p_meta, '{}'::jsonb), 'servidor', p_ip_hash);
$$;

comment on function app.auditar(uuid, uuid, text, text, text, jsonb, text) is
  'Escreve no audit_log com origem=servidor. Exclusiva de Edge Function.';


-- ═══════════════════════════════════════════════════════════════════════════
-- Privilégios
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on public.audit_log       from anon, authenticated;
revoke all on public.webhook_eventos from anon, authenticated;
revoke all on public.rate_limit      from anon, authenticated;

-- Nem `usage` na sequência da identity: o cliente não escolhe id de log.
grant select (id, workspace_id, ator_id, evento, recurso, recurso_id, meta,
              origem, criado_em)
  on public.audit_log to authenticated;

-- `origem` e `ip_hash` fora do grant de INSERT: o cliente não se declara
-- servidor nem grava rastro de rede.
grant insert (workspace_id, ator_id, evento, recurso, recurso_id, meta)
  on public.audit_log to authenticated;

-- Sem grant algum em webhook_eventos e rate_limit. Intencional.

grant execute on function app.consumir_rate_limit(text, integer, integer) to service_role;
grant execute on function app.limpar_rate_limit() to service_role;
grant execute on function app.auditar(uuid, uuid, text, text, text, jsonb, text)
  to service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.audit_log       enable row level security;
alter table public.webhook_eventos enable row level security;
alter table public.rate_limit      enable row level security;

-- ── audit_log ───────────────────────────────────────────────────────────────
create policy "auditoria: dono e admin leem a do seu workspace"
  on public.audit_log for select to authenticated
  using (
    workspace_id is not null
    and app.tem_papel(workspace_id, array['owner', 'admin']::public.papel[])
  );

create policy "auditoria: membro registra o que ele mesmo fez"
  on public.audit_log for insert to authenticated
  with check (
    ator_id = (select auth.uid())
    and workspace_id is not null
    and app.e_membro(workspace_id)
  );

-- Sem política de UPDATE e sem política de DELETE. Append-only não é convenção
-- documentada, é a ausência deliberada dessas duas políticas. Um log que o
-- próprio suspeito pode editar não é log.

-- ── webhook_eventos e rate_limit ────────────────────────────────────────────
-- RLS ligada, zero políticas = nega tudo para anon e authenticated.
-- `service_role` passa por cima da RLS e é o único caminho.
