#!/usr/bin/env sh
# Validates Docker, the sibling backend and — above all — the persistent data
# directory that this deployment would mount, before anything is (re)started.
#
# The data directory is read from the configuration Compose will actually use
# (COMPOSE_FILE and .env included), never guessed. The preflight fails when:
#   - the directory is missing or not writable;
#   - it holds no arefil.db (or an empty one), unless
#     AREFIL_ALLOW_NEW_DATABASE=true for a first installation;
#   - an existing (running or stopped) backend of this project mounts a
#     different directory, unless
#     AREFIL_ALLOW_DATA_DIR_CHANGE=true (e.g. a planned move of the data).
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
FRONTEND_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
BACKEND_ROOT="$FRONTEND_ROOT/../Arefil_backend"

fail() {
  printf '%s\n' "Error: $1" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || fail "Docker no está instalado o no está en PATH."
docker info >/dev/null 2>&1 || fail "el daemon de Docker no está accesible; inicia Docker e intenta de nuevo."
docker compose version >/dev/null 2>&1 || fail "docker compose no está disponible; instala el plugin Docker Compose."
command -v id >/dev/null 2>&1 || fail "no se encontró el comando 'id', necesario para mapear permisos del bind mount."
command -v node >/dev/null 2>&1 || fail "se requiere Node.js para leer la configuración efectiva de Compose."

[ -f "$FRONTEND_ROOT/Dockerfile" ] || fail "falta el Dockerfile del frontend en '$FRONTEND_ROOT'."
[ -f "$BACKEND_ROOT/Dockerfile" ] || fail "no se encontró '$BACKEND_ROOT/Dockerfile'; clona Arefil_backend como repo hermano."
[ -f "$BACKEND_ROOT/backend/app/main.py" ] || fail "el repo hermano Arefil_backend está incompleto."

cd "$FRONTEND_ROOT"
CONFIG=$(docker compose config --format json) || fail "la configuración de Compose no es válida (revisa .env y COMPOSE_FILE)."

# Project, data dir, allow-new flag, published ports and services, as rendered.
SUMMARY=$(printf '%s' "$CONFIG" | node -e '
let raw = "";
process.stdin.on("data", (chunk) => (raw += chunk)).on("end", () => {
  const config = JSON.parse(raw);
  const backend = config.services.backend;
  const mount = (backend.volumes ?? []).find((volume) => volume.target === "/app/data");
  if (!mount || mount.type !== "bind") {
    console.error("backend no monta /app/data como bind mount");
    process.exit(2);
  }
  const ports = Object.entries(config.services).flatMap(([name, service]) =>
    (service.ports ?? []).map((p) => `${name}:${p.host_ip || "0.0.0.0"}:${p.published}->${p.target}`),
  );
  console.log(config.name);
  console.log(mount.source);
  console.log(String(backend.environment?.AREFIL_ALLOW_NEW_DATABASE ?? "false").toLowerCase());
  console.log(ports.join(" ") || "(ninguno)");
  console.log(Object.keys(config.services).join(" "));
});
') || fail "no se pudo interpretar la configuración de Compose."

PROJECT=$(printf '%s\n' "$SUMMARY" | sed -n 1p)
DATA_DIR=$(printf '%s\n' "$SUMMARY" | sed -n 2p)
ALLOW_NEW_DATABASE=$(printf '%s\n' "$SUMMARY" | sed -n 3p)
PUBLISHED=$(printf '%s\n' "$SUMMARY" | sed -n 4p)
SERVICES=$(printf '%s\n' "$SUMMARY" | sed -n 5p)

[ -d "$DATA_DIR" ] || fail "no existe el directorio persistente '$DATA_DIR'."
[ -w "$DATA_DIR" ] || fail "el directorio persistente '$DATA_DIR' no es escribible por el usuario actual."

if [ ! -s "$DATA_DIR/arefil.db" ] && [ "$ALLOW_NEW_DATABASE" != "true" ]; then
  fail "no hay base de datos en '$DATA_DIR/arefil.db'. Si BACKEND_DATA_DIR es incorrecto, corrígelo; sólo en una instalación nueva usa AREFIL_ALLOW_NEW_DATABASE=true."
fi

EXISTING=$(docker compose ps --all --quiet backend 2>/dev/null || true)
if [ -n "$EXISTING" ]; then
  CURRENT=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Source}}{{end}}{{end}}' "$EXISTING")
  if [ -n "$CURRENT" ]; then
    CURRENT_REAL=$(CDPATH= cd -- "$CURRENT" 2>/dev/null && pwd -P || printf '%s' "$CURRENT")
    WANTED_REAL=$(CDPATH= cd -- "$DATA_DIR" && pwd -P)
    if [ "$CURRENT_REAL" != "$WANTED_REAL" ] && [ "${AREFIL_ALLOW_DATA_DIR_CHANGE:-false}" != "true" ]; then
      fail "el backend existente usa '$CURRENT_REAL' pero este despliegue montaría '$WANTED_REAL'. Revisa BACKEND_DATA_DIR (o AREFIL_ALLOW_DATA_DIR_CHANGE=true si el cambio es intencional)."
    fi
  fi
fi

printf '%s\n' "[docker_preflight] Docker y repos hermanos listos."
printf '%s\n' "[docker_preflight] Proyecto: $PROJECT · servicios: $SERVICES"
printf '%s\n' "[docker_preflight] Datos persistentes: $DATA_DIR"
printf '%s\n' "[docker_preflight] Puertos publicados: $PUBLISHED"
