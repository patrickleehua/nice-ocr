#!/usr/bin/env bash
set -euo pipefail

SKIP_INSTALL=0
SKIP_OCR=0

for arg in "$@"; do
  case "$arg" in
    --skip-install)
      SKIP_INSTALL=1
      ;;
    --skip-ocr)
      SKIP_OCR=1
      ;;
    *)
      echo "Unknown option: $arg" >&2
      echo "Usage: ./start-mac.command [--skip-install] [--skip-ocr]" >&2
      exit 2
      ;;
  esac
done

step() {
  printf '\n==> %s\n' "$1"
}

info() {
  printf '    %s\n' "$1"
}

require_cmd() {
  local name="$1"
  local hint="$2"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "Missing dependency: $name. $hint" >&2
    exit 1
  fi
}

find_python() {
  local candidate version major minor
  for candidate in python3 python; do
    if ! command -v "$candidate" >/dev/null 2>&1; then
      continue
    fi
    if ! version="$("$candidate" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null)"; then
      continue
    fi
    major="${version%%.*}"
    minor="${version#*.}"
    if [ "$major" = "3" ] && [ "$minor" -ge 10 ] && [ "$minor" -le 12 ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

open_terminal() {
  local title="$1"
  local command="$2"
  osascript >/dev/null <<EOF
tell application "Terminal"
  activate
  do script "printf '\\\\e]0;$title\\\\a'; $command"
end tell
EOF
}

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$ROOT_DIR/nice-ocr"
OCR_DIR="$APP_DIR/tools/ocr-layout"

if [ ! -f "$APP_DIR/package.json" ]; then
  echo "Cannot find nice-ocr/package.json. Please run this script from the repository root." >&2
  exit 1
fi

cd "$APP_DIR"

step "Checking required dependencies"
require_cmd node "Install Node.js 22 or newer from https://nodejs.org/ or Homebrew."
NODE_VERSION="$(node --version)"
NODE_MAJOR="${NODE_VERSION#v}"
NODE_MAJOR="${NODE_MAJOR%%.*}"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Node.js >= 22 is required. Current version: $NODE_VERSION" >&2
  exit 1
fi
info "Node $NODE_VERSION"

if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    info "pnpm not found; enabling Corepack."
    corepack enable
    corepack prepare pnpm@latest --activate
  else
    echo "Missing dependency: pnpm. Install it with: npm install -g pnpm" >&2
    exit 1
  fi
fi
info "pnpm $(pnpm --version)"

if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    info "Created nice-ocr/.env from .env.example."
  else
    info "No .env.example found; using built-in defaults."
  fi
fi

step "Preparing Node dependencies and database client"
if [ "$SKIP_INSTALL" -eq 0 ]; then
  pnpm install
else
  info "Skipped pnpm install."
fi
pnpm db:generate
pnpm db:push

OCR_ENABLED=0
if [ "$SKIP_OCR" -eq 0 ] && [ -f "$OCR_DIR/server.py" ]; then
  step "Checking optional OCR layout service"
  if PYTHON_CMD="$(find_python)"; then
    VENV_DIR="$OCR_DIR/.venv"
    if [ ! -d "$VENV_DIR" ]; then
      info "Creating OCR Python virtual environment."
      "$PYTHON_CMD" -m venv "$VENV_DIR"
    fi
    "$VENV_DIR/bin/python" -m pip install --upgrade pip
    "$VENV_DIR/bin/python" -m pip install -r "$OCR_DIR/requirements.txt"
    OCR_ENABLED=1
  else
    echo "    Python 3.10-3.12 was not found. OCR layout service will be skipped." >&2
    echo "    Install Python 3.10-3.12 if you want precise row positioning." >&2
  fi
fi

step "Starting services"
OCR_LAYOUT_URL_VALUE=""
if [ "$OCR_ENABLED" -eq 1 ]; then
  OCR_LAYOUT_URL_VALUE="http://127.0.0.1:8077"
  open_terminal "nice-ocr layout service" "cd '$OCR_DIR'; OCR_LAYOUT_URL='$OCR_LAYOUT_URL_VALUE' ./.venv/bin/python server.py"
  info "OCR layout service: $OCR_LAYOUT_URL_VALUE"
fi

open_terminal "nice-ocr worker" "cd '$APP_DIR'; OCR_LAYOUT_URL='$OCR_LAYOUT_URL_VALUE' pnpm worker"
open_terminal "nice-ocr web" "cd '$APP_DIR'; pnpm dev"

printf '\n%s\n' "nice-ocr is starting. Open http://localhost:3000"
printf '%s\n' "Started Terminal windows: web, worker$(if [ "$OCR_ENABLED" -eq 1 ]; then printf ', OCR layout service'; fi)"
printf '\n%s\n' "Useful switches:"
printf '%s\n' "  ./start-mac.command --skip-install    Skip pnpm install"
printf '%s\n' "  ./start-mac.command --skip-ocr        Do not prepare/start PaddleOCR layout service"
