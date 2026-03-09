# RaidFlow – Manuelle Einrichtung (Production + Preview)

Diese Anleitung beschreibt, wie du RaidFlow mit **zwei Stages** betreibst: **Production** (Branch `main`) und **Preview** (Branch `preview`). Die **Webapp** läuft auf **Vercel**, die **zwei Discord-Bots** auf **Railway**. Pro Stage: eigene Discord-Application, eigenes Supabase-Projekt, eigene Env-Variablen.

**Pipeline:** Zuerst auf Preview deployen und testen, danach nach `main` pushen für Production. Siehe [DEPLOYMENT.md](DEPLOYMENT.md) für die Struktur und URLs.

---

## Übersicht

| Komponente        | Production (Branch `main`)   | Preview (Branch `preview`)       |
|-------------------|------------------------------|----------------------------------|
| **Webapp**        | Vercel (Production)          | Vercel (Preview)                 |
| **Webapp-URL**    | https://raidflow.vercel.app/ | https://raidflow-git-preview-myhess-3468s-projects.vercel.app/ |
| **Discord Login** | Eigene Discord-OAuth-App     | Eigene Discord-OAuth-App        |
| **Discord-Bot**   | Railway (1 Service)          | Railway (1 Service)              |
| **Datenbank**     | Eigenes Supabase-Projekt     | Eigenes Supabase-Projekt        |

Die **Webapp** läuft nur auf Vercel. Der **Discord-Bot** (Ordner `discord-bot/`) läuft auf **Railway** – zwei Services: einer deployt von `main` (Production-Bot), einer von `preview` (Preview-Bot). Jeder Service hat seine eigenen Environment Variables (Token, WEBAPP_URL, BOT_SETUP_SECRET).

---

## 1. Vorbereitung: Was du brauchst

### 1.1 Discord (zwei „Umgebungen“)

- **Production:**  
  - 1 Discord Application (Developer Portal) → Client ID, Client Secret, Bot Token.  
  - Diese Application = OAuth-Login der Webapp **und** der Production-Bot.
- **Preview:**  
  - 1 weitere Discord Application → eigene Client ID, Client Secret, Bot Token.  
  - OAuth-Login der Preview-Webapp **und** Preview-Bot.

Merke dir pro Umgebung:  
`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`.  
Oft ist die Bot-Application-ID = Client ID derselben Application (`DISCORD_BOT_CLIENT_ID` = `DISCORD_CLIENT_ID`).

### 1.2 Supabase (mindestens zwei Datenbanken)

- **Production:** 1 Supabase-Projekt → Connection String (Pooler) und Direct URL.
- **Preview:** 1 weiteres Supabase-Projekt → eigene Connection Strings.

Aus dem Supabase-Dashboard (Project Settings → Database):

- **Connection pooling (Transaction Mode, Port 6543):** für `DATABASE_URL` (mit `?pgbouncer=true` o. ä.).
- **Direct connection (Session Mode, Port 5432):** für `DIRECT_URL`.

### 1.3 Secrets (pro Umgebung neu erzeugen)

- **NEXTAUTH_SECRET:** z. B. `openssl rand -base64 32` (einmal für Production, einmal für Preview).
- **BOT_SETUP_SECRET:** gemeinsames Geheimnis zwischen **Webapp** und **Bot** derselben Stage (z. B. ein langer Zufallsstring). Production und Preview haben jeweils ein **eigenes** Secret.

### 1.4 URLs

- **Production-Webapp:** `https://raidflow.vercel.app/`
- **Preview-Webapp:** `https://raidflow-git-preview-myhess-3468s-projects.vercel.app/`

---

## 2. Vercel: Environment Variables anlegen

In Vercel: **Projekt öffnen → Settings → Environment Variables.**

Für jede Variable kannst du angeben, für welche **Umgebung** sie gilt: **Production**, **Preview**, **Development**. Trage die Werte getrennt für Production und Preview ein (gleicher Name, unterschiedliche Werte je Environment).

### 2.1 Welche Variablen in Vercel?

