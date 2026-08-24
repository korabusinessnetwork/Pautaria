#!/usr/bin/env bash
#
# capturar-telas.sh — retrato de todas as telas, para conferir contra o handoff
#
# O design do Pautaria é hi-fi: cor, tipografia, espaçamento e microinteração
# são finais (docs/02_DESIGN_SYSTEM). Um componente pode compilar, passar no
# lint e ainda estar visualmente errado — e nenhum teste automatizado pega isso.
# Este script existe para que a conferência visual seja possível de repetir.
#
# Usa o Chromium do Playwright em modo headless, sem instalar pacote nenhum.
# As telas autenticadas abrem em modo demonstração via `?demo=1`.
#
# Uso:  npm run dev            # em outro terminal
#       bash scripts/capturar-telas.sh [largura]
set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE="${BASE_URL:-http://localhost:5173}"
LARGURA="${1:-1440}"
ALTURA="${ALTURA:-900}"
SAIDA="${SAIDA:-$RAIZ/.telas}"

CHROME="$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)"
[ -x "$CHROME" ] || CHROME="$(command -v chromium || command -v google-chrome || true)"
[ -x "$CHROME" ] || { echo "ERRO: Chromium não encontrado." >&2; exit 1; }

curl -s -o /dev/null "$BASE/" || { echo "ERRO: nada respondendo em $BASE — rode 'npm run dev'." >&2; exit 1; }

mkdir -p "$SAIDA"

# nome|caminho
TELAS="
landing|/
precos|/precos
entrar|/entrar
criar-conta|/criar-conta
recuperar-senha|/recuperar-senha
termos|/termos
privacidade|/privacidade
nao-encontrado|/404
quadro|/w/aurora?demo=1
plano|/w/aurora/plano?demo=1
equipe|/w/aurora/equipe?demo=1
configuracoes|/w/aurora/configuracoes?demo=1
arquivadas|/w/aurora/arquivadas?demo=1
atividade|/w/aurora/atividade?demo=1
abertura|/comecar?demo=1
"

echo "▸ Capturando em ${LARGURA}x${ALTURA} → $SAIDA"
falhas=0

while IFS='|' read -r nome caminho; do
  [ -z "$nome" ] && continue
  destino="$SAIDA/${LARGURA}-${nome}.png"

  # `--virtual-time-budget` deixa o relógio da página correr acelerado: a SPA
  # monta, busca os dados de demonstração (que têm latência simulada) e assenta
  # antes do disparo. Sem isso, a captura pega o estado de carregamento.
  "$CHROME" \
    --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
    --force-device-scale-factor=1 \
    --window-size="${LARGURA},${ALTURA}" \
    --virtual-time-budget=9000 \
    --screenshot="$destino" \
    "${BASE}${caminho}" >/dev/null 2>&1

  if [ -s "$destino" ]; then
    tam=$(stat -c%s "$destino" 2>/dev/null || echo 0)
    printf '   ✓ %-18s %6s KB\n' "$nome" "$((tam / 1024))"
  else
    printf '   ✗ %-18s (falhou)\n' "$nome"
    falhas=$((falhas + 1))
  fi
done <<< "$TELAS"

echo
if [ "$falhas" -gt 0 ]; then
  echo "✗ $falhas tela(s) não capturada(s)."
  exit 1
fi
echo "✓ Todas as telas capturadas em $SAIDA"
