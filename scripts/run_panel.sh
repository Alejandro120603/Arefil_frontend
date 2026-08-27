#!/usr/bin/env bash
# Orchestrates backend (FastAPI/uvicorn) + frontend (Next.js) for `make run_panel`.
# Invoked by the Makefile, which exports BACKEND_DIR/FRONTEND_DIR/BACKEND_PORT/
# FRONTEND_PORT/BACKEND_PY. Not meant to be run standalone.
set -euo pipefail

: "${BACKEND_DIR:?BACKEND_DIR no definido}"
: "${FRONTEND_DIR:?FRONTEND_DIR no definido}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3001}"
: "${BACKEND_PY:?BACKEND_PY no definido}"

BACKEND_DIR_ABS="$(cd "$BACKEND_DIR" && pwd)"
FRONTEND_DIR_ABS="$(cd "$FRONTEND_DIR" && pwd)"
# Resolve before any `cd` below, since BACKEND_PY may be a relative path
# (e.g. ../Arefil_backend/.venv/bin/python) computed from the original cwd.
BACKEND_PY="$(cd "$(dirname "$BACKEND_PY")" && pwd)/$(basename "$BACKEND_PY")"

echo "[run_panel] Aplicando migraciones Alembic..."
(cd "$BACKEND_DIR_ABS" && "$BACKEND_PY" -m alembic upgrade head)

echo "[run_panel] Ejecutando seed Donaldson (idempotente)..."
(cd "$BACKEND_DIR_ABS" && "$BACKEND_PY" -m app.db.seed)

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  trap - INT TERM EXIT
  echo ""
  echo "[run_panel] Deteniendo procesos..."
  for pid in "$FRONTEND_PID" "$BACKEND_PID"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null || true
    fi
  done
  for pid in "$FRONTEND_PID" "$BACKEND_PID"; do
    [[ -n "$pid" ]] && wait "$pid" 2>/dev/null || true
  done
  echo "[run_panel] Procesos detenidos."
}
trap cleanup INT TERM EXIT

echo "[run_panel] Backend:  http://127.0.0.1:${BACKEND_PORT} (docs en /docs)"
echo "[run_panel] Frontend: http://127.0.0.1:${FRONTEND_PORT}"
echo "[run_panel] Ctrl+C para detener ambos."
echo ""

(
  cd "$BACKEND_DIR_ABS"
  exec "$BACKEND_PY" -m uvicorn app.main:app --reload --host 127.0.0.1 --port "$BACKEND_PORT"
) &
BACKEND_PID=$!

(
  cd "$FRONTEND_DIR_ABS"
  exec ./node_modules/.bin/next dev --port "$FRONTEND_PORT"
) &
FRONTEND_PID=$!

set +e
wait -n "$BACKEND_PID" "$FRONTEND_PID"
EXIT_CODE=$?
set -e

if kill -0 "$BACKEND_PID" 2>/dev/null; then
  echo "[run_panel] El frontend terminó primero (code=$EXIT_CODE). Cerrando backend..."
elif kill -0 "$FRONTEND_PID" 2>/dev/null; then
  echo "[run_panel] El backend terminó primero (code=$EXIT_CODE). Cerrando frontend..."
fi

exit "$EXIT_CODE"
