# RaidFlow – UI (Seiten und Webinhalte)

Übersicht aller Seiten und Webinhalte für die optische Darstellung der RaidFlow-Webapp (Raidverwaltung für WoW TBC Gilden). Dieses Dokument beschreibt alle Seiten und UI-Elemente. Pro Bereich: Übersicht, Tabelle der Elemente, Verwendete Funktionen. Designvorgaben für Position, Größe, Darstellung und Typografie siehe Abschnitt **Designvorgaben (Entwicklung)** am Ende.

---

## 0. Landing Page (nicht eingeloggt)

Unauthentifizierter Einstieg: App-Name, Discord-Login und Bot-Einladung.

| Element | Beschreibung |
|--------|--------------|
| App-Name | Zentraler Name der App: **RaidFlow** |
| Login-Button | Zentraler Button: Login mit Discord (startet Discord OAuth) |
| Discord-Bot einladen | Leicht dezentraler Button: Discord-Bot dem eigenen Channel/Server hinzufügen (Einladungslink). **Nur für Server anzeigen/anbieten, auf denen der User Gründer (Owner) oder Manager ist** (Discord: Administrator bzw. „Server verwalten“ / MANAGE_GUILD). Siehe [DiscordBot.md](DiscordBot.md) Abschnitt 0. |
| Footer | Schmale Footerbar mit Links: **Impressum**, **Disclaimer** |

**Verwendete Funktionen:** `Discord.integration`, `Discord.bot.invite`, `Discord.bot.invite.server_rights`

---

## 1. After Login – Shell und Dashboard

Hauptansicht nach Login: Topbar, Burger-Menü, Gilden- und Raid-Übersicht.

### 1.1 Topbar

| Element | Beschreibung |
|--------|--------------|
| App-Name | **RaidFlow** (links, klickbar → Dashboard) |
| Burger-Menü | Öffnet Navigationsmenü (siehe 1.2) |
| Logout-Button | Abmelden (rechts) |

**Verwendete Funktionen:** `Auth.logout`

### 1.2 Burger-Menü

| Eintrag | Sichtbarkeit |
|---------|--------------|
| Mein Profil | Immer (eingeloggt) |
| Gildenverwaltung | Nur wenn User auf mindestens einem Server die Discord-Rolle **RaidFlow-Gildenmeister** hat |
| Discord Bot einladen | Immer (Link zum Bot hinzufügen) |
| Admin | Nur für Application-Admins (gesonderte Verwaltung) |

**Verwendete Funktionen:** `Rights.guildmaster`, `Rights.admin`

### 1.3 Dashboard (zentrale Ansicht nach Login)

| Element | Beschreibung |
|--------|--------------|
| Gilden-Auflistung | Zentrale Auflistung der Gilden (Mitgliedschaften auf Discord-Servern, die RaidFlow nutzen); pro Gilde Eintrag/ Kachel mit Name, ggf. Link zur Gildenverwaltung (wenn Gildenmeister) |
| Raid-Übersicht | Auflistung aller Raids in Kurzübersicht: Anmeldestand, Steuerungselemente je nach Rechten (z. B. als Raidleader: Bearbeiten/Setzen; als Raider: Anmelden/Abmelden); Filter nach Gilde möglich |

**Verwendete Funktionen:** `Raid.restriction`, `Rights.raidleader`, `Rights.raider`, `Rights.guildmaster`, Dashboard-Gildenliste, Dashboard-Raidliste

---

## 2. Auth / Onboarding

### 2.1 Login / Discord OAuth

| Element | Beschreibung |
|--------|--------------|
| Login-Button | Startet Discord OAuth Flow (auf Landing Page zentral) |
| Redirect nach Discord | Nutzer wird zu Discord zur Autorisierung weitergeleitet |
| Rückkehr in App | Nach erfolgreicher Auth: Redirect auf Dashboard (1.3) |

**Verwendete Funktionen:** `Discord.integration`

**Hinweis (Discord-Datenminimierung):** Von Discord nur minimal notwendige Daten anfordern und speichern. Siehe [project.md](project.md) und [db_schema.md](db_schema.md).

---

## 3. Gilde

