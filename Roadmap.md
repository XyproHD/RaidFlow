# RaidFlow – Entwicklungs-Roadmap

Diese Roadmap definiert die **Reihenfolge der Entwicklungsschritte** für RaidFlow. Sie richtet sich an **KI-Agenten und Entwickler**, die die Anwendung umsetzen. Jede Phase baut auf der vorherigen auf; Abweichungen sind nur zulässig, wenn Abhängigkeiten gewahrt bleiben.

**Bindende Referenzen:** [rules.md](rules.md) (Tech-Stack, Code-Style), [project.md](project.md) (Funktionen), [UI.md](UI.md) (Seiten und Design), [functions.md](functions.md) (Funktions-IDs und UI-Refs), [db_schema.md](db_schema.md) (Datenmodell), [DiscordBot.md](DiscordBot.md) (Bot-Funktionen).

---

## Übersicht der Phasen

| Phase | Bezeichnung | Abhängigkeit |
|-------|-------------|--------------|
| 0 | Projekt-Grundlage | – |
| 1 | Auth und Shell | 0 |
| 2 | Discord-Bot (Kern) | 0 |
| 3 | Gilden, Profil, Rechte | 1, 2 |
| 4 | Gildenverwaltung | 3 |
| 5 | Raid anlegen (Raidplaner) | 3, 4 |
| 6 | Raidteilnahme (Member) | 5 |
| 7 | Raid bearbeiten und setzen | 5, 6 |
| 8 | Raid abschließen | 7 |
| 9 | Admin | 1, 2 |
| 10 | Feinschliff (i18n, Icons, Polish) | 3–9 |

---

## Phase 0: Projekt-Grundlage

**Ziel:** Lauffähiges Next.js-Projekt mit Datenbank, UI-Basis und Konventionen. **Design:** Standard ist helles, freundliches Layout mit gutem Kontrast; Dark-Modus umschaltbar (Cookie + User-Profil), siehe [UI.md](UI.md) Designvorgaben.

**Schritte (in dieser Reihenfolge):**

1. **Next.js-Projekt anlegen** (App Router, TypeScript). Siehe [rules.md](rules.md): Next.js, TypeScript.
2. **Tailwind CSS** integrieren und konfigurieren.
3. **Prisma** einrichten, Verbindung zu **Supabase (PostgreSQL)** herstellen. Schema aus [db_schema.md](db_schema.md) in `schema.prisma` abbilden (alle Tabellen inkl. rf_*: rf_user, rf_guild, rf_user_guild, rf_raid_group, rf_guild_member, rf_character, rf_raid_time_preference, rf_dungeon, rf_raid, rf_raid_signup, rf_raid_completion, rf_guild_allowed_channel, rf_app_admin, rf_app_config, rf_audit_log; rf_raid_participation_stats als View oder materialisierte Logik). Migrationen ausführen.
4. **shadcn/ui** einrichten (`npx shadcn@latest init`). Komponenten nur dann hinzufügen, wenn sie in einer Phase benötigt werden (Button, Input, Table, Popover, Calendar, Dropdown, Sheet/Drawer für Burger-Menü usw.).
5. **next-intl** (oder vergleichbare i18n-Lösung) vorbereiten: Ordnerstruktur `[locale]` unter `app/`, Platzhalter-Übersetzungsdateien (z. B. `messages/de.json`, `messages/en.json`), Middleware für Locale (Default: Browsersprache). Noch keine vollständige Übersetzung aller Texte.
6. **Umgebungsvariablen** dokumentieren (`.env.example`): Discord Client ID/Secret (NextAuth), Datenbank-URL, ggf. Bot-Token und API-Basis-URL für Bot-Kommunikation.

**Abgabe:** App startet; Prisma migriert; leere Startseite; Referenz-Dokumente (project.md, UI.md, functions.md, db_schema.md) im Projekt verzeichnet (z. B. in README oder CONTRIBUTING).

**Referenzen:** [rules.md](rules.md), [db_schema.md](db_schema.md).

---

## Phase 1: Auth und Shell

**Ziel:** Nutzer können sich mit Discord anmelden; nach Login erscheinen Topbar, Burger-Menü und ein einfaches Dashboard. Rechteprüfung (welche Gilden/Raids sichtbar) kann zunächst mock oder später mit Bot-API erfolgen.

