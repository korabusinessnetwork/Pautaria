-- ═══════════════════════════════════════════════════════════════════════════
-- 0005 — Planos, assinaturas e cobranças
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
-- Preço e limite vivem em `planos`, como dado — não como constante no código.
-- Mudar preço é UPDATE; criar plano é INSERT. O front lê a mesma tabela que a
-- Edge Function usa para calcular o valor enviado à Asaas, então a página de
-- preços e a cobrança real não têm como divergir.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- planos — catálogo comercial
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
  'Catálogo de planos. Fonte única de preço e limite — front e Edge Function leem daqui.';
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
-- assinaturas — espelho local da assinatura na Asaas
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
-- cobrancas — cada fatura gerada pela Asaas
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
  'Faturas da assinatura. Sem nenhum dado de cartão — o pagamento acontece na Asaas.';

create index cobrancas_workspace_idx on public.cobrancas (workspace_id, vencimento desc);
create index cobrancas_assinatura_idx on public.cobrancas (assinatura_id);

create trigger cobrancas_atualizado_em
  before update on public.cobrancas
  for each row execute function app.tocar_atualizado_em();


-- ═══════════════════════════════════════════════════════════════════════════
-- Consulta de limite — usada pelos triggers de 0007 e pela UI
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
-- Privilégios — leitura e nada mais
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
-- `authenticated`, é regressão de segurança — não conveniência.
