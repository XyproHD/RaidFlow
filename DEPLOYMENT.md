# RaidFlow – Deployment-Pipeline (Stages)

RaidFlow nutzt **zwei Stages**: **Production** (Branch `main`) und **Preview** (Branch `preview`). Die Webapp läuft auf **Vercel**, die zwei Discord-Bots auf **Railway**. Alle Referenz-Dokumente liegen im **Projekt-Root**.

---

## Branches und URLs

| Stage      | Branch   | Webapp (Vercel)                                                                 | Bot (Railway)        |
|------------|----------|----------------------------------------------------------------------------------|------------------------|
| **Production** | `main`   | https://raidflow.vercel.app/                                                     | Eigener Service, Env = Production |
| **Preview**    | `preview`| https://raidflow-git-preview-myhess-3468s-projects.vercel.app/                  | Eigener Service, Env = Preview    |

**Ablauf:** Zuerst wird auf **Preview** deployed und getestet; danach Merge/Push nach **main** für Production.

---

## Projektstruktur (Monorepo)

```
RaidFlow/
├── app/                 # Next.js Webapp (App Router)
├── components/
├── lib/
├── prisma/
├── discord-bot/         # Discord-Bot (eigenes package.json)
│   ├── index.js
│   ├── deploy-commands.js
│   └── package.json
├── .env.example
├── manual_setup.md      # Detaillierte Einrichtung Vercel + Railway
├── DEPLOYMENT.md        # Diese Datei
├── Roadmap.md
├── progress_tracker.md
└── ...
```

- **Vercel** baut die **Webapp** (Projekt-Root); ignoriert `discord-bot/` für den Webapp-Build.
- **Railway** baut den **Bot** aus dem Ordner `discord-bot/` (Root Directory = `discord-bot`). Zwei Services: einer für `main`, einer für `preview`.

---

## Automatische Pipeline

| Aktion | Vercel | Railway |
|--------|--------|---------|
| **Push nach `preview`** | Neues Preview-Deploy der Webapp (Preview-URL) | Preview-Bot-Service deployt (falls auf `preview` konfiguriert) |
| **Push nach `main`**   | Neues Production-Deploy der Webapp (raidflow.vercel.app) | Production-Bot-Service deployt (falls auf `main` konfiguriert) |

Konfiguration von Branch → Service erfolgt in Vercel (Production/Preview) und in Railway (Deploy-Branch pro Service). Kein Code-Unterschied zwischen den Stages – nur **Environment Variables** pro Stage (siehe [manual_setup.md](manual_setup.md)).

**Datenbank-Schema:** Beim Webapp-Build führt Vercel `prisma migrate deploy` aus. Dadurch werden ausstehende Migrationen automatisch auf die **jeweils zugehörige** Supabase-DB angewendet (Preview-Deploy → Preview-DB, Production-Deploy → Production-DB). Schema-Änderungen: Migration lokal mit `prisma migrate dev` erzeugen (gegen Preview-DB), Migration-Dateien committen, auf Preview pushen; beim Merge nach `main` laufen dieselben Migrationen bei Production gegen die Production-DB. Details: [manual_setup.md](manual_setup.md) Abschnitt 1.5.

**Hinweis `npm run build`:** Das Script führt `prisma migrate deploy` aus und fällt bei Fehler auf **`Skipping migrate deploy`** zurück (`|| echo …`), damit der **Next.js-Build** trotzdem läuft. Fehlende Spalten führen dann erst **zur Laufzeit** zu Prisma-Fehlern — die Datenbank muss dennoch zum Schema passen.

### Prisma `P3009` (fehlgeschlagene Migration in der DB)

Wenn `prisma migrate deploy` mit **P3009** abbricht („migrate found failed migrations …“), werden **keine neuen** Migrationen mehr angewendet, bis der Zustand bereinigt ist:

1. In der DB-Tabelle `_prisma_migrations` den fehlgeschlagenen Eintrag prüfen (Migration-Name, Zeitstempel).
2. Entweder die Migration **manuell reparieren** (fehlendes SQL nachziehen) und anschließend `prisma migrate resolve --applied <name>` bzw. je nach Fall `--rolled-back`, **oder** in Absprache die Migration als erledigt markieren, wenn die Änderungen bereits anderweitig in der DB sind.
3. Danach `prisma migrate deploy` erneut ausführen (lokal oder durch erneutes Deploy).