**Schritte (in dieser Reihenfolge):**

1. **NextAuth.js** mit **Discord Provider** einrichten. OAuth-Scopes **minimal** (nur für User-Identifikation nötig); **keine E-Mail**, keinen Anzeigenamen persistieren (siehe [project.md](project.md) – Discord-Datenminimierung). Nach Login: User in DB anlegen/aktualisieren (nur `id`, `discord_id`, `created_at`, `updated_at`).
2. **Landing Page** umsetzen ([UI.md](UI.md) Abschnitt 0): zentraler App-Name „RaidFlow“, zentraler Login-Button, dezentraler Button „Discord-Bot einladen“ (Link auf Bot-Einladungs-URL), schmale Footerbar mit Links Impressum, Disclaimer. Designvorgaben aus [UI.md](UI.md) (Position, Größe, Typografie) beachten.
3. **Geschützte Layout-Struktur** für eingeloggte Nutzer: Topbar ([UI.md](UI.md) 1.1) mit „RaidFlow“ (links, klickbar → Dashboard), **Burger-Menü** (Mitte/links), **Logout-Button** (rechts). **Sprachauswahl** in der Topbar (rechts, nahe Logout): Dropdown/Buttons für Sprachen; gespeicherte Präferenz (Cookie/localStorage); Default = Browsersprache.
4. **Burger-Menü** ([UI.md](UI.md) 1.2): Einträge „Mein Profil“, „Gildenverwaltung“, „Discord Bot einladen“, „Admin“. Sichtbarkeit: Gildenverwaltung nur anzeigen, wenn User auf mindestens einem Server Rolle RaidFlow-Gildenmeister hat (später mit Bot-API; vorher optional ausblenden oder Platzhalter). Admin nur anzeigen, wenn User Application-Admin ist (AppAdmin/Owner in DB).
5. **Dashboard** ([UI.md](UI.md) 1.3): Platzhalter für „Auflistung der Gilden“ und „Auflistung aller Raids“. Gildenliste: aus UserGuild/Guild laden (User muss Mitglied auf Discord-Server sein; Sync mit Discord/Bot siehe Phase 2). Raidliste: alle Raids aus Gilden, auf die User Zugriff hat (Rechte: RaidFlow-Raider bzw. Raidflowgroup bei Einschränkung – Prüfung über Bot-API oder Session-Cache). Pro Raid: Kurzinfo, Anmeldestand, Steuerungselemente je nach Rolle (Raidleader: Bearbeiten; Raider: Anmelden/Abmelden).

**Abgabe:** Login/Logout funktioniert; Landing Page und After-Login-Shell (Topbar, Burger, Dashboard mit Gilden- und Raid-Liste) sind nutzbar. Rechte können zunächst vereinfacht sein (z. B. alle Gilden des Users anzeigen), bis Phase 2/3 die Rollen liefern.

**Referenzen:** [project.md](project.md) (Landing, After Login, Rechteverwaltung), [UI.md](UI.md) (Abschnitte 0, 1), [functions.md](functions.md) (Discord.integration, Auth.logout, Rights.*), [db_schema.md](db_schema.md) (User, UserGuild).

---

## Phase 2: Discord-Bot (Kern)

**Ziel:** Der RaidFlow-Bot verbindet sich mit Discord-Servern; `/raidflow setup` legt den Server in der Webapp an und erstellt die Basis-Rollen; `/raidflow group <Name>` erstellt Raidgruppen-Rollen. **Einladung, Setup und Gruppen-Anlage nur für User mit Gründer- oder Manager-Rechten** auf dem jeweiligen Server (siehe [DiscordBot.md](DiscordBot.md) Abschnitt 0). Webapp bietet einen Bot-Einladungslink (nur für berechtigte Server) und kann (über API) Rollen eines Users abfragen.

**Schritte (in dieser Reihenfolge):**

