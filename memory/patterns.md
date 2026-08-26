# Padrões, Pautaria

## Objetivo
Registrar "como fazemos aqui": os padrões de código, dados e UX já consolidados, para que
a mesma decisão não seja tomada de três formas diferentes em três telas.

## Contexto
Um padrão que vive só na cabeça de quem escreveu o primeiro caso não sobrevive ao segundo.
Este arquivo é o que impede que a quinta tela invente o sexto jeito de tratar erro.

## Regras Gerais
- Entra aqui o que já se repetiu **3 vezes ou mais** e foi adotado oficialmente. Antes
  disso, é `learnings.md`.
- Todo padrão tem: nome, problema que resolve, exemplo, e por que a alternativa foi
  descartada. Padrão sem alternativa descartada é preferência pessoal disfarçada.
- Padrão superado ganha `[DEPRECADO]` e aponta o substituto, nunca é apagado.

## Validações
- Padrão de código: basta o autor + um caso real no repositório.
- Padrão de segurança ou de dados: exige revisão de segunda pessoa e teste que o prove.

## Permissões
- Qualquer dev propõe; adoção oficial precisa do dono ou de um segundo revisor.

## Exceções
- Um padrão pode ser quebrado localmente com comentário explicando o motivo, no próprio
  arquivo. Quebra sem comentário é bug.

## Auditoria
- Autor, data e o caso que originou o padrão.

## Eventos
- `pattern.added` · `pattern.revised` · `pattern.deprecated`

## Configurações Futuras
- Traduzir os padrões que couberem em regras de ESLint (dois já viraram: T2 e T4 de
  `restrictions.md`).

## Casos de Uso
- Antes de escrever um componente, serviço ou migration novos; em code review.

## Critérios de Aceite
- [ ] Tem nome, problema, exemplo e alternativa descartada
- [ ] Aponta pelo menos um caso real no repositório
- [ ] Autor e data

---

## Dados

### PD1, Configuração como dado, não como código
**Problema:** um nicho novo exigiria uma tela nova, um `if` novo e um deploy.
**Padrão:** todo comportamento que varia por contexto vira linha de tabela. Ofício, etapa,
template, exemplo, limite de plano e preço são dados.
**Casos:** `oficios`, `oficio_etapas`, `oficio_templates`, `oficio_exemplos`, `planos`.
**Alternativa descartada:** objeto de configuração no código (como no protótipo). Funciona
até o primeiro cliente pedir um ofício próprio, e aí vira feature de meses.

### PD2, Integridade estrutural por FK composta, não por trigger
**Problema:** garantir que uma pauta pertence ao mesmo tenant e ao mesmo ofício do seu
quadro, e que a etapa dela é daquele ofício.
**Padrão:** denormalizar a chave e usar chave estrangeira composta. Trigger só quando a
condição é uma disjunção que FK não expressa.
**Caso:** `pautas` → 3 FKs compostas (migration 0004).
**Alternativa descartada:** trigger de validação. Trigger é código: tem bug, tem janela de
corrida, e pode ser desabilitado. FK é promessa do Postgres.

### PD3, Ordenação fracionária
**Problema:** mover um card entre dois outros sem renumerar a coluna inteira.
**Padrão:** `posicao double precision`; inserir = média das vizinhas.
**Caso:** `src/utils/ordenacao.ts` + `pautas.posicao`.
**Alternativa descartada:** índice inteiro sequencial. Renumera N linhas por movimento e
produz ordens divergentes quando duas pessoas arrastam ao mesmo tempo.

### PD4, Estado derivado, com um único escritor
**Problema:** "qual plano este workspace tem?" respondida por UPDATEs espalhados que
discordam entre si.
**Padrão:** os fatos são gravados (cobrança confirmada, assinatura cancelada) e **uma**
função recalcula o estado a partir deles.
**Caso:** `app.aplicar_estado_assinatura` é a única função que escreve `workspaces.plano`.
**Alternativa descartada:** cada handler de webhook decidindo o plano. Cinco lugares para
manter em acordo, e a divergência só aparece em produção.

### PD5, Negar por omissão
**Padrão:** `revoke all` → `grant` explícito, coluna a coluna onde importa. Privilégios
padrão do schema revertidos para que tabela nova nasça inacessível.
**Caso:** migrations 0002 a 0010.
**Alternativa descartada:** confiar só na RLS. RLS é row-level; o grant de coluna é o que
impede escrever `plano` mesmo com uma policy frouxa. As duas camadas se cobrem.

## Código

