#!/usr/bin/env sh
# Static checks on the rendered HTTPS deployment (`docker compose config`).
# Needs only the Docker CLI with the Compose plugin; nothing is started.
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
DATA_DIR=$(mktemp -d)
trap 'rm -rf "$DATA_DIR"' EXIT

render() {
  BACKEND_DATA_DIR="$DATA_DIR" docker compose -f "$ROOT/compose.yaml" "$@" config --format json
}

check() {
  node --input-type=module -e "$(cat <<'JS'
const config = JSON.parse(await new Promise((resolve) => {
  let data = ""; process.stdin.on("data", (chunk) => (data += chunk)); process.stdin.on("end", () => resolve(data));
}));
const failures = [];
const expect = (ok, message) => { if (!ok) failures.push(message); };
const { backend, frontend, caddy, "report-execution-cleanup": cleanup } = config.services;

expect(!backend.ports?.length, "backend must not publish any host port");
expect(!frontend.ports?.length, "frontend must not publish any host port");
expect(!cleanup.ports?.length, "cleanup worker must not publish any host port");
expect(JSON.stringify((caddy.ports ?? []).map((p) => p.target).sort()) === "[443,80]", "only Caddy publishes 443/80");
for (const [name, service] of Object.entries(config.services)) {
  expect(service.network_mode == null, `${name} must not use network_mode`);
}
expect(config.networks.internal?.internal === true, "frontend<->backend network must be internal");
expect(Object.keys(backend.networks ?? {}).join() === "internal", "backend only on the internal network");
expect(Object.keys(cleanup.networks ?? {}).join() === "internal", "cleanup worker only on the internal network");
expect(!Object.keys(caddy.networks ?? {}).includes("internal"), "Caddy must not reach the backend network");

const env = backend.environment;
expect(env.APP_ENV === "production", "backend runs with APP_ENV=production");
expect(env.SESSION_COOKIE_SECURE === "true", "SESSION_COOKIE_SECURE=true");
for (const key of ["CORS_ORIGINS", "TRUSTED_ORIGINS"]) {
  const origins = JSON.parse(env[key]);
  expect(origins.length > 0 && origins.every((o) => o.startsWith("https://")), `${key} must be explicit https origins`);
}
const frontendIp = frontend.networks.internal?.ipv4_address;
expect(Boolean(frontendIp), "frontend has a fixed address on the internal network");
expect(JSON.parse(env.TRUSTED_PROXIES).join() === `${frontendIp}/32`, "backend trusts X-Forwarded-For only from the frontend's address");
expect(frontend.environment.TRUST_PROXY_FORWARDED_FOR === "true", "frontend relays Caddy's X-Forwarded-For");
expect(frontend.environment.API_INTERNAL_URL === "http://backend:8000/api", "frontend reaches the backend internally");
expect(cleanup.command?.join(" ") === "python -m app.cli.report_executions worker", "cleanup runs the dedicated worker command");
expect(!JSON.stringify(cleanup.healthcheck?.test ?? []).includes("8000"), "cleanup worker does not inherit the backend's HTTP healthcheck");
expect(Array.isArray(cleanup.healthcheck?.test) && !cleanup.healthcheck.disable, "cleanup worker has its own healthcheck (required by up --wait)");
expect(cleanup.environment.REPORT_EXECUTION_CLEANUP_ENABLED === "true", "periodic cleanup is enabled by default");
expect(cleanup.environment.DATABASE_URL === backend.environment.DATABASE_URL, "cleanup and backend share the database URL");

const serialized = JSON.stringify(config);
expect(!/PASSWORD|SECRET|PRIVATE KEY/i.test(serialized), "no credentials in the rendered configuration");

if (failures.length) {
  console.error(failures.map((f) => `FAIL ${f}`).join("\n"));
  process.exit(1);
}
console.log(`[deploy_config] OK: ${Object.keys(config.services).join(", ")}; only caddy publishes ${caddy.ports.map((p) => `${p.published}->${p.target}`).join(", ")}`);
JS
)"
}

