#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
TEST_PIDS=()

cleanup() {
  local pid
  for pid in "${TEST_PIDS[@]}"; do
    kill -TERM "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  done
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

assert_contains() {
  local output="$1"
  local expected="$2"
  [[ "$output" == *"$expected"* ]] || fail "no se encontró '$expected' en la salida"
}

pick_port() {
  python3 - <<'PY'
import socket
with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    print(sock.getsockname()[1])
PY
}

start_listener() {
  local port="$1"
  python3 -m http.server "$port" --bind 127.0.0.1 >"$TMP_DIR/http-$port.log" 2>&1 &
  LISTENER_PID=$!
  TEST_PIDS+=("$LISTENER_PID")
  for _ in {1..50}; do
    ss -H -ltn "sport = :$port" | grep -q . && return 0
    sleep 0.1
  done
  fail "el listener de prueba no abrió $port"
}

run_down() {
  FRONTEND_DIR="$ROOT" BACKEND_PORT="$1" FRONTEND_PORT="$2" \
    "$ROOT/scripts/compose_down.sh"
}

printf '%s\n' 'test: compose_down idempotente con puertos libres'
port_a="$(pick_port)"
port_b="$(pick_port)"
output="$(run_down "$port_a" "$port_b")"
assert_contains "$output" "Puerto $port_a ya estaba libre."
assert_contains "$(run_down "$port_a" "$port_b")" 'AREFIL detenido.'

printf '%s\n' 'test: listener convencional'
normal_port="$(pick_port)"
other_port="$(pick_port)"
start_listener "$normal_port"
normal_pid="$LISTENER_PID"
output="$(run_down "$normal_port" "$other_port")"
assert_contains "$output" "Listener en $normal_port: PID $normal_pid"
assert_contains "$output" "Puerto $normal_port libre."
kill -0 "$normal_pid" 2>/dev/null && fail 'compose_down no terminó el listener convencional'

printf '%s\n' 'test: detección Docker (CLI aislado)'
docker_port="$(pick_port)"
docker_other_port="$(pick_port)"
start_listener "$docker_port"
docker_listener_pid="$LISTENER_PID"
mkdir -p "$TMP_DIR/bin"
cat >"$TMP_DIR/bin/docker" <<'SH'
#!/usr/bin/env bash
case "$1" in
  info) exit 0 ;;
  ps) printf '%s\n' fake-container-id ;;
  port) printf '8000/tcp -> 127.0.0.1:%s\n' "$FAKE_DOCKER_PORT" ;;
  inspect) printf '/arefil-lifecycle-test\n' ;;
  stop) kill -TERM "$FAKE_DOCKER_PID"; printf '%s\n' "$2" ;;
  *) exit 1 ;;
esac
SH
chmod +x "$TMP_DIR/bin/docker"
output="$(PATH="$TMP_DIR/bin:$PATH" FAKE_DOCKER_PORT="$docker_port" \
  FAKE_DOCKER_PID="$docker_listener_pid" run_down "$docker_port" "$docker_other_port")"
assert_contains "$output" 'Ocupado por Docker.'
assert_contains "$output" 'Container: arefil-lifecycle-test'
kill -0 "$docker_listener_pid" 2>/dev/null && fail 'el stop Docker aislado no terminó su listener'

printf '%s\n' 'test: compose_up rechaza backend inexistente'
if BACKEND_DIR="$TMP_DIR/no-backend" FRONTEND_DIR="$ROOT" BACKEND_PY="$TMP_DIR/no-python" \
  BACKEND_PORT="$(pick_port)" FRONTEND_PORT="$(pick_port)" \
  "$ROOT/scripts/compose_up.sh" >"$TMP_DIR/missing-backend.log" 2>&1; then
  fail 'compose_up aceptó un backend inexistente'
fi
assert_contains "$(<"$TMP_DIR/missing-backend.log")" 'no se encontró el backend'

printf '%s\n' 'test: compose_up rechaza venv inexistente'
mkdir -p "$TMP_DIR/backend/app"
: >"$TMP_DIR/backend/app/main.py"
if BACKEND_DIR="$TMP_DIR/backend" FRONTEND_DIR="$ROOT" BACKEND_PY="$TMP_DIR/no-python" \
  BACKEND_PORT="$(pick_port)" FRONTEND_PORT="$(pick_port)" \
  "$ROOT/scripts/compose_up.sh" >"$TMP_DIR/missing-venv.log" 2>&1; then
  fail 'compose_up aceptó un venv inexistente'
fi
assert_contains "$(<"$TMP_DIR/missing-venv.log")" 'no se encontró el Python ejecutable del venv'

printf '%s\n' 'test: compose_up detecta puerto ocupado sin matar'
mkdir -p "$TMP_DIR/fake-venv/bin"
cat >"$TMP_DIR/fake-venv/bin/python" <<'SH'
#!/usr/bin/env bash
exit 0
SH
chmod +x "$TMP_DIR/fake-venv/bin/python"
occupied_port="$(pick_port)"
free_port="$(pick_port)"
start_listener "$occupied_port"
occupied_pid="$LISTENER_PID"
if BACKEND_DIR="$TMP_DIR/backend" FRONTEND_DIR="$ROOT" BACKEND_PY="$TMP_DIR/fake-venv/bin/python" \
  BACKEND_PORT="$occupied_port" FRONTEND_PORT="$free_port" \
  "$ROOT/scripts/compose_up.sh" >"$TMP_DIR/occupied.log" 2>&1; then
  fail 'compose_up aceptó un puerto ocupado'
fi
assert_contains "$(<"$TMP_DIR/occupied.log")" "puerto $occupied_port ocupado"
kill -0 "$occupied_pid" 2>/dev/null || fail 'compose_up mató el proceso que ocupaba el puerto'

printf '%s\n' 'PASS: lifecycle local'
