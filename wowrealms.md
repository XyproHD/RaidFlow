# WoW Classic Realms – Battle.net Game Data & Profil

Diese Notiz beschreibt, wie RaidFlow **Realms** über die Battle.net-API bezieht, in der **Datenbank** speichert und wie das mit **Profil-Charakteren** und der **Gildenverwaltung** zusammenhängt. Ausführlicher: **[BNET_INTEGRATION.md](BNET_INTEGRATION.md)**.

---

## 1. Zulässige Regionen

- **Region:** `eu`, `us` (siehe auch `WowRegion` im Code).

---

## 2. Namespaces (Game Data – Connected Realm / Suche)

Für **Game-Data**-Endpunkte (z. B. Connected Realms, Suchindizes) wird der **`dynamic-*`‑Namespace** verwendet:

| Version / Produktlinie | Namespace-Muster |
|------------------------|-------------------|
| Classic (Era / 1.x) | `dynamic-classic1x-{region}` |
| MoP Classic | `dynamic-classic-{region}` |
| TBC Classic (Jubiläum usw.) | `dynamic-classicann-{region}` |

**Beispiel-Aufruf** (Connected Realm – Platzhalter `4440` durch echte ID ersetzen):

```http
GET https://{region}.api.blizzard.com/data/wow/connected-realm/4440?namespace={namespace}&orderby=id&_page=1
```

**Wichtig:** Für **Charakter-** und **Gildenprofile** (`/profile/wow/character/...`, `/data/wow/guild/...` mit Profile-Namespace) ist der Query-Parameter **`namespace`** auf das passende **`profile-*`** zu setzen, **nicht** blind der `dynamic-*`‑Wert aus der Realm-Zeile zu übernehmen. Konvertierung im Code: `dynamicNamespaceToProfileNamespace()` in `lib/wow-realm-name.ts`.

---

## 3. Datenbank: `rf_battlenet_realm`

Importierte Realms werden in **`rf_battlenet_realm`** gespeichert. Übliche Felder:

| Feld | Bedeutung |
|------|-----------|
| `id` | Primärschlüssel (UUID), von der App vergeben |
| `realmId` | Blizzard-Realm-ID (Connected Realm / Realm) |
| `name` | **Mehrsprachig als JSON** (Blizzard liefert lokalisierte Namen) |
| `slug` | Realm-Slug für URLs/API |
| `region` | z. B. `eu` |
| `namespace` | z. B. `dynamic-classicann-eu` (für Game Data; Profil nutzt abgeleitetes `profile-*`) |
| `version` | z. B. `tbc`, `mop`, Classic-Era-Kennzeichnung |
| `type` | optional |
| `createdAt` / `updatedAt` | Zeitstempel |

**Namens-Sync:** Interne Funktionen/Skripte (z. B. `npm run db:sync:wowrealms` o. Ä.) lesen die API und aktualisieren die Tabelle; bei Bedarf erneut ausführen, um die Liste zu aktualisieren.

---

## 4. Nutzung in der Webapp

- **`GET /api/wow/realms?locale=de|en|…`** – liefert die gespeicherten Realms für Comboboxen (Profil: Charakter anlegen/bearbeiten; Gildenverwaltung: WoW-Serverwahl).
- **`rf_guild.battlenet_realm_id`** – verweist auf dieselbe Tabelle; ermöglicht **Vorbelegung des Realms** im Profil-Modal, wenn eine Gilde mit konfiguriertem Server gewählt ist.
- **Charakter-Sync:** Ausgewählter Realm (`rf_battlenet_realm.id`) + Name → Battle.net **Profile**-Charakterabfrage (siehe `lib/battlenet.ts`, `fetchClassicCharacterFromBattlenetByRealm`).

---

## 5. Schema-Anpassungen

Bei API-Änderungen oder zusätzlichen Feldern: Prisma-Schema `RfBattlenetRealm` in `prisma/schema.prisma` prüfen, Migration/`db push` ausführen.

---

## 6. Verwandte Dokumente

- **[BNET_INTEGRATION.md](BNET_INTEGRATION.md)** – OAuth, Gildenverknüpfung, Charakter-Endpunkte, Battle.net-Logo in der UI, Main-Spec-Logik.
- **`.cursor/rules/wow-classic-battlenet-api.mdc`** – Kurzregeln für Agenten (Namespaces, Profile vs. Game Data).