Bot einladen bzw. Gilde anlegen. Erreichbar über Landing Page (Button „Discord Bot hinzufügen“) oder Burger-Menü „Discord Bot einladen“.

| Element | Beschreibung |
|--------|--------------|
| Bot-Einladung | Link/Button bzw. Server-Auswahl zum Einladen des Bots. **Nur Server anzeigen, auf denen der User Gründer (Owner) oder Manager ist** (ADMINISTRATOR oder MANAGE_GUILD). Siehe [DiscordBot.md](DiscordBot.md) Abschnitt 0. |
| Antrag-Formular | Optional: Formular zum Beantragen der Gilde (falls Freischaltung nötig) |

**Verwendete Funktionen:** `Discord.bot.invite`, `Discord.bot.invite.server_rights`

---

## 4. Eigenes Profil

Raidzeiten, Charaktere, Raidstatistik und Loottabelle des Nutzers.

### 4.1 Profil

| Element | Beschreibung |
|--------|--------------|
| **Anzeige-Modus (Theme)** | Umschaltung Hell/Dunkel; Auswahl wird im User-Profil und per Cookie gespeichert (siehe Designvorgaben: Light- und Dark-Modus). |
| Raidzeiten-Block | Präferierte Raidtage und Zeiten; Unterscheidung „wahrscheinlich“ / „eventuell“; Fokus Werktage oder Wochenende |
| Charakterliste | Charaktere: Name, Gilde, Spec, Off-Spec; CRUD (Anlegen, Bearbeiten, Löschen) |
| Raidstatistik | Übersicht teilgenommene Raids je Dungeon und je Gilde |
| Loottabelle | Erhaltener Loot je Gilde je Dungeon (Historie) |

**Verwendete Funktionen:** `OwnProfile.Theme`, `OwnProfile.Raidtimes`, `OwnProfile.Raidtimes.timepreferences`, `OwnProfile.Raidtimes.weekpreferences`, `OwnProfile.Chars`, `OwnProfile.Raidstatistik`, `OwnProfile.Loottable`

---

## 5. Gildenprofil (Gildenverwaltung)

Raidgruppen, Mitglieder, Channel-Auswahl für Raid-Threads. Sichtbar nur für **RaidFlow-Gildenmeister**.

### 5.1 Gildenverwaltung

| Element | Beschreibung |
|--------|--------------|
| Raidgruppen | Raidgruppen anlegen, bearbeiten, sortieren (Bot erstellt Rollen „Raidflowgroup-<Name>“) |
| Mitgliederliste | Übersicht aller Chars/Mitglieder der Gilde |
| Gruppenzuteilung | Zuteilung von Mitgliedern zu Raidgruppen (alternativ über Discord-Rollen mittels Bot) |
| **Lese Channels** | Button „Channels lesen“: Bot liest alle Discord-Channels des Servers aus und zeigt sie als Dropdown an |
| **Channel-Auswahl für Threads** | Gildenmeister wählen die Channels aus, in denen der Bot Raid-Threads erstellen darf; diese Auswahl wird in der Webapp gespeichert und beim Raidplaner (Neuer Raid) als Dropdown angeboten; nicht mehr existierende Channels werden aus der Auswahl entfernt (Sicherheitsprüfung) |

**Verwendete Funktionen:** `Guild.groups`, `Guild.members`, `Guild.members.groups`, `Discord.Guild.additionalgroups`, `Discord.bot.channels.read`, `Guild.allowed_thread_channels`, `Guild.channel_validation`

---

## 6. Raidplaner (Neuer Raid)

Neuen Raid anlegen: Grunddaten, Mindestbesetzung, DatePicker, Discord-Thread-Option. Erfordert **RaidFlow-Raidleader**.

### 6.1 Neuer Raid (Formular)

