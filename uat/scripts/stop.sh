#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PID_FILE="$REPO_ROOT/uat/.server.pid"

if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE")"
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID" && echo "Stopped (pid $PID)"
  else
    echo "Process $PID not running (stale pid file)"
  fi
  rm -f "$PID_FILE"
else
  # Fallback: kill anything on 3927
  if lsof -ti:3927 &>/dev/null; then
    kill "$(lsof -ti:3927)" && echo "Stopped process on :3927"
  else
    echo "Nothing running on :3927"
  fi
fi

rm -rf ~/.mcp-auth
echo "OAuth cache cleared"
