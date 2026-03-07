# RaidFlow – Datenbankschema

Logisches Datenbankschema für die RaidFlow-Webapp (implementierungsneutral). Abgeleitet aus [project.md](project.md) und den in [functions.md](functions.md) beschriebenen Funktionen.

**Namenskonvention:** Alle Tabellen und Views tragen das Präfix **`rf_`** (RaidFlow), damit sie eindeutig der Anwendung zugeordnet und von anderen Schemas unterschieden werden können (z. B. `rf_user`, `rf_guild`, `rf_raid`).

---

## Entity-Relationship-Diagramm (Überblick)

```mermaid
erDiagram
    rf_user ||--o{ rf_user_guild : "member of"
    rf_user ||--o{ rf_character : owns
    rf_user ||--o{ rf_raid_time_preference : has
    rf_guild ||--o{ rf_user_guild : has
    rf_guild ||--o{ rf_raid_group : has
    rf_guild ||--o{ rf_raid : owns
    rf_guild ||--o{ rf_guild_member : contains
    rf_guild ||--o{ rf_guild_allowed_channel : "thread channels"
    rf_raid_group ||--o{ rf_guild_member : "assigned to"
    rf_raid }o--|| rf_dungeon : targets
    rf_raid }o--o| rf_guild_allowed_channel : "thread in"
    rf_raid ||--o{ rf_raid_signup : has
    rf_raid }o--o| rf_raid_group : "restricted to"
    rf_raid ||--o{ rf_raid_completion : has
    rf_user ||--o{ rf_raid_signup : "signs up"
    rf_character }o--o{ rf_raid_signup : optional
    rf_user ||--o{ rf_raid_completion : credited
    rf_character }o--o{ rf_raid_completion : optional
    rf_user ||--o{ rf_loot : received
    rf_guild ||--o{ rf_loot : in
    rf_dungeon ||--o{ rf_loot : from
    rf_character }o--o{ rf_loot : on
    rf_user ||--o{ rf_audit_log : "changed by"
    rf_guild ||--o{ rf_audit_log : "guild context"
    rf_raid }o--o{ rf_audit_log : "raid context"
    rf_user { string id PK
              string discord_id UK
              string theme_preference optional
              datetime created_at
              datetime updated_at }
    rf_guild { string id PK
               string discord_guild_id UK
               string name
               string bot_invite_status
               string discord_role_guildmaster_id
               string discord_role_raidleader_id
               string discord_role_raider_id
               datetime created_at
               datetime updated_at }
    rf_user_guild { string user_id FK
                    string guild_id FK
                    string role
                    datetime joined_at }
    rf_raid_group { string id PK
                    string guild_id FK
                    string name
                    string discord_role_id
                    int sort_order }
    rf_guild_member { string id PK
                      string user_id FK
                      string guild_id FK
                      string raid_group_id FK
                      datetime joined_at }
    rf_character { string id PK
                   string user_id FK
                   string guild_id FK
                   string name
                   string main_spec
                   string off_spec
                   datetime created_at }
    rf_raid_time_preference { string id PK
                              string user_id FK
                              string weekday
                              string time_slot
                              string preference
                              string week_focus
                              datetime updated_at }
    rf_dungeon { string id PK
                 string name
                 string expansion }
    rf_raid { string id PK
              string guild_id FK
              string dungeon_id FK
              string name
              string raid_leader_id FK
              string lootmaster_id FK
              int min_tanks
              int min_melee
              int min_range
              int min_healers
              json min_specs
              string raid_group_restriction_id FK
              text note
              int max_players
              datetime scheduled_at
              datetime signup_until
              string signup_visibility
              string status
              string discord_thread_id
              string discord_channel_id
              datetime created_at
              datetime updated_at }
    rf_raid_signup { string id PK
                     string raid_id FK
                     string user_id FK
                     string character_id FK
                     string type
                     boolean allow_reserve
                     text note
                     boolean set_confirmed
                     datetime signed_at
                     datetime updated_at }
    rf_raid_completion { string id PK
                         string raid_id FK
                         string user_id FK
                         string character_id FK
                         decimal participation_counter
                         datetime created_at }
    rf_loot { string id PK
              string user_id FK
              string guild_id FK
              string dungeon_id FK
              string character_id FK
              string item_ref
              datetime received_at }
    rf_guild_allowed_channel { string id PK
                               string guild_id FK
                               string discord_channel_id
                               string name
                               datetime last_validated_at }
    rf_audit_log { string id PK
                   string entity_type
                   string entity_id
                   string action
                   string changed_by_user_id FK
                   string field_name optional
                   text old_value optional
                   text new_value optional
                   string guild_id FK optional
                   string raid_id FK optional
                   datetime created_at }
```

