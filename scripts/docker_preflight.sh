#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
FRONTEND_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
BACKEND_ROOT="$FRONTEND_ROOT/../Arefil_backend"
BACKEND_DATA_DIR=${BACKEND_DATA_DIR:-../Arefil_backend/backend/data}

case "$BACKEND_DATA_DIR" in
  /*) ;;
  *) BACKEND_DATA_DIR="$FRONTEND_ROOT/$BACKEND_DATA_DIR" ;;
esac

fail() {
  printf '%s\n' "Error: $1" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || fail "Docker no está instalado o no está en PATH."
docker info >/dev/null 2>&1 || fail "el daemon de Docker no está accesible; inicia Docker e intenta de nuevo."
docker compose version >/dev/null 2>&1 || fail "docker compose no está disponible; instala el plugin Docker Compose."
command -v id >/dev/null 2>&1 || fail "no se encontró el comando 'id', necesario para mapear permisos del bind mount."

[ -f "$FRONTEND_ROOT/Dockerfile" ] || fail "falta el Dockerfile del frontend en '$FRONTEND_ROOT'."
[ -f "$BACKEND_ROOT/Dockerfile" ] || fail "no se encontró '$BACKEND_ROOT/Dockerfile'; clona Arefil_backend como repo hermano."
[ -f "$BACKEND_ROOT/backend/app/main.py" ] || fail "el repo hermano Arefil_backend está incompleto."
[ -d "$BACKEND_DATA_DIR" ] || fail "no existe el directorio persistente '$BACKEND_DATA_DIR'."
[ -w "$BACKEND_DATA_DIR" ] || fail "el directorio persistente '$BACKEND_DATA_DIR' no es escribible por el usuario actual."

docker compose -f "$FRONTEND_ROOT/compose.yaml" config --quiet >/dev/null || fail "compose.yaml no es válido."

printf '%s\n' "[docker_preflight] Docker y repos hermanos listos."
printf '%s\n' "[docker_preflight] Datos persistentes: $BACKEND_DATA_DIR"