Die **Webapp** (Next.js) nutzt die gleichen Keys wie in deiner lokalen `.env.local`. In Vercel musst du **alle** eintragen, die die Webapp braucht – mit den **Werten der jeweiligen Stage** (Production oder Preview).

| Variable | Beschreibung | Production (Beispiel) | Preview (Beispiel) |
|----------|--------------|------------------------|---------------------|
| **NEXTAUTH_URL** | Öffentliche URL der Webapp | `https://raidflow.vercel.app/` | `https://raidflow-git-preview-myhess-3468s-projects.vercel.app/` |
| **NEXTAUTH_SECRET** | Geheimer Schlüssel für Sessions (pro Stage neu) | `<eigenes Secret, z. B. openssl rand -base64 32>` | `<anderes Secret>` |
| **DISCORD_CLIENT_ID** | Discord Application Client ID (OAuth) | Client ID der **Production**-Application | Client ID der **Preview**-Application |
| **DISCORD_CLIENT_SECRET** | Discord Application Client Secret | Secret der **Production**-Application | Secret der **Preview**-Application |
| **DISCORD_BOT_TOKEN** | Bot Token (Webapp ruft damit Discord-API z. B. für Rollen ab) | Bot Token des **Production**-Bots | Bot Token des **Preview**-Bots |
| **DISCORD_BOT_CLIENT_ID** | Bot Application ID (für Einladungs-Link) | Oft gleich wie DISCORD_CLIENT_ID (Production) | Oft gleich wie DISCORD_CLIENT_ID (Preview) |
| **BOT_SETUP_SECRET** | Gemeinsames Secret Webapp ↔ Bot (API-Aufrufe vom Bot) | Gemeinsamer Wert mit **Production**-Bot | Gemeinsamer Wert mit **Preview**-Bot |
| **DATABASE_URL** | Supabase Connection String (Pooler, z. B. Port 6543) | Connection String **Production**-Supabase | Connection String **Preview**-Supabase |
| **DIRECT_URL** | Supabase Direct URL (z. B. Port 5432, für Migrationen) | Direct URL **Production**-Supabase | Direct URL **Preview**-Supabase |

**Optional** (wenn du sie lokal nutzt):

| Variable | Beschreibung |
|----------|--------------|
| **WEBAPP_OWNER_DISCORD_ID** | Discord User ID des App-Owners (Admin-Rechte) |

Hinweis: **WEBAPP_URL** braucht die Webapp auf Vercel **nicht** – die Variable nutzt der **Bot**, um die Webapp-API aufzurufen. Sie wird nur auf **Railway** pro Bot-Service gesetzt (Production-Bot: `https://raidflow.vercel.app/`, Preview-Bot: `https://raidflow-git-preview-myhess-3468s-projects.vercel.app/`).

### 2.2 Vorgehen in Vercel

1. **Settings → Environment Variables** öffnen.
2. Für **jede** Variable aus der Tabelle oben:
   - **Key** eintragen (exakt wie in der Tabelle).
   - **Value** eintragen (Production-Werte **nur** für Production, Preview-Werte **nur** für Preview).
   - **Environment** auswählen:  
     - Für Production-Deploys: **Production** anhaken.  
     - Für Preview-Deploys: **Preview** anhaken.  
     - Optional: **Development** für lokale Vercel-Cli.
3. Speichern. Nach dem nächsten Deploy (Production bzw. Preview) sind die jeweiligen Werte aktiv.

Damit gilt: Alle Einträge und Werte, die du lokal in `.env.local` für die Webapp nutzt, solltest du **pro Stage** in Vercel anlegen – mit den Werten der **Production-** bzw. **Preview-**Umgebung (Discord, Supabase, Secrets, URLs).

---

## 3. Bot auf Railway betreiben

Der Discord-Bot läuft **nicht** auf Vercel, sondern auf **Railway**. Die **Webapp** (Next.js) gehört **nur** nach Vercel – auf Railway dürfen **nur** die Bot-Services laufen.

