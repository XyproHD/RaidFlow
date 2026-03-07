# Datenbank-Reset (RaidFlow)

## Tech-Stack laut `.env.local`

| Bereich | Technologie | Verwendung |
|--------|-------------|------------|
| **Auth** | NextAuth + Discord OAuth | `NEXTAUTH_*`, `DISCORD_CLIENT_*` |
| **Bot** | Discord Bot | `DISCORD_BOT_TOKEN`, `BOT_SETUP_SECRET`, `WEBAPP_OWNER_DISCORD_ID` |
| **Datenbank** | **Supabase (PostgreSQL)** | Projekt-ID: `ockpohmthiumohihzvpa` |
| **ORM / Zugriff** | **Prisma** (laut Kommentar) | `DATABASE_URL` (Pool), `DIRECT_URL` (Migrationen) |
| **Client** | Supabase JS SDK | `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY` |

Die **Daten und Strukturen** liegen in der **Supabase-Instanz** (PostgreSQL). Im Repo gibt es aktuell keine Prisma-Schema- oder App-Dateien – nur Spezifikationen (z. B. `db_schema.md`).

---

## Reset: Alle Strukturen und Daten löschen

Damit du das Projekt von Grund auf neu entwickeln kannst, müssen alle Tabellen/Views in Supabase gelöscht werden.

### Option A: Supabase Dashboard (empfohlen)

1. Öffne [Supabase Dashboard](https://supabase.com/dashboard) und wähle das Projekt **ockpohmthiumohihzvpa**.
2. Gehe zu **SQL Editor**.
3. Inhalt von **`scripts/db-reset.sql`** einfügen.
4. **Run** ausführen.

Damit werden alle im Skript genannten Tabellen/Views (inkl. Prisma-Migrationstabelle) mit `DROP TABLE IF EXISTS ... CASCADE` entfernt.

### Option B: Mit psql (DIRECT_URL)

```powershell
# In PowerShell (DIRECT_URL aus .env.local verwenden)
$env:PGPASSWORD="AbL43qOQmYtKss4u"
psql "postgres://postgres.ockpohmthiumohihzvpa@aws-1-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require" -f scripts/db-reset.sql
```

Oder mit einer `.env`-geladenen URL:

```powershell
npx dotenv -e .env.local -- psql "$env:DIRECT_URL" -f scripts/db-reset.sql
```

(Falls `dotenv-cli` installiert ist.)

---

## Nach dem Reset

- Die **Datenbank ist leer** (keine App-Tabellen, keine Prisma-Migrationen).
- **NextAuth / Discord / Supabase-Keys** in `.env.local` bleiben unverändert.
- Nächster Schritt: Prisma einrichten, Schema aus `db_schema.md` in `schema.prisma` abbilden und Migrationen neu ausführen (siehe Roadmap).

---

## Hinweis

- **Lokale Dateien:** Im Projekt existieren keine Prisma-Migrationen oder Supabase-Migrationsdateien; der Reset betrifft nur die **Supabase-Datenbank**.
- **Secrets:** `.env.local` enthält sensible Daten (DB-Passwort, Discord-Secrets, Supabase Keys). Nach dem Reset keine Secrets in Git committen.
