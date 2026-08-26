-- ═══════════════════════════════════════════════════════════════════════════
-- Seed, os três ofícios do sistema
--
-- Esta é a tradução direta do bloco `NICHES` do protótipo de design para dados.
-- É a prova do princípio central do Pautaria: o produto inteiro que o usuário
-- experimenta, colunas, rótulos, cores, templates, exemplos, cabe neste
-- arquivo. Nenhum componente React precisa saber que "Marketing" existe.
--
-- Idempotente: `supabase db reset` roda de novo sem duplicar nem falhar.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

insert into public.oficios
  (workspace_id, chave, nome, descricao, glifo, hue, chroma,
   titulo_quadro, campo1_label, campo2_label, mono, solo, ordem)
values
  (null, 'mkt',  'Marketing',
   'Da ideia ao publicado, cada canal no seu ritmo.',
   '▲', 45,  0.160, 'Pauta de conteúdo', 'Canal',    'Campanha',   false, false, 1),

  (null, 'ti',   'TI · Dev',
   'Sprint, review e deploy no mesmo trilho.',
   '■', 160, 0.130, 'Pauta do time',     'Sprint',   'Estimativa', true,  false, 2),

  (null, 'prod', 'Produtividade',
   'Sua semana em quatro colunas honestas.',
   '●', 265, 0.130, 'Minha semana',      'Contexto', 'Energia',    false, true,  3)
on conflict do nothing;


-- ─────────────────────────────────────────────────────────────────────────────
-- Etapas, as colunas do quadro
-- ─────────────────────────────────────────────────────────────────────────────
with dados(chave, nome, ordem) as (values
  ('mkt',  'Ideias',      0), ('mkt',  'Roteiro',     1), ('mkt',  'Produção',    2),
  ('mkt',  'Aprovação',   3), ('mkt',  'Publicado',   4),

  ('ti',   'Backlog',     0), ('ti',   'Em dev',      1), ('ti',   'Code review', 2),
  ('ti',   'QA',          3), ('ti',   'Deploy',      4),

  ('prod', 'Entrada',     0), ('prod', 'Hoje',        1), ('prod', 'Esta semana', 2),
  ('prod', 'Feito',       3)
)
insert into public.oficio_etapas (oficio_id, nome, ordem)
select o.id, d.nome, d.ordem::smallint
  from dados d
  join public.oficios o on o.chave = d.chave and o.workspace_id is null
 where not exists (
   select 1 from public.oficio_etapas e
    where e.oficio_id = o.id and e.ordem = d.ordem::smallint
 );


-- ─────────────────────────────────────────────────────────────────────────────
-- Templates, as pautas de um clique da sidebar
-- ─────────────────────────────────────────────────────────────────────────────
with dados(chave, nome, ordem) as (values
  ('mkt',  'Post carrossel',        0),
  ('mkt',  'Reels, vídeo curto',   1),
  ('mkt',  'Newsletter da semana',  2),

  ('ti',   'Bugfix',                0),
  ('ti',   'Feature nova',          1),
  ('ti',   'Refactor',              2),

  ('prod', 'Revisão semanal',       0),
  ('prod', 'Hábito novo',           1),
  ('prod', 'Lista de leitura',      2)
)
insert into public.oficio_templates (oficio_id, nome, ordem)
select o.id, d.nome, d.ordem::smallint
  from dados d
  join public.oficios o on o.chave = d.chave and o.workspace_id is null
 where not exists (
   select 1 from public.oficio_templates t
    where t.oficio_id = o.id and t.nome = d.nome
 );


-- ─────────────────────────────────────────────────────────────────────────────
-- Exemplos, as pautas que já estão no quadro quando ele abre
--
-- `prazo_dias` é relativo ao dia da criação do workspace. Negativo = já venceu
-- (a pauta publicada da semana passada, a tarefa que ficou para trás), porque
-- um quadro real tem as duas coisas, e um quadro só com prazos futuros parece
-- um catálogo, não um trabalho em andamento.
-- ─────────────────────────────────────────────────────────────────────────────
with dados(chave, etapa_ordem, titulo, campo1, campo2, prazo_dias, ordem) as (values
  -- Marketing
  ('mkt',  0, 'Série: bastidores do estúdio',    'Instagram', 'Marca · mensal',  3,   0),
  ('mkt',  1, 'Reels, 3 erros de quem começa',  'Instagram', 'Aquisição',       4,   1),
  ('mkt',  2, 'Newsletter #42, cases',          'E-mail',    'Retenção',        5,   2),
  ('mkt',  2, 'Vídeo, tour do produto',         'YouTube',   'Lançamento',      10,  3),
  ('mkt',  3, 'Carrossel, prova social',        'Instagram', 'Aquisição',       2,   4),
  ('mkt',  4, 'Post, vaga de designer',         'LinkedIn',  'Marca',           -2,  5),

  -- TI · Dev
  ('ti',   0, 'Migrar fila para worker',         'Sprint 15', '8 pts',           15,  0),
  ('ti',   1, 'Login por passkey',               'Sprint 14', '5 pts',           4,   1),
  ('ti',   2, 'Fuso errado no relatório',        'Sprint 14', '2 pts',           2,   2),
  ('ti',   3, 'Dark mode do painel',             'Sprint 14', '3 pts',           5,   3),
  ('ti',   4, 'Cache de sessão',                 'Sprint 13', '1 pt',            -3,  4),

  -- Produtividade
  ('prod', 0, 'Marcar dentista',                 'Rápida',       'Baixa',        null, 0),
  ('prod', 1, 'Treino de força',                 'Saúde',        'Alta',         0,    1),
  ('prod', 1, 'Revisar orçamento do mês',        'Casa',         'Média',        0,    2),
  ('prod', 2, 'Capítulo 4, curso de UX',        'Estudo',       'Alta',         4,    3),
  ('prod', 3, 'Planejar viagem de setembro',     'Planejamento', null,           -5,   4)
)
insert into public.oficio_exemplos
  (oficio_id, etapa_ordem, titulo, campo1, campo2, prazo_dias, ordem)
select o.id, d.etapa_ordem::smallint, d.titulo, d.campo1, d.campo2,
       d.prazo_dias::smallint, d.ordem::smallint
  from dados d
  join public.oficios o on o.chave = d.chave and o.workspace_id is null
 where not exists (
   select 1 from public.oficio_exemplos e
    where e.oficio_id = o.id and e.titulo = d.titulo
 );

commit;