**Wichtig:** Jeder Bot-Service auf Railway **muss** so konfiguriert sein:
- **Root Directory:** `discord-bot` (nicht das Projektroot). Sonst baut Railway die Next.js-App und führt `next start` aus – dann läuft die Webapp auf Railway und der Bot **nie** (Bot bleibt offline).
- **Start Command:** `npm start` (registriert beim Start die Slash-Commands bei Discord und startet danach den Bot). Alternativ nur Bot ohne Command-Registrierung: `npm run start:bot-only`.
- In den **Deploy-Logs** muss nach dem Start stehen: `RaidFlow Bot eingeloggt als …`. Steht dort `Next.js` oder `next start`, ist der falsche Ordner gewählt (Root auf `discord-bot` setzen).

Zwei **Services** im selben (oder in zwei) Railway-Projekt(en): einer für Production (deployt von Branch `main`), einer für Preview (deployt von Branch `preview`).

### 3.1 Zwei Bot-Services (Production + Preview)

- **Production-Bot (Railway-Service für `main`):**  
  - Env: `DISCORD_BOT_TOKEN` = Production-Bot-Token, `DISCORD_BOT_CLIENT_ID` = Production-Client-ID, `WEBAPP_URL` = `https://raidflow.vercel.app/`, `BOT_SETUP_SECRET` = dasselbe wie in Vercel **Production**. Falls Production unter Vercel Deployment Protection steht: **`VERCEL_AUTOMATION_BYPASS_SECRET`** = Bypass-Secret aus Vercel.  
  - Deploy-Branch in Railway: `main`.
- **Preview-Bot (Railway-Service für `preview`):**  
  - Env: `DISCORD_BOT_TOKEN` = Preview-Bot-Token, `DISCORD_BOT_CLIENT_ID` = Preview-Client-ID, `WEBAPP_URL` = `https://raidflow-git-preview-myhess-3468s-projects.vercel.app/`, `BOT_SETUP_SECRET` = dasselbe wie in Vercel **Preview**. Wenn die Preview-Webapp unter Vercel Deployment Protection läuft: zusätzlich **`VERCEL_AUTOMATION_BYPASS_SECRET`** = Bypass-Secret aus Vercel (Protection Bypass for Automation).  
  - Deploy-Branch in Railway: `preview`.

So spricht jeder Bot automatisch die richtige Webapp an. Kein Code-Unterschied – nur die Env-Variablen pro Service.

**Vercel Deployment Protection (401 beim Setup):** Wenn der Bot beim `/raidflow setup` bei „Webapp wird benachrichtigt…“ hängen bleibt und in den Railway-Logs **Webapp 401** oder „Authentication Required“ steht, blockiert **Vercel Deployment Protection** (Vercel Authentication) die Requests. Zwei Lösungen:

1. **Schutz für Preview ausschalten:** Vercel → Projekt → **Settings → Deployment Protection** → bei „Vercel Authentication“ Preview ausnehmen oder Protection für Preview-Deployments deaktivieren.
2. **Bypass für den Bot nutzen (empfohlen, wenn du Protection behalten willst):** Vercel → **Settings → Deployment Protection** → **Protection Bypass for Automation** → Bypass-Secret erzeugen. Den **gleichen Wert** auf **Railway** beim jeweiligen Bot-Service als Umgebungsvariable eintragen: **`VERCEL_AUTOMATION_BYPASS_SECRET`**. Der Bot sendet diesen Wert dann als Header und kann die Webapp-API aufrufen.

### 3.2 Automatisches Deployment

Railway deployt bei Push: Service, der auf `main` hört, baut den Production-Bot; Service, der auf `preview` hört, baut den Preview-Bot. **Wichtig:** Der Branch-Name muss exakt übereinstimmen (z. B. `Preview` vs. `preview` – Railway ist case-sensitiv). Nach Merge von `preview` nach `main` wird Production (Webapp + Production-Bot) automatisch aktualisiert.

### 3.3 Bot zeigt in Discord als „Offline“