---

## Tabellen und Felder

### rf_user (RaidFlow User)

Discord-Nutzer, die die App verwenden.

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| id | PK (UUID/string) | Eindeutige ID |
| discord_id | string, UNIQUE | Discord User ID (OAuth) – **zwingend für Identifikation** |
| theme_preference | string, optional | Anzeige-Modus: `light` oder `dark`; wird im User-Profil gespeichert und zusätzlich per Cookie (raidflow-theme) persistiert. |
| created_at | datetime | Erstellzeitpunkt |
| updated_at | datetime | Letzte Aktualisierung |

**Discord-Datenminimierung:** In der App nur `id` und `discord_id` zwingend speichern. Keine E-Mail, keinen Benutzernamen/Display-Namen dauerhaft speichern. Anzeigenamen ggf. bei Bedarf per Discord-API zur Laufzeit abrufen. Avatar-URL nicht speichern (Datenminimierung).

---

### rf_guild (RaidFlow Guild)

WoW-Gilde, zugeordnet zu einem Discord-Server. Nach `/raidflow setup` werden Server-ID und Basis-Rollen-IDs hier hinterlegt.

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| id | PK (UUID/string) | Eindeutige ID |
| discord_guild_id | string, UNIQUE | Discord Server ID |
| name | string | Gildenname (vom Discord-Server) |
| bot_invite_status | string, optional | Status Bot-Einladung (z. B. pending, active) |
| discord_role_guildmaster_id | string, optional | Discord-Rollen-ID „RaidFlow-Gildenmeister“ |
| discord_role_raidleader_id | string, optional | Discord-Rollen-ID „RaidFlow-Raidleader“ |
| discord_role_raider_id | string, optional | Discord-Rollen-ID „RaidFlow-Raider“ |
| created_at | datetime | Erstellzeitpunkt |
| updated_at | datetime | Letzte Aktualisierung |

---

### rf_user_guild (RaidFlow User–Guild)

N:M-Beziehung User–Gilde inkl. Rolle/Berechtigung (siehe Raid.restriction).

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| user_id | FK → rf_user.id | Nutzer |
| guild_id | FK → rf_guild.id | Gilde |
| role | string | Rolle (z. B. admin, member, raid_leader) |
| joined_at | datetime | Beitrittszeitpunkt |

**Primary Key:** (user_id, guild_id)

---

### rf_raid_group (RaidFlow Raidgruppe)

Raidgruppe innerhalb einer Gilde (für Gruppenzuteilung und optionale Raid-Einschränkung). Der Bot legt die Discord-Rolle „Raidflowgroup-<name>“ an; die Role-ID wird hier gespeichert.

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| id | PK (UUID/string) | Eindeutige ID |
| guild_id | FK → rf_guild.id | Gilde |
| name | string | Name der Raidgruppe (entspricht Rollen-Suffix) |
| discord_role_id | string, optional | Discord-Rollen-ID (Raidflowgroup-<name>) |
| sort_order | int | Sortierung für Anzeige |

---

### rf_guild_member (RaidFlow Gildenmitglied)

Mitgliedschaft eines Users in einer Gilde inkl. Zuordnung zu einer Raidgruppe (Guild.members, Guild.members.groups). Kann mit rf_user_guild zusammengeführt werden, wenn nur eine Mitgliedschaft pro User/Gilde existiert; hier als eigene Tabelle für „Member-Pool“ und Raidgruppen-Zuordnung.

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| id | PK (UUID/string) | Eindeutige ID |
| user_id | FK → rf_user.id | Nutzer |
| guild_id | FK → rf_guild.id | Gilde |
| raid_group_id | FK → rf_raid_group.id, optional | Zugewiesene Raidgruppe (oder über Discord-Rolle) |
| joined_at | datetime | Beitrittszeitpunkt |
| updated_at | datetime | Letzte Aktualisierung |

**Hinweis:** Falls User pro Gilde nur einmal vorkommt, kann stattdessen rf_user_guild um raid_group_id erweitert werden; dann rf_guild_member weglassen und Raidgruppen-Zuordnung in rf_user_guild speichern.

---

### rf_character (RaidFlow Charakter)