| Element | Beschreibung |
|--------|--------------|
| Grunddaten | Dungeon, Name, Raidleader, Lootmaster, Notiz, Max Teilnehmer, Raidtermin, „Anmeldung bis“, Sichtbarkeit Anmeldungen (öffentlich / nur Raidleader) |
| Mindestbesetzung | Tank, Melee, Range, Healer; Minimum pro Spec (z. B. Min Fire Mage) |
| Raidgruppen-Einschränkung | Optionale Einschränkung auf eine Raidgruppe (Rolle „Raidflowgroup-<Name>“) |
| **Discord-Channel für Thread** | Dropdown mit den in der Gildenverwaltung ausgewählten Channels; in diesem Channel legt der Bot den Raid-Thread an; Prüfung ob Channel noch existiert (sonst aus Auswahl entfernen) |
| DatePicker | Analog Outlook-Verfügbarkeit: Zeit horizontal (16–03 Uhr); vertikal Member-Pool mit Filter (Raidgruppe, Einschränkungen), Gruppierung nach Rolle; Verfügbarkeit in Zelle: Grün (wahrscheinlich), Orange (eventuell) |
| Discord-Thread-Option | Checkbox/Option zum Anlegen eines Discord-Threads für diesen Raid (im gewählten Channel) |

**Verwendete Funktionen:** `Raidplaner.New`, `Raidplaner.Data`, `Raidplaner.Data.dungeon`, `Raidplaner.Data.altname`, `Raidplaner.Data.lead`, `Raidplaner.Data.Lootmaster`, `Raidplaner.Data.Note`, `Raidplaner.Data.maxplayers`, `Raidplaner.Data.date`, `Raidplaner.Data.Minimum`, `Raidplaner.raid.restriction`, `Raidplaner.Data.date.picker`, `Raidplaner.Data.date.picker.time`, `Raidplaner.data.date.open`, `raidplaner.raid.raiders.visibility`, `Discord.bot.threads`, `Guild.Members` (Filter, Rollen, Verfügbarkeit), `Guild.allowed_thread_channels`, `Guild.channel_validation`

### 6.2 Live-Anzeige (beim DatePicker)

| Element | Beschreibung |
|--------|--------------|
| Mindestbesetzung / Teilnehmerzahl | Live-Aktualisierung: Erfüllung Mindestbesetzung und aktuelle Teilnehmerzahl beim Ändern von Datum/Zeit oder Anmeldungen |

**Verwendete Funktionen:** `Raidplaner.availible`

---

## 7. Raidteilnahme (Member)

Anmelden, Abmelden, Status ändern, Liste der Teilnehmer. Erfordert **RaidFlow-Raider** (ggf. **Raidflowgroup-<Group>**).

### 7.1 Raid-Detail (Member-Ansicht)

| Element | Beschreibung |
|--------|--------------|
| Anmeldung | Anmelden mit Typ: normal / unsicher / Reserve; bei „normal“ Option „Reserve erlauben?“; Kommentar für Raidlead |
| Abmelden | Button/Link zum Abmelden vom Raid |
| Liste angemeldeter Spieler | Sichtbar je nach Raid-Einstellung (öffentlich oder nur für Raidleader) |
| Status ändern | Eigenen Anmeldestatus ändern (z. B. normal ↔ Reserve, „Reserve erlauben?“) |
| Discord-Status | Hinweis/Link: „Mein Status:“ im zugehörigen Discord-Thread |
| **Link: Raid im Browser** | Stabile URL zum direkten Aufruf dieser Raid-Detail-Seite (z. B. zum Teilen). Berechtigungsprüfung bei jedem Aufruf – keine Umgehung. Siehe Abschnitt **URL-Struktur (Raid)**. |
| **Link: Raid-Teilnahme** | Stabile URL zum direkten Aufruf der Raid-Teilnahme (Anmelden/Abmelden/Status). Siehe Abschnitt **URL-Struktur (Raid)**. |

**Verwendete Funktionen:** `Raid.join`, `raid.join.type`, `raid.join.type.allowreserve`, `Raid.note`, `raid.data.date.open`, `raid.leave`, `raid.raiders.visibility`, `raid.join.allowreserve`, `Discord.member.raid.status`, `Discord.bot.threads.update`, `Raid.restriction`, `Raid.url.view`, `Raid.url.signup`

### 7.2 Discord-Raid-Thread (Inhalt und Links)

Der **Discord-Thread** zu einem Raid wird vom Bot gepflegt und soll **minimalistisch** sein. Inhalt der Thread-Nachricht:

