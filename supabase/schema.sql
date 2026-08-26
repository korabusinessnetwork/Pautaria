-- ═══════════════════════════════════════════════════════════════════════════
--  P A U T A R I A, S C H E M A  D O  B A N C O
--
--  ⚠️  ARQUIVO GERADO. Não edite aqui.
--
--  Fonte: supabase/migrations/*.sql, na ordem.
--  Para regenerar:  bash scripts/gerar-schema.sh
--
--  Este arquivo existe para leitura: é o retrato completo do banco em um lugar
--  só, para revisar modelagem e políticas sem abrir nove arquivos. O que roda
--  em produção são as migrations.
--
--  Invariantes que valem para TODA tabela aqui:
--    • RLS ligada, criada na mesma migration que a tabela
--    • privilégio explícito (revoke all → grant), coluna a coluna onde importa
--    • nada de escrita do cliente em tabela financeira
-- ═══════════════════════════════════════════════════════════════════════════



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0001_fundacao_tipos.sql                                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════════
-- 0001, Fundação: schema privado, tipos de domínio e utilitários
--
-- Nada aqui cria tabela. Este arquivo estabelece o vocabulário do banco (enums)
-- e a caixa de ferramentas (`app`) usada pelas políticas de RLS das migrations
-- seguintes.
--
-- Convenção do projeto: o schema `app` guarda funções internas de autorização e
-- regra. Ele NÃO é exposto na API do PostgREST, só o `public` é. Isso significa
-- que essas funções não podem ser chamadas diretamente do browser; existem
-- apenas para serem invocadas de dentro de políticas e triggers.
-- ═══════════════════════════════════════════════════════════════════════════

create schema if not exists app;

comment on schema app is
  'Funções internas de autorização e regra de negócio. Não exposto via PostgREST.';

-- `usage` no schema é necessário: as políticas de RLS chamam `app.e_membro()` e
-- companhia, e uma política é avaliada com os privilégios de quem consulta,
-- sem `usage`, toda query autenticada morreria com "permission denied for
-- schema app".
--
-- Isso NÃO expõe nada: `usage` num schema não dá direito a executar função
-- alguma; cada `grant execute` é concedido individualmente, junto da função
-- que o justifica. E o schema `app` fica fora de `config.toml → api.schemas`,
-- então o PostgREST sequer publica uma rota para ele, não há como chamar
-- `app.*` a partir do browser, com ou sem privilégio.
revoke all on schema app from public;
grant usage on schema app to anon, authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- Tipos de domínio
-- Enums em vez de text+check: o banco recusa valor fora do vocabulário, e o
-- tipo aparece nos tipos gerados do TypeScript.
-- ─────────────────────────────────────────────────────────────────────────────

-- Planos comercializados. A tabela `planos` (0005) carrega preço e limites;
-- este enum carrega apenas a identidade do plano.
create type public.plano as enum ('solo', 'estudio', 'time');

-- Papel de um usuário dentro de um workspace.
--   owner, dono; único que assina, cancela e exclui o workspace. Sempre ≥ 1.
--   admin, gerencia membros, ofícios e quadros; não mexe em assinatura.
--   membro, cria e move pautas.
create type public.papel as enum ('owner', 'admin', 'membro');

-- Estado do tenant.
--   ativo, tudo liberado
--   inadimplente, pagamento atrasado, ainda dentro do período de tolerância:
--                   continua gravável (não punimos o usuário antes da hora)
--   suspenso, tolerância esgotada: somente leitura, dados preservados
--   cancelado, encerrado pelo dono: somente leitura até a purga
create type public.status_workspace as enum
  ('ativo', 'inadimplente', 'suspenso', 'cancelado');

create type public.ciclo_cobranca as enum ('mensal', 'anual');

-- Espelha o ciclo de vida de uma assinatura na Asaas.
create type public.status_assinatura as enum
  ('pendente', 'ativa', 'inadimplente', 'cancelada', 'expirada');

-- Espelha os estados de cobrança da Asaas que nos interessam.
create type public.status_cobranca as enum
  ('pendente', 'confirmada', 'recebida', 'vencida', 'estornada', 'removida', 'chargeback');


-- ─────────────────────────────────────────────────────────────────────────────
-- Utilitários
-- ─────────────────────────────────────────────────────────────────────────────

-- `atualizado_em` mantido pelo banco, não pela aplicação: cliente esquece,
-- trigger não.
create or replace function app.tocar_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

comment on function app.tocar_atualizado_em() is
  'Trigger BEFORE UPDATE: mantém atualizado_em sob controle do banco.';


-- Normaliza um texto livre em slug URL-safe. Usada no onboarding para derivar o
-- slug do workspace a partir do nome digitado pelo usuário.
create or replace function app.gerar_slug(p_texto text)
returns text
language sql
immutable
as $$
  select trim(
           both '-' from
           regexp_replace(
             lower(
               -- remove acentuação sem depender de `unaccent`
               translate(
                 p_texto,
                 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
                 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
               )
             ),
             '[^a-z0-9]+', '-', 'g'
           )
         );
$$;

comment on function app.gerar_slug(text) is
  'Texto livre → slug URL-safe, sem acento. Determinística: usada em índice e trigger.';


-- Hash de token de uso único (convites). Guardamos o hash, nunca o token: se o
-- banco vazar, os convites em aberto não viram acesso.
-- `sha256` é nativa do Postgres desde a 11, sem dependência de extensão.
create or replace function app.hash_token(p_token text)
returns text
language sql
immutable
as $$
  select encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

comment on function app.hash_token(text) is
  'SHA-256 hex de um token. Persistimos o hash; o token só existe no e-mail do convidado.';


-- ─────────────────────────────────────────────────────────────────────────────
-- Privilégios das utilitárias
--
-- `gerar_slug` é chamada de dentro de `public.criar_workspace`, que roda como
-- SECURITY INVOKER de propósito (para manter a RLS valendo no onboarding).
-- Logo, quem chama precisa poder executá-la. É pura transformação de texto,
-- sem acesso a dado, conceder é inofensivo.
--
-- `hash_token` NÃO é concedida: ela só é chamada de dentro de
-- `public.aceitar_convite`, que é SECURITY DEFINER. Dar acesso a ela ao cliente
-- entregaria um oráculo para gerar hashes e comparar com o banco.
revoke all on function app.gerar_slug(text) from public;
revoke all on function app.hash_token(text) from public;
revoke all on function app.tocar_atualizado_em() from public;

grant execute on function app.gerar_slug(text) to authenticated;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0002_identidade_tenants.sql                                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════════
-- 0002, Identidade e tenants: profiles, workspaces, membros e convites
--
-- O **workspace é o tenant**. Todo dado de negócio do Pautaria pendura em um
-- workspace, e o isolamento entre workspaces é a fronteira de segurança mais
-- importante do produto.
--
-- Modelo de privilégio deste projeto (vale para TODAS as migrations):
--   1. `revoke all` na tabela para anon/authenticated, nada é permitido por
--      omissão.
--   2. `grant` explícito, **coluna a coluna** onde a coluna é sensível. Isso é o
--      que impede o browser de escrever `plano` ou `status` mesmo que uma
--      política de RLS estivesse frouxa: RLS é row-level, GRANT é column-level,
--      e as duas camadas se cobrem.
--   3. RLS ativada + políticas por operação.
--
-- Recursão de RLS: as políticas de `workspace_members` não podem consultar
-- `workspace_members` diretamente (laço infinito). Por isso toda checagem passa
-- pelas funções `app.*` marcadas SECURITY DEFINER, elas rodam como dono da
-- tabela e portanto não reentram na política.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- profiles, espelho público de auth.users
-- Nunca guardamos senha nem token aqui; isso é responsabilidade do GoTrue.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  nome           text not null check (char_length(trim(nome)) between 1 and 80),
  email          text not null check (email = lower(email) and email like '%@%'),
  iniciais       text not null check (char_length(iniciais) between 1 and 2),
  avatar_hue     smallint not null default 45 check (avatar_hue between 0 and 360),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

comment on table public.profiles is
  'Dados de exibição do usuário. Sem credencial, sem CPF, documento fiscal vive só na Asaas.';
comment on column public.profiles.iniciais is
  'Iniciais para o avatar (ex.: "MT"). Derivadas do nome no cadastro.';

create index profiles_email_idx on public.profiles (email);

create trigger profiles_atualizado_em
  before update on public.profiles
  for each row execute function app.tocar_atualizado_em();


-- ─────────────────────────────────────────────────────────────────────────────
-- workspaces, o tenant
-- ─────────────────────────────────────────────────────────────────────────────
create table public.workspaces (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null check (char_length(trim(nome)) between 1 and 60),
  slug               text not null unique
                       check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$'),

  -- White-label: cor, logo e rótulos do tenant. Nunca constantes no front.
  -- Formato: { "logoUrl": null, "hue": 45, "nomeExibicao": null }
  tema               jsonb not null default '{}'::jsonb
                       check (jsonb_typeof(tema) = 'object'),

  -- ── Colunas de cobrança: escrita EXCLUSIVA do servidor ───────────────────
  -- Não constam do `grant update` para `authenticated`. Um cliente malicioso
  -- que tentasse `update workspaces set plano='time'` recebe permission denied
  -- do próprio Postgres, antes de qualquer lógica de aplicação.
  plano              public.plano not null default 'solo',
  status             public.status_workspace not null default 'ativo',
  asaas_customer_id  text unique,
  -- Até quando o plano pago vale. Inclui o período de tolerância.
  plano_expira_em    timestamptz,

  criado_por         uuid not null references auth.users(id) on delete restrict,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);

comment on table public.workspaces is
  'Tenant do Pautaria. A assinatura pertence ao workspace, nunca ao usuário.';
comment on column public.workspaces.plano_expira_em is
  'Fim do período pago + tolerância. Nulo em plano solo. Só o servidor escreve.';

create index workspaces_criado_por_idx on public.workspaces (criado_por);
create index workspaces_plano_expira_idx on public.workspaces (plano_expira_em)
  where plano_expira_em is not null;

create trigger workspaces_atualizado_em
  before update on public.workspaces
  for each row execute function app.tocar_atualizado_em();


-- ─────────────────────────────────────────────────────────────────────────────
-- workspace_members, vínculo usuário ↔ tenant ↔ papel
-- ─────────────────────────────────────────────────────────────────────────────
create table public.workspace_members (
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  papel         public.papel not null default 'membro',
  criado_em     timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

comment on table public.workspace_members is
  'Um usuário pode pertencer a vários workspaces com papéis distintos.';

create index workspace_members_user_idx on public.workspace_members (user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- convites, entrada de novos membros (plano Time)
--
-- Guardamos o **hash** do token, nunca o token. Um dump do banco não vira
-- acesso: quem tem o hash não consegue reconstruir o link do convite.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.convites (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  email         text not null check (email = lower(email) and email like '%@%'),
  papel         public.papel not null default 'membro'
                  check (papel <> 'owner'),   -- owner não se cria por convite
  token_hash    text not null unique,
  expira_em     timestamptz not null,
  aceito_em     timestamptz,
  aceito_por    uuid references auth.users(id) on delete set null,
  criado_por    uuid not null references auth.users(id) on delete cascade,
  criado_em     timestamptz not null default now()
);

comment on table public.convites is
  'Convite de membro. Persistimos o SHA-256 do token; o token só existe no e-mail.';

-- Um convite aberto por e-mail e workspace.
create unique index convites_pendente_idx
  on public.convites (workspace_id, email)
  where aceito_em is null;

create index convites_email_idx on public.convites (email) where aceito_em is null;


-- ═══════════════════════════════════════════════════════════════════════════
-- Funções de autorização, a base de toda política de RLS do projeto
--
-- Todas são SECURITY DEFINER com `search_path = ''` e nomes totalmente
-- qualificados. O search_path vazio é obrigatório: sem ele, um schema plantado
-- por um atacante no caminho de busca poderia sequestrar a resolução de nomes
-- dentro de uma função que roda com privilégio elevado.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function app.e_membro(p_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.workspace_members m
     where m.workspace_id = p_workspace
       and m.user_id = (select auth.uid())
  );
$$;

comment on function app.e_membro(uuid) is
  'O usuário autenticado pertence a este workspace? Base do isolamento entre tenants.';


create or replace function app.tem_papel(p_workspace uuid, p_papeis public.papel[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.workspace_members m
     where m.workspace_id = p_workspace
       and m.user_id = (select auth.uid())
       and m.papel = any(p_papeis)
  );
$$;

comment on function app.tem_papel(uuid, public.papel[]) is
  'O usuário autenticado tem algum destes papéis no workspace?';


-- Gravável = o tenant está em estado que aceita escrita.
-- `inadimplente` continua gravável de propósito: atraso de pagamento não é
-- motivo para travar o trabalho de alguém no meio do dia. Quem trava é
-- `suspenso`, e só depois do período de tolerância.
create or replace function app.workspace_gravavel(p_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.workspaces w
      join public.workspace_members m on m.workspace_id = w.id
     where w.id = p_workspace
       and m.user_id = (select auth.uid())
       and w.status in ('ativo', 'inadimplente')
  );
$$;

comment on function app.workspace_gravavel(uuid) is
  'Membro de um workspace em estado gravável. Workspace suspenso/cancelado vira somente-leitura.';


-- Dois usuários que dividem qualquer workspace podem ver o perfil um do outro
-- (avatar do responsável, lista de membros). Fora disso, ninguém vê ninguém.
create or replace function app.compartilha_workspace(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.workspace_members eu
      join public.workspace_members outro on outro.workspace_id = eu.workspace_id
     where eu.user_id = (select auth.uid())
       and outro.user_id = p_user
  );
$$;

comment on function app.compartilha_workspace(uuid) is
  'Existe workspace em comum entre o usuário autenticado e p_user?';


-- ═══════════════════════════════════════════════════════════════════════════
-- Triggers de integridade
-- ═══════════════════════════════════════════════════════════════════════════

-- Todo usuário novo ganha um profile. Feito no banco e não na aplicação porque
-- o cadastro pode vir de qualquer provedor (e-mail, OAuth, magic link) e não
-- pode existir usuário sem perfil.
create or replace function app.ao_criar_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_nome  text;
begin
  -- Cadastro sem e-mail (só telefone/OAuth atípico) não pode derrubar o signup.
  v_email := coalesce(lower(nullif(trim(new.email), '')), new.id::text || '@sem-email.local');

  v_nome := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'nome'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(v_email, '@', 1), ''),
    'Usuário'
  );

  insert into public.profiles (id, nome, email, iniciais, avatar_hue)
  values (
    new.id,
    left(v_nome, 80),
    v_email,
    upper(
      coalesce(
        substr(split_part(v_nome, ' ', 1), 1, 1) ||
        nullif(substr(split_part(v_nome, ' ', 2), 1, 1), ''),
        substr(v_nome, 1, 2)
      )
    ),
    -- hue estável derivada do id: o mesmo usuário sempre tem a mesma cor
    (('x' || substr(replace(new.id::text, '-', ''), 1, 4))::bit(16)::int % 360)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function app.ao_criar_usuario();


-- Quem cria o workspace vira owner na mesma transação. Sem isso existiria uma
-- janela, mesmo que de milissegundos, com um workspace sem dono, e um
-- workspace sem dono é um workspace que ninguém consegue administrar nem
-- excluir.
create or replace function app.ao_criar_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, papel)
  values (new.id, new.criado_por, 'owner')
  on conflict (workspace_id, user_id) do update set papel = 'owner';
  return new;
end;
$$;

create trigger ao_criar_workspace
  after insert on public.workspaces
  for each row execute function app.ao_criar_workspace();


-- Um workspace nunca fica sem owner. Vale para UPDATE (rebaixar o último owner)
-- e para DELETE (remover o último owner). Sem esta trava, um clique errado
-- deixaria o tenant órfão e sem caminho de recuperação pela UI.
create or replace function app.proteger_ultimo_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid := old.workspace_id;
  v_owners int;
begin
  if old.papel <> 'owner' then
    return coalesce(new, old);
  end if;

  -- UPDATE que mantém o papel owner não reduz a contagem.
  if tg_op = 'UPDATE' and new.papel = 'owner' then
    return new;
  end if;

  select count(*) into v_owners
    from public.workspace_members m
   where m.workspace_id = v_workspace
     and m.papel = 'owner';

  if v_owners <= 1 then
    raise exception using
      errcode = 'P0001',
      message = 'Este é o último dono do workspace.',
      hint    = 'Promova outro membro a dono antes de sair ou de mudar seu papel.';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger proteger_ultimo_owner
  before update or delete on public.workspace_members
  for each row execute function app.proteger_ultimo_owner();


-- Anti-abuso: teto de workspaces que uma conta pode possuir. Sem isto, uma
-- conta gratuita pode criar workspaces solo indefinidamente e usar o plano
-- grátis como se fosse ilimitado.
create or replace function app.limitar_workspaces_por_dono()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limite constant int := 5;
  v_qtd int;
begin
  select count(*) into v_qtd
    from public.workspace_members m
   where m.user_id = new.criado_por
     and m.papel = 'owner';

  if v_qtd >= v_limite then
    raise exception using
      errcode = 'P0001',
      message = format('Limite de %s workspaces por conta atingido.', v_limite),
      hint    = 'Exclua um workspace que não usa ou fale com o suporte.';
  end if;

  return new;
end;
$$;

create trigger limitar_workspaces_por_dono
  before insert on public.workspaces
  for each row execute function app.limitar_workspaces_por_dono();


-- ═══════════════════════════════════════════════════════════════════════════
-- Privilégios, nada por omissão
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on public.profiles          from anon, authenticated;
revoke all on public.workspaces        from anon, authenticated;
revoke all on public.workspace_members from anon, authenticated;
revoke all on public.convites          from anon, authenticated;

grant select                                     on public.profiles to authenticated;
grant insert (id, nome, email, iniciais, avatar_hue) on public.profiles to authenticated;
grant update (nome, iniciais, avatar_hue)        on public.profiles to authenticated;

-- `plano`, `status`, `asaas_customer_id` e `plano_expira_em` ficam FORA do
-- grant de update: são território exclusivo das Edge Functions (service_role).
grant select                          on public.workspaces to authenticated;
grant insert (id, nome, slug, tema, criado_por) on public.workspaces to authenticated;
grant update (nome, tema)             on public.workspaces to authenticated;
grant delete                          on public.workspaces to authenticated;

grant select, insert, update, delete  on public.workspace_members to authenticated;

-- `convites`: sem `select` de tabela inteira. O grant de colunas vem no fim
-- desta migration e deixa `token_hash` fora do alcance do cliente.
grant insert, delete                  on public.convites to authenticated;

-- As funções de autorização precisam ser executáveis por quem passa pela RLS.
grant execute on function app.e_membro(uuid)              to authenticated;
grant execute on function app.tem_papel(uuid, public.papel[]) to authenticated;
grant execute on function app.workspace_gravavel(uuid)    to authenticated;
grant execute on function app.compartilha_workspace(uuid) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- RLS, ativada na mesma migration que cria a tabela (CLAUDE.md)
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles          enable row level security;
alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;
alter table public.convites          enable row level security;

-- ── profiles ────────────────────────────────────────────────────────────────
create policy "perfil: leio o meu e o de quem divide workspace comigo"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or app.compartilha_workspace(id));

create policy "perfil: só eu crio o meu"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

create policy "perfil: só eu edito o meu"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Sem política de DELETE: perfil só some junto com a conta (cascade de auth.users).

-- ── workspaces ──────────────────────────────────────────────────────────────
create policy "workspace: vejo os que sou membro"
  on public.workspaces for select to authenticated
  using (app.e_membro(id));

create policy "workspace: crio em meu nome"
  on public.workspaces for insert to authenticated
  with check (criado_por = (select auth.uid()));

create policy "workspace: dono e admin editam"
  on public.workspaces for update to authenticated
  using (app.tem_papel(id, array['owner', 'admin']::public.papel[]))
  with check (app.tem_papel(id, array['owner', 'admin']::public.papel[]));

create policy "workspace: só o dono exclui"
  on public.workspaces for delete to authenticated
  using (app.tem_papel(id, array['owner']::public.papel[]));

-- ── workspace_members ───────────────────────────────────────────────────────
create policy "membros: vejo os do meu workspace"
  on public.workspace_members for select to authenticated
  using (app.e_membro(workspace_id));

create policy "membros: dono e admin adicionam"
  on public.workspace_members for insert to authenticated
  with check (app.tem_papel(workspace_id, array['owner', 'admin']::public.papel[]));

create policy "membros: só o dono muda papel"
  on public.workspace_members for update to authenticated
  using (app.tem_papel(workspace_id, array['owner']::public.papel[]))
  with check (app.tem_papel(workspace_id, array['owner']::public.papel[]));

create policy "membros: dono e admin removem; qualquer um sai"
  on public.workspace_members for delete to authenticated
  using (
    user_id = (select auth.uid())
    or app.tem_papel(workspace_id, array['owner', 'admin']::public.papel[])
  );

-- ── convites ────────────────────────────────────────────────────────────────
-- Convite é gestão de acesso: só dono e admin enxergam. Um membro comum não
-- precisa saber quem foi convidado, e o `token_hash` nunca sai do servidor
-- porque a coluna não é selecionável pelo cliente (ver grant abaixo).
create policy "convites: dono e admin gerenciam"
  on public.convites for select to authenticated
  using (app.tem_papel(workspace_id, array['owner', 'admin']::public.papel[]));

create policy "convites: dono e admin criam"
  on public.convites for insert to authenticated
  with check (
    criado_por = (select auth.uid())
    and app.tem_papel(workspace_id, array['owner', 'admin']::public.papel[])
    and app.workspace_gravavel(workspace_id)
  );

create policy "convites: dono e admin revogam"
  on public.convites for delete to authenticated
  using (app.tem_papel(workspace_id, array['owner', 'admin']::public.papel[]));

-- Colunas legíveis do convite. `token_hash` NÃO está na lista: nem o dono do
-- workspace consegue lê-lo pela API. Aceitar convite é RPC (0008), o cliente
-- envia o token que recebeu por e-mail e o servidor compara os hashes.
grant select (id, workspace_id, email, papel, expira_em, aceito_em, aceito_por,
              criado_por, criado_em)
  on public.convites to authenticated;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0003_oficios.sql                                                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════════
-- 0003, Ofícios: a configuração que vira produto
--
-- Esta é a migration mais importante do ponto de vista de **produto**. Tudo que
-- o usuário percebe como "o sistema se adaptou a mim", as colunas do quadro, o
-- rótulo dos campos, o título, a cor, os templates, a fonte dos chips, está
-- aqui, como dado.
--
-- A consequência prática: **um ofício novo é um INSERT, não um deploy.** Nenhum
-- componente React sabe que "Marketing" existe; ele só sabe renderizar as
-- etapas que o ofício do quadro declarar.
--
-- Dois níveis:
--   • `workspace_id IS NULL`  → ofício do sistema, visível a todos, imutável
--                               pelo cliente. Semeados em seeds/0001_oficios.sql.
--   • `workspace_id = <uuid>` → ofício próprio do tenant (planos estudio/time).
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- oficios
-- ─────────────────────────────────────────────────────────────────────────────
create table public.oficios (
  id             uuid primary key default gen_random_uuid(),

  -- NULL = ofício do sistema. Ver os dois índices únicos parciais abaixo.
  workspace_id   uuid references public.workspaces(id) on delete cascade,

  chave          text not null check (chave ~ '^[a-z][a-z0-9_]{1,30}$'),
  nome           text not null check (char_length(trim(nome)) between 1 and 40),
  descricao      text not null default '' check (char_length(descricao) <= 140),

  -- ── Identidade visual ────────────────────────────────────────────────────
  -- O accent é derivado por completo de (hue, chroma) em OKLCH:
  --   --ac      oklch(60% chroma hue)
  --   --acSoft  oklch(60% chroma hue / .13)
  --   --acFaint oklch(60% chroma hue / .07)
  --   --acDeep  oklch(44% chroma hue)
  -- Guardar hue+chroma em vez de 4 strings hexadecimais mantém a paleta
  -- coerente por construção: não existe combinação "quase certa".
  glifo          text not null default '●' check (char_length(glifo) between 1 and 2),
  hue            smallint not null check (hue between 0 and 360),
  chroma         numeric(4,3) not null default 0.130
                   check (chroma >= 0 and chroma <= 0.400),

  -- ── Vocabulário ──────────────────────────────────────────────────────────
  titulo_quadro  text not null check (char_length(trim(titulo_quadro)) between 1 and 60),
  campo1_label   text not null check (char_length(trim(campo1_label)) between 1 and 24),
  campo2_label   text not null check (char_length(trim(campo2_label)) between 1 and 24),

  -- ── Modos ────────────────────────────────────────────────────────────────
  -- mono: chips e etiquetas em fonte monoespaçada (identidade de TI/Dev)
  -- solo: quadro de uma pessoa só, esconde responsável e avatares
  mono           boolean not null default false,
  solo           boolean not null default false,

  ordem          smallint not null default 0,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

comment on table public.oficios is
  'Configuração que define o comportamento do quadro. Ofício novo = INSERT, não deploy.';
comment on column public.oficios.workspace_id is
  'NULL = ofício do sistema (visível a todos, imutável pelo cliente).';
comment on column public.oficios.solo is
  'Quadro individual: some com responsável e avatares mesmo no plano Time.';

-- Chave única por escopo. Dois índices parciais em vez de um `unique
-- (workspace_id, chave)` porque NULL nunca conflita com NULL no Postgres, sem
-- isto, nada impediria dois ofícios de sistema com a chave 'mkt'.
create unique index oficios_sistema_chave_idx
  on public.oficios (chave) where workspace_id is null;
create unique index oficios_workspace_chave_idx
  on public.oficios (workspace_id, chave) where workspace_id is not null;

create index oficios_workspace_idx on public.oficios (workspace_id);

create trigger oficios_atualizado_em
  before update on public.oficios
  for each row execute function app.tocar_atualizado_em();


-- ─────────────────────────────────────────────────────────────────────────────
-- oficio_etapas, as colunas do kanban
-- ─────────────────────────────────────────────────────────────────────────────
create table public.oficio_etapas (
  id         uuid primary key default gen_random_uuid(),
  oficio_id  uuid not null references public.oficios(id) on delete cascade,
  nome       text not null check (char_length(trim(nome)) between 1 and 30),
  ordem      smallint not null check (ordem >= 0),

  -- Chave composta espelhada para uso em FK: garante, no nível do banco, que
  -- uma pauta nunca aponte para etapa de outro ofício (ver 0004).
  unique (id, oficio_id)
);

comment on table public.oficio_etapas is
  'Colunas do quadro, na ordem. A UI nunca inventa etapa: renderiza o que está aqui.';

-- DEFERRABLE porque reordenar etapas troca posições entre linhas dentro de uma
-- transação; sem o deferimento, o estado intermediário violaria a unicidade.
alter table public.oficio_etapas
  add constraint oficio_etapas_ordem_unica unique (oficio_id, ordem)
  deferrable initially immediate;

create index oficio_etapas_oficio_idx on public.oficio_etapas (oficio_id, ordem);


-- ─────────────────────────────────────────────────────────────────────────────
-- oficio_templates, pautas de um clique
-- ─────────────────────────────────────────────────────────────────────────────
create table public.oficio_templates (
  id         uuid primary key default gen_random_uuid(),
  oficio_id  uuid not null references public.oficios(id) on delete cascade,
  nome       text not null check (char_length(trim(nome)) between 1 and 60),
  campo1     text check (char_length(campo1) <= 40),
  campo2     text check (char_length(campo2) <= 40),
  ordem      smallint not null default 0
);

comment on table public.oficio_templates is
  'Modelos exibidos na sidebar. Clicar cria uma pauta na primeira etapa do quadro.';

create index oficio_templates_oficio_idx on public.oficio_templates (oficio_id, ordem);


-- ═══════════════════════════════════════════════════════════════════════════
-- Autorização de ofício
-- ═══════════════════════════════════════════════════════════════════════════

-- Visível: do sistema (todos) ou do meu workspace.
create or replace function app.oficio_visivel(p_oficio uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.oficios o
     where o.id = p_oficio
       and (o.workspace_id is null or app.e_membro(o.workspace_id))
  );
$$;

comment on function app.oficio_visivel(uuid) is
  'Ofício do sistema é visível a todos; ofício próprio só a membros do tenant.';


-- Editável: só ofício próprio do tenant, e só por dono/admin. Ofício do sistema
-- é imutável pela API, mudá-lo é migration, não clique.
create or replace function app.oficio_editavel(p_oficio uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.oficios o
     where o.id = p_oficio
       and o.workspace_id is not null
       and app.tem_papel(o.workspace_id, array['owner', 'admin']::public.papel[])
       and app.workspace_gravavel(o.workspace_id)
  );
$$;

comment on function app.oficio_editavel(uuid) is
  'Ofício do sistema nunca é editável pela API. Ofício próprio: dono/admin do tenant.';


-- ═══════════════════════════════════════════════════════════════════════════
-- Privilégios
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on public.oficios          from anon, authenticated;
revoke all on public.oficio_etapas    from anon, authenticated;
revoke all on public.oficio_templates from anon, authenticated;

grant select, insert, update, delete on public.oficios          to authenticated;
grant select, insert, update, delete on public.oficio_etapas    to authenticated;
grant select, insert, update, delete on public.oficio_templates to authenticated;

grant execute on function app.oficio_visivel(uuid)  to authenticated;
grant execute on function app.oficio_editavel(uuid) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.oficios          enable row level security;
alter table public.oficio_etapas    enable row level security;
alter table public.oficio_templates enable row level security;

-- ── oficios ─────────────────────────────────────────────────────────────────
create policy "ofício: vejo os do sistema e os do meu workspace"
  on public.oficios for select to authenticated
  using (workspace_id is null or app.e_membro(workspace_id));

-- `workspace_id is not null` no WITH CHECK é o que impede um cliente de criar
-- um ofício "do sistema" (visível a todos os tenants) via INSERT.
create policy "ofício: dono e admin criam ofício próprio"
  on public.oficios for insert to authenticated
  with check (
    workspace_id is not null
    and app.tem_papel(workspace_id, array['owner', 'admin']::public.papel[])
    and app.workspace_gravavel(workspace_id)
  );

create policy "ofício: só o próprio é editável"
  on public.oficios for update to authenticated
  using (
    workspace_id is not null
    and app.tem_papel(workspace_id, array['owner', 'admin']::public.papel[])
    and app.workspace_gravavel(workspace_id)
  )
  with check (
    workspace_id is not null
    and app.tem_papel(workspace_id, array['owner', 'admin']::public.papel[])
  );

create policy "ofício: só o próprio é excluível"
  on public.oficios for delete to authenticated
  using (
    workspace_id is not null
    and app.tem_papel(workspace_id, array['owner', 'admin']::public.papel[])
  );

-- ── oficio_etapas ───────────────────────────────────────────────────────────
create policy "etapas: vejo as dos ofícios que enxergo"
  on public.oficio_etapas for select to authenticated
  using (app.oficio_visivel(oficio_id));

create policy "etapas: edito só as de ofício próprio"
  on public.oficio_etapas for insert to authenticated
  with check (app.oficio_editavel(oficio_id));

create policy "etapas: atualizo só as de ofício próprio"
  on public.oficio_etapas for update to authenticated
  using (app.oficio_editavel(oficio_id))
  with check (app.oficio_editavel(oficio_id));

create policy "etapas: removo só as de ofício próprio"
  on public.oficio_etapas for delete to authenticated
  using (app.oficio_editavel(oficio_id));

-- ── oficio_templates ────────────────────────────────────────────────────────
create policy "templates: vejo os dos ofícios que enxergo"
  on public.oficio_templates for select to authenticated
  using (app.oficio_visivel(oficio_id));

create policy "templates: crio só em ofício próprio"
  on public.oficio_templates for insert to authenticated
  with check (app.oficio_editavel(oficio_id));

create policy "templates: atualizo só em ofício próprio"
  on public.oficio_templates for update to authenticated
  using (app.oficio_editavel(oficio_id))
  with check (app.oficio_editavel(oficio_id));

create policy "templates: removo só de ofício próprio"
  on public.oficio_templates for delete to authenticated
  using (app.oficio_editavel(oficio_id));


-- ═══════════════════════════════════════════════════════════════════════════
-- oficio_exemplos, o quadro que já nasce cheio
--
-- O aha moment do Pautaria é cair num quadro **populado**, não num quadro
-- vazio com as colunas certas. Um kanban zerado ainda é uma tela em branco:
-- o usuário continua sem saber que cara tem uma pauta boa naquele ofício.
--
-- Estas linhas viram as primeiras pautas do workspace no onboarding (0008).
-- São dado, como todo o resto: um ofício novo traz seus próprios exemplos sem
-- tocar em uma linha de React.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.oficio_exemplos (
  id           uuid primary key default gen_random_uuid(),
  oficio_id    uuid not null references public.oficios(id) on delete cascade,
  etapa_ordem  smallint not null check (etapa_ordem >= 0),
  titulo       text not null check (char_length(trim(titulo)) between 1 and 200),
  campo1       text check (char_length(campo1) <= 60),
  campo2       text check (char_length(campo2) <= 60),

  -- Prazo relativo ao dia da criação do workspace. Datas absolutas envelheceriam:
  -- ninguém quer estrear o produto com cinco pautas vencidas em 2026.
  prazo_dias   smallint,

  ordem        smallint not null default 0
);

comment on table public.oficio_exemplos is
  'Pautas de demonstração criadas no onboarding. Prazo relativo, nunca data fixa.';

create index oficio_exemplos_oficio_idx on public.oficio_exemplos (oficio_id, ordem);

revoke all on public.oficio_exemplos from anon, authenticated;
grant select on public.oficio_exemplos to authenticated;

alter table public.oficio_exemplos enable row level security;

create policy "exemplos: vejo os dos ofícios que enxergo"
  on public.oficio_exemplos for select to authenticated
  using (app.oficio_visivel(oficio_id));

-- Sem escrita pelo cliente: exemplo de ofício do sistema é migration; exemplo
-- de ofício próprio ainda não é feature (ver docs/09_BACKLOG).


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0004_quadros_pautas.sql                                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════════
-- 0004, Quadros e pautas: o dado operacional
--
-- Decisão de modelagem que merece atenção: a integridade "uma pauta pertence ao
-- mesmo tenant e ao mesmo ofício do seu quadro, e sua etapa pertence a esse
-- ofício" é garantida por **chaves estrangeiras compostas**, não por trigger.
--
-- Por quê: trigger é código, e código tem bug e tem janela de corrida. A FK
-- composta é uma promessa do Postgres, não existe caminho, nem via API nem via
-- psql nem via service_role distraída, que crie uma pauta apontando para a
-- etapa de outro ofício ou para o quadro de outro tenant. Custo: duas colunas
-- denormalizadas (`workspace_id`, `oficio_id`) em `pautas`. Vale cada byte:
-- `workspace_id` na própria linha também deixa a política de RLS ser um teste
-- direto, sem JOIN, o que importa numa tabela que será a mais consultada do
-- sistema.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- quadros
-- ─────────────────────────────────────────────────────────────────────────────
create table public.quadros (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  oficio_id      uuid not null references public.oficios(id) on delete restrict,
  titulo         text not null check (char_length(trim(titulo)) between 1 and 60),
  arquivado_em   timestamptz,
  criado_por     uuid references auth.users(id) on delete set null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),

  -- Alvos das FKs compostas de `pautas`. Sem estes UNIQUE, o Postgres recusa
  -- a referência composta.
  unique (id, workspace_id),
  unique (id, oficio_id)
);

comment on table public.quadros is
  'Um quadro = um ofício aplicado a um workspace. Trocar o ofício do quadro é RPC (0008).';

create index quadros_workspace_idx on public.quadros (workspace_id)
  where arquivado_em is null;

create trigger quadros_atualizado_em
  before update on public.quadros
  for each row execute function app.tocar_atualizado_em();


-- O ofício de um quadro precisa ser do sistema ou do próprio tenant. Isto não
-- cabe em FK (a condição é uma disjunção), então é trigger, e é a única
-- checagem cruzada desta migration que precisa ser.
create or replace function app.validar_oficio_do_quadro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_oficio_workspace uuid;
  v_existe boolean;
begin
  select o.workspace_id, true into v_oficio_workspace, v_existe
    from public.oficios o
   where o.id = new.oficio_id;

  if not coalesce(v_existe, false) then
    raise exception using errcode = '23503', message = 'Ofício inexistente.';
  end if;

  if v_oficio_workspace is not null and v_oficio_workspace <> new.workspace_id then
    raise exception using
      errcode = 'P0001',
      message = 'Este ofício pertence a outro workspace.',
      hint    = 'Use um ofício do sistema ou um ofício criado neste workspace.';
  end if;

  return new;
end;
$$;

create trigger validar_oficio_do_quadro
  before insert or update of oficio_id, workspace_id on public.quadros
  for each row execute function app.validar_oficio_do_quadro();


-- ─────────────────────────────────────────────────────────────────────────────
-- pautas, o card
-- ─────────────────────────────────────────────────────────────────────────────
create table public.pautas (
  id             uuid primary key default gen_random_uuid(),

  workspace_id   uuid not null,
  quadro_id      uuid not null,
  oficio_id      uuid not null,
  etapa_id       uuid not null,

  titulo         text not null check (char_length(trim(titulo)) between 1 and 200),

  -- Campos livres. O *rótulo* vem do ofício (Canal/Sprint/Contexto); o valor é
  -- texto simples. Vazio é NULL, nunca o traço '—' do protótipo: o traço é
  -- decisão de renderização, não de dado.
  campo1         text check (char_length(campo1) <= 60),
  campo2         text check (char_length(campo2) <= 60),

  prazo          date,
  responsavel_id uuid references auth.users(id) on delete set null,

  -- Ordenação fracionária: mover uma pauta entre duas outras é um UPDATE de uma
  -- linha (média das vizinhas), não uma renumeração da coluna inteira.
  posicao        double precision not null default 1000,

  arquivada_em   timestamptz,
  criado_por     uuid references auth.users(id) on delete set null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),

  -- ── Integridade estrutural, garantida pelo banco ─────────────────────────
  -- 1. a pauta está no tenant do seu quadro
  constraint pautas_quadro_tenant_fk
    foreign key (quadro_id, workspace_id)
    references public.quadros (id, workspace_id) on delete cascade
    deferrable initially immediate,

  -- 2. a pauta carrega o ofício do seu quadro
  constraint pautas_quadro_oficio_fk
    foreign key (quadro_id, oficio_id)
    references public.quadros (id, oficio_id) on delete cascade
    deferrable initially immediate,

  -- 3. a etapa da pauta pertence a esse ofício
  constraint pautas_etapa_oficio_fk
    foreign key (etapa_id, oficio_id)
    references public.oficio_etapas (id, oficio_id) on delete restrict
    deferrable initially immediate
);

comment on table public.pautas is
  'O card. Integridade tenant/ofício/etapa é garantida por FK composta, não por trigger.';
comment on column public.pautas.posicao is
  'Ordem dentro da etapa. Fracionária: reordenar move uma linha, não a coluna toda.';
comment on column public.pautas.campo1 is
  'Valor do campo livre 1. O rótulo ("Canal", "Sprint") vem de oficios.campo1_label.';

create index pautas_quadro_etapa_idx
  on public.pautas (quadro_id, etapa_id, posicao)
  where arquivada_em is null;
create index pautas_workspace_idx on public.pautas (workspace_id);
create index pautas_responsavel_idx on public.pautas (responsavel_id)
  where responsavel_id is not null;
create index pautas_prazo_idx on public.pautas (quadro_id, prazo)
  where prazo is not null and arquivada_em is null;

-- Busca por título sem varredura completa. `gin_trgm_ops` exigiria a extensão
-- pg_trgm; para o volume esperado por quadro (dezenas a centenas de pautas), o
-- índice acima já resolve e a busca roda no cliente sobre o quadro carregado.

create trigger pautas_atualizado_em
  before update on public.pautas
  for each row execute function app.tocar_atualizado_em();


-- Responsável precisa ser membro do workspace. Não é FK porque o par
-- (workspace_id, responsavel_id) é opcional e a remoção de um membro não pode
-- derrubar a pauta.
create or replace function app.validar_responsavel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.responsavel_id is null then
    return new;
  end if;

  if not exists (
    select 1 from public.workspace_members m
     where m.workspace_id = new.workspace_id
       and m.user_id = new.responsavel_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'O responsável precisa ser membro deste workspace.';
  end if;

  return new;
end;
$$;

create trigger validar_responsavel
  before insert or update of responsavel_id on public.pautas
  for each row execute function app.validar_responsavel();


-- Sair do workspace não apaga o trabalho: as pautas ficam, sem responsável.
create or replace function app.soltar_responsavel_ao_sair()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.pautas
     set responsavel_id = null
   where workspace_id = old.workspace_id
     and responsavel_id = old.user_id;
  return old;
end;
$$;

create trigger soltar_responsavel_ao_sair
  after delete on public.workspace_members
  for each row execute function app.soltar_responsavel_ao_sair();


-- ═══════════════════════════════════════════════════════════════════════════
-- Privilégios
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on public.quadros from anon, authenticated;
revoke all on public.pautas  from anon, authenticated;

grant select, insert, update, delete on public.quadros to authenticated;

-- `workspace_id` e `oficio_id` são graváveis no INSERT (o cliente precisa
-- informá-los), mas NÃO no UPDATE: mover uma pauta para outro tenant é um
-- caminho que simplesmente não existe.
grant select on public.pautas to authenticated;
grant insert (workspace_id, quadro_id, oficio_id, etapa_id, titulo, campo1, campo2,
              prazo, responsavel_id, posicao, criado_por)
  on public.pautas to authenticated;
grant update (etapa_id, titulo, campo1, campo2, prazo, responsavel_id, posicao,
              arquivada_em)
  on public.pautas to authenticated;
grant delete on public.pautas to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.quadros enable row level security;
alter table public.pautas  enable row level security;

-- ── quadros ─────────────────────────────────────────────────────────────────
create policy "quadro: vejo os do meu workspace"
  on public.quadros for select to authenticated
  using (app.e_membro(workspace_id));

create policy "quadro: membro cria"
  on public.quadros for insert to authenticated
  with check (app.workspace_gravavel(workspace_id));

create policy "quadro: membro edita"
  on public.quadros for update to authenticated
  using (app.workspace_gravavel(workspace_id))
  with check (app.workspace_gravavel(workspace_id));

create policy "quadro: dono e admin excluem"
  on public.quadros for delete to authenticated
  using (app.tem_papel(workspace_id, array['owner', 'admin']::public.papel[]));

-- ── pautas ──────────────────────────────────────────────────────────────────
-- O teste é direto em `workspace_id`, sem JOIN, sem subconsulta na tabela
-- quente. A FK composta acima é o que garante que essa coluna não mente.
create policy "pauta: vejo as do meu workspace"
  on public.pautas for select to authenticated
  using (app.e_membro(workspace_id));

create policy "pauta: membro cria"
  on public.pautas for insert to authenticated
  with check (app.workspace_gravavel(workspace_id));

create policy "pauta: membro edita"
  on public.pautas for update to authenticated
  using (app.workspace_gravavel(workspace_id))
  with check (app.workspace_gravavel(workspace_id));

create policy "pauta: membro exclui"
  on public.pautas for delete to authenticated
  using (app.workspace_gravavel(workspace_id));


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0005_planos_assinaturas.sql                                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════════
-- 0005, Planos, assinaturas e cobranças
--
-- Regra que organiza esta migration inteira: **o cliente nunca escreve aqui.**
-- Não há `grant insert/update/delete` para `authenticated` em `assinaturas` nem
-- em `cobrancas`. Toda mutação vem de Edge Function autenticada como
-- `service_role`, a partir de um fato confirmado pela Asaas.
--
-- O front lê o estado (para mostrar "Plano Estúdio · próxima cobrança 17/09") e
-- pede mudanças chamando função, nunca escrevendo tabela. Isso fecha a classe
-- de ataque mais óbvia de um SaaS: o usuário se dar um plano melhor.
--
-- Preço e limite vivem em `planos`, como dado, não como constante no código.
-- Mudar preço é UPDATE; criar plano é INSERT. O front lê a mesma tabela que a
-- Edge Function usa para calcular o valor enviado à Asaas, então a página de
-- preços e a cobrança real não têm como divergir.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- planos, catálogo comercial
-- ─────────────────────────────────────────────────────────────────────────────
create table public.planos (
  chave                  public.plano primary key,
  nome                   text not null,
  chamada                text not null,          -- uma linha para a página de preços
  preco_mensal_centavos  integer not null check (preco_mensal_centavos >= 0),
  preco_anual_centavos   integer not null check (preco_anual_centavos >= 0),

  -- Limites como dado. NULL em uma chave = ilimitado.
  --   max_quadros, max_pautas_por_quadro, max_membros : integer | null
  --   oficios_personalizados, exportar, historico     : boolean
  limites                jsonb not null default '{}'::jsonb
                           check (jsonb_typeof(limites) = 'object'),

  destaques              jsonb not null default '[]'::jsonb
                           check (jsonb_typeof(destaques) = 'array'),
  ordem                  smallint not null default 0,
  publico                boolean not null default true,
  atualizado_em          timestamptz not null default now()
);

comment on table public.planos is
  'Catálogo de planos. Fonte única de preço e limite, front e Edge Function leem daqui.';
comment on column public.planos.limites is
  'Limites do plano. Chave ausente ou nula = ilimitado. Aplicados por trigger em 0007.';

create trigger planos_atualizado_em
  before update on public.planos
  for each row execute function app.tocar_atualizado_em();


insert into public.planos
  (chave, nome, chamada, preco_mensal_centavos, preco_anual_centavos, limites, destaques, ordem)
values
  ('solo', 'Solo',
   'Para começar hoje, sem cartão.',
   0, 0,
   jsonb_build_object(
     'max_quadros', 1,
     'max_pautas_por_quadro', 40,
     'max_membros', 1,
     'oficios_personalizados', false,
     'exportar', false,
     'historico', false
   ),
   jsonb_build_array(
     '1 quadro', 'Até 40 pautas', 'Os 3 ofícios do sistema',
     'Quadro e tabela', 'Troca de ofício quando quiser'
   ),
   1),

  ('estudio', 'Estúdio',
   'Para quem vive de pauta.',
   2900, 29000,
   jsonb_build_object(
     'max_quadros', null,
     'max_pautas_por_quadro', null,
     'max_membros', 1,
     'oficios_personalizados', true,
     'exportar', true,
     'historico', true
   ),
   jsonb_build_array(
     'Quadros ilimitados', 'Pautas ilimitadas', 'Ofícios personalizados',
     'Exportar em CSV', 'Histórico de movimentação'
   ),
   2),

  ('time', 'Time',
   'Para o time inteiro no mesmo trilho.',
   7900, 79000,
   jsonb_build_object(
     'max_quadros', null,
     'max_pautas_por_quadro', null,
     'max_membros', 8,
     'oficios_personalizados', true,
     'exportar', true,
     'historico', true
   ),
   jsonb_build_array(
     'Tudo do Estúdio', 'Até 8 membros', 'Papéis (dono, admin, membro)',
     'Responsável por pauta', 'Registro de auditoria'
   ),
   3);

-- 12 meses pelo preço de 10. A conferência mora no banco para que ninguém
-- publique um preço anual maior que 12 mensalidades por engano de digitação.
alter table public.planos
  add constraint planos_anual_nao_pior_que_mensal
  check (preco_anual_centavos <= preco_mensal_centavos * 12);


-- ─────────────────────────────────────────────────────────────────────────────
-- assinaturas, espelho local da assinatura na Asaas
-- ─────────────────────────────────────────────────────────────────────────────
create table public.assinaturas (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.workspaces(id) on delete cascade,
  plano                 public.plano not null references public.planos(chave),
  ciclo                 public.ciclo_cobranca not null,
  status                public.status_assinatura not null default 'pendente',

  -- Valor no momento da contratação. Congelado de propósito: mudar o preço de
  -- tabela amanhã não pode alterar retroativamente o que já foi cobrado.
  valor_centavos        integer not null check (valor_centavos > 0),

  asaas_subscription_id text unique,
  asaas_customer_id     text not null,

  proxima_cobranca      date,
  inicio_periodo        timestamptz,
  fim_periodo           timestamptz,
  cancelada_em          timestamptz,
  motivo_cancelamento   text check (char_length(motivo_cancelamento) <= 300),

  criado_por            uuid references auth.users(id) on delete set null,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),

  constraint assinaturas_plano_pago check (plano <> 'solo')
);

comment on table public.assinaturas is
  'Espelho da assinatura na Asaas. Escrita exclusiva de Edge Function (service_role).';
comment on column public.assinaturas.valor_centavos is
  'Valor congelado na contratação. Mudança de tabela não altera contrato vigente.';

-- Um workspace tem no máximo uma assinatura viva. Assinaturas encerradas ficam
-- na tabela como histórico de cobrança.
create unique index assinaturas_viva_por_workspace_idx
  on public.assinaturas (workspace_id)
  where status in ('pendente', 'ativa', 'inadimplente');

create index assinaturas_workspace_idx on public.assinaturas (workspace_id);
create index assinaturas_status_idx on public.assinaturas (status, proxima_cobranca);

create trigger assinaturas_atualizado_em
  before update on public.assinaturas
  for each row execute function app.tocar_atualizado_em();


-- ─────────────────────────────────────────────────────────────────────────────
-- cobrancas, cada fatura gerada pela Asaas
--
-- O que NÃO existe nesta tabela, por decisão: número de cartão, bandeira,
-- titular, CVV, linha digitável completa, QR de Pix. O usuário paga na página
-- hospedada da Asaas; guardamos identificador e status. É isso que mantém o
-- Pautaria fora do escopo de PCI-DSS além do SAQ-A.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.cobrancas (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  assinatura_id     uuid references public.assinaturas(id) on delete set null,

  asaas_payment_id  text not null unique,
  status            public.status_cobranca not null,
  valor_centavos    integer not null check (valor_centavos >= 0),
  forma_pagamento   text check (char_length(forma_pagamento) <= 30),
  vencimento        date,
  pago_em           timestamptz,

  -- URL da fatura hospedada pela Asaas. É para onde mandamos o usuário pagar.
  url_fatura        text check (url_fatura ~ '^https://'),

  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

comment on table public.cobrancas is
  'Faturas da assinatura. Sem nenhum dado de cartão, o pagamento acontece na Asaas.';

create index cobrancas_workspace_idx on public.cobrancas (workspace_id, vencimento desc);
create index cobrancas_assinatura_idx on public.cobrancas (assinatura_id);

create trigger cobrancas_atualizado_em
  before update on public.cobrancas
  for each row execute function app.tocar_atualizado_em();


-- ═══════════════════════════════════════════════════════════════════════════
-- Consulta de limite, usada pelos triggers de 0007 e pela UI
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function app.limite_plano(p_workspace uuid, p_chave text)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(p.limites ->> p_chave, 'null')::numeric
    from public.workspaces w
    join public.planos p on p.chave = w.plano
   where w.id = p_workspace;
$$;

comment on function app.limite_plano(uuid, text) is
  'Limite numérico do plano vigente do workspace. NULL = ilimitado.';


create or replace function app.recurso_liberado(p_workspace uuid, p_chave text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((p.limites ->> p_chave)::boolean, false)
    from public.workspaces w
    join public.planos p on p.chave = w.plano
   where w.id = p_workspace;
$$;

comment on function app.recurso_liberado(uuid, text) is
  'Flag booleana do plano vigente (oficios_personalizados, exportar, historico).';


-- ═══════════════════════════════════════════════════════════════════════════
-- Privilégios, leitura e nada mais
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on public.planos      from anon, authenticated;
revoke all on public.assinaturas from anon, authenticated;
revoke all on public.cobrancas   from anon, authenticated;

-- A página de preços é pública: `anon` também lê o catálogo.
grant select on public.planos to anon, authenticated;

-- Nenhum insert/update/delete. Nem para o dono do workspace.
grant select (id, workspace_id, plano, ciclo, status, valor_centavos,
              proxima_cobranca, inicio_periodo, fim_periodo, cancelada_em,
              criado_em)
  on public.assinaturas to authenticated;

grant select (id, workspace_id, assinatura_id, status, valor_centavos,
              forma_pagamento, vencimento, pago_em, url_fatura, criado_em)
  on public.cobrancas to authenticated;

grant execute on function app.limite_plano(uuid, text)     to authenticated;
grant execute on function app.recurso_liberado(uuid, text) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.planos      enable row level security;
alter table public.assinaturas enable row level security;
alter table public.cobrancas   enable row level security;

create policy "planos: catálogo é público"
  on public.planos for select to anon, authenticated
  using (publico);

-- Assinatura e cobrança são dado financeiro do tenant: só dono e admin. Um
-- membro comum não precisa ver quanto o time paga.
create policy "assinatura: dono e admin leem"
  on public.assinaturas for select to authenticated
  using (app.tem_papel(workspace_id, array['owner', 'admin']::public.papel[]));

create policy "cobrança: dono e admin leem"
  on public.cobrancas for select to authenticated
  using (app.tem_papel(workspace_id, array['owner', 'admin']::public.papel[]));

-- Sem políticas de escrita, por decisão. `service_role` ignora RLS e é o único
-- caminho de mutação. Se um dia aparecer aqui uma policy de INSERT para
-- `authenticated`, é regressão de segurança, não conveniência.


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0006_seguranca_operacional.sql                                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

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


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0007_limites_de_plano.sql                                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════════
-- 0007, Limites de plano, aplicados pelo banco
--
-- A UI desabilita o botão para ser gentil. O banco recusa a linha para ser
-- correto. São camadas diferentes com propósitos diferentes, e só a segunda é
-- uma garantia: o cliente é código que roda na máquina do usuário, e qualquer
-- pessoa com o console do navegador aberto pode chamar a API sem passar pelo
-- botão.
--
-- Detalhe que costuma passar batido: `count(*)` seguido de `if` tem corrida.
-- Duas requisições simultâneas contam 39 pautas cada, ambas passam, e o
-- workspace termina com 41 num plano de 40. O `pg_advisory_xact_lock` por
-- workspace serializa apenas as inserções concorrentes do MESMO tenant, o
-- custo é nulo no caso normal (ninguém cria duas pautas no mesmo milissegundo)
-- e a contagem passa a ser exata.
--
-- Rebaixamento de plano: os gatilhos são todos de INSERT. Quem já tem 200
-- pautas e cai para o Solo continua vendo, editando, movendo e apagando as 200.
-- Só não cria a 201ª. Dado de usuário não é refém de cobrança.
-- ═══════════════════════════════════════════════════════════════════════════


-- Serializa as verificações de limite de um workspace dentro da transação.
create or replace function app.travar_workspace(p_workspace uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select pg_advisory_xact_lock(
    ('x' || substr(replace(p_workspace::text, '-', ''), 1, 16))::bit(64)::bigint
  );
$$;

comment on function app.travar_workspace(uuid) is
  'Lock consultivo por transação, por workspace. Torna exata a contagem de limites.';


-- Mensagem de erro padronizada. Errcode P0001 com um `hint` que a camada de
-- serviços traduz em `plano_limite_atingido`, o front recebe um código
-- estável, não uma string para casar com regex.
create or replace function app.erro_limite(p_mensagem text)
returns void
language plpgsql
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = p_mensagem,
    hint    = 'plano_limite_atingido';
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Quadros por workspace
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function app.limitar_quadros()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limite numeric;
  v_qtd    integer;
begin
  v_limite := app.limite_plano(new.workspace_id, 'max_quadros');
  if v_limite is null then
    return new;   -- ilimitado
  end if;

  perform app.travar_workspace(new.workspace_id);

  select count(*) into v_qtd
    from public.quadros q
   where q.workspace_id = new.workspace_id
     and q.arquivado_em is null;

  if v_qtd >= v_limite then
    perform app.erro_limite(format(
      'Seu plano permite %s quadro(s). Faça upgrade para criar mais.', v_limite::int));
  end if;

  return new;
end;
$$;

create trigger limitar_quadros
  before insert on public.quadros
  for each row execute function app.limitar_quadros();


-- ─────────────────────────────────────────────────────────────────────────────
-- Pautas por quadro
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function app.limitar_pautas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limite numeric;
  v_qtd    integer;
begin
  v_limite := app.limite_plano(new.workspace_id, 'max_pautas_por_quadro');
  if v_limite is null then
    return new;
  end if;

  perform app.travar_workspace(new.workspace_id);

  select count(*) into v_qtd
    from public.pautas p
   where p.quadro_id = new.quadro_id
     and p.arquivada_em is null;

  if v_qtd >= v_limite then
    perform app.erro_limite(format(
      'Seu plano permite %s pautas por quadro. Arquive alguma ou faça upgrade.',
      v_limite::int));
  end if;

  return new;
end;
$$;

create trigger limitar_pautas
  before insert on public.pautas
  for each row execute function app.limitar_pautas();


-- ─────────────────────────────────────────────────────────────────────────────
-- Membros por workspace
--
-- Conta membros efetivos **mais** convites em aberto: senão o dono do plano
-- Solo dispara oito convites, todos são aceitos, e o limite vira decoração.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function app.limitar_membros()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid := new.workspace_id;
  v_limite numeric;
  v_qtd    integer;
begin
  v_limite := app.limite_plano(v_workspace, 'max_membros');
  if v_limite is null then
    return new;
  end if;

  perform app.travar_workspace(v_workspace);

  select (select count(*) from public.workspace_members m where m.workspace_id = v_workspace)
       + (select count(*) from public.convites c
           where c.workspace_id = v_workspace
             and c.aceito_em is null
             and c.expira_em > now())
    into v_qtd;

  if v_qtd >= v_limite then
    perform app.erro_limite(format(
      'Seu plano permite %s membro(s), contando convites em aberto. Mude para o plano Time.',
      v_limite::int));
  end if;

  return new;
end;
$$;

create trigger limitar_membros
  before insert on public.workspace_members
  for each row execute function app.limitar_membros();

create trigger limitar_membros_por_convite
  before insert on public.convites
  for each row execute function app.limitar_membros();


-- ─────────────────────────────────────────────────────────────────────────────
-- Ofícios personalizados (flag booleana do plano)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function app.limitar_oficios_personalizados()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.workspace_id is null then
    return new;   -- ofício do sistema: só entra por migration/seed
  end if;

  if not app.recurso_liberado(new.workspace_id, 'oficios_personalizados') then
    perform app.erro_limite(
      'Ofícios personalizados fazem parte dos planos Estúdio e Time.');
  end if;

  return new;
end;
$$;

create trigger limitar_oficios_personalizados
  before insert on public.oficios
  for each row execute function app.limitar_oficios_personalizados();


-- ─────────────────────────────────────────────────────────────────────────────
-- Visão de uso, alimenta a UI para desabilitar botão ANTES do clique
--
-- `security_invoker = true` é essencial: sem isso a view rodaria com os
-- privilégios de quem a criou e devolveria o uso de todos os tenants. Com ele,
-- a RLS de cada tabela subjacente continua valendo para quem consulta.
-- ─────────────────────────────────────────────────────────────────────────────
create view public.v_uso_workspace
with (security_invoker = true)
as
select
  w.id                                   as workspace_id,
  w.plano,
  p.nome                                 as plano_nome,
  w.status,
  w.plano_expira_em,
  (select count(*) from public.quadros q
    where q.workspace_id = w.id and q.arquivado_em is null)      as quadros,
  (select count(*) from public.pautas pa
    where pa.workspace_id = w.id and pa.arquivada_em is null)    as pautas,
  (select count(*) from public.workspace_members m
    where m.workspace_id = w.id)                                 as membros,
  (select count(*) from public.convites c
    where c.workspace_id = w.id and c.aceito_em is null
      and c.expira_em > now())                                   as convites_abertos,
  p.limites
from public.workspaces w
join public.planos p on p.chave = w.plano;

comment on view public.v_uso_workspace is
  'Uso vs. limites do plano. security_invoker: respeita a RLS de quem consulta.';

revoke all on public.v_uso_workspace from anon, authenticated;
grant select on public.v_uso_workspace to authenticated;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0008_rpc_aplicacao.sql                                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════════
-- 0008, RPCs da aplicação
--
-- Uma operação vira RPC quando precisa ser **atômica** ou quando precisa de um
-- privilégio que o chamador não tem. Fora esses dois casos, o cliente fala com
-- as tabelas via PostgREST e a RLS decide, inventar RPC para tudo só reconstrói
-- um backend sem os benefícios de ter um.
--
-- As três aqui:
--   • criar_workspace, atomicidade: tenant + quadro + pautas de exemplo
--                             nascem juntos ou não nascem
--   • aceitar_convite, privilégio: quem aceita ainda não é membro e
--                             portanto não enxerga a linha do convite
--   • trocar_oficio_quadro, atomicidade: remapear todas as pautas para as
--                             etapas do novo ofício sem estado intermediário
--                             inválido
--
-- E uma quarta, interna, que não é RPC: `app.aplicar_estado_assinatura`, o
-- único lugar do sistema que decide qual plano um workspace tem.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- criar_workspace, o onboarding inteiro em uma transação
--
-- SECURITY INVOKER de propósito. A função não precisa de privilégio extra: o
-- trigger `ao_criar_workspace` (0002) cria o vínculo de dono assim que a linha
-- entra, e a partir daí a própria RLS autoriza o resto. Rodar como invoker
-- mantém todas as políticas valendo, inclusive os limites de plano, em vez de
-- abrir um buraco de privilégio por conveniência.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.criar_workspace(
  p_nome         text,
  p_oficio_chave text,
  p_semear       boolean default true
)
returns table (workspace_id uuid, slug text, quadro_id uuid)
language plpgsql
set search_path = ''
as $$
declare
  v_user      uuid := (select auth.uid());
  v_base      text;
  v_slug      text;
  v_sufixo    int := 0;
  v_workspace uuid;
  v_oficio    public.oficios%rowtype;
  v_quadro    uuid;
  v_exemplo   record;
  v_etapa     uuid;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'Autenticação obrigatória.';
  end if;

  if coalesce(trim(p_nome), '') = '' then
    raise exception using errcode = '22023', message = 'Informe um nome para o workspace.';
  end if;

  -- Ofício precisa ser do sistema: no onboarding o usuário ainda não tem
  -- workspace, logo não pode ter ofício próprio.
  select * into v_oficio
    from public.oficios o
   where o.chave = p_oficio_chave
     and o.workspace_id is null;

  if not found then
    raise exception using
      errcode = '22023',
      message = format('Ofício "%s" não existe.', p_oficio_chave);
  end if;

  -- Slug único. O laço tenta `estudio`, `estudio-2`, `estudio-3`… em vez de
  -- devolver erro de unicidade para o usuário resolver.
  v_base := left(coalesce(nullif(app.gerar_slug(p_nome), ''), 'workspace'), 34);
  v_slug := v_base;
  while exists (select 1 from public.workspaces w where w.slug = v_slug) loop
    v_sufixo := v_sufixo + 1;
    if v_sufixo > 200 then
      v_slug := v_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
      exit;
    end if;
    v_slug := v_base || '-' || v_sufixo;
  end loop;

  -- O id é gerado aqui, e não por `returning`. Motivo sutil e importante:
  -- `INSERT ... RETURNING` exige que a política de **SELECT** aprove a linha
  -- devolvida, e a política de SELECT de `workspaces` pede que o usuário já
  -- seja membro. Quem cria o vínculo é o trigger AFTER INSERT, que só dispara
  -- no fim da instrução, depois do RETURNING. O resultado seria um erro de RLS
  -- em pleno caminho feliz do onboarding. Gerar o uuid antes remove a
  -- dependência circular sem afrouxar política alguma.
  v_workspace := gen_random_uuid();

  insert into public.workspaces (id, nome, slug, criado_por)
  values (v_workspace, left(trim(p_nome), 60), v_slug, v_user);
  -- ← neste ponto o trigger ao_criar_workspace já criou o vínculo de dono

  v_quadro := gen_random_uuid();
  insert into public.quadros (id, workspace_id, oficio_id, titulo, criado_por)
  values (v_quadro, v_workspace, v_oficio.id, v_oficio.titulo_quadro, v_user);

  if p_semear then
    for v_exemplo in
      select e.etapa_ordem, e.titulo, e.campo1, e.campo2, e.prazo_dias, e.ordem
        from public.oficio_exemplos e
       where e.oficio_id = v_oficio.id
       order by e.ordem
    loop
      select et.id into v_etapa
        from public.oficio_etapas et
       where et.oficio_id = v_oficio.id
         and et.ordem = v_exemplo.etapa_ordem;

      continue when v_etapa is null;

      insert into public.pautas
        (workspace_id, quadro_id, oficio_id, etapa_id, titulo, campo1, campo2,
         prazo, responsavel_id, posicao, criado_por)
      values
        (v_workspace, v_quadro, v_oficio.id, v_etapa, v_exemplo.titulo,
         v_exemplo.campo1, v_exemplo.campo2,
         case when v_exemplo.prazo_dias is null
              then null
              else current_date + v_exemplo.prazo_dias end,
         case when v_oficio.solo then v_user else null end,
         (v_exemplo.ordem + 1) * 1000.0,
         v_user);
    end loop;
  end if;

  insert into public.audit_log (workspace_id, ator_id, evento, recurso, recurso_id, meta)
  values (v_workspace, v_user, 'workspace.criado', 'workspace', v_workspace::text,
          jsonb_build_object('oficio', v_oficio.chave));

  return query select v_workspace, v_slug, v_quadro;
end;
$$;

comment on function public.criar_workspace(text, text, boolean) is
  'Onboarding atômico: workspace + vínculo de dono + quadro + pautas de exemplo.';


-- ─────────────────────────────────────────────────────────────────────────────
-- aceitar_convite
--
-- SECURITY DEFINER porque quem aceita ainda não é membro e, pela RLS, não
-- enxerga a linha do convite. Duas travas compensam o privilégio elevado:
--   1. comparação por hash, o token em claro nunca esteve no banco;
--   2. o e-mail da conta autenticada precisa bater com o e-mail convidado, de
--      modo que um link vazado não serve para uma conta qualquer.
-- O limite de membros do plano continua valendo: o INSERT dispara o trigger de
-- 0007 normalmente.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.aceitar_convite(p_token text)
returns table (workspace_id uuid, slug text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := (select auth.uid());
  v_email   text;
  v_convite public.convites%rowtype;
  v_slug    text;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'Autenticação obrigatória.';
  end if;

  if coalesce(trim(p_token), '') = '' then
    raise exception using errcode = '22023', message = 'Convite inválido.';
  end if;

  select p.email into v_email from public.profiles p where p.id = v_user;

  select * into v_convite
    from public.convites c
   where c.token_hash = app.hash_token(p_token)
     and c.aceito_em is null
     and c.expira_em > now();

  -- Mensagem única para convite inexistente, expirado, já usado ou de outro
  -- e-mail: distinguir os casos ensinaria um atacante a sondar tokens.
  if not found or lower(v_convite.email) <> lower(coalesce(v_email, '')) then
    raise exception using
      errcode = 'P0001',
      message = 'Convite inválido ou expirado.',
      hint    = 'convite_invalido';
  end if;

  -- `if not exists` em vez de `on conflict (workspace_id, user_id)`: a lista de
  -- inferência do ON CONFLICT é resolvida como referência de coluna nua, e
  -- `workspace_id` também é o nome de um parâmetro OUT desta função, o
  -- plpgsql não sabe qual dos dois você quis e aborta com "ambiguous". Trocar
  -- por uma checagem explícita evita a colisão sem depender de
  -- `#variable_conflict`, que resolveria este caso e esconderia o próximo.
  if not exists (
    select 1 from public.workspace_members m
     where m.workspace_id = v_convite.workspace_id
       and m.user_id = v_user
  ) then
    insert into public.workspace_members (workspace_id, user_id, papel)
    values (v_convite.workspace_id, v_user, v_convite.papel);
  end if;

  update public.convites
     set aceito_em = now(), aceito_por = v_user
   where id = v_convite.id;

  select w.slug into v_slug
    from public.workspaces w where w.id = v_convite.workspace_id;

  insert into public.audit_log
    (workspace_id, ator_id, evento, recurso, recurso_id, meta, origem)
  values
    (v_convite.workspace_id, v_user, 'membro.entrou', 'convite', v_convite.id::text,
     jsonb_build_object('papel', v_convite.papel), 'servidor');

  return query select v_convite.workspace_id, v_slug;
end;
$$;

comment on function public.aceitar_convite(text) is
  'Aceita convite por token. Compara hash e exige que o e-mail da conta bata.';


-- ─────────────────────────────────────────────────────────────────────────────
-- trocar_oficio_quadro, a troca de sotaque, com as pautas junto
--
-- "Troque de ofício quando quiser, a pauta viaja junto." Traduzido em SQL: as
-- pautas mudam de etapa para a etapa de **mesma ordem** no novo ofício, e as
-- que não têm correspondente (ofício novo com menos colunas) caem na última.
--
-- `set constraints all deferred` é o que torna isso possível numa transação: as
-- FKs compostas de 0004 são violadas no estado intermediário (pauta ainda
-- apontando para etapa do ofício antigo enquanto o quadro já mudou), e só
-- voltam a fechar no fim. Sem o deferimento, seria necessário destruir e
-- recriar as pautas, perdendo id, histórico e qualquer referência a elas.
--
-- SECURITY DEFINER, ao contrário de `criar_workspace`. O motivo é concreto:
-- `pautas.oficio_id` está fora do `grant update` do cliente de propósito (0004),
-- porque essa coluna carrega a integridade estrutural da linha e um cliente não
-- tem por que mexer nela avulsa. Esta operação precisa mexer, então ela sobe
-- de privilégio e paga o preço: checa a autorização à mão, logo na entrada, em
-- vez de herdá-la da RLS. Toda função DEFINER do projeto deve abrir com esse
-- bloco de verificação; se não abrir, é bug de segurança.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.trocar_oficio_quadro(
  p_quadro uuid,
  p_oficio uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user       uuid := (select auth.uid());
  v_quadro     public.quadros%rowtype;
  v_oficio     public.oficios%rowtype;
  v_max_ordem  smallint;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'Autenticação obrigatória.';
  end if;

  select * into v_quadro from public.quadros q where q.id = p_quadro;
  if not found then
    raise exception using errcode = '42501', message = 'Quadro não encontrado.';
  end if;

  -- ── Autorização explícita, no lugar da RLS que o DEFINER desliga ─────────
  if not app.tem_papel(v_quadro.workspace_id, array['owner', 'admin']::public.papel[]) then
    raise exception using
      errcode = '42501',
      message = 'Só dono ou admin trocam o ofício de um quadro.';
  end if;

  if not app.workspace_gravavel(v_quadro.workspace_id) then
    raise exception using
      errcode = '42501',
      message = 'Este workspace está em modo somente-leitura.';
  end if;

  select * into v_oficio from public.oficios o where o.id = p_oficio;
  if not found or (v_oficio.workspace_id is not null
                   and v_oficio.workspace_id <> v_quadro.workspace_id) then
    raise exception using errcode = '22023', message = 'Ofício indisponível para este workspace.';
  end if;

  if v_oficio.id = v_quadro.oficio_id then
    return;
  end if;

  set constraints all deferred;

  select max(ordem) into v_max_ordem
    from public.oficio_etapas where oficio_id = p_oficio;

  if v_max_ordem is null then
    raise exception using errcode = '22023', message = 'O ofício de destino não tem etapas.';
  end if;

  update public.quadros
     set oficio_id = p_oficio,
         titulo    = case when titulo = (select o.titulo_quadro
                                           from public.oficios o
                                          where o.id = v_quadro.oficio_id)
                          then v_oficio.titulo_quadro
                          else titulo end
   where id = p_quadro;

  update public.pautas pa
     set oficio_id = p_oficio,
         etapa_id  = nova.id
    from (
      select antiga.id as etapa_antiga, destino.id
        from public.oficio_etapas antiga
        join lateral (
          select e.id
            from public.oficio_etapas e
           where e.oficio_id = p_oficio
           order by abs(e.ordem - least(antiga.ordem, v_max_ordem)), e.ordem
           limit 1
        ) destino on true
       where antiga.oficio_id = v_quadro.oficio_id
    ) nova
   where pa.quadro_id = p_quadro
     and pa.etapa_id = nova.etapa_antiga;

  insert into public.audit_log (workspace_id, ator_id, evento, recurso, recurso_id, meta)
  values (v_quadro.workspace_id, v_user, 'quadro.oficio_trocado', 'quadro', p_quadro::text,
          jsonb_build_object('de', v_quadro.oficio_id, 'para', p_oficio));
end;
$$;

comment on function public.trocar_oficio_quadro(uuid, uuid) is
  'Troca o ofício do quadro remapeando as pautas por ordem de etapa, em uma transação.';


-- ═══════════════════════════════════════════════════════════════════════════
-- app.aplicar_estado_assinatura, o único juiz do plano de um workspace
--
-- Existe exatamente uma função no sistema que escreve `workspaces.plano`. Tudo
-- que acontece na cobrança (webhook, cancelamento, reconciliação diária) chama
-- esta função e ela recalcula o estado a partir dos fatos gravados. O ganho é
-- que "qual plano este workspace tem?" tem uma resposta derivável, não uma
-- sequência de UPDATEs espalhados que podem discordar entre si.
--
-- Tolerância: 7 dias após o vencimento. O workspace segue gravável e o usuário
-- é avisado. Só depois disso vira somente-leitura, e nunca perde dado.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function app.aplicar_estado_assinatura(p_workspace uuid)
returns public.workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tolerancia constant interval := interval '7 days';
  v_ass  public.assinaturas%rowtype;
  v_ws   public.workspaces%rowtype;
  v_plano  public.plano;
  v_status public.status_workspace;
  v_expira timestamptz;
begin
  select * into v_ws from public.workspaces w where w.id = p_workspace for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Workspace não encontrado.';
  end if;

  select * into v_ass
    from public.assinaturas a
   where a.workspace_id = p_workspace
     and a.status in ('pendente', 'ativa', 'inadimplente')
   order by a.criado_em desc
   limit 1;

  if not found then
    -- Sem assinatura viva. Antes de cair para o Solo, honramos o período já
    -- pago de uma assinatura cancelada: quem pagou o mês inteiro usa o mês
    -- inteiro, mesmo tendo cancelado no dia 3. Cortar o acesso na hora do
    -- cancelamento seria ficar com o dinheiro sem entregar o serviço, e é
    -- justamente o tipo de detalhe que faz alguém não voltar a assinar.
    select * into v_ass
      from public.assinaturas a
     where a.workspace_id = p_workspace
       and a.status = 'cancelada'
       and a.fim_periodo is not null
       and a.fim_periodo > now()
     order by a.fim_periodo desc
     limit 1;

    if found then
      v_plano := v_ass.plano; v_status := 'ativo'; v_expira := v_ass.fim_periodo;
    else
      -- Plano gratuito. Um workspace nunca é bloqueado por não ter assinatura:
      -- o Solo é um plano, não uma punição.
      v_plano := 'solo'; v_status := 'ativo'; v_expira := null;
    end if;

  elsif v_ass.status = 'ativa' and v_ass.fim_periodo is not null
        and v_ass.fim_periodo > now() then
    v_plano := v_ass.plano; v_status := 'ativo'; v_expira := v_ass.fim_periodo;

  elsif v_ass.status in ('ativa', 'inadimplente') and v_ass.fim_periodo is not null
        and now() <= v_ass.fim_periodo + v_tolerancia then
    -- Venceu, mas está na tolerância: continua com o plano e gravável.
    v_plano := v_ass.plano; v_status := 'inadimplente';
    v_expira := v_ass.fim_periodo + v_tolerancia;

  elsif v_ass.status = 'pendente' then
    -- Contratou e ainda não pagou a primeira fatura: segue no Solo até
    -- confirmar. Liberar antes do pagamento seria dar o produto de graça a
    -- quem só gera boleto.
    v_plano := 'solo'; v_status := 'ativo'; v_expira := null;

  else
    -- Tolerância esgotada.
    v_plano := 'solo'; v_status := 'ativo'; v_expira := null;
    update public.assinaturas set status = 'expirada' where id = v_ass.id;
  end if;

  update public.workspaces
     set plano = v_plano,
         status = case when v_ws.status = 'cancelado' then 'cancelado' else v_status end,
         plano_expira_em = v_expira
   where id = p_workspace
  returning * into v_ws;

  return v_ws;
end;
$$;

comment on function app.aplicar_estado_assinatura(uuid) is
  'Recalcula plano/status do workspace a partir da assinatura. Único escritor de workspaces.plano.';


-- ═══════════════════════════════════════════════════════════════════════════
-- Privilégios das RPCs
--
-- `revoke from public` antes de conceder: por padrão o Postgres dá EXECUTE a
-- PUBLIC em toda função nova, o que incluiria `anon`. Conceder sem revogar
-- deixaria a função aberta a quem não fez login.
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on function public.criar_workspace(text, text, boolean) from public;
revoke all on function public.aceitar_convite(text) from public;
revoke all on function public.trocar_oficio_quadro(uuid, uuid) from public;
revoke all on function app.aplicar_estado_assinatura(uuid) from public;

grant execute on function public.criar_workspace(text, text, boolean) to authenticated;
grant execute on function public.aceitar_convite(text) to authenticated;
grant execute on function public.trocar_oficio_quadro(uuid, uuid) to authenticated;
grant execute on function app.aplicar_estado_assinatura(uuid) to service_role;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0009_endurecimento_realtime.sql                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════════
-- 0009, Endurecimento do schema e realtime
--
-- As migrations anteriores protegeram as tabelas que existem. Esta protege as
-- que **ainda não existem**, que é onde brechas costumam nascer.
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
    -- Duas condicoes, nao uma. O papel precisa existir E o usuario corrente
    -- precisa ser membro dele: `alter default privileges for role X` exige
    -- filiacao a X. Localmente o `postgres` e superusuario e passa nos dois
    -- papeis; no Supabase hospedado ele NAO e membro de `supabase_admin`, e
    -- checar so a existencia derrubava a migration inteira com
    -- "permission denied to change default privileges" (SQLSTATE 42501).
    --
    -- Pular `supabase_admin` no ambiente hospedado nao abre brecha: quem cria
    -- tabela em `public` ali e o `postgres` (via migration), e os privilegios
    -- padrao dele estao cobertos pela primeira volta do laco.
    if exists (select 1 from pg_roles where rolname = v_role)
       and pg_has_role(current_user, v_role, 'USAGE') then
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
-- aviso a ser triado depois, é um build quebrado.
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
-- `audit_log` e `profiles` ficam de fora, assinar tabela financeira via
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
-- movimento, sem isso, um UPDATE chega só com a chave primária.
alter table public.pautas  replica identity full;
alter table public.quadros replica identity full;


-- ─────────────────────────────────────────────────────────────────────────────
-- Rastro de versão do schema
-- ─────────────────────────────────────────────────────────────────────────────
comment on schema public is
  'Pautaria, schema de aplicação. Toda tabela aqui tem RLS. Ver docs/11_SEGURANCA.';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0010_pontes_servico.sql                                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

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


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0011_fechar_rpc_anon.sql                                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════════
-- 0011, fechar as RPCs da 0008 para o papel `anon`
--
-- ── O que estava errado ────────────────────────────────────────────────────
--
-- A 0008 termina com o par correto:
--
--     revoke all on function public.criar_workspace(...) from public;
--     grant execute on function public.criar_workspace(...) to authenticated;
--
-- e mesmo assim, no projeto hospedado, `anon` continuava com EXECUTE nas três.
-- Dois fatos se somam para produzir isso:
--
--   1. `public` e `anon` são coisas diferentes. `public` é o pseudo-papel que
--      representa "todo mundo, por omissão"; `anon` é um papel nominal de
--      verdade, o que o PostgREST assume quando a requisição chega sem JWT.
--      Revogar de `public` não toca uma concessão feita nominalmente a `anon`.
--
--   2. Todo projeto Supabase nasce com um `alter default privileges ... grant
--      execute on functions to anon, authenticated, service_role`. Então cada
--      função criada em `public` já surge com a concessão nominal a `anon` —
--      antes de a 0008 chegar na sua linha de `revoke`, que mira o alvo errado.
--
-- ── Por que a 0009 não cobriu ──────────────────────────────────────────────
--
-- A 0009 inverte exatamente esse padrão e o faz certo. Mas `alter default
-- privileges` vale só para objetos criados **depois** dela, e ela é a nona.
-- É por isso que as funções da 0010 (`consumir_rate_limit`,
-- `registrar_auditoria`) estão fechadas e as da 0008 não: as da 0010 nasceram
-- do lado protegido da linha do tempo.
--
-- ── Qual era o risco real ──────────────────────────────────────────────────
--
-- Nenhuma exploração direta: as três funções começam com
--
--     if v_user is null then raise exception ... 'Autenticação obrigatória.'
--
-- e `auth.uid()` é nulo para `anon`. O problema é outro, e é de prazo longo:
--
--   • superfície não autenticada, alcançável por qualquer pessoa com a chave
--     anon (que é pública por design) — uma função `SECURITY DEFINER` roda
--     ignorando RLS, então a checagem de `auth.uid()` no corpo dela é a única
--     coisa entre a internet e um privilégio elevado;
--   • invisível na leitura: o código-fonte diz `to authenticated` e quem revisa
--     conclui, razoavelmente, que `anon` está de fora;
--   • permanente: `create or replace function` **preserva** a ACL existente,
--     logo nenhuma reedição futura dessas funções corrige isso sozinha.
--
-- A correção é uma linha por função, e o valor dela está em fechar a distância
-- entre o que o repositório afirma e o que o banco faz.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- O alcance real do problema: os dois schemas, não as três funções
--
-- A suspeita começou nas três RPCs de `public`. O gate no fim deste arquivo
-- mostrou que `app` estava no mesmo estado, com 25 funções — `app.auditar`,
-- `app.tem_papel`, `app.limite_plano`, `app.consumir_rate_limit` e as demais —
-- todas executáveis por `anon` pelo mesmo motivo. Faz sentido: elas nasceram
-- em 0001 a 0008, do lado desprotegido da 0009.
--
-- Por que revogar em massa é seguro aqui:
--
--   • `anon` tem privilégio em exatamente UMA tabela, `planos`, e a política
--     dela é `qual: publico` — uma coluna booleana, sem chamada de função. Como
--     política de RLS roda com o privilégio de quem consulta, esta é a única
--     que `anon` chega a avaliar, e ela não depende de `app.*`.
--   • funções de gatilho (`app.limitar_pautas`, `app.proteger_ultimo_owner`…)
--     só disparam em escrita, e `anon` não tem escrita em lugar nenhum.
--   • `authenticated` fica intocado: as políticas continuam chamando
--     `app.e_membro`, `app.tem_papel` e companhia normalmente.
--
-- ── São DOIS defeitos diferentes, e um `revoke` só não resolve os dois ──────
--
-- Em `public`, as três RPCs têm concessão **nominal**: a ACL mostra
-- `anon=X/postgres`. Vem do `alter default privileges` que todo projeto
-- Supabase traz. Só sai com `revoke ... from anon`.
--
-- Em `app`, a ACL mostra `=X/postgres` — concessionário vazio é o **PUBLIC**,
-- o padrão do próprio PostgreSQL para qualquer função nova. `anon` só aparece
-- ali por ser membro de PUBLIC, e `revoke ... from anon` não faz absolutamente
-- nada contra uma concessão a PUBLIC. Só sai com `revoke ... from public`.
--
-- Revogar de PUBLIC não atinge quem precisa executar:
--
--   • `authenticated` tem concessão nominal própria (`authenticated=X`) nas
--     funções que as políticas de RLS chamam — `tem_papel`, `e_membro`,
--     `limite_plano`, `oficio_visivel` e companhia. Elas seguem funcionando.
--   • `service_role` idem, nas pontes das Edge Functions.
--   • as funções que ficariam sem concessão alguma são, sem exceção, funções de
--     **gatilho** mais a auxiliar `app.erro_limite`. Gatilho não precisa: o
--     PostgreSQL exige EXECUTE na hora do `create trigger`, não a cada disparo.
--     A prova está no próprio banco — `app.tocar_atualizado_em` já não tem
--     concessão além de `postgres` desde a 0001, e os gatilhos
--     `*_atualizado_em` dispararam normalmente no seed. E os quatro chamadores
--     de `erro_limite` são `security definer`, então por dentro deles o usuário
--     corrente é `postgres`, o dono.
--
-- `on all routines` em vez de `on all functions`: o segundo não inclui
-- procedures, e o objetivo aqui é não deixar categoria de fora.
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on all routines in schema public from public, anon;
revoke all on all routines in schema app    from public, anon;


-- ─────────────────────────────────────────────────────────────────────────────
-- Gate: nenhuma função de `public` ou `app` pode ser executável por `anon`
--
-- O `revoke` acima conserta as três de hoje. Este bloco impede que a mesma
-- armadilha volte amanhã: se alguém adicionar uma função nova e ela herdar a
-- concessão padrão do Supabase, a migration que a introduziu falha aqui, na
-- esteira, em vez de publicar uma porta aberta em silêncio.
--
-- `anon` continua com `usage` no schema `app` (a 0001 explica por quê: as
-- políticas de RLS chamam `app.*` e sem `usage` toda query morreria). `usage`
-- num schema não concede execução de função alguma — é justamente o que este
-- gate confirma.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_abertas text;
begin
  select string_agg(n.nspname || '.' || p.proname, ', ' order by p.proname)
    into v_abertas
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'app')
     and has_function_privilege('anon', p.oid, 'EXECUTE');

  if v_abertas is not null then
    raise exception using
      errcode = '42501',
      message = format('Funções executáveis por anon: %s', v_abertas),
      hint    = 'Adicione `revoke all on function ... from anon;` para cada uma.';
  end if;
end;
$$;
