-- ═══════════════════════════════════════════════════════════════════════════
-- 0009 — Endurecimento do schema e realtime
--
-- As migrations anteriores protegeram as tabelas que existem. Esta protege as
-- que **ainda não existem** — que é onde brechas costumam nascer.
--
-- O Postgres, e o Supabase por cima dele, são generosos por padrão: uma tabela
-- nova em `public` já sai com privilégio para `anon` e `authenticated`, e uma
-- função nova já sai com EXECUTE para PUBLIC. Isso significa que, sem esta
-- migration, uma tabela criada às pressas num sábado fica legível pela internet
-- até alguém lembrar de rodar `enable row level security`. E ninguém lembra.
--
-- Invertemos o padrão: nada por omissão. Tabela nova nasce inacessível, e só
-- passa a funcionar quando alguém escrever grants e políticas conscientemente.
-- O custo é ter que escrever essas duas linhas a mais. O benefício é que
-- esquecer passa a falhar fechado em vez de falhar aberto.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- Privilégios padrão: negar por omissão
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_role text;
begin
  foreach v_role in array array['postgres', 'supabase_admin'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format(
        'alter default privileges for role %I in schema public
           revoke all on tables from anon, authenticated', v_role);
      execute format(
        'alter default privileges for role %I in schema public
           revoke all on sequences from anon, authenticated', v_role);
      execute format(
        'alter default privileges for role %I in schema public
           revoke all on functions from public, anon, authenticated', v_role);
    end if;
  end loop;
end;
$$;

-- Ninguém cria objeto em `public` além do dono do schema.
revoke create on schema public from public, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- Auditoria de cobertura de RLS
--
-- Esta função é o gate automatizado: `scripts/testar-isolamento.sh` falha o
-- build se ela devolver qualquer linha. Uma tabela de negócio sem RLS não é um
-- aviso a ser triado depois — é um build quebrado.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function app.tabelas_sem_rls()
returns table (tabela text, motivo text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.relname::text,
         case
           when not c.relrowsecurity then 'RLS desligada'
           else 'RLS ligada mas com privilégio de escrita e nenhuma política'
         end
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and c.relname not like 'pg_%'
     and (
       not c.relrowsecurity
       or (
         not exists (select 1 from pg_policy p where p.polrelid = c.oid)
         and (
           has_table_privilege('authenticated', c.oid, 'SELECT') or
           has_table_privilege('authenticated', c.oid, 'INSERT') or
           has_table_privilege('anon', c.oid, 'SELECT') or
           has_table_privilege('anon', c.oid, 'INSERT')
         )
       )
     )
   order by 1;
$$;

comment on function app.tabelas_sem_rls() is
  'Gate de release: qualquer linha aqui reprova o deploy. Ver scripts/testar-isolamento.sh.';

grant execute on function app.tabelas_sem_rls() to service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- Realtime
--
-- Só o que a UI realmente precisa acompanhar ao vivo: uma pauta que outro
-- membro moveu, e o quadro que mudou de ofício. `assinaturas`, `cobrancas`,
-- `audit_log` e `profiles` ficam de fora — assinar tabela financeira via
-- websocket é ampliar superfície sem ganho de produto.
--
-- O Realtime do Supabase aplica RLS na entrega: um membro do workspace A não
-- recebe evento do workspace B mesmo estando inscrito no canal.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.pautas;
    alter publication supabase_realtime add table public.quadros;
  end if;
end;
$$;

-- REPLICA IDENTITY FULL faz o payload do evento carregar os valores antigos da
-- linha. É o que permite à UI saber de qual etapa a pauta saiu e animar o
-- movimento — sem isso, um UPDATE chega só com a chave primária.
alter table public.pautas  replica identity full;
alter table public.quadros replica identity full;


-- ─────────────────────────────────────────────────────────────────────────────
-- Rastro de versão do schema
-- ─────────────────────────────────────────────────────────────────────────────
comment on schema public is
  'Pautaria — schema de aplicação. Toda tabela aqui tem RLS. Ver docs/11_SEGURANCA.';
