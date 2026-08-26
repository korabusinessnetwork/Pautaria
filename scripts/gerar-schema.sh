#!/usr/bin/env bash
#
# gerar-schema.sh, consolida supabase/migrations/*.sql em supabase/schema.sql
#
# `schema.sql` é a fonte de verdade legível do banco (CLAUDE.md). Manter os dois
# à mão garantiria divergência; por isso ele é GERADO. Rode este script sempre
# que adicionar uma migration, e comite o resultado.
#
# Uso: bash scripts/gerar-schema.sh
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS="$RAIZ/supabase/migrations"
DESTINO="$RAIZ/supabase/schema.sql"

[ -d "$MIGRATIONS" ] || { echo "ERRO: $MIGRATIONS não existe." >&2; exit 1; }

{
  cat <<'CABECALHO'
-- ═══════════════════════════════════════════════════════════════════════════
--  P A U T A R I A, S C H E M A  D O  B A N C O
--
--  ⚠️  ARQUIVO GERADO. Não edite aqui.
--
--  Fonte: supabase/migrations/*.sql, na ordem.
--  Para regenerar:  bash scripts/gerar-schema.sh
--
--  Este arquivo existe para leitura: é o retrato completo do banco em um lugar
--  só, para revisar modelagem e políticas sem abrir nove arquivos. O que roda
--  em produção são as migrations.
--
--  Invariantes que valem para TODA tabela aqui:
--    • RLS ligada, criada na mesma migration que a tabela
--    • privilégio explícito (revoke all → grant), coluna a coluna onde importa
--    • nada de escrita do cliente em tabela financeira
-- ═══════════════════════════════════════════════════════════════════════════

CABECALHO

  for arquivo in "$MIGRATIONS"/*.sql; do
    nome="$(basename "$arquivo")"
    printf '\n\n-- ╔%s╗\n' "$(printf '═%.0s' {1..74})"
    printf -- '-- ║ %-72s ║\n' "$nome"
    printf -- '-- ╚%s╝\n\n' "$(printf '═%.0s' {1..74})"
    cat "$arquivo"
  done
} > "$DESTINO"

linhas=$(wc -l < "$DESTINO" | tr -d ' ')
echo "✓ $DESTINO gerado ($linhas linhas, $(ls -1 "$MIGRATIONS"/*.sql | wc -l | tr -d ' ') migrations)"
