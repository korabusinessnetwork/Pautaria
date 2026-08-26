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