| Inhalt | Beschreibung |
|--------|--------------|
| Dungeon | Name des Raid-Dungeons |
| Name | Raid-Name (Alternativname) |
| Anmeldungen | Format **Anmeldungen / max_players** (z. B. 12 / 25) |
| Fehlende Mindestbesetzung | Welche Rollen/Specs noch fehlen (z. B. Tank: -1, Fire Mage: -1) |
| Mein Status | Für den lesenden User: eigener Anmeldestatus (wenn berechtigt und ggf. angemeldet) |
| Link „Raid im Browser“ | URL zur Webapp: Raid-Detail direkt im Browser öffnen |
| Link „Raid-Teilnahme im Browser“ | URL zur Webapp: Raid-Teilnahme (Anmelden/Abmelden) direkt öffnen |

**Sichtbarkeit:** Die Webapp zeigt nur Raids, für die der User die nötigen Rollen hat (RaidFlow-Raider; bei Raidgruppen-Einschränkung Raidflowgroup-&lt;Name&gt;). Die **Aufrufe über die URLs** erfolgen **direkt über die URL** – die **Berechtigungsprüfung wird nicht umgangen**: Bei jedem Seitenaufruf prüft die Webapp Login und Rollen; bei fehlender Berechtigung: Redirect (z. B. Login/Dashboard) oder Fehlerseite.

**Verwendete Funktionen:** `Discord.bot.threads.content`, `Discord.member.raid.status`, `Raid.url.view`, `Raid.url.signup`, `Raid.restriction`

### 7.3 URL-Struktur (Raid – direkter Aufruf, mit Berechtigungsprüfung)

Damit ein Raid und die Raid-Teilnahme **direkt per URL** aufrufbar sind (z. B. aus dem Discord-Thread oder zum Teilen), werden **stabile URLs** verwendet. Die Berechtigungsprüfung erfolgt **bei jedem Aufruf** (Session/Login, RaidFlow-Raider, ggf. Raidflowgroup); die URL **darf die Prüfung nicht umgehen**.

| Ziel | URL-Beispiel (konzeptionell) | Prüfung beim Laden |
|------|------------------------------|---------------------|
| Raid ansehen (Detail) | `/{locale}/guild/{guildId}/raid/{raidId}` oder `/{locale}/raid/{raidId}` | User eingeloggt; User hat RaidFlow-Raider (und ggf. Raidflowgroup bei Einschränkung); sonst Redirect/Fehlerseite |
| Raid-Teilnahme (Anmelden/Abmelden) | `/{locale}/guild/{guildId}/raid/{raidId}/signup` oder `/{locale}/raid/{raidId}/signup` | Wie oben |

Implementierung: Beim Rendern der Route (z. B. in Next.js App Router) zuerst Session prüfen, dann Raid laden, dann Rollen des Users für die Gilde des Raids prüfen; bei Fehlern Redirect zu Login oder „Kein Zugriff“-Seite.

---

## 8. Raidplaner (Bearbeiten)

Grunddaten, Anmeldungsliste, Gesetzte setzen, Raid setzen (Status „fertig“). Erfordert **RaidFlow-Raidleader**.

### 8.1 Raid bearbeiten

| Element | Beschreibung |
|--------|--------------|
| Grunddaten ändern | Dungeon, Name, Notiz, Max Teilnehmer, „Anmeldung bis“, Sichtbarkeit etc. bearbeiten |
| Raidleader / Lootmaster | Auswahl aus Pool der (gesetzten) Spieler |
| Termin | Termin verschieben (mit Hinweis: alle Anmeldungen werden zurückgesetzt); Termin absagen |
| Anmeldungsliste | Spalten: normal, unsicher, reserve; gruppiert nach Rolle; Anzahl bisheriger Teilnahmen an diesem Dungeon; Hinweis wenn Spieler Notiz hinterlegt hat; Anzeige der Notiz bei Mouseover |
| Alle Notizen einblenden | Funktion zum Einblenden aller Spieler-Notizen |
| Gesetzte Spieler | Angemeldete Spieler auf „Gesetzt“ setzen; Spieler aus Gildenpool manuell hinzufügen; Aktualisierung Mindestanforderungen |
| Prüfung 2 Gruppen | Anzeige/Hinweis ob genug Anmeldungen für 2 Gruppen (2× Max, 2× Min Rollen, 2× Min Specs) |
| Raid setzen | Button: Status „fertig“; Liste gesetzter Spieler veröffentlichen (wenn Raidoption nicht öffentlich); Spieler über Discord informieren; Discord-Thread aktualisieren |