1. **Discord-Bot** anlegen (Developer Portal): Application, Bot-Token, Slash-Commands registrieren (`/raidflow setup`, `/raidflow group` mit Option/Parameter Groupname). Bot in ein Test-Guild inviten.
2. **`/raidflow setup`** implementieren: **Rechteprüfung:** Nur ausführen, wenn ausführender User Server-Owner ist (`guild.owner_id`) ODER die Berechtigung **ADMINISTRATOR** (0x8) ODER **MANAGE_GUILD** (0x20) hat. Dann: Guild-ID in der Webapp speichern (Tabelle Guild: `discord_guild_id`, `name`, `bot_invite_status` o. ä.), auf Discord die drei Rollen anlegen (RaidFlow-Gildenmeister, RaidFlow-Raidleader, RaidFlow-Raider), Rollen-IDs in Guild speichern. Siehe [DiscordBot.md](DiscordBot.md) Abschnitte 0 und 1.
3. **`/raidflow group <Groupname>`** implementieren: **Gleiche Rechteprüfung** wie bei Setup (Owner oder ADMINISTRATOR oder MANAGE_GUILD). Rolle „Raidflowgroup-<Groupname>“ auf Discord anlegen, in der Webapp RaidGroup anlegen/aktualisieren (`guild_id`, `name`, `discord_role_id`). Siehe [DiscordBot.md](DiscordBot.md) Abschnitte 0 und 2.
4. **API oder Service** in der Webapp (oder Bot): Endpunkt/Service, der für einen User und eine Guild-ID die Discord-Rollen des Users auf diesem Server zurückgibt (z. B. über Discord API mit Bot-Token). Diese Information wird für Rechteprüfung (Rights.guildmaster, Rights.raidleader, Rights.raider, Raidflowgroup) genutzt.
5. **Bot-Einladung** in der Webapp: Einladungslink bzw. Server-Auswahl nur für Server anzeigen, auf denen der User **Gründer (Owner)** oder **Manager** ist (Prüfung: `owner_id` oder ADMINISTRATOR oder MANAGE_GUILD, z. B. über GET /users/@me/guilds mit entsprechenden Scopes/Response). Auf Landing Page und im Burger-Menü „Discord Bot einladen“ nur berechtigte Server anbieten. Siehe [DiscordBot.md](DiscordBot.md) Abschnitt 0.

**Abgabe:** Bot reagiert auf `/raidflow setup` und `/raidflow group <Name>` nur bei berechtigten Usern (Owner/Administrator/ManageGuild); Webapp speichert Guild und RaidGroup mit Rollen-IDs; Webapp zeigt Bot-Einladung nur für Server, auf denen der User die nötigen Rechte hat; Webapp kann User-Rollen für einen Server abfragen (für Phase 1/3 nutzbar).

**Referenzen:** [DiscordBot.md](DiscordBot.md) (Abschnitte 0, 1, 2, 5 Rechte), [db_schema.md](db_schema.md) (Guild, RaidGroup), [project.md](project.md) (Discord Integration, Gilde anlegen).

---

## Phase 3: Gilden, Profil, Rechte

**Ziel:** Dashboard zeigt echte Gilden (aus DB, gefiltert nach User-Mitgliedschaft und ggf. Whitelist/Blacklist). Eigenes Profil: Raidzeiten, Charaktere, Raidstatistik, Loot. Rechte (RaidFlow-Gildenmeister, Raidleader, Raider, Raidflowgroup) steuern Sichtbarkeit von Menü und Inhalten. Rollen/Specs mit Icons darstellen (Quelle z. B. C:\tmp\wow, Integration z. B. unter `public/icons/wow`).

**Schritte (in dieser Reihenfolge):**

