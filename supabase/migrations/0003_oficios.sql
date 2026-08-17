-- ═══════════════════════════════════════════════════════════════════════════
-- 0003 — Ofícios: a configuração que vira produto
--
-- Esta é a migration mais importante do ponto de vista de **produto**. Tudo que
-- o usuário percebe como "o sistema se adaptou a mim" — as colunas do quadro, o
-- rótulo dos campos, o título, a cor, os templates, a fonte dos chips — está
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
  -- solo: quadro de uma pessoa só — esconde responsável e avatares
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
-- (workspace_id, chave)` porque NULL nunca conflita com NULL no Postgres — sem
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
-- oficio_etapas — as colunas do kanban
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
-- oficio_templates — pautas de um clique
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
-- é imutável pela API — mudá-lo é migration, não clique.
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
-- oficio_exemplos — o quadro que já nasce cheio
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
