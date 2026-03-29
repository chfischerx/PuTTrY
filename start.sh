#!/bin/bash

# PuTTrY Server Start Script
# Builds and starts server (frontend built separately via 'npm run build')
# Usage: ./start.sh [--detach] [--help]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DETACH=false

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_help() {
  cat <<EOF
PuTTrY Server Start Script

Builds server and CLI, then starts the server.
(Frontend built separately via 'npm run build')

Usage: ./start.sh [OPTIONS]

Options:
  --detach      Run server in the background (daemon mode)
  --help        Show this help message

Examples:
  # First-time setup (build frontend, then start server)
  npm run build && ./start.sh

  # Start server in foreground (rebuilds server/CLI only)
  ./start.sh

  # Start as daemon
  ./start.sh --detach

Environment:
  The script loads environment variables from:
    1. .env.local (if present, for development)
    2. ~/.puttry/.env (for production settings)
    3. Process environment

  Set these environment variables to customize:
    PORT              Server port (default: 5174)
    HOST              Server host (default: 0.0.0.0)
    AUTH_DISABLED     Disable authentication (default: 0)
    NODE_ENV          Set to 'production' for optimized performance
    LOG_LEVEL         Set log level (default: info)

EOF
}

log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --detach)
      DETACH=true
      shift
      ;;
    --help)
      print_help
      exit 0
      ;;
    *)
      log_error "Unknown option: $1"
      print_help
      exit 1
      ;;
  esac
done

# Check if we're in the right directory
if [ ! -f "$SCRIPT_DIR/package.json" ]; then
  log_error "package.json not found. Are you in the PuTTrY root directory?"
  exit 1
fi

# Build server and CLI (frontend is built separately via 'npm run build')
log_info "Building server and CLI..."
cd "$SCRIPT_DIR"
npm run build:server && npm run build:cli
log_info "Build complete"

# Verify server and frontend exist
if [ ! -f "$SCRIPT_DIR/dist-server/server.js" ]; then
  log_error "Server not found at dist-server/server.js. Run 'npm run build:all' first."
  exit 1
fi

if [ ! -f "$SCRIPT_DIR/dist/index.html" ]; then
  log_error "Frontend not found at dist/index.html. Run 'npm run build' first."
  exit 1
fi

# Set production environment if not already set
if [ -z "$NODE_ENV" ]; then
  export NODE_ENV=production
fi

log_info "Starting PuTTrY server..."
log_info "NODE_ENV=$NODE_ENV"

if [ -f "$SCRIPT_DIR/.env.local" ]; then
  log_info "Loading .env.local"
fi

if [ -f "$HOME/.puttry/.env" ]; then
  log_info "Loading ~/.puttry/.env"
fi

SERVER_PATH="$SCRIPT_DIR/dist-server/server.js"

if [ "$DETACH" = true ]; then
  # Start in background with nohup
  log_info "Starting server in background..."
  nohup node --enable-source-maps "$SERVER_PATH" > "$SCRIPT_DIR/server.log" 2>&1 &
  PID=$!
  log_info "Server started with PID $PID"
  log_info "Logs written to: $SCRIPT_DIR/server.log"
  echo $PID
else
  # Start in foreground
  node --enable-source-maps "$SERVER_PATH"
fi
