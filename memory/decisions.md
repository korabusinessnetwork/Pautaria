# Decisões — Pautaria

## Objetivo
Registrar decisões de produto e processo que outras pessoas precisam conhecer, mas que não
carregam trade-off arquitetural profundo o bastante para virar ADR.

## Contexto
Sem este arquivo, decisões pequenas viram folclore: alguém pergunta "por que o plano Solo
tem só um quadro?" e a resposta se perde. ADR é caro; nem toda decisão merece um. Este é o
meio-termo.

## Regras Gerais
- Se a decisão muda arquitetura, stack, modelo de dados central ou tem custo recorrente →
  é **ADR**, em `docs/08_DECISOES/`, não aqui.
- Toda entrada tem: decisão, motivo, e o que foi descartado.
- Decisão revertida não é apagada: ganha `[REVERTIDA]` e o motivo da reversão.

## Validações
- Decisão de precificação ou de política com o usuário exige aprovação do dono.

## Permissões
- Propõe: qualquer pessoa. Aprova: dono, para produto e preço.

## Exceções
- Decisão de implementação reversível em um commit não precisa ser registrada.

## Auditoria
- Autor e data.

## Eventos
- `decision.recorded` · `decision.reverted` · `decision.promoted` (virou ADR)

## Configurações Futuras
- Gerar changelog de produto a partir das entradas marcadas como visíveis ao usuário.

## Casos de Uso
- Ao responder "por que é assim?"; no onboarding; ao revisar preço ou política.

## Critérios de Aceite
- [ ] Diz a decisão, o motivo e o que foi descartado
- [ ] Autor e data
- [ ] Se for arquitetural, foi movida para ADR

---

## D1 — O plano gratuito é permanente, não um trial de 14 dias
*2026-08-17 · Matheus*

**Decisão.** `solo` é grátis para sempre: 1 quadro, 40 pautas, 1 usuário, os 3 ofícios do
sistema.

**Motivo.** O produto se vende pelo aha moment, e o aha moment exige uso continuado, não
uma janela. Um trial temporal força a decisão de compra antes de o quadro virar hábito.
Free permanente também gera crescimento orgânico — quem usa sozinho convida o time depois.

**Descartado.** Trial de 14 dias com tudo liberado e ticket maior (R$ 39/R$ 99). Converte
mais rápido e mata o funil de longo prazo.

## D2 — O limite do Solo é *um quadro*, e trocar o ofício dele é livre
*2026-08-17 · Matheus*

**Decisão.** Como um quadro tem exatamente um ofício, o Solo tem na prática "um ofício
ativo por vez" — mas **trocar** é gratuito em qualquer plano.

**Motivo.** Cobrar pela troca seria cobrar exatamente pela coisa que torna o Pautaria
diferente. O limite precisa cair sobre volume, não sobre a promessa.

**Descartado.** "1 ofício" como limite literal, travando a troca. Mataria o segundo aha
moment e, com ele, o argumento de venda.

*Elevado a restrição: `restrictions.md` P1.*

## D3 — Anual = 10 mensalidades
*2026-08-17 · Matheus*

**Decisão.** R$ 290/ano e R$ 790/ano. Dois meses grátis.

**Motivo.** Desconto legível sem calculadora, e o banco tem um CHECK
(`planos_anual_nao_pior_que_mensal`) que impede publicar um anual pior que 12 mensalidades
por erro de digitação.

**Descartado.** 20% de desconto — mesma ordem de grandeza, menos memorável.

## D4 — A assinatura pertence ao workspace, não ao usuário
*2026-08-17 · Matheus*

**Decisão.** `assinaturas.workspace_id`. Um usuário em três workspaces pode estar em três
planos diferentes.

**Motivo.** É o que torna o plano Time vendável: o time paga por um espaço compartilhado,
não por N licenças individuais. Também evita o caso ruim de o dono sair e levar o plano.

**Descartado.** Assinatura por usuário. Simplifica a cobrança e quebra a colaboração.

## D5 — Sem checkout próprio: a Asaas hospeda o pagamento
*2026-08-17 · Matheus*

