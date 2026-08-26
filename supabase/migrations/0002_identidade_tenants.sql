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
