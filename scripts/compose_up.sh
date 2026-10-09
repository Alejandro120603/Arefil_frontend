#!/usr/bin/env bash
# Runs the sibling FastAPI backend and this Next.js frontend for local development.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/compose_common.sh
source "$SCRIPT_DIR/compose_common.sh"

AREFIL_LOG_PREFIX="compose_up"
: "${BACKEND_DIR:?BACKEND_DIR no definido}"
: "${FRONTEND_DIR:?FRONTEND_DIR no definido}"
: "${BACKEND_PY:?BACKEND_PY no definido}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3001}"

fail() {
  arefil_error "$1"
  exit 1
}

arefil_validate_port "$BACKEND_PORT" || fail "BACKEND_PORT inválido: '$BACKEND_PORT'."
arefil_validate_port "$FRONTEND_PORT" || fail "FRONTEND_PORT inválido: '$FRONTEND_PORT'."
[[ "$BACKEND_PORT" != "$FRONTEND_PORT" ]] || fail "backend y frontend no pueden usar el mismo puerto ($BACKEND_PORT)."
command -v setsid >/dev/null 2>&1 || fail "no se encontró 'setsid', necesario para aislar los árboles de procesos."
command -v node >/dev/null 2>&1 || fail "Node.js no está instalado o no está en PATH."
if ! command -v ss >/dev/null 2>&1 \
  && ! command -v lsof >/dev/null 2>&1 \
  && ! command -v fuser >/dev/null 2>&1; then
  fail "se requiere ss, lsof o fuser para validar los puertos."
fi

[[ -f "$BACKEND_DIR/app/main.py" ]] || fail "no se encontró el backend en '$BACKEND_DIR'."
[[ -x "$BACKEND_PY" ]] || fail "no se encontró el Python ejecutable del venv en '$BACKEND_PY'."
[[ -x "$FRONTEND_DIR/node_modules/.bin/next" ]] || fail "no se encontró Next.js en '$FRONTEND_DIR/node_modules'. Ejecuta npm install."
"$BACKEND_PY" -c 'import fastapi, uvicorn, alembic' 2>/dev/null \
  || fail "faltan dependencias de Python en el venv del backend. Ejecuta make setup_panel."

BACKEND_DIR_ABS="$(cd "$BACKEND_DIR" && pwd)"
FRONTEND_DIR_ABS="$(cd "$FRONTEND_DIR" && pwd)"
BACKEND_PY="$(cd "$(dirname "$BACKEND_PY")" && pwd)/$(basename "$BACKEND_PY")"
RUNTIME_DIR="$(arefil_runtime_path "$FRONTEND_DIR_ABS")"
RUNTIME_FILE="$RUNTIME_DIR/instance"

for port in "$BACKEND_PORT" "$FRONTEND_PORT"; do
  if ! arefil_port_is_free "$port"; then
    arefil_error "puerto $port ocupado."
    arefil_describe_port "$port" >&2
    printf '\nEjecuta:\nmake compose_down\n' >&2
    exit 1
  fi
done

mkdir -p "$RUNTIME_DIR"
chmod 700 "$RUNTIME_DIR"

if [[ -f "$RUNTIME_FILE" ]]; then
  arefil_error "existe metadata de otra ejecución en '$RUNTIME_FILE'."
  arefil_error "ejecuta 'make compose_down' antes de volver a iniciar."
  exit 1
fi

arefil_log "Aplicando migraciones Alembic..."
(cd "$BACKEND_DIR_ABS" && "$BACKEND_PY" -m alembic upgrade head)

arefil_log "Ejecutando seed Donaldson (idempotente)..."
(cd "$BACKEND_DIR_ABS" && "$BACKEND_PY" -m app.db.seed)

BACKEND_PID=""
FRONTEND_PID=""
BACKEND_START=""
FRONTEND_START=""
CLEANING_UP=0