- **Railway:** Prüfe, ob der Bot-Service für diese Stage überhaupt läuft (Deploy erfolgreich?). In den **Logs** des Services solltest du nach dem Start sehen: `RaidFlow Bot eingeloggt als <Name>#1234`. Fehlt das oder erscheint ein Fehler (z. B. „Login fehlgeschlagen“, „DISCORD_BOT_TOKEN fehlt“), dann:
  - **DISCORD_BOT_TOKEN** auf Railway gesetzt? Muss der **Bot-Token** der **gleichen** Discord-Application sein, mit der du den Bot eingeladen hast (Production-Bot → Production-Token, Preview-Bot → Preview-Token).
  - **Deploy-Branch:** Wenn dein Branch z. B. `Preview` (großes P) heißt, in Railway beim Preview-Bot-Service genau diesen Branch als Deploy-Branch einstellen, nicht `preview`.
- **Discord:** Bot einmal aus dem Server entfernen und über den Einladungs-Link der **richtigen** Stage erneut hinzufügen (Production-Link für Production, Preview-Link für Preview).

---

## 3.4 Discord-Login auf Vercel (Browser-Fehler / Redirect)

Wenn der Login mit Discord auf https://raidflow.vercel.app eine Fehlermeldung oder eine leere/fehlerhafte Seite auslöst:

1. **Discord Developer Portal** → deine Application → **OAuth2** → **Redirects:**  
   Genau diese URL eintragen (Production): `https://raidflow.vercel.app/api/auth/callback/discord`  
   Für Preview: `https://raidflow-git-preview-myhess-3468s-projects.vercel.app/api/auth/callback/discord`  
   Kein abschließender Schrägstrich, exakt so.
2. **Vercel** → Environment Variables: **NEXTAUTH_URL** für Production = `https://raidflow.vercel.app` (mit oder ohne `/` am Ende, einheitlich). Für Preview die jeweilige Preview-URL.
3. **NEXTAUTH_SECRET** in Vercel gesetzt (pro Environment).
4. Nach Änderung an Redirects oder Env: Deploy neu anstoßen bzw. Seite hart neu laden.

**„Application error: a server-side exception has occurred“ (z. B. auf Preview):** Meist fehlen oder sind falsch gesetzt: **DATABASE_URL** / **DIRECT_URL** (Supabase für diese Stage), **NEXTAUTH_SECRET**, **NEXTAUTH_URL**, **DISCORD_CLIENT_ID**, **DISCORD_CLIENT_SECRET** in Vercel für das jeweilige Environment (Production bzw. Preview). In den Vercel-Logs (Functions/Logs) steht die genaue Exception.

---

## 4. Kurz-Checkliste

- [ ] Zwei Discord Applications (Production + Preview) mit je Client ID, Client Secret, Bot Token.
- [ ] Zwei Supabase-Projekte (Production + Preview) mit je `DATABASE_URL` und `DIRECT_URL`.
- [ ] In **Vercel** für **Production** (Branch `main`) alle Webapp-Variablen mit Production-Werten; **NEXTAUTH_URL** = `https://raidflow.vercel.app/`.
- [ ] In **Vercel** für **Preview** (Branch `preview`) dieselben Variablen mit Preview-Werten; **NEXTAUTH_URL** = `https://raidflow-git-preview-myhess-3468s-projects.vercel.app/`.
- [ ] Auf **Railway**: zwei Services für den Bot (Root Directory `discord-bot`), einer für `main` (Production-Bot), einer für `preview` (Preview-Bot), mit je passendem `DISCORD_BOT_TOKEN`, `WEBAPP_URL`, `BOT_SETUP_SECRET`.
- [ ] Nach Änderungen an Env-Variablen: ggf. **Redeploy** in Vercel bzw. Railway.

Wenn du das so anlegst, werden in Production immer Production-Bot und Production-DB genutzt, in Preview immer Preview-Bot und Preview-DB – ohne Code-Unterschied zwischen den Stages. Pipeline: [DEPLOYMENT.md](DEPLOYMENT.md).
