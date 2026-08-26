# 10, Prompts

> Biblioteca de prompts para agentes de IA que trabalham neste repositório. O objetivo é
> que um agente novo produza código indistinguível do que já existe, o que significa
> carregar as restrições certas **antes** de escrever, não corrigir depois.

## Leitura obrigatória antes de qualquer tarefa

Nesta ordem:

1. `CLAUDE.md`, a constituição. Precede qualquer preferência.
2. `memory/restrictions.md`, prioridade máxima; metade das ideias esbarra aqui.
3. `docs/00_VISAO`, o que o produto é, e o que ele não é.
4. O documento da área tocada (`03_` regras, `04_` modelagem, `11_` segurança).

## Prompt-base

```
Trabalhe no Pautaria seguindo CLAUDE.md.

Antes de escrever qualquer linha:
1. leia memory/restrictions.md (prioridade máxima)
2. leia o doc da área que a tarefa toca (docs/03_, 04_ ou 11_)
3. confirme que a tarefa não contraria docs/00_VISAO

Invariantes que não se negociam:
- Nenhum componente importa @supabase/supabase-js, tudo por src/lib/*.service.ts
- Nenhum componente conhece o nome de um ofício. Rótulo vem de oficio.*, cor de (hue, chroma)
- Tabela nova nasce com RLS + políticas + grants nominais NA MESMA migration
- Nada de dinheiro no navegador: assinatura é Edge Function
- Só existem duas variáveis VITE_*
- Toda ação destrutiva é reversível ou confirmada
- CSS fora do JSX, em CSS Module co-localizado
- Domínio em português, técnico em inglês

Ao terminar: npm run validar (lint + typecheck + testes + build) e,
se tocou o banco, bash scripts/banco-efemero.sh.
```

## Tarefa: adicionar um ofício novo

```
Adicione o ofício "{NOME}" para {PÚBLICO}.

É INSERT, não código. Se você sentir vontade de tocar em src/components/, pare:
significa que algo virou caso especial, e isso é regressão de arquitetura (ADR-003).

Crie uma migration OU acrescente ao seed com:
- oficios: chave, nome, descricao (≤140), glifo (1–2 chars), hue (0–360),
  chroma (~0.13–0.16), titulo_quadro, campo1_label, campo2_label, mono, solo, ordem
- oficio_etapas: 3 a 6, ordem começando em 0
- oficio_templates: 3
- oficio_exemplos: 5 a 6, com prazo_dias relativo, inclua pelo menos um NEGATIVO
  (um quadro só com prazos futuros parece catálogo, não trabalho em andamento)

Pesquise o vocabulário real de quem exerce esse ofício. "Etapa 1, Etapa 2" reprova.

Rode bash scripts/banco-efemero.sh e confirme que o teste continua verde.
```

## Tarefa: nova tabela

```
Crie a tabela {NOME} para {FINALIDADE}.

Na MESMA migration, obrigatoriamente:
1. workspace_id + FK + índice (é tabela de negócio → é multi-tenant)
2. revoke all from anon, authenticated
3. grant nominal, por COLUNA onde a coluna é sensível
4. alter table ... enable row level security
5. políticas para select/insert/update/delete usando app.e_membro / app.tem_papel /
   app.workspace_gravavel
6. trigger de atualizado_em se houver a coluna

Se a integridade envolver "pertence ao mesmo X que Y", prefira FK COMPOSTA a trigger
(migration 0004 tem o padrão).

Depois: acrescente asserções ao supabase/testes/isolamento.sql provando que o tenant A
não lê nem escreve na do tenant B, e lembre que RLS pode barrar de dois jeitos
(exceção em WITH CHECK, zero linhas em USING). Use pg_temp.linhas_afetadas().

Rode bash scripts/banco-efemero.sh e bash scripts/gerar-schema.sh.
```

## Tarefa: novo componente