**Verwendete Funktionen:** `raid.data`, `Raidplaner.Data.lead.raider.select`, `Raidplaner.Data.raider.select`, `raid.data.date.new`, `raid.status`, `raid.members.list`, Spieler „Gesetzt“ setzen, aus Pool hinzufügen, Prüfung „2 Gruppen möglich“, Raid setzen (Status fertig, Liste veröffentlichen, Discord-Benachrichtigung, `Discord.bot.threads.update`)

---

## 9. Raidplaner (Abschließen)

Zähler je Spieler (0–1), Spieler hinzufügen, Raid abschließen (Status „Abgeschlossen“). Erfordert **RaidFlow-Raidleader**.

### 9.1 Raid abschließen

| Element | Beschreibung |
|--------|--------------|
| Ansicht | Wie „Raid bearbeiten“, aber nur gesetzte Spieler bearbeitbar |
| Zähler je Spieler | Eingabefeld Teilnahmeanteil 0–1 (dezimal, z. B. 0,5 oder 0,8); Standard 1 |
| Spieler hinzufügen | Möglichkeit, Spieler aus dem Gildenpool hinzuzufügen, die nicht angemeldet waren |
| Button „Abschließen“ | Setzt Status „Abgeschlossen“; schreibt allen (gesetzten) Spielern den Zähler für Dungeon/Gilde gut |

**Verwendete Funktionen:** Abschließen-Logik (Zähler speichern, Status „Abgeschlossen“, RaidParticipationStats / Zähler gutschreiben)

---

## 10. Admin (Application-Admin)

Gilden löschen, Whitelist/Blacklist, Admins verwalten. Nur für Application-Admins (Owner nicht entfernbar).

| Element | Beschreibung |
|--------|--------------|
| Gilden verwalten | Gilden löschen (inkl. zugehörige Raids, Anmeldungen, Rollen-Daten) |
| Whitelist / Blacklist | Whitelist oder Blacklist aktivieren: nur erlaubte Server nutzen RaidFlow bzw. bestimmte Server aussperren |
| Admins verwalten | Weitere Admins ernennen oder entfernen (über Discord-ID); Owner (eine feste Discord-ID) kann nicht entfernt werden |

**Verwendete Funktionen:** `Admin.guilds.delete`, `Admin.whitelist_blacklist`, `Admin.admins.manage`, `Rights.admin`

---

## Querschnitt: Seite × Funktion

| Seite / View | Funktionen (IDs) |
|--------------|------------------|
| Landing Page | Discord.integration, Discord.bot.invite |
| Dashboard (Topbar, Burger, Gilden/Raids) | Auth.logout, Rights.guildmaster, Rights.admin, Raid.restriction, Rights.raidleader, Rights.raider |
| Login / Discord OAuth | Discord.integration |
| Discord Bot einladen / Gilde anlegen | Discord.bot.invite |
| Profil | OwnProfile.Theme, OwnProfile.Raidtimes, OwnProfile.Raidtimes.timepreferences, OwnProfile.Raidtimes.weekpreferences, OwnProfile.Chars, OwnProfile.Raidstatistik, OwnProfile.Loottable |
| Gildenverwaltung | Guild.groups, Guild.members, Guild.members.groups, Discord.Guild.additionalgroups, Discord.bot.channels.read, Guild.allowed_thread_channels, Guild.channel_validation |
| Neuer Raid | Raidplaner.New, Raidplaner.Data (+ Unterfelder), Raidplaner.Data.Minimum, Raidplaner.raid.restriction, Raidplaner.Data.date.picker, Raidplaner.data.date.open, raidplaner.raid.raiders.visibility, Discord.bot.threads, Guild.Members, Guild.allowed_thread_channels, Guild.channel_validation |
| Live-Anzeige DatePicker | Raidplaner.availible |
| Raid-Detail (Member) | Raid.restriction, Raid.join, raid.join.type, raid.join.type.allowreserve, Raid.note, raid.data.date.open, raid.leave, raid.raiders.visibility, raid.join.allowreserve, Discord.member.raid.status, Discord.bot.threads.update, Raid.url.view, Raid.url.signup |
| Discord-Raid-Thread (Inhalt) | Discord.bot.threads.content, Discord.member.raid.status, Raid.url.view, Raid.url.signup, Raid.restriction |
| URL-Struktur Raid/Teilnahme | Raid.url.view, Raid.url.signup (Berechtigungsprüfung bei jedem Aufruf) |
| Raid bearbeiten | raid.data, Raidplaner.Data.lead.raider.select, Raidplaner.Data.raider.select, raid.data.date.new, raid.status, raid.members.list, Gesetzt setzen / Pool hinzufügen, 2-Gruppen-Prüfung, Raid setzen |
| Raid abschließen | Zähler 0–1, Spieler hinzufügen, Abschließen (Status, Zähler gutschreiben) |
| Admin | Admin.guilds.delete, Admin.whitelist_blacklist, Admin.admins.manage, Rights.admin |

