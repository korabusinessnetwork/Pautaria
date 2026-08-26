# 00, Visão

> Por que o Pautaria existe. Se um documento contradiz este, o erro está no outro.
> A identidade completa (personas, tom, valores) vive em `memory/identity.md`.

## O problema

Quem trabalha por fluxo, social media, squad de produto, autônomo, precisa de um quadro.
As ferramentas disponíveis entregam uma tela em branco e transferem a configuração para o
usuário: nomear colunas, inventar campos, decidir vocabulário.

Três consequências observáveis:

1. **O quadro nasce genérico.** "To do / Doing / Done" não descreve o trabalho de ninguém.
2. **A configuração fica pela metade.** Ninguém termina de modelar o próprio processo às
   14h de uma terça.
3. **O quadro é abandonado.** Em três semanas volta tudo para a planilha ou o caderno.

O problema não é falta de recurso na ferramenta. É o custo cognitivo cobrado **antes** de
qualquer valor ser entregue.

## A inversão

> **O ofício é a configuração.**

Escolher "Marketing" já entrega: cinco etapas (Ideias → Roteiro → Produção → Aprovação →
Publicado), dois campos rotulados (`Canal`, `Campanha`), um título ("Pauta de conteúdo"),
uma cor, três templates e seis pautas de exemplo. Nada disso é perguntado.

Escolher "TI · Dev" entrega Backlog → Deploy, `Sprint` e `Estimativa`, chips em fonte
monoespaçada. Escolher "Produtividade" entrega quatro colunas, `Contexto` e `Energia`, e
some com responsável e avatares, porque é um quadro de uma pessoa só.

## North star

**Tempo entre o cadastro e o primeiro quadro útil.** Alvo: menos de 60 segundos.

É a métrica que o produto inteiro serve. Ela explica por que o nome do workspace é
derivado em vez de perguntado, por que o quadro nasce povoado, e por que não existe tela
de setup em lugar nenhum.

Métricas de apoio: taxa de quem cria a segunda pauta no primeiro dia; taxa de quem troca
de ofício ao menos uma vez (prova que o segundo aha aconteceu); retenção em 30 dias.

## O que o Pautaria **não** é

- **Não** é um construtor de banco de dados sem código. Campos são dois, com rótulo do
  ofício. Quem precisa de 14 campos customizados precisa de outra ferramenta.
- **Não** compete por integrações. Compete por tempo até o primeiro quadro útil.
- **Não** é para empresas com processo de compra. É self-service, R$ 29 a R$ 79.

Dizer isto aqui tem função prática: metade das decisões de roadmap são recusas, e a recusa
precisa de fundamento escrito.

## Como o produto escala

Um nicho novo, jurídico, obra, consultório, edição de vídeo, é:

```sql
insert into oficios (chave, nome, glifo, hue, chroma, titulo_quadro,
                     campo1_label, campo2_label, mono, solo) values (...);
insert into oficio_etapas ...;
insert into oficio_templates ...;
insert into oficio_exemplos ...;
```

**Zero linhas de React. Zero deploy.** É a consequência mais importante da arquitetura, e
está descrita em `docs/01_ARQUITETURA` e no ADR-003.

## Modelo de negócio

Assinatura recorrente via Asaas, cobrada do **workspace**.

| Plano | Preço | Para quem |
|---|---|---|
| `solo` | grátis, permanente | quem está conhecendo, e quem usa sozinho e cabe no limite |
| `estudio` | R$ 29/mês · R$ 290/ano | quem vive de pauta |
| `time` | R$ 79/mês · R$ 790/ano | quando entram outras pessoas |

O gratuito é o funil, não uma amostra temporal, ver `memory/decisions.md` D1.

## Fase atual

**Fase 1, Fundação + MVP monetizável.** Auth, workspace multi-tenant, quadro e tabela,
os três ofícios do sistema, assinatura Asaas ponta a ponta, limites de plano aplicados
pelo banco, e o teste de isolamento entre tenants como gate de release.

Roadmap completo em `memory/identity.md`; itens priorizados em `docs/09_BACKLOG`.
