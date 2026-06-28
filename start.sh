#!/usr/bin/env bash
# start.sh — helm development launcher
#
#   API server (Fastify, Node.js)   → dynamic port (47800–47899)
#   Frontend dev server (Vite)      → dynamic port (47600–47699)
#
# Usage:
#   ./start.sh              # default dev mode
#   ./start.sh --prod       # production build + serve
#   ./start.sh --stop       # stop all services
#   ./start.sh --rebuild    # force npm install even if up to date

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${SCRIPT_DIR}"
LOG_DIR="${PROJECT_ROOT}/logs"

# ── Helpers ───────────────────────────────────────────────────────────────────
info()   { echo "  ${*}"; }
ok()     { echo "  [ok] ${*}"; }
warn()   { echo "  [warn] ${*}"; }
die()    { echo "[fail] ${*}" >&2; exit 1; }
header() { echo; echo "── ${*}"; }

# ── Port allocation ───────────────────────────────────────────────────────────
find_free_port() {
  local start="${1}" end="${2}" port
  for port in $(seq "${start}" "${end}"); do
    if ! ss -tln 2>/dev/null | grep -q ":${port} " && \
       ! lsof -i tcp:"${port}" &>/dev/null 2>&1; then
      echo "${port}"; return 0
    fi
  done
  die "No free port found in range ${start}–${end}"
}

# ── Flags ─────────────────────────────────────────────────────────────────────
PROD_MODE=false
STOP_ONLY=false
FORCE_REBUILD=false
for arg in "$@"; do
  case "${arg}" in
    --prod)         PROD_MODE=true ;;
    --stop)         STOP_ONLY=true ;;
    --rebuild)      FORCE_REBUILD=true ;;
    --reset-ports)
      sed -i 's/^BACKEND_PORT="[0-9]*"/BACKEND_PORT=""/' "${BASH_SOURCE[0]}"
      sed -i 's/^FRONTEND_PORT="[0-9]*"/FRONTEND_PORT=""/' "${BASH_SOURCE[0]}"
      ok "Ports reset — next run will assign new ones"; exit 0 ;;
    *) echo "Unknown flag: ${arg}" >&2; exit 1 ;;
  esac
done

wait_for_http() {
  local url="${1}" label="${2}" log="${3:-}" timeout=30 elapsed=0
  while ! curl -sf --max-time 2 "${url}" &>/dev/null; do
    sleep 0.5; elapsed=$((elapsed + 1))
    if [[ ${elapsed} -ge $((timeout * 2)) ]]; then
      local hint=""; [[ -n "${log}" ]] && hint=" — check ${log}"
      die "${label} did not respond at ${url} after ${timeout}s${hint}"
    fi
  done
}

npm_needs_install() {
  [[ ! -d "${PROJECT_ROOT}/node_modules" ]] && return 0
  [[ "${PROJECT_ROOT}/package.json" -nt "${PROJECT_ROOT}/node_modules/.package-lock.json" ]]
}

# ── 1. Dependency checks ──────────────────────────────────────────────────────
header "1. Checking dependencies"

command -v node &>/dev/null || die "node not found — install from https://nodejs.org"
ok "Node: $(node --version)"

command -v npm &>/dev/null || die "npm not found"
ok "npm: $(npm --version)"

command -v curl &>/dev/null || die "curl not found — required for health checks"
command -v lsof &>/dev/null || warn "lsof not found — port cleanup disabled"

if [[ ! -f "${PROJECT_ROOT}/.env" ]]; then
  if [[ -f "${PROJECT_ROOT}/.env.example" ]]; then
    cp "${PROJECT_ROOT}/.env.example" "${PROJECT_ROOT}/.env"
    warn ".env created from .env.example — fill in DATABASE_URL, GITHUB_TOKEN, GITHUB_USERNAMES"
  else
    die ".env not found and no .env.example to copy from"
  fi
else
  ok ".env present"
fi

if grep -qE 'placeholder|changeme|your_token_here|user:password' "${PROJECT_ROOT}/.env" 2>/dev/null; then
  warn ".env contains placeholder values — update DATABASE_URL / GITHUB_TOKEN before syncing"
fi

set -a; source "${PROJECT_ROOT}/.env"; set +a

# ── 2. Stop running services ──────────────────────────────────────────────────
# Stop by process name — we don't know which dynamic ports were assigned last time
header "2. Stopping services"
if pkill -f "node.*server/index.js" 2>/dev/null; then
  ok "Stopped API server"
else
  info "API server was not running"
fi
if pkill -f "[v]ite" 2>/dev/null; then
  ok "Stopped Vite"
else
  info "Vite was not running"
fi
sleep 0.3

[[ "${STOP_ONLY}" == true ]] && { echo; ok "All services stopped."; exit 0; }

# ── Ports — assigned once on first run, then hardcoded into this script ───────
BACKEND_PORT=""   # assigned on first run
FRONTEND_PORT=""  # assigned on first run

