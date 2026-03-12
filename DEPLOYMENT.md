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

---

## Vercel verbinden

1. **Projekt bei Vercel anlegen:** [vercel.com/new](https://vercel.com/new) → Repository (GitHub/GitLab/Bitbucket) auswählen, **RaidFlow**-Repo verbinden.
2. **Root Directory** leer lassen (Webapp liegt im Repo-Root).
3. **Build-Einstellungen** werden aus `vercel.json` gelesen (`framework: nextjs`, `buildCommand`, `installCommand`). Nicht im Dashboard überschreiben.
4. **Environment Variables** für **Production** und **Preview** getrennt setzen: Vercel Dashboard → Projekt → **Settings** → **Environment Variables**. Für Preview alle Variablen aus `.env.example` eintragen und **Preview** (und ggf. Production) auswählen. Wichtig für den Build:
   - **DATABASE_URL** und **DIRECT_URL** (Supabase): Ohne sie schlägt `prisma migrate deploy` fehl, der Build läuft trotzdem weiter (`Skipping migrate deploy`). Für laufende App und Migrationen müssen beide gesetzt sein.
   - **NEXTAUTH_URL**: Für Preview z. B. `https://<dein-preview-subdomain>.vercel.app`, für Production `https://raidflow.vercel.app`.
   - **NEXTAUTH_SECRET**, **DISCORD_*** etc. wie in `.env.example` dokumentiert.
5. **Preview-Branch:** Unter **Settings** → **Git** den Branch für Preview Deployments auf `preview` setzen (oder den gewünschten Branch).

---

## Preview-Build: Fehlerbehebung

**Häufige Ursachen für fehlgeschlagene Preview-Builds:**

| Ursache | Lösung |
|--------|--------|
| **Type/Prisma-Fehler** (z. B. unbekannte Felder in `where`) | Lokal `npm run build` ausführen; Fehler beheben (z. B. Relation nutzen statt nicht existierendes Feld). |
| **Fehlende Env-Variablen** | In Vercel → Settings → Environment Variables für **Preview** prüfen: mindestens `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`. |
| **`prisma migrate deploy` schlägt fehl** | Build sollte trotzdem durchlaufen (Fallback im Script). Wenn nicht: Env `DATABASE_URL`/`DIRECT_URL` für Preview setzen oder Build-Command anpassen. |

Der letzte fehlgeschlagene Preview-Build wurde durch einen **TypeScript-Fehler** in `app/api/guilds/[guildId]/raid-groups/[raidGroupId]/allowed-characters/route.ts` verursacht: Es wurde `raidGroupId` in der `where`-Clause von `rfGuildMember.findMany` verwendet; im Prisma-Schema hat `RfGuildMember` kein Feld `raidGroupId`. Stattdessen muss die Relation `memberRaidGroups: { some: { raidGroupId } }` verwendet werden. Diese Anpassung ist im Repo vorgenommen – nach Push auf `preview` sollte der Build durchlaufen.

---

## Referenz

- **Manuelle Einrichtung** (Vercel Env-Variablen, Railway, Discord, Supabase): [manual_setup.md](manual_setup.md)
- **Lokal starten:** [README.md](README.md) (Webapp: `npm run dev`; Bot: `npm run bot` bzw. `npm run dev:all`)
