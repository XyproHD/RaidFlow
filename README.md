# RaidFlow

**Web-App zur Raidverwaltung für WoW TBC Gilden – mit Discord-Anbindung.**

RaidFlow hilft Gilden dabei, Raids zu planen, Anmeldungen zu verwalten und Teilnahme sowie Loot nachzuvollziehen. Die Anwendung arbeitet eng mit einem Discord-Bot zusammen: Login und Rechte laufen über Discord, Raid-Threads und Benachrichtigungen direkt im Server.

---

## Vision

RaidFlow soll **eine zentrale Anlaufstelle** für Gilden sein:

- **Raidleader** erstellen Raids, legen Mindestbesetzung und Termine fest und sehen auf einen Blick, wer kann und wer sich angemeldet hat.
- **Spieler** melden sich mit wenigen Klicks an oder ab, hinterlassen Notizen und behalten ihre Raid- und Loot-Historie im Blick.
- **Gildenmeister** richten Raidgruppen und erlaubte Discord-Channels ein und haben die Übersicht über die Gilde.

Alles läuft webbasiert; die Rechte und die Sichtbarkeit von Raids werden über **Discord-Rollen** gesteuert. So bleibt die Struktur der Gilde in Discord erhalten, und RaidFlow ergänzt sie um Planung und Statistik.

---

## Für wen ist was sichtbar?

| Rolle | Was du siehst und tun kannst |
|-------|------------------------------|
| **RaidFlow-Raider** | Deine Gilden und Raids sehen, an Raids an- und abmelden, eigenes Profil (Charaktere, Raidzeiten, Statistik, Loot). |
| **RaidFlow-Raidleader** | Alles wie Raider plus: Raids anlegen, bearbeiten, „setzen“ (Teilnehmer festlegen) und abschließen. |
| **RaidFlow-Gildenmeister** | Alles wie Raidleader plus: Gildenverwaltung (Raidgruppen, Mitglieder, Channel-Auswahl für Raid-Threads). |


Bei Raids mit **Raidgruppen-Einschränkung** brauchst du zusätzlich die passende **Raidflowgroup-&lt;Name&gt;**-Rolle auf Discord, um den Raid zu sehen und dich anzumelden.

---

## Kernfunktionen im Überblick

### Für alle (nach Login)

- **Dashboard:** Übersicht deiner Gilden (Discord-Server mit RaidFlow) und aller Raids mit Anmeldestand und Aktionen je nach Rolle.
- **Mein Profil:** Anzeige-Modus (Hell/Dunkel in der Topbar, gespeichert im Profil und per Cookie), Raidzeiten-Präferenzen (wahrscheinlich/eventuell, Werktage/Wochenende; Outlook-artiges Grid), Charaktere (Anlegen und Bearbeiten im gleichen Modal; Liste mit ⭐/➖ für Main/Alt, Klassen- und Spec-Icons, Name, Gilde, ⋮-Menü für Bearbeiten/Als Main setzen), Raidstatistik pro Dungeon und Gilde, Loottabelle (erhaltener Loot pro Gilde/Dungeon).
- **Sprachauswahl** in der Topbar (Standard: Browsersprache).
- **Discord-Bot einladen:** Link, um den RaidFlow-Bot auf einem eigenen Discord-Server hinzuzufügen.

### Gildenverwaltung (nur RaidFlow-Gildenmeister)

- **Raidgruppen** anlegen und verwalten (der Bot legt die Discord-Rollen „Raidflowgroup-&lt;Name&gt;“ an).
- **Mitglieder** der Gilde einsehen und Raidgruppen zuordnen (in der App oder über Discord-Rollen).
- **„Lese Channels“:** Bot liefert alle Discord-Channels; Gildenmeister wählen die Channels, in denen der Bot Raid-Threads erstellen darf. Diese Auswahl wird beim Anlegen eines Raids als Channel-Dropdown angeboten.

### Raidplaner (RaidFlow-Raidleader)

