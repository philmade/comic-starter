#!/usr/bin/env bash
# Double-click this in Finder (or run it) to start the local dev server.
# Serves THIS folder AND handles POST /save, so the editor can write working.html.
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
PORT=8000
echo "────────────────────────────────────────────────"
echo " The Palomar Lights — dev server (port $PORT)"
echo "────────────────────────────────────────────────"
echo "  EDITOR:        http://localhost:$PORT/editor.html"
echo "  Print view:    http://localhost:$PORT/working.html"
echo "  Old web comic: http://localhost:$PORT/comic.html"
echo ""
echo "  Leave this window open while you work. Ctrl+C to stop."
echo "────────────────────────────────────────────────"
# Free the port if something's already on it, then serve (with POST /save support).
lsof -ti:$PORT 2>/dev/null | xargs kill -9 2>/dev/null
node "$DIR/server.js" "$DIR" "$PORT"