Ohne diese Bereinigung bleiben z. B. neue Spalten wie **`rf_raid.dungeon_ids`** unangewendet, obwohl der App-Build grün ist.

### Preview-DB und MCP (Supabase)

Für die **Preview-Datenbank** kann eine fehlende DDL-Änderung alternativ direkt per Supabase-MCP mit **`apply_migration`** nachgezogen werden (gleiches SQL wie in `prisma/migrations/…/migration.sql`). Danach sollte `list_migrations` den Eintrag zeigen und `information_schema` die Spalte enthalten.

---

## Vercel verbinden

1. **Projekt bei Vercel anlegen:** [vercel.com/new](https://vercel.com/new) → Repository (GitHub/GitLab/Bitbucket) auswählen, **RaidFlow**-Repo verbinden.
2. **Root Directory** leer lassen (Webapp liegt im Repo-Root).
3. **Build-Einstellungen** werden aus `vercel.json` gelesen (`framework: nextjs`, `buildCommand`, `installCommand`). Nicht im Dashboard überschreiben.
4. **Environment Variables** für **Production** und **Preview** getrennt setzen: Vercel Dashboard → Projekt → **Settings** → **Environment Variables**. Für Preview alle Variablen aus `.env.example` eintragen und **Preview** (und ggf. Production) auswählen. Wichtig für den Build:
   - **DATABASE_URL** und **DIRECT_URL** (Supabase): Ohne sie schlägt `prisma migrate deploy` fehl, der Build läuft trotzdem weiter (`Skipping migrate deploy`). Für laufende App und Migrationen müssen beide gesetzt sein.
   - **NEXTAUTH_URL**: Für Preview z. B. `https://<dein-preview-subdomain>.vercel.app`, für Production `https://raidflow.vercel.app`.
   - **NEXTAUTH_SECRET**, **DISCORD_*** etc. wie in `.env.example` dokumentiert.
   - **Battle.net:** Zugangsdaten für die Blizzard-API werden **nicht** als Vercel-Env für die Webapp benötigt, sofern **`rf_battlenet_api_config`** in der jeweiligen Datenbank (Preview/Production) gepflegt ist. Siehe [BNET_INTEGRATION.md](BNET_INTEGRATION.md).
5. **Preview-Branch:** Unter **Settings** → **Git** den Branch für Preview Deployments auf `preview` setzen (oder den gewünschten Branch).

---

## Preview-Build: Fehlerbehebung

**Häufige Ursachen für fehlgeschlagene Preview-Builds:**

| Ursache | Lösung |
|--------|--------|
| **Type/Prisma-Fehler** (z. B. unbekannte Felder in `where`) | Lokal `npm run build` ausführen; Fehler beheben (z. B. Relation nutzen statt nicht existierendes Feld). |
| **Fehlende Env-Variablen** | In Vercel → Settings → Environment Variables für **Preview** prüfen: mindestens `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`. |
| **`prisma migrate deploy` schlägt fehl** | Zuerst **P3009** / fehlgeschlagene Migrationen prüfen (Abschnitt oben). Sonst: Env `DATABASE_URL`/`DIRECT_URL` für Preview. Der Build kann dank Fallback trotzdem grün sein — Laufzeitfehler bis Schema passt. |

Beispiel für einen behobenen Build-Fehler (historisch): In `allowed-characters` wurde `raidGroupId` falsch in `rfGuildMember.where` verwendet; korrekt ist die Relation `memberRaidGroups: { some: { raidGroupId } }`.

---

## Referenz

- **Manuelle Einrichtung** (Vercel Env-Variablen, Railway, Discord, Supabase): [manual_setup.md](manual_setup.md)
- **Battle.net (DB-Konfiguration, keine Pflicht-Env-Variablen):** [BNET_INTEGRATION.md](BNET_INTEGRATION.md)
- **Lokal starten:** [README.md](README.md) (Webapp: `npm run dev`; Bot: `npm run bot` bzw. `npm run dev:all`)