1. **User-Gilden-Zuordnung:** Sicherstellen, dass User beim ersten Zugriff auf einen Server (z. B. nach Login oder bei Aufruf einer Guild-API) in UserGuild/GuildMember eingetragen werden können (Sync mit Discord/Bot). Dashboard: nur Gilden anzeigen, in denen der User Mitglied ist; Rechte pro Gilde aus Phase-2-API (Rollen abfragen).
2. **Burger-Menü Sichtbarkeit:** Gildenverwaltung nur anzeigen, wenn User auf mindestens einem Server RaidFlow-Gildenmeister hat; Admin nur, wenn User in AppAdmin oder Owner (AppConfig). Siehe [UI.md](UI.md) 1.2, [functions.md](functions.md) Rights.*.
3. **Seite „Mein Profil“** ([UI.md](UI.md) Abschnitt 4, [project.md](project.md) Eigenes Profil): **Anzeige-Modus (Theme)** umschaltbar (Hell/Dunkel); Speicherung im User-Profil (rf_user.theme_preference) und per Cookie (raidflow-theme). RaidTimePreference CRUD (Raidtage/Zeiten, wahrscheinlich/eventuell, Werktage/Wochenende). Character CRUD (Name, Gilde, Spec, Off-Spec). Raidstatistik: aus RaidParticipationStats bzw. RaidCompletion aggregiert (je Dungeon, je Gilde). Loottabelle: Tabelle Loot (Lesen; Erfassen optional oder in späterer Phase). Alle Texte aus i18n (next-intl).
4. **Rollen- und Spec-Icons:** Icons aus bereitgestellter Quelle (z. B. C:\tmp\wow) ins Projekt übernehmen (z. B. `public/icons/wow/`). Mapping Rollen (Tank, Melee, Range, Healer) und Specs (z. B. Fire Mage) auf Icon-Dateien. Wo immer Rollen oder Specs angezeigt werden (Profil, später Mindestbesetzung, Anmeldungsliste, DatePicker), **Icon + Tooltip/aria-label** verwenden. Siehe [project.md](project.md), [UI.md](UI.md) Designvorgaben zu Icons.
5. **Dungeon-Stammdaten:** Tabelle Dungeon mit TBC-Dungeons befüllen (Seed oder Migration), damit beim Anlegen eines Raids ein Dungeon wählbar ist.

**Abgabe:** Dashboard listet nur Gilden des Users; Rechte steuern Menü und Zugriff. Profil-Seite vollständig nutzbar (Raidzeiten, Charaktere, Statistik, Loot). Rollen/Specs mit Icons. Dungeon-Daten vorhanden.

**Referenzen:** [project.md](project.md) (Eigenes Profil, Rechteverwaltung), [UI.md](UI.md) (4, Designvorgaben), [functions.md](functions.md) (OwnProfile.*, Rights.*), [db_schema.md](db_schema.md) (Character, RaidTimePreference, Loot, RaidParticipationStats, Dungeon).

---

## Phase 4: Gildenverwaltung

**Ziel:** Nutzer mit Rolle RaidFlow-Gildenmeister sehen die Gildenverwaltung. Raidgruppen anlegen/bearbeiten (Bot erstellt Rollen), Mitglieder einsehen, „Lese Channels“ mit Channel-Auswahl für Raid-Threads; nicht existierende Channels aus Auswahl entfernen.

**Schritte (in dieser Reihenfolge):**

1. **Seite Gildenverwaltung** ([UI.md](UI.md) Abschnitt 5): Zugriff nur für User mit RaidFlow-Gildenmeister auf der gewählten Gilde. Raidgruppen: CRUD; beim Anlegen/Ändern einer Gruppe den Bot aufrufen (Rolle Raidflowgroup-<Name> anlegen), `discord_role_id` in RaidGroup speichern.
2. **Mitgliederliste:** Anzeige der Mitglieder der Gilde (aus GuildMember/UserGuild; Daten ggf. über Bot/API von Discord ergänzen). Gruppenzuteilung: Raidgruppe pro Member speichern (GuildMember.raid_group_id oder UserGuild-Erweiterung).
3. **„Lese Channels“:** Button in Gildenverwaltung ruft Bot-API auf; Bot liefert Liste aller Text-Channels des Servers. Ergebnis als Dropdown/Liste anzeigen. Gildenmeister wählt Channels aus, in denen der Bot Raid-Threads erstellen darf; Auswahl in GuildAllowedChannel speichern.
4. **Channel-Validierung:** Beim Laden der erlaubten Channels (oder periodisch) prüfen, ob jeder gespeicherte Channel auf Discord noch existiert. Nicht mehr existierende Einträge aus GuildAllowedChannel entfernen. Siehe [project.md](project.md), [functions.md](functions.md) Guild.channel_validation.

**Abgabe:** Gildenverwaltung vollständig nutzbar; Raidgruppen und erlaubte Thread-Channels sind in der Webapp gespeichert und werden beim Raidplaner (Phase 5) verwendet.