render | check
# Overrides keep the same guarantees (ports, origin and subnet are configurable).
AREFIL_PUBLIC_ORIGIN=https://arefil.example.internal:8443 HTTPS_PORT=8443 HTTP_PORT=8080 \
  AREFIL_INTERNAL_SUBNET=10.231.0.0/24 AREFIL_FRONTEND_INTERNAL_IP=10.231.0.10 render | check

# Cloudflare Tunnel edge (compose.cloudflare.yaml): no Caddy, the frontend is
# the only listener and only on loopback, for the host's cloudflared.
render_cloudflare() {
  BACKEND_DATA_DIR="$DATA_DIR" docker compose -f "$ROOT/compose.yaml" -f "$ROOT/compose.cloudflare.yaml" "$@" config --format json
}

check_cloudflare() {
  EXPECTED_ORIGIN="$1" EXPECTED_PORT="$2" node --input-type=module -e "$(cat <<'JS'
const config = JSON.parse(await new Promise((resolve) => {
  let data = ""; process.stdin.on("data", (chunk) => (data += chunk)); process.stdin.on("end", () => resolve(data));
}));
const failures = [];
const expect = (ok, message) => { if (!ok) failures.push(message); };
const { backend, frontend, "report-execution-cleanup": cleanup } = config.services;

expect(config.name === "arefil", "the project name is pinned to arefil");
expect(!("caddy" in config.services), "Caddy is not part of the Cloudflare topology");
expect(!backend.ports?.length, "backend must not publish any host port");
expect(!cleanup.ports?.length, "cleanup worker must not publish any host port");
const ports = frontend.ports ?? [];
expect(ports.length === 1 && ports[0].host_ip === "127.0.0.1", "frontend listens on loopback only");
expect(String(ports[0]?.published) === process.env.EXPECTED_PORT && ports[0]?.target === 3000, "frontend loopback port feeds the tunnel ingress");
expect(Object.keys(backend.networks ?? {}).join() === "internal", "backend only on the internal network");

for (const service of [backend, cleanup]) {
  for (const key of ["CORS_ORIGINS", "TRUSTED_ORIGINS"]) {
    expect(JSON.stringify(JSON.parse(service.environment[key])) === JSON.stringify([process.env.EXPECTED_ORIGIN]), `${key} is exactly the public origin`);
  }
}
expect(backend.environment.SESSION_COOKIE_SECURE === "true", "SESSION_COOKIE_SECURE=true");
expect(backend.environment.AREFIL_ALLOW_NEW_DATABASE === "false", "a new empty database is refused by default");
expect(frontend.environment.CLIENT_IP_HEADER === "cf-connecting-ip", "frontend takes the client address from CF-Connecting-IP");
expect(frontend.environment.TRUST_PROXY_FORWARDED_FOR === "false", "a client-sent X-Forwarded-For is never trusted behind Cloudflare");
expect(frontend.environment.PUBLIC_ORIGIN === process.env.EXPECTED_ORIGIN, "the https redirect targets the public origin");
expect(frontend.build.args.NEXT_PUBLIC_API_URL === "/backend-api", "the browser only knows the same-origin proxy");

if (failures.length) {
  console.error(failures.map((f) => `FAIL ${f}`).join("\n"));
  process.exit(1);
}
console.log(`[deploy_config] OK cloudflare: ${Object.keys(config.services).join(", ")}; only frontend on ${ports[0].host_ip}:${ports[0].published}`);
JS
)"
}

AREFIL_PUBLIC_ORIGIN=https://arefil.example.com render_cloudflare | check_cloudflare https://arefil.example.com 3001
AREFIL_PUBLIC_ORIGIN=https://arefil.example.com FRONTEND_PORT=3101 render_cloudflare | check_cloudflare https://arefil.example.com 3101
if AREFIL_PUBLIC_ORIGIN= render_cloudflare >/dev/null 2>&1; then
  echo "FAIL the Cloudflare topology must refuse to render without AREFIL_PUBLIC_ORIGIN" >&2
  exit 1
fi
echo "[deploy_config] OK cloudflare: AREFIL_PUBLIC_ORIGIN is required"
