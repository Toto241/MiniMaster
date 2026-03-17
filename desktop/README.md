# MiniMaster Desktop Launcher

Native Desktop-Oberfläche (Electron) für die MiniMaster-Panels – getrennt nach Eltern und Operator.

## Start

Vom Repository-Root:

```bash
# Eltern-Panel (Standard – kein CLI-Zugriff)
npm run desktop-start

# Operator Dashboard (mit CLI-Ausführung)
npm run desktop-operator
```

Alternativ direkt:

```bash
npx electron desktop/main.js              # Eltern
npx electron desktop/main.js --operator   # Operator
```

## Architektur

| Modus | Fenster | Preload | CLI-Zugriff |
|-------|---------|---------|-------------|
| Standard | `launcher.html` → Eltern Control Panel | `preload.js` | Nein |
| `--operator` | `admin-panel/index.html` direkt | `operator-preload.js` | Ja (Whitelist) |

### Sicherheitskonzept

- Das **Eltern-Panel** läuft in einer Standard-Sandbox ohne Shell-Zugriff.
- Das **Operator Dashboard** erhält über `operator-preload.js` eine IPC-Bridge zum Main-Prozess, die CLI-Befehle ausführen kann.
- `contextIsolation: true` und `nodeIntegration: false` bleiben in **beiden** Modi aktiv.
- Nur explizit erlaubte Befehle werden akzeptiert: `firebase`, `npm`, `npx`, `node`, `adb`.
- Jede Ausführung erfordert einen Bestätigungsdialog im UI.
- Argumente werden gegen Shell-Metazeichen sanitized.

## Enthaltene Oberflächen

- **Eltern-Panel**: `web-control/index.html` (über `launcher.html`)
- **Operator Dashboard**: `admin-panel/index.html` (direkt, nur im Operator-Modus)
- **Audit Logs**: `admin-panel/logs.html`

## Hinweis

Die Panels benötigen eine konfigurierte Firebase-Verbindung. Im Operator-Modus kann die Befehlszentrale im Setup-Tab Befehle direkt ausführen statt sie nur zu kopieren.