**Referenzen:** [project.md](project.md) (Gildenprofil), [UI.md](UI.md) (5), [functions.md](functions.md) (Guild.*, Discord.bot.channels.read), [DiscordBot.md](DiscordBot.md) (Abschnitte 2, 3), [db_schema.md](db_schema.md) (RaidGroup, GuildMember, GuildAllowedChannel).

---

## Phase 5: Raid anlegen (Raidplaner)

**Ziel:** Raidleader können einen neuen Raid anlegen: Grunddaten, Mindestbesetzung, Termin, Verfügbarkeits-Ansicht (DatePicker/Grid), Anmeldung bis, Sichtbarkeit, optional Discord-Thread in einem erlaubten Channel. Raid wird in DB gespeichert (Status draft/open); optional Thread über Bot anlegen.

**Schritte (in dieser Reihenfolge):**

1. **Formular „Neuer Raid“** ([UI.md](UI.md) Abschnitt 6, [project.md](project.md) Raidplaner Neuer Raid): Dungeon, Name, Raidleader, Lootmaster, Notiz, Max Teilnehmer, Raidtermin (Datum + Uhrzeit), „Anmeldung bis“, Sichtbarkeit Anmeldungen (öffentlich / nur Raidleader). Mindestbesetzung: Tank, Melee, Range, Healer; Min-Specs (z. B. Fire Mage). Optionale Einschränkung auf Raidgruppe (Dropdown aus RaidGroup). Channel für Discord-Thread: Dropdown aus GuildAllowedChannel (nur erlaubte Channels; nach Validierung). Checkbox „Discord-Thread anlegen“. Speichern: Raid in DB (Status z. B. open), ggf. Bot-API aufrufen zum Erstellen des Threads; `discord_thread_id` und `discord_channel_id` am Raid speichern.
2. **Termin- und Zeitauswahl:** shadcn Calendar + Popover für Datum; Zeit-Slots 16–03 Uhr (Select oder Slider). Siehe [UI.md](UI.md), [functions.md](functions.md) Raidplaner.Data.date, Raidplaner.Data.date.picker.time.
3. **Verfügbarkeits-Grid (custom):** Eigenes Grid (z. B. auf Basis shadcn Table oder CSS Grid): Zeilen = Member der Gilde (aus GuildMember/Character, gefiltert nach Raidgruppe falls Einschränkung), Spalten = Zeit-Slots (16–03 Uhr). Pro Zelle: Farbe aus RaidTimePreference (grün = wahrscheinlich, orange = eventuell). Live-Anzeige: aktuelle Teilnehmerzahl und Erfüllung Mindestbesetzung bei Änderung von Datum/Zeit oder Auswahl. Siehe [project.md](project.md) DatePicker, [UI.md](UI.md) 6.1, 6.2, [functions.md](functions.md) Raidplaner.availible.
4. **Zugriff:** Nur Nutzer mit RaidFlow-Raidleader auf der Gilde dürfen „Neuer Raid“ sehen und das Formular absenden.

**Abgabe:** Neuer Raid kann vollständig angelegt werden; Verfügbarkeits-Matrix und Live-Mindestbesetzung funktionieren; optional Discord-Thread wird erstellt und verknüpft.

**Referenzen:** [project.md](project.md) (Raidplaner Neuer Raid), [UI.md](UI.md) (6), [functions.md](functions.md) (Raidplaner.New, Raidplaner.Data.*, Guild.allowed_thread_channels), [db_schema.md](db_schema.md) (Raid), [DiscordBot.md](DiscordBot.md) (Abschnitt 4).

---

## Phase 6: Raidteilnahme (Member)

**Ziel:** Raider sehen Raid-Detail und können sich anmelden (normal/unsicher/Reserve), mit Kommentar und „Reserve erlauben?“; abmelden; Status ändern. Liste der angemeldeten Spieler je nach Raid-Einstellung sichtbar. Bot aktualisiert Discord-Thread bei Anmeldungen. **Thread-Inhalt minimalistisch** (Dungeon, Name, Anmeldungen/max_players, fehlende Mindestbesetzung, „Mein Status“, Links). **Raid und Raid-Teilnahme direkt per URL** aufrufbar; Berechtigungsprüfung bei jedem Aufruf (keine Umgehung).