---

## Designvorgaben (Entwicklung)

Vorgaben für Position, Größe, Darstellung und Typografie zur einheitlichen Umsetzung.

### Light- und Dark-Modus (Kontrast)

- **Standard:** Helles, freundliches Design mit guten Kontrasten (Hintergrund, Text, Bedienelemente). Primärfarben und Fließtext sind gut lesbar.
- **Dark-Modus:** Optional umschaltbar; dunkle Hintergründe mit gutem Kontrast zu Bedienelementen und Texten. Buttons, Links und Eingabefelder bleiben klar erkennbar.
- **Umschaltung:** Die Auswahl des Modus (Hell/Dunkel) erfolgt **im User-Profil** („Mein Profil“ → Anzeige-Modus) und wird **per Cookie** (`raidflow-theme`) sowie im **User-Profil** (rf_user.theme_preference) gespeichert. Beim Wechsel wird sofort der gewählte Modus angewendet; die Einstellung bleibt über Sitzungen hinweg erhalten.

### Position

- **Landing Page:** App-Name zentral oben; Login-Button zentral unterhalb; Bot-Button leicht dezentral (z. B. darunter, leicht versetzt); Footer fix unten, schmal.
- **Nach Login:** Topbar fix oben (RaidFlow links, Burger Mitte/links, Logout rechts); Inhaltsbereich zentral; Burger-Menü als Overlay/Drawer von links.
- **Buttons/Actions:** Primär-Aktion (z. B. „Login“, „Speichern“) prominent platzieren; Sekundär (z. B. „Abbrechen“, „Discord Bot einladen“) optisch zurückgenommen.

### Größe

- **Buttons:** Mindesthöhe für Touch (z. B. 44 px); Primär-Button größer/breiter als Sekundär.
- **Footer:** Geringe Höhe (z. B. 32–40 px); Topbar einheitliche Höhe (z. B. 48–56 px).
- **Tabellen/Listen:** Mindestzeilenhöhe für Lesbarkeit; DatePicker-Zellen ausreichend groß für Farbindikatoren (grün/orange).

### Darstellung

- **Primär-Button:** Klar hervorgehoben (z. B. Vollfarbe, guter Kontrast).
- **Sekundär-Button:** Outline oder dezent (z. B. „Discord Bot einladen“).
- **Links (Impressum, Disclaimer):** Als Textlinks, keine großen Buttons.
- **Status/Farben:** Grün = wahrscheinlich (Verfügbarkeit), Orange = eventuell; konsistent in DatePicker und ggf. Raid-Status.

### Typografie

- **App-Name „RaidFlow“:** Größere Schrift, semibold/bold.
- **Überschriften (Seiten/Bereiche):** Eine Stufe größer als Fließtext, bold.
- **Fließtext:** Lesbare Grundschriftgröße (z. B. 16 px Basis).
- **Buttons:** Kurze Labels, Schriftgröße wie Body oder leicht hervorgehoben.

### Weitere

- **Formulare:** Klare Label-Feld-Zuordnung; Pflichtfelder markieren; Fehlermeldungen nah am Feld.
- **Tabellen:** Header erkennbar; bei langen Listen ggf. Pagination oder virtuelles Scrollen.
