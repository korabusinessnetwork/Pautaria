-- ═══════════════════════════════════════════════════════════════════════════
-- 0007 — Limites de plano, aplicados pelo banco
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
-- workspace serializa apenas as inserções concorrentes do MESMO tenant — o
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
-- serviços traduz em `plano_limite_atingido` — o front recebe um código
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
-- Visão de uso — alimenta a UI para desabilitar botão ANTES do clique
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
