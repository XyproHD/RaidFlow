# RaidFlow Discord-Bot

Slash-Commands: `/raidflow setup`, `/raidflow group <groupname>`  
Rechte: Nur Server-Owner oder Nutzer mit **Administrator** bzw. **Server verwalten** (MANAGE_GUILD). Siehe [DiscordBot.md](../DiscordBot.md) Abschnitt 0.

**Bot-Berechtigungen:** Die Einladungs-URL fordert die nötigen Rechte an (Manage Roles, View Channel, Send Messages, Threads erstellen/verwalten usw.). Details siehe [DiscordBot.md](../DiscordBot.md) Abschnitt „Bot-Berechtigungen (Einladungs-URL)“.

**Antworten:** Alle Antworten auf Slash-Commands sind **ephemeral** (nur für den ausführenden Nutzer sichtbar, „Whisper“). Während der Ausführung werden Zwischenstände angezeigt (z. B. „Rollen werden erstellt…“, „Webapp wird benachrichtigt…“). Siehe [DiscordBot.md](../DiscordBot.md) Abschnitt „Antworten bei Slash-Command-Interaktionen (ephemeral)“.

**Deployment:** Es gibt **zwei Bots** – einen für **Production** (Branch `main`), einen für **Preview** (Branch `preview`). Beide werden auf **Railway** betrieben (zwei Services, Root Directory `discord-bot`). Pro Service eigene Env-Variablen (Token, WEBAPP_URL, BOT_SETUP_SECRET). Beim Start wird automatisch `deploy-commands.js` ausgeführt (Slash-Commands bei Discord registriert), danach startet der Bot. Siehe [DEPLOYMENT.md](../DEPLOYMENT.md) und [manual_setup.md](../manual_setup.md).

## Einrichtung (lokal / manuell)

1. **Discord Developer Portal:** Application anlegen, Bot erstellen, Token kopieren (für Production und Preview je eine Application).
2. **Umgebung:** Im Projektroot `.env.local` (oder hier `discord-bot/.env`) mit mindestens:
   - `DISCORD_BOT_TOKEN` – Bot Token
   - `DISCORD_BOT_CLIENT_ID` oder `DISCORD_CLIENT_ID` – Application ID
   - `BOT_SETUP_SECRET` – gemeinsames Secret mit der Webapp (für API-Aufrufe)
   - `WEBAPP_URL` – Basis-URL der Webapp (lokal: `http://localhost:3000`; Production: `https://raidflow.vercel.app/`; Preview: siehe [manual_setup.md](../manual_setup.md))

3. **Commands registrieren (einmalig bzw. nach Änderung):**
   ```bash
   cd discord-bot && npm install && node deploy-commands.js
   ```
   Es erscheint **/raidflow setup** und **/raidflow group** (mit Unterbefehl). Optional: `GUILD_ID` setzen (Test-Guild), dann erscheinen die Commands sofort; ohne `GUILD_ID` globale Registrierung (kann verzögert sein). Falls noch alte Namen wie `/raidflow_setup` angezeigt werden: deploy erneut ausführen, dann in Discord **/raidflow** eingeben – die Unterbefehle erscheinen dort.

4. **Bot starten:**
   ```bash
   cd discord-bot && npm start
   ```
   Die Webapp muss laufen und unter `WEBAPP_URL` erreichbar sein (für `/raidflow setup` und `group`).

## Ablauf

- **`/raidflow setup`:** Prüft Rechte → erstellt drei Rollen (RaidFlow-Gildenmeister, RaidFlow-Raidleader, RaidFlow-Raider) → ruft Webapp `POST /api/bot/guild` auf.
- **`/raidflow group <Name>`:** Prüft Rechte → erstellt Rolle `Raidflowgroup-<Name>` → ruft Webapp `POST /api/bot/raid-group` auf.