if [[ -z "${BACKEND_PORT}" ]]; then
  BACKEND_PORT="$(find_free_port 47800 47899)"
  FRONTEND_PORT="$(find_free_port 47600 47699)"
  sed -i "s/^BACKEND_PORT=\"\"/BACKEND_PORT=\"${BACKEND_PORT}\"/" "${BASH_SOURCE[0]}"
  sed -i "s/^FRONTEND_PORT=\"\"/FRONTEND_PORT=\"${FRONTEND_PORT}\"/" "${BASH_SOURCE[0]}"
  info "Ports assigned and saved (backend=${BACKEND_PORT} frontend=${FRONTEND_PORT})"
else
  info "Ports: backend=${BACKEND_PORT}  frontend=${FRONTEND_PORT}"
fi

export BACKEND_PORT FRONTEND_PORT PORT="${BACKEND_PORT}"
export BACKEND_URL="http://localhost:${BACKEND_PORT}"
export FRONTEND_URL="http://localhost:${FRONTEND_PORT}"

# ── 3. Install / build ────────────────────────────────────────────────────────
header "3. Installing dependencies"
mkdir -p "${LOG_DIR}"

if [[ "${FORCE_REBUILD}" == true ]] || npm_needs_install; then
  info "Running npm install..."
  npm install --prefix "${PROJECT_ROOT}" --silent
  ok "npm deps installed"
else
  ok "node_modules up to date — skipping install (use --rebuild to force)"
fi

if [[ "${PROD_MODE}" == true ]]; then
  header "3b. Building frontend (production)"
  info "Running vite build..."
  npm run build --prefix "${PROJECT_ROOT}" 2>&1 | tail -5
  ok "Frontend built to dist/"
fi

# ── 4. Start services ─────────────────────────────────────────────────────────
header "4. Starting services"

if [[ "${PROD_MODE}" == true ]]; then
  info "Starting API server in production mode (port ${BACKEND_PORT})..."
  NODE_ENV=production node "${PROJECT_ROOT}/server/index.js" \
    >"${LOG_DIR}/server.log" 2>&1 &
  SERVER_PID=$!
  wait_for_http "${BACKEND_URL}/api/health" "API server" "${LOG_DIR}/server.log"
  kill -0 "${SERVER_PID}" 2>/dev/null || die "API server exited immediately — check ${LOG_DIR}/server.log"
  ok "API server running (PID ${SERVER_PID}, port ${BACKEND_PORT}) — serving frontend at ${BACKEND_URL}"

  echo
  echo "┌─────────────────────────────────────────────────┐"
  echo "│  Helm is running (production)              │"
  echo "├─────────────────────────────────────────────────┤"
  printf "│  %-14s  %-30s │\n" "App + API" "${BACKEND_URL}"
  echo "├─────────────────────────────────────────────────┤"
  echo "│  Logs: ${LOG_DIR}/server.log                    │"
  echo "│  Stop: ./start.sh --stop                        │"
  echo "└─────────────────────────────────────────────────┘"
  echo
  exit 0
fi

# Dev mode: API server + Vite dev server
info "Starting API server (port ${BACKEND_PORT})..."
node --watch "${PROJECT_ROOT}/server/index.js" \
  >"${LOG_DIR}/server.log" 2>&1 &
SERVER_PID=$!
wait_for_http "${BACKEND_URL}/api/health" "API server" "${LOG_DIR}/server.log"
kill -0 "${SERVER_PID}" 2>/dev/null || die "API server exited immediately — check ${LOG_DIR}/server.log"
ok "API server running (PID ${SERVER_PID}, port ${BACKEND_PORT})"

info "Starting Vite dev server (port ${FRONTEND_PORT})..."
npm run dev:client --prefix "${PROJECT_ROOT}" \
  >"${LOG_DIR}/vite.log" 2>&1 &
VITE_PID=$!
wait_for_http "${FRONTEND_URL}/" "Vite dev server" "${LOG_DIR}/vite.log"
kill -0 "${VITE_PID}" 2>/dev/null || die "Vite exited immediately — check ${LOG_DIR}/vite.log"
ok "Vite dev server running (PID ${VITE_PID}, port ${FRONTEND_PORT})"

# ── Done ──────────────────────────────────────────────────────────────────────
echo
echo "┌─────────────────────────────────────────────────┐"
echo "│  Helm is running                           │"
echo "├─────────────────────────────────────────────────┤"
printf "│  %-14s  %-30s │\n" "Frontend" "${FRONTEND_URL}"
printf "│  %-14s  %-30s │\n" "API"      "${BACKEND_URL}"
echo "├─────────────────────────────────────────────────┤"
echo "│  Logs: ${LOG_DIR}/                              │"
echo "│  Stop: ./start.sh --stop                        │"
echo "└─────────────────────────────────────────────────┘"
echo
