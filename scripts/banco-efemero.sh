#!/usr/bin/env bash
#
# banco-efemero.sh, sobe um Postgres descartável, aplica tudo e roda os testes
#
# Existe para que o gate de segurança do banco possa rodar em qualquer lugar:
# CI, contêiner sem Docker-in-Docker, máquina de quem não quer subir o stack
# completo do Supabase. Usa o shim de `supabase/testes/shim-supabase.sql` para
# recriar só o contrato que as migrations tocam (papéis, auth.uid, publicação).
#
# Sequência: initdb → shim → migrations → seeds → teste de isolamento → derruba.
#
# Uso:  bash scripts/banco-efemero.sh
#       PGVERSAO=15 bash scripts/banco-efemero.sh
#       MANTER=1 bash scripts/banco-efemero.sh   # não derruba no fim
#       DB_URL=postgresql://… bash scripts/banco-efemero.sh   # usa um banco existente
#
# Com DB_URL definido, o script não sobe cluster nenhum: aplica tudo no banco
# indicado. É o modo usado no CI, onde o Postgres vem como service container.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGVERSAO="${PGVERSAO:-}"
PORTA="${PORTA:-55432}"
BASE="${BASE:-/tmp/pautaria-pg-efemero}"

# ── Modo "banco externo" ─────────────────────────────────────────────────────
if [ -n "${DB_URL:-}" ]; then
  echo "▸ Banco externo: ${DB_URL%%\?*}"
  mkdir -p "$BASE"

  echo "▸ Shim do Supabase"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$RAIZ/supabase/testes/shim-supabase.sql"

  echo "▸ Migrations"
  for arquivo in "$RAIZ"/supabase/migrations/*.sql; do
    printf '   %s\n' "$(basename "$arquivo")"
    psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$arquivo"
  done

  echo "▸ Seeds"
  for arquivo in "$RAIZ"/supabase/seeds/*.sql; do
    printf '   %s\n' "$(basename "$arquivo")"
    psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$arquivo"
  done

  echo "▸ Teste de isolamento entre tenants"
  echo
  SAIDA="$BASE/isolamento.out"
  STATUS=0
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$RAIZ/supabase/testes/isolamento.sql" \
    >"$SAIDA" 2>&1 || STATUS=$?
  sed -e 's/^psql:[^ ]*: //' -e 's/^NOTICE:  //' "$SAIDA" | grep -v '^[[:space:]]*$' || true

  echo
  if [ "$STATUS" -ne 0 ]; then
    echo "✗ Teste de isolamento REPROVADO (psql saiu com $STATUS)."
    exit 1
  fi
  echo "✓ Banco validado: migrations, seeds e isolamento."
  exit 0
fi

# Descobre os binários do servidor (o pacote cliente sozinho não basta).
if [ -z "$PGVERSAO" ]; then
  PGVERSAO="$(ls -1 /usr/lib/postgresql 2>/dev/null | sort -rn | head -1 || true)"
fi
PGBIN="/usr/lib/postgresql/$PGVERSAO/bin"
[ -x "$PGBIN/initdb" ] || PGBIN="$(dirname "$(command -v initdb 2>/dev/null || echo /nao-existe)")"
[ -x "$PGBIN/initdb" ] || {
  echo "ERRO: binários de servidor do Postgres não encontrados." >&2
  echo "      Instale postgresql-16 (ou defina PGVERSAO)." >&2
  exit 1; }

# O Postgres recusa rodar como root; se for o caso, delega ao usuário postgres.
COMO=""
if [ "$(id -u)" -eq 0 ] && getent passwd postgres >/dev/null; then
  COMO="su postgres -c"
fi
rodar() { if [ -n "$COMO" ]; then su postgres -c "$1"; else bash -c "$1"; fi; }

derrubar() {
  rodar "$PGBIN/pg_ctl -D $BASE/data -m immediate -w stop" >/dev/null 2>&1 || true
  [ "${MANTER:-0}" = "1" ] || rm -rf "$BASE"
}
trap derrubar EXIT

echo "▸ Postgres efêmero (v$PGVERSAO) em $BASE"
rm -rf "$BASE"; mkdir -p "$BASE/data" "$BASE/sock"
[ -n "$COMO" ] && chown -R postgres:postgres "$BASE"

rodar "$PGBIN/initdb -D $BASE/data -U postgres --auth=trust" >/dev/null
rodar "$PGBIN/pg_ctl -D $BASE/data -o \"-k $BASE/sock -p $PORTA -c listen_addresses='' -c wal_level=logical\" -l $BASE/data/log -w start" >/dev/null

export PGHOST="$BASE/sock" PGPORT="$PORTA" PGUSER=postgres PGDATABASE=postgres

echo "▸ Shim do Supabase"
psql -v ON_ERROR_STOP=1 -q -f "$RAIZ/supabase/testes/shim-supabase.sql"

echo "▸ Migrations"
for arquivo in "$RAIZ"/supabase/migrations/*.sql; do
  printf '   %s\n' "$(basename "$arquivo")"
  psql -v ON_ERROR_STOP=1 -q -f "$arquivo"
done

echo "▸ Seeds"
for arquivo in "$RAIZ"/supabase/seeds/*.sql; do
  printf '   %s\n' "$(basename "$arquivo")"
  psql -v ON_ERROR_STOP=1 -q -f "$arquivo"
done

echo "▸ Teste de isolamento entre tenants"
echo

# `set -o pipefail` + a saída num arquivo: filtrar a saída não pode engolir o
# código de retorno do psql, senão o gate reportaria sucesso sobre uma falha.
SAIDA="$BASE/isolamento.out"
STATUS=0
psql -v ON_ERROR_STOP=1 -q -f "$RAIZ/supabase/testes/isolamento.sql" >"$SAIDA" 2>&1 || STATUS=$?
sed -e 's/^psql:[^ ]*: //' -e 's/^NOTICE:  //' "$SAIDA" | grep -v '^[[:space:]]*$' || true

echo
if [ "$STATUS" -ne 0 ]; then
  echo "✗ Teste de isolamento REPROVADO (psql saiu com $STATUS)."
  exit 1
fi
echo "✓ Banco validado: migrations, seeds e isolamento."
