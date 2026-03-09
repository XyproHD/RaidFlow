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

## Referenz

- **Manuelle Einrichtung** (Vercel Env-Variablen, Railway, Discord, Supabase): [manual_setup.md](manual_setup.md)
- **Lokal starten:** [README.md](README.md) (Webapp: `npm run dev`; Bot: `npm run bot` bzw. `npm run dev:all`)
