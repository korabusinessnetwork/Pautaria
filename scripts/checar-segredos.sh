#!/usr/bin/env bash
#
# checar-segredos.sh — varredura de segredo vazado no repositório
#
# Roda no CI e antes de todo deploy. Procura os padrões que realmente aparecem
# num vazamento de projeto Supabase/Asaas, não uma lista genérica.
#
# ─────────────────────────────────────────────────────────────────────────────
# SOBRE PRECISÃO
#
# A primeira versão deste script reprovava o próprio repositório: acusava o
# `.env.example` de ser um `.env`, a chave-exemplo do INSTALACAO.md de ser uma
# chave real, e a tabela de anti-padrões do docs/10_PROMPTS de conter uma
# variável proibida — que ela cita justamente para dizer "não faça isto".
#
# Um scanner que grita à toa é um scanner que as pessoas aprendem a ignorar, e
# aí ele deixa de proteger no dia em que estiver certo. Por isso cada checagem
# aqui é escopada ao lugar onde o vazamento importa:
#
#   • `.env`      → arquivo versionado que não seja o `.env.example`
#   • chave Asaas → padrão longo o bastante para ser real, fora da documentação
#   • `VITE_*`    → só em arquivos que ALIMENTAM O BUILD (src/, configs, .env).
#                   Documentação pode nomear a variável proibida à vontade: doc
#                   não vira bundle.
#
# Sem dependência paga: grep e git, só.
set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

FALHAS=0
reprovar() { echo "  ✗ $1"; FALHAS=$((FALHAS + 1)); }

# Caminhos que são documentação: podem citar nomes de segredo como exemplo.
EH_DOC='^(docs/|memory/|CLAUDE\.md|README\.md|INSTALACAO\.md|respostas-intake\.md|\.env\.example|scripts/checar-segredos\.sh|\.github/)'

echo "▸ Varredura de segredos"

# ── 1. Arquivo .env versionado (exceto o exemplo) ────────────────────────────
ENVS=$(git ls-files | grep -E '(^|/)\.env($|\.)' | grep -v '\.env\.example$' || true)
if [ -n "$ENVS" ]; then
  reprovar "arquivo .env versionado — git rm --cached:"
  echo "$ENVS" | sed 's/^/      /'
else
  echo "  ✓ nenhum .env versionado (só o .env.example)"
fi

# ── 2. Chave service_role do Supabase ────────────────────────────────────────
# O JWT do service_role começa com `eyJ`. Procuramos a atribuição concreta, não
# a palavra "service_role" — que aparece legitimamente em migrations e docs.
SERVICE=$(git ls-files -z | xargs -0 grep -lE 'SUPABASE_SERVICE_ROLE_KEY *= *["'"'"']?eyJ' 2>/dev/null \
          | grep -vE "$EH_DOC" || true)
if [ -n "$SERVICE" ]; then
  reprovar "chave service_role atribuída em:"
  echo "$SERVICE" | sed 's/^/      /'
else
  echo "  ✓ nenhuma chave service_role atribuída"
fi

# ── 3. Chave de API da Asaas ─────────────────────────────────────────────────
# Chaves reais têm ~160 caracteres depois do prefixo. Exigir 40+ evita confundir
# com o placeholder `$aact_hmlg_SUA_CHAVE` da documentação.
ASAAS=$(git ls-files -z | xargs -0 grep -lE '\$aact_[A-Za-z0-9+/=_-]{40,}' 2>/dev/null \
        | grep -vE "$EH_DOC" || true)
if [ -n "$ASAAS" ]; then
  reprovar "chave de API da Asaas encontrada em:"
  echo "$ASAAS" | sed 's/^/      /'
else
  echo "  ✓ nenhuma chave da Asaas"
fi

# ── 4. VITE_* não autorizada, onde ela vira bundle ───────────────────────────
# Escopo: código-fonte e configuração de build. Tudo que começa com VITE_ nesses
# arquivos é embutido no JavaScript público.
ARQUIVOS_BUILD=$(git ls-files -- 'src/*' 'vite.config.ts' 'vercel.json' '.env.example' \
                                'index.html' 'package.json' 2>/dev/null || true)
INVALIDAS=""
if [ -n "$ARQUIVOS_BUILD" ]; then
  INVALIDAS=$(echo "$ARQUIVOS_BUILD" | tr '\n' '\0' \
              | xargs -0 grep -hoE 'VITE_[A-Z0-9_]+' 2>/dev/null \
              | sort -u \
              | grep -vE '^VITE_(SUPABASE_URL|SUPABASE_ANON_KEY)$' || true)
fi
if [ -n "$INVALIDAS" ]; then
  reprovar "variáveis VITE_* não autorizadas (vão para o bundle público):"
  echo "$INVALIDAS" | sed 's/^/      /'
else
  echo "  ✓ apenas as duas VITE_* autorizadas no código de build"
fi

# ── 5. Chave privada em qualquer formato ─────────────────────────────────────
PEM=$(git ls-files -z | xargs -0 grep -lE -- '-----BEGIN [A-Z ]*PRIVATE KEY-----' 2>/dev/null || true)
if [ -n "$PEM" ]; then
  reprovar "chave privada (PEM) versionada em:"
  echo "$PEM" | sed 's/^/      /'
else
  echo "  ✓ nenhuma chave privada PEM"
fi

# ── 6. Segredo de Edge Function atribuído no repositório ─────────────────────
FUNCAO=$(git ls-files -z | xargs -0 grep -lE '(ASAAS_WEBHOOK_TOKEN|CRON_TOKEN|IP_HASH_SAL) *= *["'"'"']?[A-Za-z0-9+/_-]{16,}' 2>/dev/null \
         | grep -vE "$EH_DOC" || true)
if [ -n "$FUNCAO" ]; then
  reprovar "segredo de Edge Function atribuído em:"
  echo "$FUNCAO" | sed 's/^/      /'
else
  echo "  ✓ nenhum segredo de Edge Function no repositório"
fi

echo
if [ "$FALHAS" -gt 0 ]; then
  echo "✗ $FALHAS problema(s) de segredo. Deploy bloqueado."
  exit 1
fi
echo "✓ Nenhum segredo encontrado."