Spielercharakter eines Users (Name, Gilde, Spec, Off-Spec). OwnProfile.Chars.

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| id | PK (UUID/string) | Eindeutige ID |
| user_id | FK → rf_user.id | Besitzer |
| guild_id | FK → rf_guild.id, optional | Zugehörige Gilde (für Anzeige) |
| name | string | Charaktername |
| main_spec | string | Haupt-Spezialisierung (z. B. Fire Mage) |
| off_spec | string, optional | Off-Spezialisierung |
| created_at | datetime | Erstellzeitpunkt |
| updated_at | datetime | Letzte Aktualisierung |

---

### rf_raid_time_preference (RaidFlow Raidzeit-Präferenz)

Raidzeit-Präferenzen eines Users (wahrscheinlich/eventuell, Werktag/WE). OwnProfile.Raidtimes.

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| id | PK (UUID/string) | Eindeutige ID |
| user_id | FK → rf_user.id | Nutzer |
| weekday | string | Wochentag (z. B. Mo–So) oder „all“ |
| time_slot | string | Zeit-Slot (z. B. 16–18, 18–20, … 02–03 Uhr) |
| preference | string | wahrscheinlich \| eventuell |
| week_focus | string, optional | Werktag \| Wochenende (Fokus) |
| updated_at | datetime | Letzte Aktualisierung |

---

### rf_dungeon (RaidFlow Dungeon)

Raid-Dungeon (TBC).

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| id | PK (UUID/string) | Eindeutige ID |
| name | string | Dungeonname (z. B. Karazhan, SSC) |
| expansion | string | Erweiterung (z. B. TBC) |

---

### rf_raid (RaidFlow Raid)

Ein geplanter Raid. Raidplaner.Data, raid.data.

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| id | PK (UUID/string) | Eindeutige ID |
| guild_id | FK → rf_guild.id | Gilde |
| dungeon_id | FK → rf_dungeon.id | Dungeon |
| name | string | Raid-Name (altname) |
| raid_leader_id | FK → rf_user.id (oder Character), optional | Raidleader |
| lootmaster_id | FK → rf_user.id (oder Character), optional | Lootmaster |
| min_tanks | int | Mindestanzahl Tanks |
| min_melee | int | Mindestanzahl Melee |
| min_range | int | Mindestanzahl Range |
| min_healers | int | Mindestanzahl Healer |
| min_specs | JSON | Mindestanzahl pro Spec (z. B. {"Fire Mage": 1}) |
| raid_group_restriction_id | FK → rf_raid_group.id, optional | Einschränkung auf Raidgruppe |
| note | text, optional | Raid-Notiz |
| max_players | int | Max Teilnehmer |
| scheduled_at | datetime | Raidtermin (Datum + Uhrzeit) |
| signup_until | datetime | Anmeldung bis |
| signup_visibility | string | public \| raid_leader_only (Liste Anmeldungen) |
| status | string | draft \| open \| locked \| completed \| cancelled |
| discord_thread_id | string, optional | Discord-Thread-ID |
| discord_channel_id | string, optional | Discord-Channel-ID, in dem der Raid-Thread erstellt wurde (muss in rf_guild_allowed_channel für diese Gilde liegen) |
| created_at | datetime | Erstellzeitpunkt |
| updated_at | datetime | Letzte Aktualisierung |

---

### rf_raid_signup (RaidFlow Raid-Anmeldung)

Anmeldung eines Users zu einem Raid. Raid.join, raid.leave, raid.members.list.

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| id | PK (UUID/string) | Eindeutige ID |
| raid_id | FK → rf_raid.id | Raid |
| user_id | FK → rf_user.id | Angemeldeter User |
| character_id | FK → rf_character.id, optional | Optional: Charakter für diesen Raid |
| type | string | normal \| unsicher \| reserve |
| allow_reserve | boolean | Bei normal: Reserve erlauben? |
| note | text, optional | Kommentar für Raidlead |
| set_confirmed | boolean | Vom Raidlead auf „Gesetzt“ gesetzt |
| signed_at | datetime | Anmeldezeitpunkt |
| updated_at | datetime | Letzte Aktualisierung |

---

### rf_raid_completion (RaidFlow Raid-Abschluss)

Abschluss eines Raids pro Spieler inkl. Teilnahmeanteil (Zähler 0–1). Wird beim „Raid abschließen“ befüllt und treibt Raidstatistik/Loot-Kontext.

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| id | PK (UUID/string) | Eindeutige ID |
| raid_id | FK → rf_raid.id | Raid |
| user_id | FK → rf_user.id | Spieler |
| character_id | FK → rf_character.id, optional | Optional: Charakter |
| participation_counter | decimal(3,2) | Teilnahmeanteil 0–1 (z. B. 0,5; 0,8; 1,0), Default 1 |
| created_at | datetime | Zeitpunkt Abschluss |

