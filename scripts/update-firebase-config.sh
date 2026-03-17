#!/bin/bash
set -euo pipefail

# MiniMaster – Firebase-Konfiguration in alle Web-Panels schreiben
# Bekannte Werte aus .firebaserc werden vorbelegt.
# Die 3 fehlenden Werte (API Key, Messaging Sender ID, App ID) stammen
# aus der Firebase Console → Projekteinstellungen → Ihre Apps → Web-App.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Bekannte Standardwerte (abgeleitet von Project ID) ─────────────────
DEFAULT_PROJECT_ID="minimaster-app"
DEFAULT_AUTH_DOMAIN="${DEFAULT_PROJECT_ID}.firebaseapp.com"
DEFAULT_STORAGE_BUCKET="${DEFAULT_PROJECT_ID}.firebasestorage.app"

echo "========================================="
echo " MiniMaster – Firebase Config Update"
echo "========================================="
echo ""
echo "Projekt-ID:     $DEFAULT_PROJECT_ID"
echo "Auth Domain:    $DEFAULT_AUTH_DOMAIN"
echo "Storage Bucket: $DEFAULT_STORAGE_BUCKET"
echo ""
echo "Die folgenden 3 Werte findest du in der Firebase Console:"
echo "  Projekteinstellungen (⚙️) → Allgemein → Ihre Apps → Web-App"
echo ""

# ── Fehlende Werte interaktiv abfragen ─────────────────────────────────
read -rp "API Key (AIzaSy...): " apiKey
if [ -z "$apiKey" ]; then
    echo "❌ API Key darf nicht leer sein."
    exit 1
fi

read -rp "Messaging Sender ID (z.B. 123456789012): " messagingSenderId
if [ -z "$messagingSenderId" ]; then
    echo "❌ Messaging Sender ID darf nicht leer sein."
    exit 1
fi

read -rp "App ID (z.B. 1:123456789012:web:abc123): " appId
if [ -z "$appId" ]; then
    echo "❌ App ID darf nicht leer sein."
    exit 1
fi

# Optionale Overrides für abgeleitete Werte
read -rp "Project ID [$DEFAULT_PROJECT_ID]: " projectId
projectId="${projectId:-$DEFAULT_PROJECT_ID}"

read -rp "Auth Domain [${projectId}.firebaseapp.com]: " authDomain
authDomain="${authDomain:-${projectId}.firebaseapp.com}"

read -rp "Storage Bucket [${projectId}.firebasestorage.app]: " storageBucket
storageBucket="${storageBucket:-${projectId}.firebasestorage.app}"

echo ""
echo "─── Zusammenfassung ───"
echo "  API Key:              $apiKey"
echo "  Auth Domain:          $authDomain"
echo "  Project ID:           $projectId"
echo "  Storage Bucket:       $storageBucket"
echo "  Messaging Sender ID:  $messagingSenderId"
echo "  App ID:               $appId"
echo ""
read -rp "Übernehmen? [J/n] " confirm
if [[ "${confirm,,}" == "n" ]]; then
    echo "Abgebrochen."
    exit 0
fi

# ── Config-Blöcke erzeugen ─────────────────────────────────────────────
# fallbackFirebaseConfig – wird in admin-panel/app.js und web-control/app.js verwendet
fallback_config="const fallbackFirebaseConfig = {\\
    apiKey: \"$apiKey\",\\
    authDomain: \"$authDomain\",\\
    projectId: \"$projectId\",\\
    storageBucket: \"$storageBucket\",\\
    messagingSenderId: \"$messagingSenderId\",\\
    appId: \"$appId\"\\
};"

# firebaseConfig – wird in web-control/firebase-config.template.js verwendet
template_config="const firebaseConfig = {\\
    apiKey: \"$apiKey\",\\
    authDomain: \"$authDomain\",\\
    projectId: \"$projectId\",\\
    storageBucket: \"$storageBucket\",\\
    messagingSenderId: \"$messagingSenderId\",\\
    appId: \"$appId\"\\
};"

# ── Dateien aktualisieren ──────────────────────────────────────────────
echo ""

# 1. admin-panel/app.js (fallbackFirebaseConfig)
TARGET="$REPO_ROOT/admin-panel/app.js"
if [ -f "$TARGET" ]; then
    sed -i '/const fallbackFirebaseConfig = {/,/};/c\'"$fallback_config" "$TARGET"
    echo "✅ admin-panel/app.js aktualisiert"
else
    echo "⚠️  admin-panel/app.js nicht gefunden – übersprungen"
fi

# 2. web-control/app.js (fallbackFirebaseConfig)
TARGET="$REPO_ROOT/web-control/app.js"
if [ -f "$TARGET" ]; then
    sed -i '/const fallbackFirebaseConfig = {/,/};/c\'"$fallback_config" "$TARGET"
    echo "✅ web-control/app.js aktualisiert"
else
    echo "⚠️  web-control/app.js nicht gefunden – übersprungen"
fi

# 3. web-control/firebase-config.template.js (firebaseConfig)
TARGET="$REPO_ROOT/web-control/firebase-config.template.js"
if [ -f "$TARGET" ]; then
    sed -i '/const firebaseConfig = {/,/};/c\'"$template_config" "$TARGET"
    echo "✅ web-control/firebase-config.template.js aktualisiert"
else
    echo "⚠️  web-control/firebase-config.template.js nicht gefunden – übersprungen"
fi

echo ""
echo "========================================="
echo "🎉 Firebase-Konfiguration aktualisiert!"
echo "========================================="
echo ""
echo "Nächste Schritte:"
echo "  1. Prüfe die Änderungen:  git diff admin-panel/app.js web-control/app.js"
echo "  2. Hosting deployen:      firebase deploy --only hosting --project $projectId"
echo "  3. Im Operator Dashboard: Werte erscheinen als Fallback-Konfiguration"
echo ""
echo "Tipp: Die Werte können auch im Operator Dashboard unter"
echo "      'Einrichtung → Firebase verbinden' eingegeben werden."
