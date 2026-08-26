# 05, Fluxos

## Cadastro → primeiro quadro

O fluxo que a north star mede. Alvo: **menos de 60 segundos**.

```
/criar-conta
  nome · e-mail · senha (requisitos acendem enquanto digita)
    │
    ├─ Supabase Auth signUp
    ├─ trigger ao_criar_usuario → cria profiles com iniciais e hue
    └─ e-mail de confirmação
         │
/entrar ─┴─► /  →  Destino decide:
              sem workspace → /comecar    (escolha do ofício)
              com workspace → /w/{slug}
                     │
/comecar   ▲ ▲ ▲  três tiles: Marketing · TI · Dev · Produtividade
             clique
               │
               └─ criar_workspace(nome, oficio, semear)   [uma transação]
                    ├─ workspaces          (trigger cria o vínculo de dono)
                    ├─ quadros             (título vem do ofício)
                    ├─ pautas × N          (de oficio_exemplos, prazo relativo)
                    └─ audit_log 'workspace.criado'
                          │
                          ▼
                    /w/{slug}, quadro tematizado e povoado
```

**Decisões visíveis no fluxo.** O nome do workspace é derivado do primeiro nome, não
perguntado (`decisions.md` D11). O quadro nasce cheio, não vazio (D10). Não existe tela de
setup entre a escolha e o quadro.

**Por que RPC e não três chamadas do cliente.** Falhar entre a segunda e a terceira
deixaria o usuário num workspace com quadro vazio, e sem caminho de volta, porque o limite
do Solo já teria sido consumido pelo quadro que ele não pediu.

## Trabalho no quadro

```
Topbar                Sidebar                  Quadro
  + Nova pauta ──────────────────────────────► input inline na 1ª etapa
  busca ─────────────────────────────────────► filtra título e campos, ao vivo
  Quadro ⇄ Tabela                              mesma pauta, outra pergunta
                      modelo (+) ────────────► pauta na etapa 0, com os campos do modelo
                      ofício ────────────────► trocar_oficio_quadro (pautas viajam junto)

arrastar card ──► onMutate (cache já move) ──► UPDATE ──► erro? rollback
                                                └─ Realtime avisa as outras abas

clique no card ──► drawer
                    ├─ editar título e campos no lugar (salva ao sair do campo)
                    ├─ MOVER PARA (pills)   ← caminho de teclado do arrasto
                    └─ Arquivar (confirma)  ← arquivada_em, não DELETE
```

## Assinatura ponta a ponta

```
/w/{slug}/plano  (só o dono)
  escolhe plano e ciclo → nome + CPF/CNPJ (validado no dígito, antes do envio)
    │
    ▼
POST /functions/v1/assinatura-criar          [JWT obrigatório]
  1. rate limit 5/h por usuário
  2. Zod na entrada
  3. exigirDonoDoWorkspace
  4. preço lido da tabela `planos`  ← o cliente diz QUAL plano, nunca QUANTO
  5. INSERT assinatura 'pendente'   ← índice único = trava contra clique duplo
  6. Asaas: cliente (reaproveita por CPF) → assinatura
  7. vincula ids · grava a 1ª cobrança
     ↳ qualquer falha de 6/7 desfaz o passo 5
    │
    ▼  redireciona para a fatura hospedada
┌─────────────────────────────────────────┐
│  asaas.com, Pix · boleto · cartão      │  ← nenhum dado de cartão passa por nós
└─────────────────┬───────────────────────┘
                  │ pagamento
                  ▼
POST /functions/v1/asaas-webhook             [sem JWT · token próprio]
  1. asaas-access-token em tempo constante   (falha → 401 + rate limit no IP)
  2. idempotência por id de evento
       já processado → 200 { duplicado: true }, sem efeito
  3. FATO   cobranca upsert
  4. FATO   assinatura ativa · fim_periodo = vencimento + ciclo
  5. DERIVA aplicar_estado_assinatura()
              └─ workspace.plano = 'estudio' · status 'ativo'
  6. marca processado_em
       falha → processado_em fica nulo, Asaas retenta, reprocessa
                  │
                  ▼
        o app já reflete o plano novo
```

### Fatura perdida

Boleto venceu, Pix expirou, aba fechada. `assinatura-portal` consulta a Asaas **ao vivo**,
uma fatura vencida ganha link novo quando é reemitida, e o link guardado levaria a uma
página morta. De quebra, sincroniza o histórico local caso um webhook tenha se perdido.

### Cancelamento

```
dono clica → confirmação mostra até quando o acesso vale
  → Asaas DELETE /subscriptions/{id}    (404 = já cancelada lá; segue)
  → status 'cancelada' + cancelada_em
  → aplicar_estado_assinatura()
       └─ acha a cancelada com fim_periodo no futuro → MANTÉM o plano até lá
  → reconciliação diária faz a transição quando a data chegar
```

Cancela-se primeiro na Asaas de propósito: se falhasse depois de marcar como cancelada, a
recorrência continuaria cobrando enquanto o nosso banco diz que acabou, o pior
desencontro possível.

## Inadimplência

```
vencimento sem pagamento
  └─ PAYMENT_OVERDUE → assinatura 'inadimplente'
       └─ workspace 'inadimplente'  ·  plano MANTIDO  ·  continua gravável
            └─ UI mostra faixa de atenção + "Pagar fatura em aberto"

+7 dias sem pagar
  └─ reconciliação → assinatura 'expirada' → workspace volta ao 'solo'
       └─ dado intacto. Quem tinha 200 pautas continua com 200; só não cria a 201ª.
```

## Convite e entrada no time

```
/w/{slug}/equipe  (dono ou admin)
  e-mail + papel
    └─ token de 256 bits gerado no NAVEGADOR
         ├─ SHA-256 vai para o banco
         └─ link aparece UMA VEZ na tela  ← depois disso não existe mais em lugar nenhum
              │
              ▼ (enviado por fora)
/convite?t={token}
  aceita automaticamente ao abrir, a pessoa já clicou uma vez, no e-mail
    └─ aceitar_convite(token)   [SECURITY DEFINER]
         ├─ compara hash
         ├─ exige que o e-mail da conta bata com o convidado
         ├─ INSERT membro  (trigger de limite do plano continua valendo)
         └─ marca aceito
              └─ /w/{slug}
```

Erro único para inexistente, expirado, já usado ou e-mail diferente, distinguir ensinaria
a sondar tokens.

## Recuperação de senha

```
/recuperar-senha → resposta SEMPRE igual, exista a conta ou não
     └─ e-mail com link (validade 1 h)
          └─ /nova-senha, detectSessionInUrl troca o token por sessão
               ├─ sem sessão → "link inválido ou expirado" + pedir outro
               └─ com sessão → nova senha (requisitos visíveis) → entra
```

## Erro e degradação

| Situação | O que o usuário vê |
|---|---|
| Sem `.env` (dev) | Tela explicando o que falta e o comando para resolver |
| Sem `.env` (build de produção) | **O build falha.** Nunca chega ao usuário |
| Erro de renderização | Fronteira global: "Suas pautas estão salvas" + tentar de novo |
| Sessão expirada | Redireciona ao login preservando o destino |
| Limite de plano | Botão desabilitado com o motivo + link "Ver planos →" |
| Workspace suspenso | Faixa no topo, tudo legível, edição desabilitada |
| Asaas fora do ar | "Não conseguimos falar com o processador. Tente em instantes." |
| Rede lenta | Timeout de 20 s no cliente, 15 s na chamada à Asaas |