- **Neuer Raid:** Dungeon, Name, Raidleader, Lootmaster, Mindestbesetzung (Tank, Melee, Range, Healer sowie Min-Specs), optionale Raidgruppen-Einschränkung, Notiz, max. Teilnehmer, Raidtermin, „Anmeldung bis“, Sichtbarkeit der Anmeldeliste (öffentlich oder nur Raidleader), optional Discord-Thread in einem erlaubten Channel.
- **Verfügbarkeits-Ansicht:** Termin und Uhrzeit (z. B. 16–03 Uhr) wählen; Anzeige der potenziellen Teilnehmer mit ihrer Verfügbarkeit (z. B. grün = wahrscheinlich, orange = eventuell) und Live-Hinweis zur Mindestbesetzung.
- **Raid bearbeiten:** Grunddaten ändern, Raidleader/Lootmaster aus dem Teilnehmerpool wählen, Termin verschieben (Anmeldungen werden zurückgesetzt) oder Raid absagen, Anmeldungsliste mit Filter und Notizen, Spieler auf „Gesetzt“ setzen oder aus dem Pool hinzufügen, Prüfung „2 Gruppen möglich?“ (doppelte Besetzung), **Raid setzen** (Status „fertig“, Liste veröffentlichen, Discord-Benachrichtigung, Thread-Update).
- **Raid abschließen:** Für jeden gesetzten Spieler einen Teilnahmeanteil (0–1, z. B. 0,5 oder 0,8) eintragen, fehlende Spieler aus dem Pool hinzufügen, Raid abschließen – alle erhalten den Zähler für den Dungeon in der Gilde gutgeschrieben.

### Raidteilnahme (RaidFlow-Raider)

- **Anmelden** mit Typ: normal, unsicher oder Reserve; bei „normal“ optional „Reserve erlauben?“; Kommentar für den Raidleader (z. B. „kann 15 Min später“). Nach Ablauf von „Anmeldung bis“ ist nur noch Reserve-Anmeldung möglich.
- **Abmelden** und **Status ändern** (z. B. normal ↔ Reserve).
- **Liste der angemeldeten Spieler** – sichtbar, wenn der Raid „öffentlich“ konfiguriert ist, sonst nur für Raidleader.
- **Discord-Thread:** Hinweis/Link zum Raid-Thread mit „Mein Status:“ und aktueller Übersicht. Der Thread ist **minimalistisch** gehalten: Dungeon, Name, Anmeldungen/max. Teilnehmer, fehlende Mindestbesetzung, eigener Status, sowie **Links**, um den Raid und die Raid-Teilnahme **direkt im Browser** zu öffnen.
- **Direkte URLs:** Raid-Ansicht und Raid-Teilnahme sind über **stabile URLs** aufrufbar (z. B. zum Teilen oder aus dem Discord-Thread). Die **Berechtigungsprüfung** (Login, RaidFlow-Raider, ggf. Raidflowgroup) erfolgt **bei jedem Aufruf** – die URL umgeht die Prüfung nicht; ohne Rechte: Redirect oder Fehlerseite.

---

## Discord-Integration

- **Login:** Per Discord OAuth (NextAuth.js). Es werden nur die **minimal nötigen Daten** verwendet (z. B. Discord-User-ID); E-Mail und Anzeigename werden nicht dauerhaft gespeichert (Datenminimierung).
- **RaidFlow-Bot:** Wird auf den Discord-Server eingeladen (Einladungs-URL fordert die nötigen **Bot-Berechtigungen** an: Rollen verwalten, Channels sehen, Nachrichten/Threads senden usw.). Mit **`/raidflow setup`** wird der Server in der Webapp angelegt und die Basis-Rollen (RaidFlow-Gildenmeister, RaidFlow-Raidleader, RaidFlow-Raider) auf Discord erstellt sowie in der App gespeichert. Mit **`/raidflow group <Groupname>`** wird die Rolle „Raidflowgroup-&lt;Groupname&gt;“ angelegt und in der App die Raidgruppe mit Rollen-ID hinterlegt. Alle Bot-Antworten sind **ephemeral** (nur für den ausführenden Nutzer sichtbar), inkl. Zwischenstände (z. B. „Rollen werden erstellt…“).
- **Raid-Threads:** Der Bot erstellt in einem von der Gildenverwaltung freigegebenen Channel einen Thread pro Raid und aktualisiert ihn bei Anmeldungen, beim „Raid setzen“ und beim Abschließen. **Thread-Inhalt (minimalistisch):** Dungeon, Name, Anmeldungen/max. Teilnehmer, fehlende Mindestbesetzung, „Mein Status“, Link „Raid im Browser“, Link „Raid-Teilnahme im Browser“. In der Webapp sind nur Raids sichtbar, für die der User die nötigen Rollen hat (bei Raidgruppen-Einschränkung zusätzlich Raidflowgroup).

Details zum Bot (Berechtigungen, ephemerale Antworten): siehe **[DiscordBot.md](DiscordBot.md)**.

---

## Technischer Stack

RaidFlow ist als moderne Web-App umgesetzt:

| Bereich | Technologie |
|--------|-------------|
| Framework | Next.js (App Router) |
| Styling | Tailwind CSS |
| UI-Komponenten | shadcn/ui |
| Datenbank | Prisma mit Supabase (PostgreSQL) |
| Authentifizierung | NextAuth.js (Discord Provider) |
| Sprache | TypeScript |