---

### rf_raid_participation_stats (RaidFlow Raid-Teilnahme-Statistik, View)

Aggregierte Teilnahmen je User + Gilde + Dungeon (OwnProfile.Raidstatistik). Kann als materialisierte Tabelle oder View aus rf_raid_completion + rf_raid + rf_dungeon berechnet werden.

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| user_id | FK → rf_user.id | Nutzer |
| guild_id | FK → rf_guild.id | Gilde |
| dungeon_id | FK → rf_dungeon.id | Dungeon |
| participation_count | decimal | Summe participation_counter über alle RaidCompletions für diesen User/Gilde/Dungeon |

**Hinweis:** Primary Key (user_id, guild_id, dungeon_id); Aktualisierung bei jedem Raid-Abschluss.

---

### rf_guild_allowed_channel (RaidFlow erlaubter Gilden-Channel)

Von der Gildenverwaltung ausgewählte Discord-Channels, in denen der Bot Raid-Threads erstellen darf. „Lese Channels“ liefert die Kandidaten; Gildenmeister wählen aus. Beim Erstellen eines Raids wird einer dieser Channels gewählt; Sicherheitsprüfung: nicht mehr existierende Channels werden aus der Liste entfernt.

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| id | PK (UUID/string) | Eindeutige ID |
| guild_id | FK → rf_guild.id | Gilde |
| discord_channel_id | string | Discord-Channel-ID |
| name | string, optional | Anzeigename (z. B. bei „Lese Channels“ gesetzt) |
| last_validated_at | datetime, optional | Letzte Prüfung, ob Channel noch existiert |
| created_at | datetime | Erstellzeitpunkt |

---

### rf_app_admin (RaidFlow App-Admin)

Application-Admins (Verwaltung im Admin-Menü). Können Gilden löschen, Whitelist/Blacklist verwalten und weitere Admins ernennen/entfernen. Owner (eine feste Discord-ID in rf_app_config) kann nicht entfernt werden.

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| id | PK (UUID/string) | Eindeutige ID |
| discord_user_id | string, UNIQUE | Discord User ID des Admins |
| added_by_discord_id | string, optional | Discord-ID des Admins, der diesen Eintrag angelegt hat |
| created_at | datetime | Erstellzeitpunkt |

**Hinweis:** Ob ein User „Owner“ ist, wird über rf_app_config.owner_discord_id abgeglichen, nicht über rf_app_admin (Owner muss nicht zwingend in rf_app_admin stehen, wird aber für „sieht alles“ und unentfernbar behandelt).

---

### rf_app_config (RaidFlow App-Konfiguration)

Globale Anwendungskonfiguration: Owner, Whitelist/Blacklist für Discord-Server.

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| key | PK (string) | Konfigurationsschlüssel (z. B. owner_discord_id, use_whitelist, use_blacklist) |
| value | text/string | Wert (z. B. Discord-ID, true/false, JSON-Liste von Server-IDs) |

**Typische Keys:**
- `owner_discord_id` – Discord-ID des Application-Owners (kann nicht entfernt werden)
- `use_whitelist` – boolean: nur Server aus Whitelist erlauben
- `use_blacklist` – boolean: Server aus Blacklist aussperren
- `server_whitelist` – JSON-Array von discord_guild_id (wenn use_whitelist)
- `server_blacklist` – JSON-Array von discord_guild_id (wenn use_blacklist)

---

### rf_loot (RaidFlow Loot)

Loot-Historie: erhaltener Loot je User, Gilde, Dungeon (OwnProfile.Loottable).

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| id | PK (UUID/string) | Eindeutige ID |
| user_id | FK → rf_user.id | Empfänger |
| guild_id | FK → rf_guild.id | Gilde |
| dungeon_id | FK → rf_dungeon.id | Dungeon |
| character_id | FK → rf_character.id, optional | Charakter, der den Loot erhalten hat |
| item_ref | string | Item-Referenz (Name oder externe Item-ID) |
| received_at | datetime | Zeitpunkt (Raid/Datum) |

---

## Audit-Log (Änderungsprotokoll)

Für zentrale Inhalte wird jede relevante Änderung protokolliert: **Wer** (User), **was** (Aktion/Feld), **alter Wert**, **neuer Wert**, **wann**.

### rf_audit_log (RaidFlow Audit-Log)

