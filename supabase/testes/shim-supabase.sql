-- ═══════════════════════════════════════════════════════════════════════════
--  SHIM, o mínimo do Supabase, num Postgres puro
--
--  As migrations do Pautaria dependem de coisas que a plataforma Supabase
--  fornece: os papéis `anon` / `authenticated` / `service_role`, o schema
--  `auth` com `auth.users` e `auth.uid()`, e a publicação `supabase_realtime`.
--
--  Este arquivo recria esse contrato mínimo para que as migrations e o teste de
--  isolamento rodem contra um Postgres comum, em CI, num contêiner, na máquina
--  de quem não quer subir o stack inteiro. Não é uma reimplementação do
--  Supabase: é a superfície que o nosso schema toca, e nada além.
--
--  Inclui de propósito a **generosidade padrão** do Supabase (grant all em
--  `public` para anon/authenticated). Sem reproduzir isso, o endurecimento da
--  migration 0009 passaria no teste sem nunca ter sido exercitado.
--
--  Uso:  psql -f supabase/testes/shim-supabase.sql
--        psql -f supabase/migrations/0001_...  (e seguintes)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Papéis ───────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

grant usage on schema public to anon, authenticated, service_role;


-- ── Schema auth ──────────────────────────────────────────────────────────────
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  instance_id        uuid,
  id                 uuid primary key,
  aud                text,
  role               text,
  email              text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  raw_app_meta_data  jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb
);

-- Mesma implementação que o Supabase usa: lê o `sub` das claims que o PostgREST
-- injeta na sessão. É o que torna `set local role` + `request.jwt.claims` um
-- substituto fiel de uma requisição autenticada de verdade.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ), ''
  )::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
    'anon'
  );
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;

grant execute on function auth.uid(), auth.role(), auth.jwt()
  to anon, authenticated, service_role;


-- ── Realtime ─────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;


-- ── A generosidade padrão do Supabase, reproduzida ───────────────────────────
-- É exatamente isto que a migration 0009 desfaz. Reproduzir aqui faz o teste
-- provar o endurecimento em vez de só assumi-lo.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