**Schritte (in dieser Reihenfolge):**

1. **Raid-Detail-Seite** ([UI.md](UI.md) Abschnitt 7): Für Raids, auf die der User Zugriff hat (RaidFlow-Raider + ggf. Raidflowgroup). Anzeige: Raid-Infos, Termin, Dungeon, Mindestbesetzung, Anmeldestand. **Stabile URLs** für Raid-Ansicht und Raid-Teilnahme (z. B. …/raid/{raidId}, …/raid/{raidId}/signup); beim Laden der Route **Berechtigungsprüfung** (Login, Rollen); bei fehlender Berechtigung Redirect/Fehlerseite ([UI.md](UI.md) 7.3).
2. **Anmelden:** Formular/Modal: Typ (normal, unsicher, reserve); bei „normal“ Option „Reserve erlauben?“; Kommentar (Text). Nach Ablauf von „Anmeldung bis“ nur Reserve-Anmeldung zulassen. RaidSignup in DB anlegen; Bot-API aufrufen zum Aktualisieren des Raid-Threads.
3. **Abmelden und Status ändern:** Button Abmelden (RaidSignup löschen oder deaktivieren); bestehende Anmeldung bearbeiten (Typ, Reserve erlauben?). Thread erneut aktualisieren.
4. **Liste angemeldeter Spieler:** Anzeigen, wenn Raid.signup_visibility = public; sonst nur für Raidleader (Phase 7). Hinweis/Link „Mein Status im Discord-Thread“ ([functions.md](functions.md) Discord.member.raid.status). **Links** auf Raid-Detail und Raid-Teilnahme (Raid.url.view, Raid.url.signup) in der Webapp anzeigen/teilbar.
5. **Discord-Thread-Inhalt** ([DiscordBot.md](DiscordBot.md) 4.1, [UI.md](UI.md) 7.2): Bot-Nachricht **minimalistisch**: Dungeon, Name, **Anmeldungen / max_players**, **fehlende Mindestbesetzung** (Rollen/Specs); **„Mein Status“** für den lesenden User (wenn berechtigt); **Link „Raid im Browser“**, **Link „Raid-Teilnahme im Browser“** (stabile Webapp-URLs). Webapp zeigt nur Raids, für die der User Rollen hat (Raid.restriction); Thread-Links unterliegen in der Webapp der Berechtigungsprüfung.

**Abgabe:** Raider können sich an- und abmelden, Status ändern; Raid und Teilnahme sind per URL direkt aufrufbar (mit Berechtigungsprüfung); Thread wird bei Änderungen aktualisiert mit minimalistischem Inhalt und Links; Liste der Teilnehmer entsprechend Sichtbarkeit.

**Referenzen:** [project.md](project.md) (Raidteilnahme, Thread, URL), [UI.md](UI.md) (7, 7.2, 7.3), [functions.md](functions.md) (Raid.join, Raid.url.view, Raid.url.signup, Discord.bot.threads.content), [DiscordBot.md](DiscordBot.md) (Abschnitt 4, 4.1), [db_schema.md](db_schema.md) (RaidSignup).

---

## Phase 7: Raid bearbeiten und setzen

**Ziel:** Raidleader können einen Raid bearbeiten (Grunddaten, Raidleader/Lootmaster aus Pool, Termin verschieben/absagen), Anmeldungsliste mit Filter und Notizen verwalten, Spieler auf „Gesetzt“ setzen und aus Pool hinzufügen, „Raid setzen“ (Status locked, Liste veröffentlichen, Discord-Benachrichtigung, Thread-Update). Prüfung „2 Gruppen möglich“.

**Schritte (in dieser Reihenfolge):**

