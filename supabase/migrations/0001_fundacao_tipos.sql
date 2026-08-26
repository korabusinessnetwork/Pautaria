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
