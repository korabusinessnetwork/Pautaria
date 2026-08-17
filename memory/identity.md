# Identidade — Pautaria

## Objetivo
Ser a fonte oficial de verdade sobre **o que o Pautaria é**: propósito, público, promessa,
tom de voz e posicionamento. Qualquer decisão de produto que contrarie este arquivo está
errada ou exige mudança deliberada dele (com ADR).

## Contexto
Produto nasce de um handoff de design hi-fi, não de um documento de requisitos. Sem um
registro explícito da identidade, cada feature nova tende a puxar o produto na direção de
"mais um Trello com temas" — que é exatamente o que ele não é. Consultar antes de propor
qualquer feature, mudança de fluxo ou copy.

## Regras Gerais
- Mudança de propósito, público-alvo ou promessa central exige ADR em `docs/08_DECISOES/`.
- Ajuste de tom de voz e copy pode ser feito direto, com registro de data e autor.
- Nenhuma entrada aqui descreve implementação — implementação mora em `docs/`.

## Validações
- Toda alteração de posicionamento precisa citar o sinal que a motivou (conversa com
  usuário, dado de uso, decisão comercial). Opinião sem sinal não altera identidade.

## Permissões
- Escreve e aprova: Matheus (dono/founder).
- Lê: todos, sempre, antes de decidir produto.

## Exceções
- Em experimento explicitamente rotulado (`[EXPERIMENTO]`), uma feature pode contrariar o
  posicionamento por até um ciclo, para testar hipótese. Passado o prazo, ou vira decisão
  registrada ou é removida.

## Auditoria
- Autor e data em cada alteração. Revisão recomendada a cada trimestre.

## Eventos
- `identity.updated` — propósito, público ou promessa alterados
- `identity.reviewed` — revisão periódica concluída sem mudança

## Configurações Futuras
- Integrar ao onboarding de novos colaboradores/agentes como primeira leitura obrigatória.

## Casos de Uso
- Antes de aprovar uma feature nova; ao escrever copy de landing ou de e-mail; ao decidir
  o que **não** construir.

## Critérios de Aceite
- [ ] A entrada diz o que o produto é, não como ele funciona
- [ ] Tem autor e data
- [ ] Se muda posicionamento, referencia o ADR correspondente

---

## Propósito

**Entregar um quadro de trabalho já configurado, antes de o usuário configurar qualquer
coisa.**

O Pautaria existe porque a tela em branco mata o quadro. Ferramentas genéricas entregam
"To do / Doing / Done" e transferem ao usuário o trabalho de inventar etapas, nomear
campos e decidir vocabulário. A maioria abandona antes de terminar. O Pautaria inverte:
escolher o ofício **é** a configuração.

## Promessa central

> **Toda pauta tem um sotaque.**

As etapas, os campos, a terminologia, a cor e os templates se ajustam a como a pessoa
trabalha — não o contrário. E trocar de sotaque é livre: a pauta viaja junto.

## Público-alvo

Profissionais e times de 1 a 8 pessoas, em português, que trabalham por fluxo:

| Persona | Contexto | Vocabulário | O que a faz ficar |
|---|---|---|---|
| **Rebeca** — social media | Agência de 4 pessoas, calendário editorial | canal, campanha, roteiro | Saber o que está em aprovação hoje, sem abrir planilha |
| **Alan** — tech lead | Squad de 5, sem processo de Jira | sprint, estimativa, code review | Backlog → deploy num trilho só, sem cerimônia |
| **Matheus** — autônomo | Trabalha sozinho | contexto, energia | A semana em quatro colunas honestas, sem responsável nem avatar |

Fora do alvo hoje: empresas grandes com processo de compra, times que precisam de campos
customizados arbitrários, quem quer substituir Jira ou Asana em escala.

## Proposta de valor

1. **Zero configuração até o valor.** Escolher o ofício entrega quadro, colunas, campos e
   pautas de exemplo. Nenhuma tela de setup no caminho.
2. **Vocabulário de quem usa.** O card de marketing diz "Canal"; o de dev diz "Sprint". A
   diferença não é cosmética — é o que faz o quadro parecer construído para aquela pessoa.
3. **Um ofício novo é uma linha no banco.** O produto escala em nichos sem escalar em
   código.

## Aha moments

1. Escolher o ofício e cair num quadro **já povoado e já tematizado**.
2. Trocar de ofício na sidebar e ver o workspace inteiro se re-tematizar — sem reload,
   sem perder pauta.

## Tom de voz

Direto, em português do Brasil, sem jargão de produto e sem infantilização.

- **Assim:** "solte uma pauta aqui" · "Enter cria · Esc cancela" · "Você continua com o
  plano até 17 de setembro."
- **Não assim:** "Nenhum item encontrado 😢" · "Ops! Algo deu errado" · "Otimize seu
  workflow com nossa solução".

Regra prática: se a frase caberia num aviso de banco, reescreva. Se soaria estranho dita
em voz alta para um colega, reescreva.

## Posicionamento

Entre o caderno (rápido, mas não colabora) e o Jira (poderoso, mas exige um analista de
processos). O Pautaria é a ferramenta que **já sabe** como o seu ofício trabalha.

- **Não** é um construtor de banco de dados sem código.
- **Não** compete por número de integrações.
- **Compete** por tempo até o primeiro quadro útil: alvo de menos de 60 segundos desde o
  cadastro.

## Valores do produto

1. **Nada de tela em branco.** Todo estado vazio ensina a próxima ação.
2. **Prevenir em vez de avisar.** Botão que não vai funcionar nasce desabilitado, com o
   motivo à vista.
3. **Dado de usuário não é refém de cobrança.** Rebaixar plano nunca apaga nada; workspace
   suspenso vira somente leitura, nunca porta fechada.
4. **Cancelar é fácil.** Um clique, sem retenção forçada, e acesso até o fim do período pago.
5. **Sotaque é do usuário, não nosso.** Nenhuma marca, cor ou rótulo do Pautaria hardcodado
   onde deveria vir do tenant.

## Modelo de negócio

Assinatura recorrente (Asaas), cobrada do **workspace** e não do usuário. `solo` gratuito
como trial permanente — é o funil, não uma amostra temporal. `estudio` R$ 29/mês para quem
vive de pauta; `time` R$ 79/mês quando entram outras pessoas.

## Roadmap

| Fase | Entrega | Estado |
|---|---|---|
| 1 | Fundação + MVP monetizável: auth, workspace, quadro/tabela, ofícios, assinatura, limites no banco | **atual** |
| 2 | Colaboração: convites na UI, realtime multi-usuário, comentários | próxima |
| 3 | Ofícios personalizados (editor de etapas/campos/templates) e exportação | planejada |
| 4 | Segurança avançada: MFA/TOTP, sessões ativas, LGPD self-service | planejada |
| 5 | Automação por evento (`pauta.movida` → notificação/integração) | ideia |

---
*Registrado em 2026-08-17 por Matheus (fundação do projeto).*
