-- ═══════════════════════════════════════════════════════════════════════════
--  TESTE DE ISOLAMENTO ENTRE TENANTS
--
--  Executado por `bash scripts/testar-isolamento.sh`. É gate de release: se
--  qualquer afirmação abaixo falhar, o deploy para.
--
--  O que este arquivo faz de diferente de "conferir que a RLS está ligada":
--  ele encena o ataque. Cria dois workspaces com donos distintos, assume a
--  identidade de cada um exatamente como o PostgREST faz (`set local role
--  authenticated` + `request.jwt.claims`), e tenta atravessar a fronteira por
--  todos os caminhos que um cliente tem: ler, inserir, atualizar, apagar,
--  escalar privilégio de plano e forjar auditoria.
--
--  Tudo roda dentro de uma transação com ROLLBACK no fim, o banco fica como
--  estava.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
\timing off
\pset tuples_only on
\pset format unaligned
\pset footer off

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- Utilitários do teste
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function pg_temp.afirmar(p_ok boolean, p_descricao text)
returns void language plpgsql as $$
begin
  if p_ok then
    raise notice '  ✓ %', p_descricao;
  else
    raise exception 'FALHA DE ISOLAMENTO: %', p_descricao;
  end if;
end;
$$;

-- Assume a identidade de um usuário do jeito que o PostgREST assume.
create or replace function pg_temp.virar(p_user uuid)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated',
                      'aud', 'authenticated')::text,
    true);
end;
$$;

create or replace function pg_temp.virar_postgres()
returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

create or replace function pg_temp.virar_anon()
returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
end;
$$;

-- Executa um comando esperando que ele seja RECUSADO. Devolve true se falhou
-- (que é o resultado desejado num teste de fronteira).
create or replace function pg_temp.recusado(p_sql text)
returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;   -- passou: isso é o problema
exception when others then
  return true;    -- barrado: era o esperado
end;
$$;

-- Quantas linhas um UPDATE/DELETE realmente tocou.
--
-- A RLS tem dois modos de barrar, e a diferença importa: `WITH CHECK` levanta
-- exceção (a linha que você quer gravar é inválida), enquanto `USING` apenas
-- torna a linha invisível, o comando "funciona" e afeta zero linhas. Um teste
-- que só procura exceção passaria batido pelo segundo caso e não teria provado
-- nada sobre UPDATE e DELETE cruzando tenants.
create or replace function pg_temp.linhas_afetadas(p_sql text)
returns integer language plpgsql as $$
declare v_n integer;
begin
  execute p_sql;
  get diagnostics v_n = row_count;
  return v_n;
exception when others then
  -- O motivo é impresso: quando um teste reprova, saber SE foi barrado não
  -- ajuda a corrigir; saber POR QUE, sim.
  raise notice '    (barrado: %, %)', sqlstate, sqlerrm;
  return -1;
end;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCO 1, Cobertura de RLS
-- ═══════════════════════════════════════════════════════════════════════════
\echo '▸ Bloco 1, cobertura de RLS'

do $$
declare
  v_faltando text;
begin
  select string_agg(tabela || ' (' || motivo || ')', ', ')
    into v_faltando
    from app.tabelas_sem_rls();

  perform pg_temp.afirmar(
    v_faltando is null,
    coalesce('toda tabela de negócio tem RLS' ||
             case when v_faltando is null then '' else ', PENDENTE: ' || v_faltando end,
             ''));
end;
$$;

do $$
declare v_qtd int;
begin
  select count(*) into v_qtd from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public';
  perform pg_temp.afirmar(v_qtd >= 25,
    format('políticas de RLS registradas: %s', v_qtd));
end;
$$;

-- Colunas financeiras não podem estar no grant de UPDATE de `authenticated`.
do $$
declare v_col text;
begin
  foreach v_col in array array['plano', 'status', 'asaas_customer_id', 'plano_expira_em'] loop
    perform pg_temp.afirmar(
      not has_column_privilege('authenticated', 'public.workspaces', v_col, 'UPDATE'),
      format('cliente não pode escrever workspaces.%s', v_col));
  end loop;
end;
$$;