Die Oberfläche ist **responsiv (Mobile First)** und **mehrsprachig** (next-intl), mit Sprachauswahl in der Topbar und Standardsprache = Browsersprache. Das **Standard-Design** nutzt **helle, freundliche Farben mit gutem Kontrast**; ein **Dark-Modus** kann im User-Profil gewählt werden (dunkle Farben, guter Kontrast zu Bedienelementen und Text). Die Modus-Auswahl wird **im User-Profil und per Cookie** gespeichert.


---

## Kurz: Ablauf eines Raids

1. **Gildenmeister** lädt den Bot ein, führt `/raidflow setup` aus, richtet ggf. Raidgruppen ein und wählt die Discord-Channels für Raid-Threads.
2. **Raidleader** legt einen neuen Raid an (Dungeon, Termin, Mindestbesetzung, Channel für Thread usw.) und nutzt die Verfügbarkeits-Ansicht zur Planung.
3. **Raider** melden sich an (normal/unsicher/Reserve), ggf. mit Kommentar; der Discord-Thread zeigt den aktuellen Stand.
4. **Raidleader** setzt den Raid („Gesetzt“ = feste Teilnehmerliste), Spieler werden per Discord informiert.
5. Nach dem Raid **schließt der Raidleader ab**, trägt ggf. Teilnahmeanteile (0–1) ein – alle erhalten ihren Zähler für die Raidstatistik in der Gilde.

RaidFlow unterstützt damit die gesamte Kette von der Planung über die Anmeldung bis zur Auswertung – klar strukturiert und an Discord angebunden.

---

## Referenz-Dokumente (Entwicklung)

| Dokument | Inhalt |
|----------|--------|
| [project.md](project.md) | Funktionale Details, Vision, Abläufe |
| [UI.md](UI.md) | Seiten, Layout, Designvorgaben |
| [functions.md](functions.md) | Funktions-IDs, UI-Referenzen |
| [db_schema.md](db_schema.md) | Datenmodell, Tabellen rf_* |
| [Roadmap.md](Roadmap.md) | Phasen und Schritte der Entwicklung |
| [progress_tracker.md](progress_tracker.md) | Fortschritt und Akzeptanzkriterien |
| [DiscordBot.md](DiscordBot.md) | Bot-Befehle, Rollen, Threads |
| [rules.md](rules.md) | Tech-Stack, Code-Style |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Deployment-Pipeline (main/preview, Vercel, Railway) |
| [manual_setup.md](manual_setup.md) | Manuelle Einrichtung (Vercel, Railway, Discord, Supabase) |

**Lokal starten:** `npm run dev` – App unter http://localhost:3000 (Redirect auf /de).  
**Datenbank:** `.env.example` nach `.env` kopieren und `DATABASE_URL`/`DIRECT_URL` eintragen. Für Prisma: `npx prisma db push` (Schema anwenden) oder `npx prisma migrate dev` (mit Migrationen; erwartet `.env`). Nach Schema-Änderungen (z. B. neues Feld `theme_preference` in rf_user) erneut `npx prisma db push` ausführen. **TBC-Dungeons:** `npm run db:seed` (bzw. `npx prisma db seed`) befüllt die Tabelle rf_dungeon mit TBC-Raids (Karazhan, SSC, BT usw.).

---

## Deployment (Vercel + Railway, zwei Stages)

RaidFlow nutzt **zwei Stages**: **Production** (Branch `main`) und **Preview** (Branch `preview`). Die **Webapp** läuft auf **Vercel**, die **zwei Discord-Bots** auf **Railway**. Zuerst auf Preview deployen und testen, danach nach `main` pushen für Production.

| Stage | Branch | Webapp (Vercel) | Bot (Railway) |
|-------|--------|------------------|---------------|
| **Production** | `main` | https://raidflow.vercel.app/ | 1 Service, Env = Production |
| **Preview** | `preview` | https://raidflow-git-preview-myhess-3468s-projects.vercel.app/ | 1 Service, Env = Preview |

| Was | Wo / Hinweis |
|-----|----------------|
| **Pipeline & Struktur** | [DEPLOYMENT.md](DEPLOYMENT.md) – Branches, URLs, Monorepo-Struktur, automatische Deploys. |
| **Manuelle Einrichtung** | [manual_setup.md](manual_setup.md) – Vercel Environment Variables (Production + Preview), Railway (zwei Bot-Services), Discord, Supabase. |
| **Build-Konfiguration** | **`vercel.json`** (Framework Next.js, Install/Build). Nicht entfernen; Änderungen im Repo vornehmen. |
| **Output Directory** | Im Vercel-Dashboard *Settings → General → Build & Development* **leer lassen**. |
| **Prisma** | `prisma` in **dependencies** (für Vercel Build). Schema-Änderungen: Migration lokal testen, auf Supabase anwenden; Vercel baut mit `prisma generate` automatisch. |
