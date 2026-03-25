# RaidFlow – Battle.net API & Profil-/Gilden-Anbindung

Dieses Dokument beschreibt die **Battle.net-Integration** in RaidFlow: Konfiguration, Realm-Sync, **Gildenverwaltung** (Serverwahl, Gilden-ID), **Charaktere im Profil** (Synchronisation, Speicherung, BNet-Hinweis) und die **relevanten API-Routen**. Ergänzend zu technischen Details in `lib/battlenet.ts`, `lib/wow-realm-name.ts` und der Cursor-Regel **WoW Classic – Battle.net API** (`.cursor/rules/wow-classic-battlenet-api.mdc`).

---

## 1. Konfiguration (`rf_battlenet_api_config`)

Die App lädt **Client-Credentials** (OAuth) und Pfade aus der Datenbanktabelle **`rf_battlenet_api_config`** (pro Region, z. B. `eu`). Dazu gehören u. a.:

- `client_id` / `client_secret`, `oauth_token_url`, `api_base_url`
- **`namespace_profile`** und **`namespace_dynamic`** (Profile- vs. Game-Data-Namespaces)
- Pfade: `profile_character_path`, `profile_guild_path`, `search_guild_path`, `search_character_path`, …

**Authentifizierung:** Token über die regionale OAuth-URL (z. B. `https://eu.battle.net/oauth/token`), anschließend Header `Authorization: Bearer <access_token>` für Blizzard-Requests (siehe `lib/battlenet.ts`).

Es sind **keine** Battle.net-Secrets in `.env` nötig, sofern die Konfiguration in der DB gepflegt ist.

---

## 2. Namespaces: Game Data vs. Profile

| Produktlinie | Game Data (`dynamic-*`) | Profile (`profile-*`) |
|--------------|-------------------------|------------------------|
| WoW Classic (Era / 1.x) | `dynamic-classic1x-{region}` | `profile-classic1x-{region}` |
| TBC Classic (Jubiläum usw.) | `dynamic-classicann-{region}` | `profile-classicann-{region}` |
| Mists Classic | `dynamic-classic-{region}` | `profile-classic-{region}` |

In **`rf_battlenet_realm`** liegt typischerweise der **dynamic-**Namespace (Realm-/Connected-Realm-Import). Für **Charakter- und Gildenprofile** muss der Query-Parameter **`namespace`** auf das passende **`profile-*`** gesetzt werden. Im Code: `dynamicNamespaceToProfileNamespace()` in `lib/wow-realm-name.ts`.

---

## 3. Realm-Liste & `wowrealms.md`

- **Connected Realms** werden über die **Game-Data-API** mit dem jeweiligen **`dynamic-*`‑Namespace** bezogen (siehe [wowrealms.md](wowrealms.md)).
- Gespeichert in **`rf_battlenet_realm`** (Felder u. a. `id`, `slug`, `name` als JSON, `region`, `namespace`, `version`).
- Die Webapp stellt die Liste authentifizierten Nutzern über **`GET /api/wow/realms?locale=…`** bereit (für Profil-Charaktermodal und Gildenverwaltung).

---

## 4. Gildenverwaltung: WoW-Server & Battle.net-Gilde

**Ziel:** Die Discord-Gilde mit einem **WoW-Realm** und optional einer **Battle.net-Gilde** verknüpfen, damit Suche und spätere Features eindeutig sind.

**UI:** Abschnitt in der Gildenverwaltung (`components/guild-battlenet-section.tsx`) – nur für **RaidFlow-Gildenmeister**.

**In `rf_guild` gespeichert (Auszug):**

| Feld | Bedeutung |
|------|-----------|
| `battlenet_realm_id` | FK auf **`rf_battlenet_realm.id`** – gewählter Server aus der Realm-Liste |
| `battlenet_profile_realm_slug` | Realm-Slug für **Profile-API** (Gilde/Charakter) |
| `battlenet_profile_realm_id` | Numerische Realm-ID aus Blizzard, falls bekannt |
| `battlenet_guild_id` | Battle.net-Gilden-ID (**BigInt**) |
| `battlenet_guild_name` | Anzeigename der WoW-Gilde |

**API:**

- **`GET /api/guilds/[guildId]/battlenet-link`** – Liest die Verknüpfung für die UI.
- **`PATCH /api/guilds/[guildId]/battlenet-link`** – Setzt oder löscht Realm- und Gilden-Daten (Body: `battlenetRealmId`, `battlenetGuildId`, `battlenetGuildName`; alles `null` = löschen).

**Serverwahl:** Combobox über dieselbe Realm-Liste wie im Profil (`/api/wow/realms`). Zusätzlich können Gilden über Blizzard-**Suche** gefunden und übernommen werden (Such-API mit **dynamic-**Namespace, je nach Implementierung in der Route).

**Profil – Charakter anlegen:** Wenn der Nutzer eine **Gilde** wählt, die `battlenet_realm_id` gesetzt hat, wird der **Realm im Charakter-Modal vorbelegt** (`battlenetRealmId` in den Gildenoptionen aus `getGuildsForUser` / `UserGuildInfo`).

---

## 5. Profil: Charaktere & Battle.net-Sync

