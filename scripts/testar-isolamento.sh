#!/usr/bin/env bash
#
# testar-isolamento.sh, o gate de segurança do banco
#
# Prova, contra um Postgres de verdade, as duas afirmações que sustentam o
# isolamento entre tenants do Pautaria:
#
#   1. Nenhuma tabela de negócio ficou sem RLS.
#   2. Um usuário do workspace A não lê, não escreve e não apaga nada do
#      workspace B, e não consegue se dar um plano melhor.
#
# Um teste que apenas afirma "configuramos RLS" não vale nada. Este cria dois
# tenants reais, assume a identidade de cada usuário via `set local role` +
# `request.jwt.claims` (exatamente como o PostgREST faz) e tenta atravessar a
# fronteira. Se conseguir, sai com código 1.
#
# Uso: bash scripts/testar-isolamento.sh
#      DB_URL=postgresql://... bash scripts/testar-isolamento.sh
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

command -v psql >/dev/null 2>&1 || {
  echo "ERRO: psql não encontrado. Instale o cliente do Postgres." >&2; exit 1; }

echo "▸ Banco: ${DB_URL%%\?*}"
echo

psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$RAIZ/supabase/testes/isolamento.sql"

echo
echo "✓ Isolamento entre tenants: aprovado."
