#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$REPO_ROOT/tests/.env"
PID_FILE="$REPO_ROOT/uat/.server.pid"
LOG_FILE="$REPO_ROOT/uat/.server.log"

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Server already running (pid $(cat "$PID_FILE")). Run stop.sh first."
  exit 1
fi

cd "$REPO_ROOT"
npm run build --silent

node --env-file="$ENV_FILE" build/index.js >"$LOG_FILE" 2>&1 &
echo $! >"$PID_FILE"

sleep 1
if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Started (pid $(cat "$PID_FILE")) — http://127.0.0.1:3927/tableau-mcp"
  echo "Logs: $LOG_FILE"
else
  echo "Server failed to start. Check $LOG_FILE"
  rm -f "$PID_FILE"
  exit 1
fi