write_runtime_file() {
  local temp_file="$RUNTIME_FILE.tmp.$$"
  umask 077
  {
    printf 'version=1\n'
    printf 'frontend_root=%s\n' "$FRONTEND_DIR_ABS"
    printf 'supervisor_pid=%s\n' "$$"
    printf 'supervisor_start=%s\n' "$(arefil_process_starttime "$$")"
    printf 'backend_port=%s\n' "$BACKEND_PORT"
    printf 'frontend_port=%s\n' "$FRONTEND_PORT"
    printf 'backend_pid=%s\n' "$BACKEND_PID"
    printf 'backend_start=%s\n' "$BACKEND_START"
    printf 'frontend_pid=%s\n' "$FRONTEND_PID"
    printf 'frontend_start=%s\n' "$FRONTEND_START"
  } >"$temp_file"
  mv -f "$temp_file" "$RUNTIME_FILE"
}

stop_group() {
  local pid="$1"
  local start="$2"
  local marker="$3"
  local label="$4"
  local attempt

  [[ -n "$pid" && -n "$start" ]] || return 0
  arefil_process_matches "$pid" "$start" "$marker" || return 0
  kill -TERM -- "-$pid" 2>/dev/null || true

  for ((attempt = 0; attempt < 100; attempt++)); do
    kill -0 -- "-$pid" 2>/dev/null || return 0
    sleep 0.1
  done

  arefil_log "$label ignoró SIGTERM; enviando SIGKILL al grupo $pid."
  kill -KILL -- "-$pid" 2>/dev/null || true
}

cleanup() {
  local exit_code=$?
  ((CLEANING_UP == 0)) || return "$exit_code"
  CLEANING_UP=1
  trap - INT TERM EXIT
  printf '\n'
  arefil_log "Deteniendo procesos..."
  stop_group "$FRONTEND_PID" "$FRONTEND_START" 'next dev' "Next.js"
  stop_group "$BACKEND_PID" "$BACKEND_START" 'uvicorn' "Uvicorn"
  [[ -n "$FRONTEND_PID" ]] && wait "$FRONTEND_PID" 2>/dev/null || true
  [[ -n "$BACKEND_PID" ]] && wait "$BACKEND_PID" 2>/dev/null || true
  rm -f "$RUNTIME_FILE"
  rmdir "$RUNTIME_DIR" 2>/dev/null || true
  arefil_log "Procesos detenidos."
  return "$exit_code"
}

handle_int() {
  exit 130
}

handle_term() {
  exit 143
}

trap handle_int INT
trap handle_term TERM
trap cleanup EXIT

arefil_log "Backend:  http://127.0.0.1:${BACKEND_PORT} (docs en /docs)"
arefil_log "Frontend: http://127.0.0.1:${FRONTEND_PORT}"
arefil_log "Ctrl+C para detener ambos."
printf '\n'

setsid bash -c 'cd "$1" && exec "$2" -m uvicorn app.main:app --reload --host 127.0.0.1 --port "$3"' \
  arefil-backend "$BACKEND_DIR_ABS" "$BACKEND_PY" "$BACKEND_PORT" &
BACKEND_PID=$!
BACKEND_START="$(arefil_process_starttime "$BACKEND_PID")"

setsid bash -c 'cd "$1" && exec env NEXT_TELEMETRY_DISABLED=1 ./node_modules/.bin/next dev --hostname 127.0.0.1 --port "$2"' \
  arefil-frontend "$FRONTEND_DIR_ABS" "$FRONTEND_PORT" &
FRONTEND_PID=$!
FRONTEND_START="$(arefil_process_starttime "$FRONTEND_PID")"

write_runtime_file

set +e
wait -n "$BACKEND_PID" "$FRONTEND_PID"
EXIT_CODE=$?
set -e

if kill -0 "$BACKEND_PID" 2>/dev/null; then
  arefil_log "El frontend terminó primero (code=$EXIT_CODE). Cerrando backend..."
elif kill -0 "$FRONTEND_PID" 2>/dev/null; then
  arefil_log "El backend terminó primero (code=$EXIT_CODE). Cerrando frontend..."
fi

exit "$EXIT_CODE"
