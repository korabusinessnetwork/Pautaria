-- ═══════════════════════════════════════════════════════════════════════════
-- 0010, Pontes de serviço
--
-- Tensão a resolver: as funções de defesa (`app.consumir_rate_limit`,
-- `app.auditar`, `app.aplicar_estado_assinatura`) moram no schema `app`, que
-- fica fora de `config.toml → api.schemas` justamente para não existir rota
-- HTTP até elas. Mas as Edge Functions falam com o banco pelo PostgREST, e o
-- PostgREST só enxerga `public`.
--
-- A solução preguiçosa seria expor o schema `app` inteiro na API e confiar nos
-- grants. Isso publicaria uma rota para cada função interna, incluindo as que
-- vierem depois, escritas por alguém que não pensou em rota nenhuma. Superfície
-- de ataque que cresce sozinha é a pior espécie.
--
-- Em vez disso: uma ponte nominal por função, em `public`, com
-- `revoke all from public` + `grant execute to service_role`. `anon` e
-- `authenticated` recebem 403 do próprio Postgres, a rota existe, a permissão
-- não. Expor uma função nova passa a exigir escrever uma ponte nova, de
-- propósito. É a mesma lógica de negar por omissão da migration 0009,
-- aplicada a funções.
-- ═══════════════════════════════════════════════════════════════════════════


create or replace function public.consumir_rate_limit(
  p_chave    text,
  p_limite   integer,
  p_janela_s integer
)
returns table (permitido boolean, restante integer, reinicia_em timestamptz)
language sql
security definer
set search_path = ''
as $$
  select * from app.consumir_rate_limit(p_chave, p_limite, p_janela_s);
$$;

comment on function public.consumir_rate_limit(text, integer, integer) is
  'Ponte de serviço para app.consumir_rate_limit. Só service_role executa.';


create or replace function public.registrar_auditoria(
  p_workspace  uuid,
  p_ator       uuid,
  p_evento     text,
  p_recurso    text default null,
  p_recurso_id text default null,
  p_meta       jsonb default '{}'::jsonb,
  p_ip_hash    text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  select app.auditar(p_workspace, p_ator, p_evento, p_recurso, p_recurso_id,
                     p_meta, p_ip_hash);
$$;

comment on function public.registrar_auditoria(uuid, uuid, text, text, text, jsonb, text) is
  'Ponte de serviço para app.auditar (origem=servidor). Só service_role executa.';


create or replace function public.aplicar_estado_assinatura(p_workspace uuid)
returns table (plano public.plano, status public.status_workspace,
               plano_expira_em timestamptz)
language sql
security definer
set search_path = ''
as $$
  select w.plano, w.status, w.plano_expira_em
    from app.aplicar_estado_assinatura(p_workspace) w;
$$;

comment on function public.aplicar_estado_assinatura(uuid) is
  'Ponte de serviço: recalcula o plano do workspace. Só service_role executa.';


create or replace function public.faxina_operacional()
returns table (baldes_removidos integer)
language sql
security definer
set search_path = ''
as $$
  select app.limpar_rate_limit();
$$;

comment on function public.faxina_operacional() is
  'Ponte de serviço: limpeza periódica dos baldes de rate limit.';


create or replace function public.auditoria_rls()
returns table (tabela text, motivo text)
language sql
security definer
set search_path = ''
as $$
  select * from app.tabelas_sem_rls();
$$;

comment on function public.auditoria_rls() is
  'Ponte de serviço: tabelas sem RLS. Usada por monitoramento externo.';


-- ═══════════════════════════════════════════════════════════════════════════
-- Privilégios, service_role e mais ninguém
--
-- `revoke from public` é obrigatório e vem primeiro: o Postgres concede EXECUTE
-- a PUBLIC em toda função nova. Sem esta linha, `anon` chamaria
-- `public.aplicar_estado_assinatura` e recalcularia o plano de qualquer
-- workspace cujo uuid conseguisse adivinhar.
--
-- O teste de isolamento (Bloco 6) verifica exatamente isto.
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on function public.consumir_rate_limit(text, integer, integer) from public;
revoke all on function public.registrar_auditoria(uuid, uuid, text, text, text, jsonb, text) from public;
revoke all on function public.aplicar_estado_assinatura(uuid) from public;
revoke all on function public.faxina_operacional() from public;
revoke all on function public.auditoria_rls() from public;

grant execute on function public.consumir_rate_limit(text, integer, integer) to service_role;
grant execute on function public.registrar_auditoria(uuid, uuid, text, text, text, jsonb, text) to service_role;
grant execute on function public.aplicar_estado_assinatura(uuid) to service_role;
grant execute on function public.faxina_operacional() to service_role;
grant execute on function public.auditoria_rls() to service_role;
