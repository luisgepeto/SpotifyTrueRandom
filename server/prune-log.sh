#!/bin/bash
# Prune reconcile.log to keep only the last 7 days of entries.
# Runs daily via cron at 4:00 AM.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOGFILE="$SCRIPT_DIR/reconcile.log"

if [ ! -f "$LOGFILE" ]; then
  exit 0
fi

CUTOFF=$(date -d '7 days ago' +%Y-%m-%dT%H:%M:%S)

awk -v cutoff="$CUTOFF" '
  /Reconciliation START|Playlist cache START/ {
    match($0, /[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}/)
    if (RSTART > 0) {
      ts = substr($0, RSTART, RLENGTH)
      if (ts >= cutoff) keep = 1
      else keep = 0
    }
  }
  keep { print }
' "$LOGFILE" > "$LOGFILE.tmp" && mv "$LOGFILE.tmp" "$LOGFILE"