do $$
begin
  perform pg_temp.afirmar(
    not has_table_privilege('authenticated', 'public.assinaturas', 'INSERT')
    and not has_table_privilege('authenticated', 'public.assinaturas', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.assinaturas', 'DELETE'),
    'cliente não escreve em assinaturas');

  perform pg_temp.afirmar(
    not has_table_privilege('authenticated', 'public.cobrancas', 'INSERT')
    and not has_table_privilege('authenticated', 'public.cobrancas', 'UPDATE'),
    'cliente não escreve em cobrancas');

  perform pg_temp.afirmar(
    not has_table_privilege('authenticated', 'public.webhook_eventos', 'SELECT')
    and not has_table_privilege('anon', 'public.webhook_eventos', 'SELECT'),
    'webhook_eventos é inalcançável pela API');

  perform pg_temp.afirmar(
    not has_table_privilege('authenticated', 'public.rate_limit', 'SELECT'),
    'rate_limit é inalcançável pela API');

  perform pg_temp.afirmar(
    not has_column_privilege('authenticated', 'public.audit_log', 'origem', 'INSERT'),
    'cliente não consegue marcar auditoria como origem=servidor');

  perform pg_temp.afirmar(
    not has_column_privilege('authenticated', 'public.convites', 'token_hash', 'SELECT'),
    'token_hash de convite nunca sai do servidor');
end;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCO 2, Cenário: dois tenants, dois donos
-- ═══════════════════════════════════════════════════════════════════════════
\echo ''
\echo '▸ Bloco 2, montando dois tenants'

-- IDs fixos para o teste ser legível na saída.
\set uid_a 'aaaaaaaa-0000-4000-8000-000000000001'
\set uid_b 'bbbbbbbb-0000-4000-8000-000000000002'

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values
  -- A senha é irrelevante: o teste assume a identidade via claims, não via
  -- login. Um hash bcrypt inválido evita depender da extensão pgcrypto aqui.
  ('00000000-0000-0000-0000-000000000000', :'uid_a'::uuid, 'authenticated',
   'authenticated', 'alice@teste.local', 'sem-login-neste-teste',
   now(), now(), now(), '{"provider":"email"}'::jsonb, '{"nome":"Alice Teste"}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', :'uid_b'::uuid, 'authenticated',
   'authenticated', 'bruno@teste.local', 'sem-login-neste-teste',
   now(), now(), now(), '{"provider":"email"}'::jsonb, '{"nome":"Bruno Teste"}'::jsonb);

-- Alice cria o workspace dela, com o ofício de Marketing.
select pg_temp.virar(:'uid_a'::uuid);
select workspace_id as ws_a, quadro_id as quadro_a
  from public.criar_workspace('Estúdio da Alice', 'mkt') \gset

-- Bruno cria o dele, com o ofício de TI.
select pg_temp.virar(:'uid_b'::uuid);
select workspace_id as ws_b, quadro_id as quadro_b
  from public.criar_workspace('Squad do Bruno', 'ti') \gset

select pg_temp.virar_postgres();

-- Capturamos os ids internos do Bruno AGORA, como superusuário. É o que torna
-- o Bloco 4 um ataque de verdade: sem isso, Alice tentaria inserir usando um
-- SELECT que a própria RLS esvazia, o INSERT afetaria zero linhas, e o teste
-- passaria sem nunca ter encostado na fronteira. Um atacante real não descobre
-- ids por SELECT, descobre por vazamento, log, ou adivinhação. Damos os ids de
-- graça a ela e exigimos que a barreira segure mesmo assim.
select oficio_id as oficio_b from public.quadros where id = :'quadro_b'::uuid \gset
select id as etapa_b0 from public.oficio_etapas
 where oficio_id = :'oficio_b'::uuid and ordem = 0 \gset
select id as pauta_b from public.pautas
 where workspace_id = :'ws_b'::uuid order by criado_em limit 1 \gset

select pg_temp.afirmar(
  (select count(*) from public.pautas where workspace_id = :'ws_a'::uuid) = 6,
  'workspace da Alice nasceu com as 6 pautas de exemplo do ofício Marketing');

select pg_temp.afirmar(
  (select count(*) from public.pautas where workspace_id = :'ws_b'::uuid) = 5,
  'workspace do Bruno nasceu com as 5 pautas de exemplo do ofício TI');


-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCO 3, Leitura não atravessa a fronteira
-- ═══════════════════════════════════════════════════════════════════════════
\echo ''
\echo '▸ Bloco 3, leitura'

select pg_temp.virar(:'uid_a'::uuid);

select pg_temp.afirmar(
  (select count(*) from public.workspaces) = 1,
  'Alice enxerga exatamente 1 workspace (o dela)');

select pg_temp.afirmar(
  (select count(*) from public.workspaces where id = :'ws_b'::uuid) = 0,
  'Alice não enxerga o workspace do Bruno');

select pg_temp.afirmar(
  (select count(*) from public.pautas where workspace_id = :'ws_b'::uuid) = 0,
  'Alice não lê nenhuma pauta do Bruno');

select pg_temp.afirmar(
  (select count(*) from public.pautas) > 0,
  'Alice lê as próprias pautas de exemplo');

select pg_temp.afirmar(
  (select count(*) from public.quadros where id = :'quadro_b'::uuid) = 0,
  'Alice não enxerga o quadro do Bruno');

select pg_temp.afirmar(
  (select count(*) from public.workspace_members where workspace_id = :'ws_b'::uuid) = 0,
  'Alice não lista os membros do Bruno');

select pg_temp.afirmar(
  (select count(*) from public.profiles) = 1,
  'Alice só enxerga o próprio perfil, não há diretório global de usuários');

select pg_temp.afirmar(
  (select count(*) from public.v_uso_workspace) = 1,
  'a view de uso respeita a RLS (security_invoker)');

select pg_temp.afirmar(
  (select count(*) from public.oficios where workspace_id is null) = 3,
  'os 3 ofícios do sistema são visíveis a todos');


-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCO 4, Escrita não atravessa a fronteira
-- ═══════════════════════════════════════════════════════════════════════════
\echo ''
\echo '▸ Bloco 4, escrita'

-- Com todos os ids em mãos, a única coisa entre Alice e o quadro do Bruno é a
-- política de RLS. É exatamente essa a afirmação que queremos provar.
select pg_temp.afirmar(
  pg_temp.recusado(format(
    $q$ insert into public.pautas
          (workspace_id, quadro_id, oficio_id, etapa_id, titulo, posicao)
        values (%L::uuid, %L::uuid, %L::uuid, %L::uuid, 'invasao', 1) $q$,
    :'ws_b', :'quadro_b', :'oficio_b', :'etapa_b0')),
  'Alice não cria pauta no quadro do Bruno nem com os ids na mão');

select pg_temp.afirmar(
  pg_temp.recusado(format(
    $q$ insert into public.quadros (workspace_id, oficio_id, titulo)
        values (%L::uuid, %L::uuid, 'quadro invasor') $q$, :'ws_b', :'oficio_b')),
  'Alice não cria quadro no workspace do Bruno');

select pg_temp.afirmar(
  pg_temp.linhas_afetadas(format(
    $q$ update public.pautas set titulo = 'sequestrada' where id = %L::uuid $q$,
    :'pauta_b')) <= 0,
  'UPDATE de Alice não alcança a pauta do Bruno nem pelo id exato');

select pg_temp.afirmar(
  pg_temp.linhas_afetadas(format(
    $q$ delete from public.pautas where id = %L::uuid $q$, :'pauta_b')) <= 0,
  'DELETE de Alice não alcança a pauta do Bruno nem pelo id exato');

select pg_temp.afirmar(
  pg_temp.linhas_afetadas(format(
    $q$ update public.pautas set titulo = 'sequestrada' where workspace_id = %L::uuid $q$,
    :'ws_b')) <= 0,
  'UPDATE em massa de Alice não alcança nenhuma pauta do Bruno');

select pg_temp.afirmar(
  pg_temp.linhas_afetadas(format(
    $q$ delete from public.pautas where workspace_id = %L::uuid $q$, :'ws_b')) <= 0,
  'DELETE em massa de Alice não alcança nenhuma pauta do Bruno');

select pg_temp.afirmar(
  pg_temp.linhas_afetadas(format(
    $q$ update public.workspaces set nome = 'tomado' where id = %L::uuid $q$,
    :'ws_b')) <= 0,
  'Alice não renomeia o workspace do Bruno');

-- O teste mais revelador do bloco: um UPDATE deliberadamente sem filtro. Se a
-- RLS não estivesse valendo, ele reescreveria as 11 pautas do banco. Atingir
-- exatamente as 6 da Alice prova que a política funciona como WHERE implícito.
select pg_temp.afirmar(
  pg_temp.linhas_afetadas(
    $q$ update public.pautas set titulo = titulo where true $q$) = 6,
  'UPDATE sem WHERE de Alice atinge só as 6 pautas dela, a RLS é o WHERE implícito');

select pg_temp.afirmar(
  pg_temp.recusado(format(
    $q$ insert into public.workspace_members (workspace_id, user_id, papel)
        values (%L::uuid, %L::uuid, 'owner') $q$, :'ws_b', :'uid_a')),
  'Alice não se adiciona como dona do workspace do Bruno');


-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCO 5, Escalada de privilégio de plano
--
-- O ataque mais óbvio de um SaaS: o usuário se dar o plano pago. Precisa
-- falhar por privilégio de COLUNA, antes de qualquer lógica de aplicação.
-- ═══════════════════════════════════════════════════════════════════════════
\echo ''
\echo '▸ Bloco 5, escalada de plano'

select pg_temp.afirmar(
  pg_temp.recusado(format(
    $q$ update public.workspaces set plano = 'time' where id = %L::uuid $q$, :'ws_a')),
  'Alice não muda o próprio plano para Time');

select pg_temp.afirmar(
  pg_temp.recusado(format(
    $q$ update public.workspaces set status = 'ativo', plano_expira_em = now() + interval '10 years'
         where id = %L::uuid $q$, :'ws_a')),
  'Alice não estende a própria validade de plano');

select pg_temp.afirmar(
  pg_temp.recusado(format(
    $q$ insert into public.assinaturas
          (workspace_id, plano, ciclo, status, valor_centavos, asaas_customer_id)
        values (%L::uuid, 'time', 'anual', 'ativa', 1, 'cus_falso') $q$, :'ws_a')),
  'Alice não forja uma assinatura ativa');

select pg_temp.afirmar(
  pg_temp.recusado(
    $q$ update public.planos set preco_mensal_centavos = 0 where chave = 'time' $q$),
  'Alice não altera a tabela de preços');


-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCO 6, Auditoria e tabelas de defesa
-- ═══════════════════════════════════════════════════════════════════════════
\echo ''
\echo '▸ Bloco 6, auditoria e defesa'

select pg_temp.afirmar(
  pg_temp.recusado(format(
    $q$ insert into public.audit_log (workspace_id, ator_id, evento, origem)
        values (%L::uuid, %L::uuid, 'assinatura.ativada', 'servidor') $q$,
    :'ws_a', :'uid_a')),
  'Alice não forja registro de auditoria com origem=servidor');

select pg_temp.afirmar(
  pg_temp.recusado(
    $q$ update public.audit_log set evento = 'nada.aconteceu' where true $q$),
  'ninguém edita o audit_log (append-only)');

select pg_temp.afirmar(
  pg_temp.recusado($q$ delete from public.audit_log where true $q$),
  'ninguém apaga o audit_log (append-only)');

select pg_temp.afirmar(
  pg_temp.recusado($q$ select count(*) from public.webhook_eventos $q$),
  'webhook_eventos permanece inalcançável em runtime');

select pg_temp.afirmar(
  pg_temp.recusado($q$ select app.aplicar_estado_assinatura(gen_random_uuid()) $q$),
  'a função que decide o plano não é chamável pelo cliente');

-- As pontes de serviço (0010) existem em `public` e, portanto, têm rota HTTP.
-- Quem as fecha é o grant. Cada uma precisa recusar o cliente autenticado.
select pg_temp.afirmar(
  pg_temp.recusado(format(
    $q$ select public.aplicar_estado_assinatura(%L::uuid) $q$, :'ws_a')),
  'ponte de serviço: cliente não recalcula o próprio plano');

select pg_temp.afirmar(
  pg_temp.recusado(
    $q$ select public.consumir_rate_limit('escopo:teste', 1, 60) $q$),
  'ponte de serviço: cliente não manipula o rate limit');

select pg_temp.afirmar(
  pg_temp.recusado(format(
    $q$ select public.registrar_auditoria(%L::uuid, %L::uuid, 'assinatura.ativada') $q$,
    :'ws_a', :'uid_a')),
  'ponte de serviço: cliente não escreve auditoria de servidor');

select pg_temp.afirmar(
  pg_temp.recusado($q$ select public.faxina_operacional() $q$),
  'ponte de serviço: cliente não dispara faxina operacional');

select pg_temp.afirmar(
  pg_temp.recusado($q$ select public.auditoria_rls() $q$),
  'ponte de serviço: cliente não enumera a postura de RLS do banco');


-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCO 7, Limites de plano são do banco, não da UI
-- ═══════════════════════════════════════════════════════════════════════════
\echo ''
\echo '▸ Bloco 7, limites de plano'

select pg_temp.afirmar(
  pg_temp.recusado(format(
    $q$ insert into public.quadros (workspace_id, oficio_id, titulo)
        select %L::uuid, o.id, 'Segundo quadro'
          from public.oficios o where o.chave = 'prod' and o.workspace_id is null $q$,
    :'ws_a')),
  'plano Solo recusa o segundo quadro (limite no banco)');

select pg_temp.afirmar(
  pg_temp.recusado(format(
    $q$ insert into public.oficios
          (workspace_id, chave, nome, hue, titulo_quadro, campo1_label, campo2_label)
        values (%L::uuid, 'meu', 'Meu ofício', 200, 'Meu quadro', 'A', 'B') $q$, :'ws_a')),
  'plano Solo recusa ofício personalizado');

-- O caminho feliz continua funcionando: limite não pode virar bloqueio geral.
-- Um teste de segurança que só prova negativas esconde o pior tipo de
-- regressão, a que fecha o produto junto com a brecha.
select pg_temp.afirmar(
  pg_temp.linhas_afetadas(format(
    $q$ insert into public.pautas
          (workspace_id, quadro_id, oficio_id, etapa_id, titulo, posicao, criado_por)
        select %L::uuid, q.id, q.oficio_id, e.id, 'Pauta legítima', 99999, %L::uuid
          from public.quadros q
          join public.oficio_etapas e on e.oficio_id = q.oficio_id and e.ordem = 0
         where q.id = %L::uuid $q$, :'ws_a', :'uid_a', :'quadro_a')) = 1,
  'Alice cria pauta no próprio quadro normalmente');

select pg_temp.afirmar(
  pg_temp.linhas_afetadas(format(
    $q$ update public.pautas set etapa_id = (
          select e.id from public.oficio_etapas e
            join public.quadros q on q.oficio_id = e.oficio_id
           where q.id = %L::uuid and e.ordem = 2)
         where titulo = 'Pauta legítima' $q$, :'quadro_a')) = 1,
  'Alice move a própria pauta entre etapas normalmente');


-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCO 8, Integridade estrutural (FK composta)
-- ═══════════════════════════════════════════════════════════════════════════
\echo ''
\echo '▸ Bloco 8, integridade estrutural'

select pg_temp.afirmar(
  pg_temp.recusado(format(
    $q$ insert into public.pautas
          (workspace_id, quadro_id, oficio_id, etapa_id, titulo, posicao)
        select %L::uuid, %L::uuid, q.oficio_id, e.id, 'etapa de outro ofício', 1
          from public.quadros q,
               lateral (select e2.id from public.oficio_etapas e2
                         join public.oficios o on o.id = e2.oficio_id
                        where o.chave = 'prod' and o.workspace_id is null limit 1) e
         where q.id = %L::uuid $q$, :'ws_a', :'quadro_a', :'quadro_a')),
  'FK composta impede pauta apontar para etapa de outro ofício');


-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCO 9, Perspectiva do Bruno (a fronteira vale nos dois sentidos)
-- ═══════════════════════════════════════════════════════════════════════════
\echo ''
\echo '▸ Bloco 9, do outro lado'

select pg_temp.virar(:'uid_b'::uuid);

select pg_temp.afirmar(
  (select count(*) from public.workspaces) = 1,
  'Bruno também enxerga apenas o workspace dele');

select pg_temp.afirmar(
  (select count(*) from public.pautas where workspace_id = :'ws_a'::uuid) = 0,
  'Bruno não lê pauta alguma da Alice');

select pg_temp.afirmar(
  (select count(*) from public.audit_log where workspace_id = :'ws_a'::uuid) = 0,
  'Bruno não lê a auditoria da Alice');


-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCO 10, Usuário anônimo
-- ═══════════════════════════════════════════════════════════════════════════
\echo ''
\echo '▸ Bloco 10, anônimo'

select pg_temp.virar_anon();

select pg_temp.afirmar(
  pg_temp.recusado($q$ select count(*) from public.pautas $q$),
  'anônimo não alcança pautas');

select pg_temp.afirmar(
  pg_temp.recusado($q$ select count(*) from public.workspaces $q$),
  'anônimo não alcança workspaces');

select pg_temp.afirmar(
  pg_temp.recusado($q$ select count(*) from public.profiles $q$),
  'anônimo não alcança perfis');

select pg_temp.afirmar(
  (select count(*) from public.planos) = 3,
  'anônimo lê o catálogo de planos (a página de preços é pública)');

select pg_temp.afirmar(
  pg_temp.recusado($q$ select public.criar_workspace('x', 'mkt') $q$),
  'anônimo não cria workspace');


-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCO 11, "a pauta viaja junto": troca de ofício
--
-- A promessa da tela de abertura, verificada em SQL. Alice troca o quadro de
-- Marketing (5 etapas) para Produtividade (4 etapas). As pautas precisam
-- sobreviver com o mesmo id, migrar para a etapa de ordem correspondente, e as
-- que estavam na 5ª coluna precisam cair na última do novo ofício.
--
-- Este bloco exercita o `set constraints all deferred` das FKs compostas,
-- justamente o trecho de 0008 que seria impossível de conferir por leitura.
-- ═══════════════════════════════════════════════════════════════════════════
\echo ''
\echo '▸ Bloco 11, troca de ofício'

select pg_temp.virar(:'uid_a'::uuid);

select id as oficio_prod from public.oficios
 where chave = 'prod' and workspace_id is null \gset

\set pautas_antes 7

select pg_temp.afirmar(
  pg_temp.linhas_afetadas(format(
    $q$ select public.trocar_oficio_quadro(%L::uuid, %L::uuid) $q$,
    :'quadro_a', :'oficio_prod')) >= 0,
  'Alice troca o ofício do próprio quadro sem erro');

select pg_temp.afirmar(
  (select count(*) from public.pautas where quadro_id = :'quadro_a'::uuid) = :pautas_antes,
  format('nenhuma pauta se perdeu na troca (%s continuam)', :pautas_antes));

select pg_temp.afirmar(
  (select count(*) from public.pautas p
     join public.oficio_etapas e on e.id = p.etapa_id
    where p.quadro_id = :'quadro_a'::uuid
      and e.oficio_id <> :'oficio_prod'::uuid) = 0,
  'toda pauta migrou para uma etapa do novo ofício');

select pg_temp.afirmar(
  (select count(*) from public.pautas
    where quadro_id = :'quadro_a'::uuid and oficio_id <> :'oficio_prod'::uuid) = 0,
  'a coluna denormalizada oficio_id acompanhou a troca');

select pg_temp.afirmar(
  (select count(distinct e.ordem) from public.pautas p
     join public.oficio_etapas e on e.id = p.etapa_id
    where p.quadro_id = :'quadro_a'::uuid) > 1,
  'as pautas ficaram distribuídas entre etapas, não amontoadas numa só');


-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCO 12, Convites
-- ═══════════════════════════════════════════════════════════════════════════
\echo ''
\echo '▸ Bloco 12, convites'

select pg_temp.afirmar(
  pg_temp.recusado(format(
    $q$ insert into public.convites (workspace_id, email, papel, token_hash, expira_em, criado_por)
        values (%L::uuid, 'terceiro@teste.local', 'membro', 'hash-falso',
                now() + interval '7 days', %L::uuid) $q$, :'ws_a', :'uid_a')),
  'plano Solo recusa convidar um segundo membro');

select pg_temp.afirmar(
  pg_temp.recusado($q$ select public.aceitar_convite('token-que-nunca-existiu') $q$),
  'token de convite inventado é recusado');

-- Convite legítimo, criado pelo servidor (como o webhook faria após upgrade).
select pg_temp.virar_postgres();
update public.workspaces set plano = 'time' where id = :'ws_a'::uuid;
insert into public.convites (workspace_id, email, papel, token_hash, expira_em, criado_por)
values (:'ws_a'::uuid, 'bruno@teste.local', 'membro',
        app.hash_token('token-real-do-email'), now() + interval '7 days', :'uid_a'::uuid);

select pg_temp.virar(:'uid_b'::uuid);
select pg_temp.afirmar(
  pg_temp.linhas_afetadas(
    $q$ select public.aceitar_convite('token-real-do-email') $q$) >= 0,
  'Bruno aceita o convite com o token certo');

select pg_temp.afirmar(
  (select count(*) from public.workspaces) = 2,
  'Bruno agora enxerga os dois workspaces');

select pg_temp.afirmar(
  (select count(*) from public.pautas where workspace_id = :'ws_a'::uuid) = 7,
  'e passa a enxergar as pautas da Alice, porque agora é membro, não por brecha');

select pg_temp.afirmar(
  (select count(*) from public.assinaturas where workspace_id = :'ws_a'::uuid) = 0
  and (select count(*) from public.cobrancas where workspace_id = :'ws_a'::uuid) = 0,
  'mas continua sem ver dado financeiro: membro comum não é dono nem admin');

select pg_temp.afirmar(
  pg_temp.linhas_afetadas(format(
    $q$ delete from public.workspaces where id = %L::uuid $q$, :'ws_a')) <= 0,
  'membro comum não exclui o workspace de que participa');

select pg_temp.afirmar(
  pg_temp.linhas_afetadas(format(
    $q$ update public.workspace_members set papel = 'owner'
         where workspace_id = %L::uuid and user_id = %L::uuid $q$,
    :'ws_a', :'uid_b')) <= 0,
  'membro comum não se promove a dono');

select pg_temp.afirmar(
  pg_temp.linhas_afetadas(format(
    $q$ delete from public.workspace_members
         where workspace_id = %L::uuid and user_id = %L::uuid $q$,
    :'ws_a', :'uid_a')) <= 0,
  'membro comum não expulsa a dona do workspace');

-- E o caminho legítimo de saída continua aberto: entrar num time não pode
-- virar armadilha.
select pg_temp.afirmar(
  pg_temp.linhas_afetadas(format(
    $q$ delete from public.workspace_members
         where workspace_id = %L::uuid and user_id = %L::uuid $q$,
    :'ws_a', :'uid_b')) = 1,
  'mas pode sair sozinho do workspace quando quiser');


-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCO 13, Máquina de estados da assinatura
--
-- `app.aplicar_estado_assinatura` é a única função do sistema que escreve
-- `workspaces.plano`. Todo o resto (webhook, cancelamento, reconciliação) só
-- grava fatos e chama ela. Por isso ela merece teste de ramo a ramo: um erro
-- aqui é "o cliente pagou e não recebeu" ou "o cliente parou de pagar e
-- continuou recebendo".
--
-- Roda como postgres porque é isso que a Edge Function é: service_role.
-- ═══════════════════════════════════════════════════════════════════════════
\echo ''
\echo '▸ Bloco 13, máquina de estados da assinatura'

select pg_temp.virar_postgres();

-- Estado inicial
select pg_temp.afirmar(
  (select plano from public.workspaces where id = :'ws_b'::uuid) = 'solo',
  'workspace novo nasce no plano solo');

-- ── Ramo 1: contratou, ainda não pagou ───────────────────────────────────────
insert into public.assinaturas
  (workspace_id, plano, ciclo, status, valor_centavos, asaas_customer_id,
   asaas_subscription_id)
values (:'ws_b'::uuid, 'estudio', 'mensal', 'pendente', 2900, 'cus_t', 'sub_t');

select pg_temp.afirmar(
  (select plano from app.aplicar_estado_assinatura(:'ws_b'::uuid)) = 'solo',
  'assinatura pendente NÃO libera o plano, boleto gerado não é boleto pago');

-- ── Ramo 2: pagamento confirmado ─────────────────────────────────────────────
update public.assinaturas
   set status = 'ativa',
       inicio_periodo = now(),
       fim_periodo = now() + interval '30 days'
 where workspace_id = :'ws_b'::uuid;

select pg_temp.afirmar(
  (select plano  from app.aplicar_estado_assinatura(:'ws_b'::uuid)) = 'estudio'
  and (select status from public.workspaces where id = :'ws_b'::uuid) = 'ativo',
  'pagamento confirmado libera o plano e mantém o workspace ativo');

-- ── Ramo 3: venceu, dentro da tolerância de 7 dias ───────────────────────────
update public.assinaturas
   set status = 'inadimplente', fim_periodo = now() - interval '2 days'
 where workspace_id = :'ws_b'::uuid;

select pg_temp.afirmar(
  (select plano from app.aplicar_estado_assinatura(:'ws_b'::uuid)) = 'estudio',
  'atraso de 2 dias mantém o plano, tolerância existe para isso');

select pg_temp.afirmar(
  (select status from public.workspaces where id = :'ws_b'::uuid) = 'inadimplente',
  'mas o workspace é marcado inadimplente, para a UI poder avisar');

select pg_temp.afirmar(
  app.workspace_gravavel(:'ws_b'::uuid) is not null,
  'workspace inadimplente continua gravável: atraso não trava o trabalho do dia');

-- ── Ramo 4: tolerância esgotada ──────────────────────────────────────────────
update public.assinaturas
   set fim_periodo = now() - interval '30 days'
 where workspace_id = :'ws_b'::uuid;

select pg_temp.afirmar(
  (select plano from app.aplicar_estado_assinatura(:'ws_b'::uuid)) = 'solo',
  'passada a tolerância, o workspace volta ao solo');

select pg_temp.afirmar(
  (select status from public.assinaturas where workspace_id = :'ws_b'::uuid) = 'expirada',
  'e a assinatura é marcada como expirada');

-- ── Ramo 5: o dado do usuário sobrevive ao rebaixamento ──────────────────────
select pg_temp.afirmar(
  (select count(*) from public.pautas where workspace_id = :'ws_b'::uuid) = 5,
  'rebaixar plano NÃO apaga pauta alguma, dado de usuário não é refém de cobrança');

-- ── Ramo 6: cancelou no meio do período pago ─────────────────────────────────
update public.assinaturas
   set status = 'cancelada',
       cancelada_em = now(),
       fim_periodo = now() + interval '20 days'
 where workspace_id = :'ws_b'::uuid;

select pg_temp.afirmar(
  (select plano from app.aplicar_estado_assinatura(:'ws_b'::uuid)) = 'estudio',
  'quem cancela hoje usa até o fim do mês que já pagou');

select pg_temp.afirmar(
  (select plano_expira_em from public.workspaces where id = :'ws_b'::uuid) > now(),
  'e a data-limite do acesso fica registrada no workspace');

-- ── Ramo 7: o período cancelado terminou ─────────────────────────────────────
update public.assinaturas
   set fim_periodo = now() - interval '1 day'
 where workspace_id = :'ws_b'::uuid;

select pg_temp.afirmar(
  (select plano from app.aplicar_estado_assinatura(:'ws_b'::uuid)) = 'solo',
  'terminado o período pago, o cancelamento faz efeito');

-- ── Ramo 8: a trava contra assinatura duplicada ──────────────────────────────
insert into public.assinaturas
  (workspace_id, plano, ciclo, status, valor_centavos, asaas_customer_id)
values (:'ws_b'::uuid, 'time', 'anual', 'pendente', 79000, 'cus_t');

select pg_temp.afirmar(
  pg_temp.recusado(format(
    $q$ insert into public.assinaturas
          (workspace_id, plano, ciclo, status, valor_centavos, asaas_customer_id)
        values (%L::uuid, 'estudio', 'mensal', 'pendente', 2900, 'cus_t') $q$, :'ws_b')),
  'índice único impede duas assinaturas vivas, a trava contra clique duplo');

-- ── Ramo 9: integridade de valores ───────────────────────────────────────────
select pg_temp.afirmar(
  pg_temp.recusado(format(
    $q$ insert into public.assinaturas
          (workspace_id, plano, ciclo, status, valor_centavos, asaas_customer_id)
        values (%L::uuid, 'solo', 'mensal', 'ativa', 100, 'cus_t') $q$, :'ws_a')),
  'não existe assinatura do plano gratuito');

select pg_temp.afirmar(
  pg_temp.recusado(
    $q$ update public.planos set preco_anual_centavos = 999999 where chave = 'estudio' $q$
  ) or (select preco_anual_centavos <= preco_mensal_centavos * 12
          from public.planos where chave = 'estudio'),
  'preço anual nunca pode ficar pior que 12 mensalidades');


select pg_temp.virar_postgres();

\echo ''
rollback;
