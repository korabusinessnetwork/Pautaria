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
