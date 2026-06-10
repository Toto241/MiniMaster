#!/usr/bin/env bash
# MiniMaster Betriebszentrale – Start (Linux/macOS)
#
# Pendant zu start.bat. Startet den Python-Admin-Server (Port 8765) und
# oeffnet das Admin-Panel im Standard-Browser.
#
# Verwendung:
#   ./start.sh                  Standardstart (Pre-Flight + Panel)
#   ./start.sh --preflight      Nur Pre-Flight ausfuehren
#   ./start.sh --skip-preflight Pre-Flight ueberspringen
#   ./start.sh --acceptance     Vollstaendiger Acceptance-Run (siehe start.bat)
#   ./start.sh --quick-check    Quick-Check (Lint + Core-Suites)
#   ./start.sh --coverage       Full-Run mit Coverage
#
set -u

cd "$(dirname "$0")"

REPO_ROOT="$(pwd)"
PORT="${MINIMASTER_ADMIN_PORT:-8765}"
HOST="${MINIMASTER_ADMIN_HOST:-127.0.0.1}"

echo "MiniMaster Betriebszentrale - Start"
echo

# Python finden: venv -> python3 -> python
if [ -x "$REPO_ROOT/.venv/bin/python" ]; then
    PY="$REPO_ROOT/.venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
    PY="$(command -v python3)"
elif command -v python >/dev/null 2>&1; then
    PY="$(command -v python)"
else
    echo "[FEHLER] Python wurde nicht gefunden. Bitte Python 3.8+ installieren."
    exit 1
fi

if ! "$PY" -c "import sys; sys.exit(0 if sys.version_info >= (3,8) else 1)"; then
    echo "[FEHLER] Python 3.8 oder hoeher wird benoetigt."
    "$PY" --version
    exit 1
fi

MODE="${1:-}"

case "$MODE" in
  --preflight)
    "$PY" scripts/preflight.py
    exit $?
    ;;
  -h|--help)
    grep -E "^#" "$0" | sed -E 's/^# ?//'
    exit 0
    ;;
esac

# Pre-Flight (Warnungen erlaubt, Pflichtfehler werden angezeigt aber blockieren nicht)
if [ "$MODE" != "--skip-preflight" ]; then
    echo "--- Pre-Flight ---"
    "$PY" scripts/preflight.py || {
        rc=$?
        echo
        echo "[WARN] Pre-Flight meldet $rc Pflicht-Fehler. Start trotzdem fortsetzen?"
        printf "Fortfahren? [y/N] "
        read -r ans
        case "$ans" in
            y|Y|yes|j|J|ja) ;;
            *) echo "Abgebrochen."; exit 1 ;;
        esac
    }
    echo
fi

# Pruefen ob Port bereits belegt ist
if command -v ss >/dev/null 2>&1; then
    PORT_BUSY="$(ss -ltn 2>/dev/null | awk -v p=":$PORT" '$4 ~ p {print "yes"; exit}')"
elif command -v netstat >/dev/null 2>&1; then
    PORT_BUSY="$(netstat -ltn 2>/dev/null | awk -v p=":$PORT" '$4 ~ p {print "yes"; exit}')"
else
    PORT_BUSY=""
fi

if [ -n "$PORT_BUSY" ]; then
    echo "[INFO] Port $PORT ist bereits belegt – moeglicherweise laeuft der Server schon."
    echo "       Das Admin-Panel wird direkt geoeffnet."
else
    echo "Starte Python-Admin-Server auf http://$HOST:$PORT ..."
    # Server im Hintergrund starten, Log nach python_admin/logs/server.out
    mkdir -p python_admin/logs
    nohup "$PY" -m python_admin.app > python_admin/logs/server.out 2>&1 &
    SERVER_PID=$!
    echo "Server-PID: $SERVER_PID (Log: python_admin/logs/server.out)"

    # Auf Server-Bereitschaft warten (max. 20 Sekunden)
    READY=0
    for i in $(seq 1 20); do
        sleep 1
        if command -v curl >/dev/null 2>&1; then
            if curl -sf "http://$HOST:$PORT/api/runtime-info" >/dev/null 2>&1; then
                READY=1
                break
            fi
        else
            # Fallback: pruefen, ob Prozess noch laeuft
            if kill -0 "$SERVER_PID" 2>/dev/null; then
                READY=1
                break
            fi
        fi
    done

    if [ "$READY" -eq 0 ]; then
        echo "[WARNUNG] Server antwortet nach 20 Sekunden nicht."
        echo "          Pruefen Sie python_admin/logs/server.out auf Fehler."
    fi
fi

# Optionale Acceptance-Modi (vereinfacht – Detailauswertung siehe Admin-Panel)
trigger_run() {
    local mode_payload="$1"
    local tmp="$(mktemp)"
    curl -sf -X POST -H "Content-Type: application/json" \
        -d "$mode_payload" "http://$HOST:$PORT/api/acceptance/start" \
        -o "$tmp"
    if [ $? -ne 0 ]; then
        echo "[FEHLER] Acceptance-Start fehlgeschlagen."
        rm -f "$tmp"
        return 1
    fi
    local run_id
    run_id="$("$PY" -c "import json,sys;print(json.load(open(sys.argv[1])).get('runId',''))" "$tmp")"
    rm -f "$tmp"
    if [ -z "$run_id" ]; then
        echo "[FEHLER] Keine runId zurueckgeliefert."
        return 1
    fi
    echo "Run-ID: $run_id"
    while :; do
        sleep 5
        status_tmp="$(mktemp)"
        if curl -sf "http://$HOST:$PORT/api/acceptance/status/$run_id" -o "$status_tmp"; then
            status="$("$PY" -c "import json,sys;print(json.load(open(sys.argv[1])).get('status',''))" "$status_tmp")"
            rm -f "$status_tmp"
            [ "$status" = "running" ] || break
        else
            rm -f "$status_tmp"
            break
        fi
    done
    echo "[ABNAHME] Run abgeschlossen: $status"
    curl -sf "http://$HOST:$PORT/api/acceptance/report/$run_id" || true
}

case "$MODE" in
    --acceptance)  trigger_run '{"mode":"full"}' ; exit 0 ;;
    --quick-check) trigger_run '{"mode":"quick"}' ; exit 0 ;;
    --coverage)    trigger_run '{"mode":"full","coverage":true}' ; exit 0 ;;
esac

# Admin-Panel im Browser oeffnen
URL="http://$HOST:$PORT/admin-panel/"
echo "Oeffne Admin-Panel unter $URL ..."
if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
    open "$URL" >/dev/null 2>&1 &
else
    echo "[HINWEIS] Kein Browser-Opener gefunden. Bitte manuell oeffnen: $URL"
fi