1. **Seite „Raid bearbeiten“** ([UI.md](UI.md) Abschnitt 8): Zugriff nur für RaidFlow-Raidleader dieser Gilde. Grunddaten bearbeiten (raid.data). Raidleader und Lootmaster aus Pool der (gesetzten) Spieler wählen (Raidplaner.Data.lead.raider.select, Raidplaner.Data.raider.select).
2. **Termin:** Ändern (mit Hinweis: alle Anmeldungen werden zurückgesetzt – raid.data.date.new); Raid absagen (Status cancelled – raid.status).
3. **Anmeldungsliste** (raid.members.list): Tabelle mit Spalten normal/unsicher/Reserve, gruppiert nach Rolle, Anzahl Teilnahmen an diesem Dungeon, Notiz-Hinweis und Tooltip/Mouseover für Notiz. Aktion „Alle Notizen einblenden“. Rollen/Specs mit Icons.
4. **Gesetzt setzen:** RaidSignup.set_confirmed = true; Spieler aus Gildenpool hinzufügen (RaidSignup anlegen, set_confirmed = true). Live-Aktualisierung Mindestbesetzung.
5. **Prüfung „2 Gruppen möglich“:** Anzeige/Hinweis, ob 2× max_players, 2× Mindestbesetzung Rollen und 2× Mindestbesetzung Specs durch aktuelle Anmeldungen abgedeckt sind.
6. **Raid setzen:** Button setzt Status auf locked; wenn signup_visibility = raid_leader_only, Liste der gesetzten Spieler veröffentlichen (für alle sichtbar). Bot: Benachrichtigung an Spieler, Thread aktualisieren (Discord.bot.threads.update).

**Abgabe:** Raid bearbeiten, Anmeldungsliste, Gesetzt setzen und „Raid setzen“ vollständig umgesetzt; Discord-Thread und Benachrichtigung funktionieren.

**Referenzen:** [project.md](project.md) (Raidplaner Bearbeiten), [UI.md](UI.md) (8), [functions.md](functions.md) (raid.data, raid.members.list, Raid setzen), [DiscordBot.md](DiscordBot.md) (Abschnitt 4, 4.1 Thread-Inhalt).

---

## Phase 8: Raid abschließen

**Ziel:** Raidleader können einen gesetzten Raid abschließen: pro gesetztem Spieler Teilnahmeanteil (0–1, dezimal) eintragen, fehlende Spieler aus Pool hinzufügen, Button „Abschließen“. Status → completed; RaidCompletion-Einträge anlegen; RaidParticipationStats aktualisieren; Bot aktualisiert Thread.

**Schritte (in dieser Reihenfolge):**

1. **Seite „Raid abschließen“** ([UI.md](UI.md) Abschnitt 9): Nur für Raids mit Status locked; nur für Raidleader. Ansicht: nur gesetzte Spieler bearbeitbar. Pro Spieler Eingabefeld Teilnahmeanteil (0–1, z. B. 0,5 oder 0,8; Default 1). Möglichkeit, weitere Spieler aus Gildenpool hinzuzufügen (RaidCompletion mit participation_counter).
2. **Button „Abschließen“:** Raid.status = completed. Für jeden gesetzten/hinzugefügten Spieler RaidCompletion anlegen (raid_id, user_id, character_id optional, participation_counter). RaidParticipationStats aktualisieren (View neu berechnen oder Tabelle befüllen). Bot: Thread aktualisieren.
3. **RaidParticipationStats:** Sicherstellen, dass Aggregation (User + Guild + Dungeon, Summe participation_counter) bei jedem Abschluss aktualisiert wird und in „Mein Profil“ (Raidstatistik) korrekt angezeigt wird.

**Abgabe:** Raid kann abgeschlossen werden; Zähler werden korrekt gutgeschrieben; Statistik im Profil stimmt; Thread zeigt abgeschlossenen Status.

**Referenzen:** [project.md](project.md) (Raidplaner abschließen), [UI.md](UI.md) (9), [db_schema.md](db_schema.md) (RaidCompletion, RaidParticipationStats).

---

## Phase 9: Admin

**Ziel:** Application-Admins (AppAdmin oder Owner in AppConfig) sehen das Admin-Menü. Gilden löschen, Whitelist oder Blacklist für Discord-Server aktivieren, weitere Admins (per Discord-ID) hinzufügen/entfernen. Owner (feste Discord-ID) nicht entfernbar.

**Schritte (in dieser Reihenfolge):**