**Decisão.** Criamos a assinatura pela API e redirecionamos para a fatura hospedada.
Nenhum campo de cartão em lugar algum do sistema.

**Motivo.** Mantém o projeto no SAQ-A do PCI-DSS — o escopo mais raso que existe. O custo
é uma navegação a mais; o benefício é nunca ter dado de cartão sob nossa responsabilidade.

**Descartado.** Checkout embutido com tokenização. Economiza um clique e traz auditoria de
PCI e o pior tipo de incidente possível para um produto deste porte.

*Elevado a restrição: `restrictions.md` S7.*

## D6 — Tolerância de 7 dias antes de suspender
*2026-08-17 · Matheus*

**Decisão.** Pagamento atrasado marca o workspace como `inadimplente`, e ele **continua
gravável** por 7 dias. Só depois vira somente leitura — e nunca perde dado.

**Motivo.** Boleto atrasa, cartão expira, Pix falha. Travar o trabalho de alguém no meio
do dia por causa de um atraso de dois dias é desproporcional e gera cancelamento.

**Descartado.** Corte imediato no vencimento. Mais simples de implementar e hostil.

## D7 — Cancelar não corta o acesso na hora
*2026-08-17 · Matheus*

**Decisão.** Quem cancela mantém o plano até `fim_periodo`. A reconciliação diária faz a
transição quando a data chega.

**Motivo.** O período já foi pago. Cortar antes é ficar com o dinheiro sem entregar o
serviço.

*Elevado a restrição: `restrictions.md` P4.*

## D8 — Rate limiting entrou na v1, além do escopo aprovado
*2026-08-17 · Claude Code, comunicado ao dono*

**Decisão.** O escopo de segurança aprovado foi "base obrigatória", que não incluía rate
limiting. Ele foi implementado mesmo assim, nas Edge Functions.

**Motivo.** O webhook e o checkout são endpoints **públicos**. Sem limite, o token do
webhook fica sujeito a força bruta e o checkout a flood — o que anularia na prática os
controles que a base obrigatória exige. O custo marginal foi uma tabela e uma função.

**Registrado como exceção deliberada de escopo**, não como escopo silenciosamente
ampliado. Ver ADR-006.

## D9 — Sem biblioteca de drag-and-drop
*2026-08-17 · Claude Code*

**Decisão.** API nativa de HTML5, sem `dnd-kit` ou equivalente.

**Motivo.** O caso é simples (mover um card entre listas, com índice calculado pela
posição do ponteiro) e as bibliotecas custam ~40 kB mais uma camada de conceitos. O que
elas entregam de verdadeiramente difícil é acessibilidade de teclado — e isso as pills
"MOVER PARA" do drawer já cobrem, porque já estavam no design.

**Descartado.** `dnd-kit`. Revisar se surgirem requisitos de multi-seleção ou reordenação
de colunas.

## D10 — O quadro nasce povoado
*2026-08-17 · Matheus*

**Decisão.** O onboarding cria pautas de exemplo a partir de `oficio_exemplos`, com prazos
relativos — inclusive alguns já vencidos.

**Motivo.** Colunas certas com quadro vazio ainda é tela em branco. O exemplo ensina que
cara tem uma pauta boa naquele ofício.

**Descartado.** Quadro vazio com placeholder explicativo.

## D11 — Nome do workspace derivado, não perguntado
*2026-08-17 · Claude Code*

**Decisão.** O onboarding batiza o workspace como "Pauta de {primeiro nome}" e segue. O
usuário renomeia depois.

**Motivo.** Cada pergunta antes do valor é atrito. Renomear custa dois cliques quando a
pessoa já está dentro; nomear na entrada custa uma decisão antes de saber para quê.

## D12 — Convite mostra o link uma única vez
*2026-08-17 · Claude Code*

**Decisão.** O token é gerado no cliente, só o SHA-256 vai ao banco, e o link aparece uma
vez com aviso explícito. Não existe "reenviar" — revoga-se e cria-se outro.

**Motivo.** É a mesma escolha de qualquer gerenciador de segredos: um convite recuperável
a qualquer momento vaza junto com o banco.

**Descartado.** Guardar o token para permitir reenvio. Mais conveniente e transforma um
dump de banco em acesso.