### 5.1 Ein Modal für manuelles Anlegen + optional BNet

Es gibt **ein** Dialog „Charakter anlegen“ / „Bearbeiten“ (kein separater „Auto Add“-Button mehr). Enthalten sind u. a.:

- **Gilde** (optional, inkl. „ohne Gilde“)
- **Server (Realm)** – optional, Auswahl aus DB-Liste (für eindeutige API-Zuordnung)
- **Charaktername** + Button **„BNet Sync“**
- **Klasse / Main-Spec / Off-Spec** – nach Sync vorausgefüllt, **immer manuell überschreibbar**

### 5.2 Ablauf „BNet Sync“

1. Nutzer wählt einen **Realm aus der Liste** und trägt den **Namen** ein.
2. **`POST /api/user/characters/battlenet-fetch`** lädt den Charakter von der **Profile-API** (Realm aus `rf_battlenet_realm`, Namespace **profile-***), **ohne** DB-Schreiben.
3. Antwort enthält u. a. `characterName`, `mainSpec` und ein serialisierbares **`profile`**-Objekt für die spätere Persistenz.
4. Beim **Speichern** sendet der Client optional **`battlenetProfile`** mit:
   - **`POST /api/user/characters`** (neu)
   - **`PATCH /api/user/characters/[id]`** (bearbeiten, erneuter Sync jederzeit möglich)

Server legt bzw. aktualisiert dann **`rf_battlenet_character_profile`** (u. a. `battlenet_character_id`, `realm_slug`, `raw_profile`, `last_synced_at`). Konflikt mit Unique-Constraint → HTTP **409**.

**Hinweis bei fehlendem API-Treffer:** Wenn Blizzard **404** liefert, zeigt die UI zusätzlich den Text zur **exakten Schreibweise inkl. Sonderzeichen** (Übersetzungen `profile.bnetExactSpellingHint` in `messages/de.json` / `en.json`).

### 5.3 Main-Spec aus der API

Die **Haupt-Spezialisierung** wird aus der **Character-Specializations**-Ressource abgeleitet, nicht nur aus `active_spec`:

- Zuerst **`specialization_groups`** der aktiven Gruppe: pro Eintrag **`spent_points`** (Talentbaum mit den meisten Punkten gewinnt).
- Alternativ flache **`specializations`** mit Summe **`talent_rank`** / **`rank`** pro Baum.
- **Fallback:** `active_specialization` bzw. Profil-`active_spec`.

Implementierung: `lib/battlenet.ts` (`pickMainSpecNameFromSpecializations`, `resolveClassAndSpec`).

### 5.4 BNet-Hinweis in Charakterlisten

Liegt zu einem Charakter ein Eintrag in **`rf_battlenet_character_profile`** mit gesetzter **`battlenet_character_id`** vor, gilt der Charakter als **mit Battle.net verknüpft**. In der UI erscheint ein kleines **„BNet“**-Badge:

- **Eigenes Profil** – Charakterliste (`profile-characters.tsx`)
- **Gildenverwaltung** – Mitglieder/Charakterkarten (`GET /api/guilds/[guildId]/members` liefert `hasBattlenet`)

---

## 6. API-Übersicht (Auswahl)

| Methode | Pfad | Zweck |
|---------|------|--------|
| GET | `/api/wow/realms` | Realm-Liste für UI (Profil + Gilde) |
| POST | `/api/user/characters/battlenet-fetch` | Battle.net-Vorschau (kein DB-Write) |
| POST | `/api/user/characters` | Charakter anlegen, optional `battlenetProfile` |
| PATCH | `/api/user/characters/[id]` | Charakter ändern, optional `battlenetProfile` (Re-Sync) |
| POST | `/api/user/characters/auto-add` | Legacy: anlegen inkl. sofortigem BNet-Profil (weiterhin nutzbar für Automatisierung) |
| GET / PATCH | `/api/guilds/[guildId]/battlenet-link` | Gilden-Battle.net-Verknüpfung lesen/schreiben |

---

## 7. Code-Referenz (Kurz)

| Bereich | Dateien (Auszug) |
|---------|-------------------|
| BNet-Client, Spec-Logik | `lib/battlenet.ts` |
| Profil-Payload / Upsert | `lib/battlenet-character-persist.ts` |
| DTO inkl. `hasBattlenet` | `lib/character-api-dto.ts` |
| Namespace-Hilfen | `lib/wow-realm-name.ts` |
| Gilden + `battlenetRealmId` | `lib/user-guilds.ts` |
| Profil-UI | `app/[locale]/(protected)/profile/profile-characters.tsx` |
| Gilden-BNet-UI | `components/guild-battlenet-section.tsx` |

---

## 8. Offizielle Dokumentation

- [World of Warcraft Classic – Game Data APIs](https://community.developer.battle.net/documentation/world-of-warcraft-classic/game-data-apis)
- [World of Warcraft Classic – Profile APIs](https://community.developer.battle.net/documentation/world-of-warcraft-classic/profile-apis)

Namespaces und Pfade können sich je nach Produkt unterscheiden – immer mit der aktuellen Blizzard-Doku zum jeweiligen Classic-Produkt abgleichen.