### PC1, Camada de serviços obrigatória
**Padrão:** nenhum componente importa `@supabase/supabase-js`. Tudo passa por
`src/lib/*.service.ts`. Aplicado por ESLint.
**Caso:** até o tipo `Session` é reexportado por `auth.service.ts` em vez de importado do
SDK nos componentes.
**Alternativa descartada:** hooks chamando o SDK direto. Mais curto de escrever e
transforma troca de provedor num reescrita da UI inteira.

### PC2, Envelope `{ data, error }` com código estável
**Padrão:** todo erro vira `ErroApp` com `codigo` (contrato) e `mensagem` (humano). A UI
decide comportamento por código, nunca por texto.
**Caso:** `src/lib/erros.ts`, `supabase/functions/_shared/http.ts`.
**Alternativa descartada:** propagar o erro do PostgREST. Mostraria "new row violates
row-level security policy" para quem só queria criar um card.

### PC3, Zod na fronteira, nos dois sentidos
**Padrão:** entrada validada antes de tocar o banco; **saída do banco validada antes de
virar estado da UI**.
**Caso:** `src/lib/tipos.ts` + `src/lib/validar.ts`.
**Alternativa descartada:** confiar no tipo do TypeScript. O tipo é apagado em runtime; a
coluna renomeada numa migration vira `undefined` renderizado em silêncio.
**Nota:** em produção, item malformado é descartado e logado, não derruba a tela.

### PC4, Atualização otimista no gesto direto
**Padrão:** arrastar e arquivar aplicam no cache antes da rede e revertem em erro.
**Caso:** `useQuadro`.
**Alternativa descartada:** esperar a resposta. 200 ms de latência transformam
manipulação direta em "pedido ao servidor".
**Limite do padrão:** vale para gesto direto e reversível. Cobrança **não** é otimista.

### PC5, Nomes de domínio em português, técnicos em inglês
`criarPauta`, `moverPauta`, `oficio`, `quadro` × `handleSubmit`, `useEffect`, `onDragStart`.
O schema do banco é integralmente em português.

### PC6, Eventos de domínio em `dot.case`
Substantivo no passado: `pauta.criada`, `assinatura.ativada`. Constantes em
`src/constants/eventos.ts`; formato validado por CHECK no banco.

## Segurança

### PS1, Comparação de segredo em tempo constante
**Padrão:** qualquer comparação de token usa XOR acumulado sobre o comprimento inteiro.
**Caso:** `iguaisEmTempoConstante`, webhook da Asaas e token do cron.
**Alternativa descartada:** `===`. Retorna no primeiro byte diferente e permite descobrir
o token por medição de tempo.

### PS2, Idempotência por id de evento externo
**Padrão:** `UNIQUE (provedor, evento_externo_id)` + distinção entre "já processado"
(ignora, 200) e "recebido e falhou" (reprocessa).
**Caso:** `webhook_eventos`.

### PS3, Segredo de uso único: guardar o hash, nunca o valor
**Caso:** `convites.token_hash` (SHA-256). O token existe no e-mail do convidado e em
lugar nenhum mais.
**Consequência aceita:** não existe "reenviar convite", revoga-se e cria-se outro.

### PS4, Pseudonimizar em vez de coletar
**Padrão:** IP no `audit_log` como HMAC-SHA256 com sal do servidor.
**Alternativa descartada:** IP em claro (coleta desnecessária) ou SHA puro (4 bilhões de
IPv4 caem por força bruta em minutos).

### PS5, Falhar fechado no acesso, aberto na proteção
**Padrão:** autenticação e autorização falham fechado. Rate limit falha **aberto**, se o
contador está fora do ar, a requisição passa.
**Razão:** derrubar o checkout de todos porque o balde caiu troca um problema pequeno por
um grande. Rate limit protege contra abuso; não é controle de acesso.

## UX

### PU1, Estado vazio ensina a próxima ação
Coluna vazia diz "solte uma pauta aqui". Sem workspace, o usuário cai na escolha de ofício,
nunca numa tela "crie seu primeiro projeto".

### PU2, Botão desabilitado carrega o motivo
`motivoDesabilitado` no `Botao` vira `title` e `aria-describedby`. Desabilitar sem
explicar é uma parede.

### PU3, Ação destrutiva é reversível ou confirmada
Arquivar pauta confirma (não há UI de desarquivar ainda). Cancelar assinatura confirma e
mostra até quando o acesso vale.

### PU4, Caminho de teclado para todo gesto de mouse
Arrastar card tem equivalente nas pills "MOVER PARA" do drawer. `draggable` do HTML5 não
funciona por teclado, e fingir que funciona é pior do que oferecer outra rota.

### PU5, Prazo em linguagem de quadro
"hoje", "amanhã", "sex", "há 3 dias", não "2026-08-20". A pergunta real é "estou
atrasado?", não "qual é a data".
