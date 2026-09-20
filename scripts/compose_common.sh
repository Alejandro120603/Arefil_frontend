#!/usr/bin/env bash

# Shared, side-effect-free helpers for the local AREFIL lifecycle scripts.
# This file is sourced by compose_up.sh and compose_down.sh.

arefil_log() {
  printf '[%s] %s\n' "$AREFIL_LOG_PREFIX" "$*"
}

arefil_error() {
  printf '[%s] ERROR: %s\n' "$AREFIL_LOG_PREFIX" "$*" >&2
}

arefil_validate_port() {
  local port="$1"
  [[ "$port" =~ ^[0-9]+$ ]] && ((port >= 1 && port <= 65535))
}

arefil_port_is_free() {
  local port="$1"

  if command -v ss >/dev/null 2>&1; then
    [[ -z "$(ss -H -ltn "sport = :$port" 2>/dev/null)" ]]
    return
  fi
  if command -v lsof >/dev/null 2>&1; then
    ! lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | grep -q .
    return
  fi
  if command -v fuser >/dev/null 2>&1; then
    ! fuser -n tcp "$port" >/dev/null 2>&1
    return
  fi

  arefil_error "no se encontró ss, lsof ni fuser para revisar el puerto $port."
  return 2
}

arefil_listener_pids() {
  local port="$1"
  local output=""

  if command -v lsof >/dev/null 2>&1; then
    output="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)"
  fi
  if [[ -z "$output" ]] && command -v ss >/dev/null 2>&1; then
    output="$(ss -H -ltnp "sport = :$port" 2>/dev/null \
      | grep -o 'pid=[0-9][0-9]*' \
      | cut -d= -f2 || true)"
  fi
  if [[ -z "$output" ]] && command -v fuser >/dev/null 2>&1; then
    output="$(fuser -n tcp "$port" 2>/dev/null || true)"
  fi

  if [[ -n "$output" ]]; then
    tr ' ' '\n' <<<"$output" | sed '/^$/d' | sort -n -u
  fi
}

arefil_pid_listens_on_port() {
  local expected_pid="$1"
  local port="$2"
  local pid

  while IFS= read -r pid; do
    [[ "$pid" == "$expected_pid" ]] && return 0
  done < <(arefil_listener_pids "$port")
  return 1
}

arefil_process_name() {
  local pid="$1"
  ps -p "$pid" -o comm= 2>/dev/null | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' || true
}

arefil_process_command() {
  local pid="$1"
  ps -p "$pid" -o args= 2>/dev/null | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' || true
}

arefil_process_starttime() {
  local pid="$1"
  [[ -r "/proc/$pid/stat" ]] || return 1
  awk '{print $22}' "/proc/$pid/stat" 2>/dev/null
}

arefil_process_cmdline() {
  local pid="$1"
  [[ -r "/proc/$pid/cmdline" ]] || return 1
  tr '\0' ' ' <"/proc/$pid/cmdline" 2>/dev/null
}

arefil_process_matches() {
  local pid="$1"
  local expected_start="$2"
  local marker="$3"
  local actual_start cmdline

  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  actual_start="$(arefil_process_starttime "$pid" 2>/dev/null || true)"
  [[ -n "$actual_start" && "$actual_start" == "$expected_start" ]] || return 1
  cmdline="$(arefil_process_cmdline "$pid" 2>/dev/null || true)"
  [[ "$cmdline" == *"$marker"* ]]
}

arefil_runtime_path() {
  local frontend_root="$1"
  local root_hash

  if command -v sha256sum >/dev/null 2>&1; then
    root_hash="$(printf '%s' "$frontend_root" | sha256sum | awk '{print substr($1,1,16)}')"
  else
    root_hash="$(printf '%s' "$frontend_root" | cksum | awk '{print $1}')"
  fi
  printf '%s/arefil-compose-%s-%s\n' "${XDG_RUNTIME_DIR:-/tmp}" "$(id -u)" "$root_hash"
}

arefil_docker_container_for_port() {
  local port="$1"
  local container_id mapping endpoint host_port

  command -v docker >/dev/null 2>&1 || return 1
  docker info >/dev/null 2>&1 || return 1

  while IFS= read -r container_id; do
    [[ -n "$container_id" ]] || continue
    while IFS= read -r mapping; do
      [[ "$mapping" == *' -> '* ]] || continue
      endpoint="${mapping##* -> }"
      host_port="${endpoint##*:}"
      if [[ "$host_port" == "$port" ]]; then
        printf '%s\n' "$container_id"
        return 0
      fi
    done < <(docker port "$container_id" 2>/dev/null || true)
  done < <(docker ps -q 2>/dev/null)

  return 1
}

arefil_docker_container_name() {
  docker inspect --format '{{.Name}}' "$1" 2>/dev/null | sed 's#^/##'
}

arefil_describe_port() {
  local port="$1"
  local container_id container_name pid process command

  if container_id="$(arefil_docker_container_for_port "$port" 2>/dev/null)"; then
    container_name="$(arefil_docker_container_name "$container_id")"
    printf 'Docker: sí\nContainer: %s\n' "${container_name:-$container_id}"
  fi

  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    process="$(arefil_process_name "$pid")"
    command="$(arefil_process_command "$pid")"
    printf 'PID: %s\nProceso: %s\n' "$pid" "${process:-desconocido}"
    [[ -n "$command" ]] && printf 'Comando: %s\n' "$command"
  done < <(arefil_listener_pids "$port")
}

arefil_wait_for_port_free() {
  local port="$1"
  local attempts="${2:-100}"
  local attempt

  for ((attempt = 0; attempt < attempts; attempt++)); do
    arefil_port_is_free "$port" && return 0
    sleep 0.1
  done
  return 1
}