1. **AppConfig und AppAdmin** in DB nutzen: Owner-Discord-ID (AppConfig), Liste Admins (AppAdmin). Middleware oder Layout: Admin-Menüpunkt nur anzeigen, wenn session.user.discord_id in AppAdmin oder = Owner.
2. **Admin-Seite** ([UI.md](UI.md) Abschnitt 10): Gilden löschen (Guild + abhängige Daten: Raids, Signups, Completions, RaidGroups, GuildAllowedChannel, UserGuild/GuildMember bereinigen). Whitelist/Blacklist: Toggle aktivieren (nur eine aktiv); Liste Server-IDs (discord_guild_id) pflegen. Beim Zugriff auf Gilden/Raids prüfen: wenn Whitelist aktiv, nur Guilds aus Liste; wenn Blacklist aktiv, Guilds aus Liste ausschließen.
3. **Admins verwalten:** Liste der Admin-Discord-IDs anzeigen; hinzufügen (Discord-ID eingeben), entfernen (außer Owner). Owner in AppConfig getrennt halten und nie aus Admin-Liste löschbar machen.

**Abgabe:** Admin-Bereich vollständig; Gilden löschen, Whitelist/Blacklist und Admin-Verwaltung funktionieren; Owner geschützt.

**Referenzen:** [project.md](project.md) (Admin), [UI.md](UI.md) (10), [functions.md](functions.md) (Admin.*), [db_schema.md](db_schema.md) (AppAdmin, AppConfig).

---

## Phase 10: Feinschliff (i18n, Icons, Polish)

**Ziel:** Alle sichtbaren Texte mehrsprachig; Rollen/Spec-Icons überall konsistent; Designvorgaben aus UI.md eingehalten; Performance und Zugänglichkeit geprüft.

**Schritte (in dieser Reihenfolge):**

1. **i18n vervollständigen:** Alle UI-Texte in Übersetzungsdateien (z. B. messages/de.json, en.json); Komponenten auf useTranslations/getTranslations umstellen. Datums-/Zahlenformate nach Locale (date-fns Locale oder Intl). Sprachauswahl in Topbar bereits in Phase 1; hier nur Vollständigkeit sicherstellen.
2. **Rollen- und Spec-Icons:** Prüfen, dass überall (Profil, Mindestbesetzung, Anmeldungsliste, DatePicker, Filter) Icons mit Tooltip/aria-label verwendet werden; Mapping zentral (z. B. roleIconMap, specIconMap) und konsistent.
3. **Designvorgaben** ([UI.md](UI.md) Abschnitt Designvorgaben): Position, Größe, Darstellung, Typografie für alle relevanten Seiten prüfen und anpassen. Mobile First, Touch-Ziele, Kontrast.
4. **Impressum und Disclaimer:** Platzhalter-Seiten oder externe Links in Footer einbinden.
5. **Datenminimierung prüfen:** Keine Speicherung von E-Mail/Anzeigename (User); Bot/Webapp tauschen nur nötige IDs aus (siehe [project.md](project.md), [DiscordBot.md](DiscordBot.md) Datenminimierung).

**Abgabe:** App mehrsprachig nutzbar; Icons und Design konsistent; rechtliche Platzhalter vorhanden; Datenminimierung eingehalten.

**Referenzen:** [project.md](project.md), [UI.md](UI.md) (Designvorgaben), [DiscordBot.md](DiscordBot.md) (Datenminimierung).

---

## Hinweise für KI-Agenten

- **Reihenfolge einhalten:** Phasen 0–10 in dieser Ordnung abarbeiten. Innerhalb einer Phase die Schritte in der angegebenen Reihenfolge umsetzen.
- **Referenzen prüfen:** Vor der Umsetzung eines Schritts die genannten Abschnitte in project.md, UI.md, functions.md, db_schema.md und DiscordBot.md lesen.
- **Tech-Stack:** Siehe [rules.md](rules.md). Keine anderen Frameworks oder Datenbanken ohne Anpassung der Doku verwenden.
- **Keine funktionalen Abweichungen:** Wenn die Spezifikation in project.md oder UI.md fehlerhaft oder unklar erscheint, die Doku anpassen (z. B. in project.md oder UI.md) und dann implementieren – nicht stillschweigend abweichen.
- **Abgabe pro Phase:** Nach jeder Phase sollte die App lauffähig sein; Regressionen in früheren Phasen vermeiden.
