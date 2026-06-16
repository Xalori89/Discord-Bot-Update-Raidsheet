# Raid Sync Bot – Setup Anleitung

## Was der Bot macht

- **Vollautomatisch:** Erkennt jeden Raidhelper-Post in allen Channels
- **Live-Sync:** Aktualisiert das Sheet bei jeder Anmeldung/Abmeldung
- **Kein API-Key nötig:** Liest direkt aus dem Discord-Embed
- **Discord-Post:** Postet nach jedem Sync den aktuellen Roster in #raidsheet

---

## Commands

| Command | Wer | Was |
|---|---|---|
| `/sync-raid message_id:XXX` | Raid-Leader | Synct ein bestimmtes Event manuell |
| `/scan-channel` | Raid-Leader | Zeigt alle Raidhelper-Events im Channel zur Auswahl |
| `/roster-status` | Alle | Zeigt den aktuellen Roster |

---

## Schritt 1: Discord Bot erstellen

1. https://discord.com/developers/applications → **New Application** → Name: `Raid Sync`
2. Links **Bot** → **Add Bot** → **Token** kopieren → das ist `DISCORD_TOKEN`
3. **Message Content Intent** aktivieren (wichtig!)
4. **Server Members Intent** aktivieren
5. Links **OAuth2 → URL Generator:**
   - Scopes: `bot`, `applications.commands`
   - Permissions: `Read Messages`, `Read Message History`, `Send Messages`, `Embed Links`
6. URL im Browser → Bot zum Server einladen

---

## Schritt 2: Google Service Account einrichten

1. https://console.cloud.google.com → Neues Projekt erstellen
2. **APIs & Services → Library → Google Sheets API** → aktivieren
3. **APIs & Services → Credentials → Create Credentials → Service Account**
4. Name: `raid-sync` → Erstellen
5. Service Account anklicken → **Keys → Add Key → JSON** → Datei herunterladen
6. JSON-Datei öffnen → Inhalt komplett kopieren

---

## Schritt 3: Google Sheet freigeben

1. Das Raid-Sheet in Google Sheets öffnen
2. Oben rechts **Freigeben**
3. Die E-Mail-Adresse des Service Accounts eintragen (steht in der JSON-Datei unter `client_email`)
4. Berechtigung: **Bearbeiter** → Freigeben

---

## Schritt 4: .env Datei befüllen

```bash
cp .env.example .env
```

Dann `.env` öffnen und ausfüllen:

```
DISCORD_TOKEN=     ← aus Schritt 1
CLIENT_ID=         ← Discord Developer Portal → Application ID
GUILD_ID=          1001841890854973511
RAIDSHEET_CHANNEL_ID=  ← Rechtsklick auf #raidsheet → ID kopieren
GOOGLE_SHEET_ID=   ← aus der Sheet-URL (der lange Teil zwischen /d/ und /edit)
GOOGLE_CREDENTIALS=    ← JSON-Inhalt aus Schritt 2 (alles in eine Zeile)
WEBHOOK_URL=       ← Webhook aus #raidsheet (bereits eingetragen)
```

**GOOGLE_CREDENTIALS als eine Zeile:** Den JSON-Inhalt komplett kopieren und als eine Zeile ohne Zeilenumbrüche einfügen.

---

## Schritt 5: Auf Render deployen

1. https://render.com → **New → Web Service** → GitHub Repo verbinden
2. Build Command: `npm install`
3. Start Command: `npm start`
4. Environment Variables: alle Werte aus `.env` dort eintragen
5. **Deploy**

---

## Schritt 6: Commands registrieren (einmalig)

Lokal ausführen:
```bash
npm install
node register-commands.js
```

---

## Schritt 7: Testen

1. Raidhelper-Post in Discord anschauen
2. `/scan-channel` im Channel eingeben
3. Event auswählen → Sheet wird befüllt → Post in #raidsheet erscheint

---

## Automatischer Sync

Ab sofort erkennt der Bot jeden neuen Raidhelper-Post automatisch und synct bei jeder Änderung. Du musst nichts mehr manuell machen.

---

## Google Sheet ID finden

URL des Sheets:
```
https://docs.google.com/spreadsheets/d/DIESE_ID_HIER/edit
```
Die Zeichenkette zwischen `/d/` und `/edit` ist die Sheet-ID.

---

## Raidhelper Bot ID

Die Standard Raidhelper Bot ID ist `579155972115660803` – bereits voreingestellt.
Falls ihr einen anderen Raidhelper-Bot nutzt: Entwicklermodus → Rechtsklick auf Raidhelper-Bot → ID kopieren → in `.env` als `RAIDHELPER_BOT_ID` eintragen.