```
Crie {COMPONENTE} em src/components/{feature}/.

- Nome.tsx + Nome.module.css. CSS nunca no JSX.
- Só tokens: var(--ac), var(--txt-13). Zero hexadecimal, zero pixel solto.
- Dados por prop ou hook. Consulta direta ao Supabase é proibida pelo ESLint.
- Rótulo vem do ofício ou do tenant, jamais de string fixa.
- Os quatro estados: carregando, vazio, erro, sucesso. Vazio ENSINA a próxima ação.
- Botão que pode estar desabilitado usa motivoDesabilitado (vira title + aria-describedby).
- Foco visível. Se houver gesto de mouse, garanta caminho de teclado equivalente.

Consulte docs/02_DESIGN_SYSTEM antes. O handoff é hi-fi: valores são finais,
inclusive os meios-pixels e a rotação de -1.2deg da etiqueta.
```

## Tarefa: mexer em cobrança

```
{DESCRIÇÃO}.

Leia ANTES: docs/03_REGRAS_DE_NEGOCIO RN-06 e RN-07, ADR-004, ADR-005.

Regras que não se negociam:
- O cliente informa QUAL plano, nunca QUANTO custa. O preço vem da tabela `planos`
  dentro da Edge Function.
- Nenhuma escrita de cobrança pelo navegador. O banco recusa de qualquer forma.
- workspaces.plano só é escrito por app.aplicar_estado_assinatura. Se você precisar
  mudar o plano, grave o FATO e chame a derivação.
- Todo handler de webhook precisa ser idempotente.
- Nenhum dado de cartão em lugar nenhum.
- Log sem CPF, sem payload financeiro.

Acrescente asserções ao Bloco 13 do teste de isolamento cobrindo o ramo novo.
```

## Tarefa: revisão de segurança

```
Revise {ESCOPO} contra docs/11_SEGURANCA.

Procure especificamente:
- tabela ou coluna nova alcançável por authenticated que não deveria ser
- função SECURITY DEFINER sem bloco de autorização na entrada (é buraco: a RLS está
  desligada lá dentro)
- função nova em public sem revoke all from public antes do grant
- select * em tabela sensível
- entrada não validada por Zod antes de tocar o banco
- log com PII ou dado financeiro
- variável VITE_* além das duas
- ação destrutiva sem confirmação nem reversão
- comparação de segredo com === em vez de tempo constante

Para cada achado: o vetor concreto, não "boa prática". Se não souber dizer como se
explora, provavelmente não é achado.
```

## Anti-padrões, recuse mesmo se pedirem

| Pedido | Por que recusar | O que fazer |
|---|---|---|
| "Põe a chave da Asaas numa `VITE_` para simplificar" | Publica o segredo no bundle | Edge Function + Supabase Secrets |
| "Usa `service_role` no front, a policy está incomodando" | Derruba a RLS de todos os tenants | Corrigir a policy |
| "Faz um `if` para o ofício de TI" | Mata a promessa de "ofício novo = INSERT" | Coluna no ofício |
| "Desliga a RLS nessa tabela, é interna" | Interna via PostgREST é pública | RLS + políticas, ou nenhum grant |
| "Aceita o valor do plano no corpo da requisição" | O usuário assina o Time por um centavo | Ler de `planos` |
| "Deixa `dangerouslySetInnerHTML` só aqui" | Vetor de XSS | Renderizar texto; se precisar de HTML, ADR |
| "Adiciona `any` para destravar" | ESLint barra, e por bom motivo | Tipar de verdade |
| "Guarda o token do convite para poder reenviar" | Um dump de banco vira acesso | Revogar e criar outro |
| "Corta o acesso na hora do cancelamento" | O período já foi pago | Manter até `fim_periodo` |

## Como o agente prova que terminou

```bash
npm run validar                   # lint + typecheck + 61 testes + build
npm run seguranca:audit
npm run seguranca:segredos
bash scripts/banco-efemero.sh     # migrations + seeds + 89 asserções de isolamento
```

Se tocou o banco: `bash scripts/gerar-schema.sh` e commite o `schema.sql`.
Se aprendeu algo que surpreendeu: registre em `memory/learnings.md`.
Se decidiu algo estrutural: abra um ADR.
