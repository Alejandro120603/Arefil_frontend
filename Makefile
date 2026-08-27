# Arefil frontend — orchestrates the sibling FastAPI backend + this Next.js
# frontend for local development. See README.md for the full setup story.

BACKEND_DIR ?= ../Arefil_backend/backend
FRONTEND_DIR ?= .
BACKEND_PORT ?= 8000
FRONTEND_PORT ?= 3001
BACKEND_DATA_DIR ?= ../Arefil_backend/backend/data
COMPOSE_PROJECT_NAME ?= arefil

# Backend deps live in a venv that is a sibling of backend/ (matches
# Arefil_backend/README.md's own `python3 -m venv .venv` instructions).
BACKEND_VENV ?= $(BACKEND_DIR)/../.venv
BACKEND_PY ?= $(BACKEND_VENV)/bin/python

.PHONY: run_panel setup_panel check_backend check_frontend docker_preflight docker_up docker_down docker_logs docker_ps docker_rebuild

## Validate the sibling backend + its venv, or fail with an actionable message.
check_backend:
	@if [ ! -f "$(BACKEND_DIR)/app/main.py" ]; then \
		echo "Error: no se encontró el backend en '$(BACKEND_DIR)'."; \
		echo "  Ajusta BACKEND_DIR o clona Arefil_backend como repo hermano:"; \
		echo "    ~/projects/Arefil_frontend"; \
		echo "    ~/projects/Arefil_backend"; \
		exit 1; \
	fi
	@if [ ! -x "$(BACKEND_PY)" ]; then \
		echo "Error: no se encontró el entorno virtual del backend en '$(BACKEND_VENV)'."; \
		echo "  Ejecuta 'make setup_panel' o sigue Arefil_backend/backend/README.md."; \
		exit 1; \
	fi
	@"$(BACKEND_PY)" -c "import fastapi, uvicorn, alembic" 2>/dev/null || { \
		echo "Error: faltan dependencias de Python en '$(BACKEND_VENV)'."; \
		echo "  Ejecuta 'make setup_panel' para instalarlas."; \
		exit 1; \
	}

## Validate frontend deps, installing them on first run (this repo only).
check_frontend:
	@if [ ! -d "$(FRONTEND_DIR)/node_modules" ]; then \
		echo "[check_frontend] node_modules no encontrado, instalando dependencias..."; \
		cd "$(FRONTEND_DIR)" && npm install; \
	fi

## First-time setup: backend venv + deps, frontend deps.
setup_panel:
	@if [ ! -f "$(BACKEND_DIR)/app/main.py" ]; then \
		echo "Error: no se encontró el backend en '$(BACKEND_DIR)'."; \
		exit 1; \
	fi
	@if [ ! -x "$(BACKEND_PY)" ]; then \
		echo "[setup_panel] Creando entorno virtual del backend en '$(BACKEND_VENV)'..."; \
		python3 -m venv "$(BACKEND_VENV)"; \
	fi
	@echo "[setup_panel] Instalando dependencias de backend..."
	@"$(BACKEND_PY)" -m pip install --upgrade pip >/dev/null
	@"$(BACKEND_PY)" -m pip install -r "$(BACKEND_DIR)/requirements.txt"
	@echo "[setup_panel] Instalando dependencias de frontend..."
	@cd "$(FRONTEND_DIR)" && npm install
	@echo "[setup_panel] Listo. Ejecuta 'make run_panel'."

## Migrate + seed the backend, then run FastAPI (:$(BACKEND_PORT)) and
## Next.js (:$(FRONTEND_PORT)) together. Ctrl+C, or either process dying,
## stops both cleanly (see scripts/run_panel.sh).
run_panel: check_backend check_frontend
	@BACKEND_DIR="$(BACKEND_DIR)" FRONTEND_DIR="$(FRONTEND_DIR)" \
		BACKEND_PORT="$(BACKEND_PORT)" FRONTEND_PORT="$(FRONTEND_PORT)" \
		BACKEND_PY="$(BACKEND_PY)" \
		exec ./scripts/run_panel.sh

## Validate Docker, Compose, the sibling backend, and the persistent data path.
docker_preflight:
	@BACKEND_DATA_DIR="$(BACKEND_DATA_DIR)" ./scripts/docker_preflight.sh

## Start the complete production stack and wait for both healthchecks.
docker_up: docker_preflight
	@AREFIL_UID="$$(id -u)" AREFIL_GID="$$(id -g)" \
		FRONTEND_PORT="$(FRONTEND_PORT)" BACKEND_PORT="$(BACKEND_PORT)" \
		BACKEND_DATA_DIR="$(BACKEND_DATA_DIR)" COMPOSE_PROJECT_NAME="$(COMPOSE_PROJECT_NAME)" \
		docker compose up --detach --build --wait

## Stop and remove containers/network. Persistent backend data is never removed.
docker_down: docker_preflight
	@FRONTEND_PORT="$(FRONTEND_PORT)" BACKEND_PORT="$(BACKEND_PORT)" \
		BACKEND_DATA_DIR="$(BACKEND_DATA_DIR)" COMPOSE_PROJECT_NAME="$(COMPOSE_PROJECT_NAME)" \
		docker compose down

## Follow logs for both application services.
docker_logs: docker_preflight
	@FRONTEND_PORT="$(FRONTEND_PORT)" BACKEND_PORT="$(BACKEND_PORT)" \
		BACKEND_DATA_DIR="$(BACKEND_DATA_DIR)" COMPOSE_PROJECT_NAME="$(COMPOSE_PROJECT_NAME)" \
		docker compose logs --follow --tail=100 frontend backend

## Show Compose service and health status.
docker_ps: docker_preflight
	@FRONTEND_PORT="$(FRONTEND_PORT)" BACKEND_PORT="$(BACKEND_PORT)" \
		BACKEND_DATA_DIR="$(BACKEND_DATA_DIR)" COMPOSE_PROJECT_NAME="$(COMPOSE_PROJECT_NAME)" \
		docker compose ps

## Rebuild/recreate both services without deleting persistent data.
docker_rebuild: docker_preflight
	@AREFIL_UID="$$(id -u)" AREFIL_GID="$$(id -g)" \
		FRONTEND_PORT="$(FRONTEND_PORT)" BACKEND_PORT="$(BACKEND_PORT)" \
		BACKEND_DATA_DIR="$(BACKEND_DATA_DIR)" COMPOSE_PROJECT_NAME="$(COMPOSE_PROJECT_NAME)" \
		docker compose up --detach --build --force-recreate --wait
