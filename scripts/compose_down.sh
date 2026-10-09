#!/usr/bin/env bash
# Stops a known local AREFIL instance, then frees only its two configured ports.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/compose_common.sh
source "$SCRIPT_DIR/compose_common.sh"

AREFIL_LOG_PREFIX="compose_down"
FRONTEND_DIR="${FRONTEND_DIR:-.}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3001}"

fail() {
  arefil_error "$1"
  exit 1
}

arefil_validate_port "$BACKEND_PORT" || fail "BACKEND_PORT inválido: '$BACKEND_PORT'."
arefil_validate_port "$FRONTEND_PORT" || fail "FRONTEND_PORT inválido: '$FRONTEND_PORT'."

FRONTEND_DIR_ABS="$(cd "$FRONTEND_DIR" && pwd)"
RUNTIME_DIR="$(arefil_runtime_path "$FRONTEND_DIR_ABS")"
RUNTIME_FILE="$RUNTIME_DIR/instance"

stop_known_instance() {
  local version="" frontend_root="" supervisor_pid="" supervisor_start=""
  local backend_pid="" backend_start="" frontend_pid="" frontend_start=""
  local key value attempt

  [[ -f "$RUNTIME_FILE" && ! -L "$RUNTIME_FILE" ]] || return 0
  if [[ "$(stat -c '%u' "$RUNTIME_FILE" 2>/dev/null || true)" != "$(id -u)" ]]; then
    arefil_error "la metadata '$RUNTIME_FILE' no pertenece al usuario actual; no se usará."
    return 0
  fi

  while IFS='=' read -r key value; do
    case "$key" in
      version) version="$value" ;;
      frontend_root) frontend_root="$value" ;;
      supervisor_pid) supervisor_pid="$value" ;;
      supervisor_start) supervisor_start="$value" ;;
      backend_pid) backend_pid="$value" ;;
      backend_start) backend_start="$value" ;;
      frontend_pid) frontend_pid="$value" ;;
      frontend_start) frontend_start="$value" ;;
    esac
  done <"$RUNTIME_FILE"

  if [[ "$version" != "1" || "$frontend_root" != "$FRONTEND_DIR_ABS" ]]; then
    arefil_error "metadata inválida o stale; se eliminará sin señalizar procesos."
    rm -f "$RUNTIME_FILE"
    rmdir "$RUNTIME_DIR" 2>/dev/null || true
    return 0
  fi

  if arefil_process_matches "$supervisor_pid" "$supervisor_start" 'compose_up.sh'; then
    arefil_log "Deteniendo instancia conocida de AREFIL (PID $supervisor_pid)..."
    kill -TERM "$supervisor_pid" 2>/dev/null || true
    for ((attempt = 0; attempt < 250; attempt++)); do
      kill -0 "$supervisor_pid" 2>/dev/null || break
      sleep 0.1
    done
    if kill -0 "$supervisor_pid" 2>/dev/null; then
      arefil_log "El supervisor ignoró SIGTERM; enviando SIGKILL."
      kill -KILL "$supervisor_pid" 2>/dev/null || true
    fi
  else
    arefil_log "Metadata stale: el supervisor ya no corresponde a AREFIL."
    if arefil_process_matches "$frontend_pid" "$frontend_start" 'next dev'; then
      arefil_log "Deteniendo grupo huérfano de Next.js ($frontend_pid)..."
      kill -TERM -- "-$frontend_pid" 2>/dev/null || true
    fi
    if arefil_process_matches "$backend_pid" "$backend_start" 'uvicorn'; then
      arefil_log "Deteniendo grupo huérfano de Uvicorn ($backend_pid)..."
      kill -TERM -- "-$backend_pid" 2>/dev/null || true
    fi
  fi

  rm -f "$RUNTIME_FILE"
  rmdir "$RUNTIME_DIR" 2>/dev/null || true
}

stop_conventional_listeners() {
  local port="$1"
  local round pid process command attempt
  local -a pids=()

  for ((round = 1; round <= 3; round++)); do
    arefil_port_is_free "$port" && return 0
    mapfile -t pids < <(arefil_listener_pids "$port")
    if ((${#pids[@]} == 0)); then
      arefil_error "puerto $port ocupado, pero no fue posible identificar el PID sin privilegios."
      arefil_error "revisa con 'sudo ss -ltnp sport = :$port' y vuelve a ejecutar con los privilegios necesarios."
      return 1
    fi

    for pid in "${pids[@]}"; do
      process="$(arefil_process_name "$pid")"
      command="$(arefil_process_command "$pid")"
      arefil_log "Listener en $port: PID $pid (${process:-desconocido})."
      [[ -n "$command" ]] && arefil_log "Comando: $command"
      arefil_log "Enviando SIGTERM al PID $pid..."
      kill -TERM "$pid" 2>/dev/null || true
    done

    for ((attempt = 0; attempt < 50; attempt++)); do
      arefil_port_is_free "$port" && return 0
      sleep 0.1
    done

    for pid in "${pids[@]}"; do
      if kill -0 "$pid" 2>/dev/null && arefil_pid_listens_on_port "$pid" "$port"; then
        arefil_log "PID $pid ignoró SIGTERM; enviando SIGKILL."
        kill -KILL "$pid" 2>/dev/null || true
      fi
    done
    arefil_wait_for_port_free "$port" 30 && return 0
  done

  return 1
}

free_port() {
  local port="$1"
  local container_id container_name

  arefil_log "Revisando puerto $port..."
  if arefil_port_is_free "$port"; then
    arefil_log "Puerto $port ya estaba libre."
    return 0
  fi

  if container_id="$(arefil_docker_container_for_port "$port" 2>/dev/null)"; then
    container_name="$(arefil_docker_container_name "$container_id")"
    arefil_log "Ocupado por Docker."
    arefil_log "Container: ${container_name:-$container_id}"
    arefil_log "Deteniendo container..."
    if ! docker stop "$container_id" >/dev/null; then
      arefil_error "Docker no pudo detener el container ${container_name:-$container_id}."
      return 1
    fi
    if arefil_wait_for_port_free "$port" 100; then
      arefil_log "Puerto $port libre."
      return 0
    fi
    arefil_log "El puerto sigue ocupado después de detener el container; revisando el listener actual."
  fi

  stop_conventional_listeners "$port" \
    || { arefil_error "no fue posible liberar el puerto $port."; return 1; }
  arefil_log "Puerto $port libre."
}

stop_known_instance

status=0
free_port "$BACKEND_PORT" || status=1
free_port "$FRONTEND_PORT" || status=1

if ((status == 0)); then
  arefil_log "AREFIL detenido."
else
  arefil_error "AREFIL no quedó completamente detenido."
fi
exit "$status"