Eine Zeile pro Änderung (bei mehreren geänderten Feldern z. B. pro Feld eine Zeile, gleicher Zeitstempel für dieselbe Aktion).

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| id | PK (UUID/string) | Eindeutige ID |
| entity_type | string | Betroffener Bereich: `guild_settings` \| `raid` \| `raid_signup` |
| entity_id | string | ID des geänderten Datensatzes (rf_guild.id, rf_raid.id, rf_raid_signup.id) |
| action | string | Aktion: `created` \| `updated` \| `deleted` |
| changed_by_user_id | FK → rf_user.id | **Wer** – User, der die Änderung vorgenommen hat |
| field_name | string, optional | **Was** – bei Updates: Name des geänderten Feldes; bei created/deleted optional (z. B. leer oder `_full`) |
| old_value | text, optional | **Alter Wert** – vorheriger Wert (bei created leer; bei deleted ggf. Snapshot als JSON) |
| new_value | text, optional | **Neuer Wert** – neuer Wert (bei deleted leer) |
| guild_id | FK → rf_guild.id, optional | Gilde (für Abfragen „alle Logs dieser Gilde“) |
| raid_id | FK → rf_raid.id, optional | Raid (für Abfragen „alle Logs dieses Raids / dieser Anmeldungen“) |
| created_at | datetime | **Wann** – Zeitpunkt der Änderung |

**Verwendung:**

- **Gildeneinstellungen:** Jede Änderung an rf_guild (Name, Rollen-IDs, …), rf_raid_group, rf_guild_allowed_channel usw. → `entity_type = guild_settings`, pro geändertem Feld eine Zeile mit field_name, old_value, new_value; `changed_by_user_id` = Gildenmeister/Raidleader, der gespeichert hat.
- **Raid angelegt/geändert/gelöscht:** `entity_type = raid`. Bei Erstellung: eine Zeile `action = created`, new_value = Snapshot (JSON) des Raids. Bei Bearbeitung: pro geändertem Feld eine Zeile `action = updated`. Bei Löschung: eine Zeile `action = deleted`, old_value = Snapshot.
- **Raid-Teilnahme (Anmeldung/Status):** `entity_type = raid_signup`. Bei Anmeldung: `action = created`. Jede Statusänderung (type, set_confirmed, note, …): `action = updated`, field_name, old_value, new_value. So entsteht eine **Historie pro Spieler/Raid** (Wer hat sich wann angemeldet, wer hat welchen Status wann geändert).

---

## Optionale Tabellen

### rf_raid_min_spec (RaidFlow Raid Mindest-Spec)

Falls Mindest-Specs nicht nur als JSON in rf_raid gespeichert werden sollen (z. B. für Abfragen/Filter):

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| raid_id | FK → rf_raid.id | Raid |
| spec_name | string | Spec (z. B. Fire Mage) |
| minimum_count | int | Mindestanzahl |

**Primary Key:** (raid_id, spec_name)

---

## Beziehungsübersicht (Kurz)

- **rf_user** ↔ **rf_guild** über **rf_user_guild** (und ggf. **rf_guild_member** für Raidgruppen).
- **rf_user** hat viele **rf_character**, viele **rf_raid_time_preference**.
- **rf_guild** hat viele **rf_raid_group**, viele **rf_raid**, viele **rf_guild_member** (bzw. rf_user_guild).
- **rf_raid** gehört zu **rf_guild** und **rf_dungeon**; hat viele **rf_raid_signup**, viele **rf_raid_completion**; optional **raid_group_restriction_id** → rf_raid_group; optional **discord_channel_id** (Channel aus **rf_guild_allowed_channel**).
- **rf_guild** hat viele **rf_guild_allowed_channel** (erlaubte Channels für Raid-Threads).
- **rf_raid_group** speichert optional **discord_role_id** (Rolle Raidflowgroup-<name>).
- **rf_app_admin** und **rf_app_config** (Owner, Whitelist/Blacklist) steuern Application-Admin-Rechte und Server-Zulassung.
- **rf_raid_completion** liefert die Basis für **rf_raid_participation_stats** (View oder Tabelle).
- **rf_loot** referenziert **rf_user**, **rf_guild**, **rf_dungeon**, optional **rf_character**.
- **rf_audit_log** speichert für Gildeneinstellungen, Raids und Raid-Anmeldungen jede Änderung (Wer, was, alter/neuer Wert, wann); Referenzen auf **rf_user**, optional **rf_guild**, **rf_raid**.
