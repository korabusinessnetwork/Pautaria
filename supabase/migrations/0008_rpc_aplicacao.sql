-- ═══════════════════════════════════════════════════════════════════════════
-- 0008 — RPCs da aplicação
--
-- Uma operação vira RPC quando precisa ser **atômica** ou quando precisa de um
-- privilégio que o chamador não tem. Fora esses dois casos, o cliente fala com
-- as tabelas via PostgREST e a RLS decide — inventar RPC para tudo só reconstrói
-- um backend sem os benefícios de ter um.
--
-- As três aqui:
--   • criar_workspace       — atomicidade: tenant + quadro + pautas de exemplo
--                             nascem juntos ou não nascem
--   • aceitar_convite       — privilégio: quem aceita ainda não é membro e
--                             portanto não enxerga a linha do convite
--   • trocar_oficio_quadro  — atomicidade: remapear todas as pautas para as
--                             etapas do novo ofício sem estado intermediário
--                             inválido
--
-- E uma quarta, interna, que não é RPC: `app.aplicar_estado_assinatura` — o
-- único lugar do sistema que decide qual plano um workspace tem.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- criar_workspace — o onboarding inteiro em uma transação
--
-- SECURITY INVOKER de propósito. A função não precisa de privilégio extra: o
-- trigger `ao_criar_workspace` (0002) cria o vínculo de dono assim que a linha
-- entra, e a partir daí a própria RLS autoriza o resto. Rodar como invoker
-- mantém todas as políticas valendo — inclusive os limites de plano — em vez de
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
  -- no fim da instrução — depois do RETURNING. O resultado seria um erro de RLS
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
--   1. comparação por hash — o token em claro nunca esteve no banco;
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
  -- `workspace_id` também é o nome de um parâmetro OUT desta função — o
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
-- trocar_oficio_quadro — a troca de sotaque, com as pautas junto
--
-- "Troque de ofício quando quiser — a pauta viaja junto." Traduzido em SQL: as
-- pautas mudam de etapa para a etapa de **mesma ordem** no novo ofício, e as
-- que não têm correspondente (ofício novo com menos colunas) caem na última.
--
-- `set constraints all deferred` é o que torna isso possível numa transação: as
-- FKs compostas de 0004 são violadas no estado intermediário (pauta ainda
-- apontando para etapa do ofício antigo enquanto o quadro já mudou), e só
-- voltam a fechar no fim. Sem o deferimento, seria necessário destruir e
-- recriar as pautas — perdendo id, histórico e qualquer referência a elas.
--
-- SECURITY DEFINER, ao contrário de `criar_workspace`. O motivo é concreto:
-- `pautas.oficio_id` está fora do `grant update` do cliente de propósito (0004),
-- porque essa coluna carrega a integridade estrutural da linha e um cliente não
-- tem por que mexer nela avulsa. Esta operação precisa mexer — então ela sobe
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
-- app.aplicar_estado_assinatura — o único juiz do plano de um workspace
--
-- Existe exatamente uma função no sistema que escreve `workspaces.plano`. Tudo
-- que acontece na cobrança (webhook, cancelamento, reconciliação diária) chama
-- esta função e ela recalcula o estado a partir dos fatos gravados. O ganho é
-- que "qual plano este workspace tem?" tem uma resposta derivável, não uma
-- sequência de UPDATEs espalhados que podem discordar entre si.
--
-- Tolerância: 7 dias após o vencimento. O workspace segue gravável e o usuário
-- é avisado. Só depois disso vira somente-leitura — e nunca perde dado.
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
    -- cancelamento seria ficar com o dinheiro sem entregar o serviço — e é
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
