# RaidFlow – Funktionen

Alle für RaidFlow benötigten Funktionen, gruppiert nach Domänen. Jede Funktion enthält ID, Kurzbeschreibung und Referenz auf die zugehörigen UI-Elemente (Seite + Element).

---

## Rechteverwaltung (Discord-Rollen)

| ID | Beschreibung | Ref UI |
|----|--------------|--------|
| `Rights.guildmaster` | Gildenverwaltung nur für User mit Discord-Rolle **RaidFlow-Gildenmeister** (Raidflow-Gildenleiter) | Burger-Menü (Gildenverwaltung sichtbar), Gildenverwaltung |
| `Rights.raidleader` | Alle Raidplaner-Funktionen (Neuer Raid, Bearbeiten, Setzen, Abschließen) erfordern **RaidFlow-Raidleader** auf dem jeweiligen Server | Neuer Raid, Raid bearbeiten, Raid abschließen, Dashboard (Steuerungselemente) |
| `Rights.raider` | Anzeige der Raids und Teilnahme (Anmelden/Abmelden) erfordern **RaidFlow-Raider**; bei Raidgruppen-Einschränkung zusätzlich **Raidflowgroup-<Group>** | Dashboard (Raid-Liste), Raid-Detail (Member) |
| `Rights.admin` | Admin-Menü nur für Application-Admins (Discord-ID in AppAdmin oder Owner); Admins sehen immer alles | Burger-Menü (Admin), Admin-Seite |

---

## Auth / Landing

| ID | Beschreibung | Ref UI |
|----|--------------|--------|
| `Discord.integration` | Discord OAuth Login; Berechtigungssteuerung über Discord-Rollen. OAuth-Scopes minimal (nur für User-Identifikation nötig); **keine E-Mail, keinen Anzeigenamen in der App speichern**; siehe project.md / db_schema Datenminimierung. | Landing Page (zentraler Login-Button), Auth |
| `Discord.bot.invite` | Bot auf Discord-Server einladen (Einladungslink) | Landing Page (dezentraler Button), Burger „Discord Bot einladen“, Gilde anlegen |
| `Discord.bot.invite.server_rights` | Bot-Einladung nur für Server, auf denen der User **Gründer (Owner)** oder **Manager** ist. Discord-Standard: Prüfung auf `owner_id` ODER Berechtigung **ADMINISTRATOR** (0x8) ODER **MANAGE_GUILD** (0x20, „Server verwalten“). Gleiche Prüfung im Bot für `/raidflow setup` und `/raidflow group`. Siehe [DiscordBot.md](DiscordBot.md) Abschnitt 0. | Einladungslink/Auswahl nur für berechtigte Server; Bot lehnt Setup/Group ab, wenn User nicht Owner/Administrator/ManageGuild hat |
| `Auth.logout` | User abmelden | Topbar (Logout-Button) |

---

## Discord (Bot, Threads, Channels)

| ID | Beschreibung | Ref UI |
|----|--------------|--------|
| `Discord.Guild.additionalgroups` | Gruppenzuteilung über Discord-Rollen (Raidflowgroup-<Name>) mittels Bot | Gildenprofil, Gruppenzuteilung |
| `Discord.bot.threads` | Discord-Thread für einen Raid anlegen (im ausgewählten erlaubten Channel) | Neuer Raid, Option Discord-Thread, Channel-Dropdown |
| `Discord.bot.threads.update` | Discord-Thread aktualisieren (z. B. nach Anmeldungen, Raid setzen, Abschließen) | Raid bearbeiten (Raid setzen), Raid-Detail Member |
| `Discord.bot.threads.content` | Thread-Inhalt minimalistisch: Dungeon, Name, Anmeldungen (Anmeldungen / max_players), fehlende Mindestbesetzung; „Mein Status“ für den User; nur Raids sichtbar, für die der User Rollen hat (Restrictions); Links siehe Raid.url.view, Raid.url.signup | Discord-Thread (Bot-Nachricht) |
| `Discord.member.raid.status` | „Mein Status:“ im Discord-Thread für den Member sichtbar / verlinkt | Raid-Detail (Member), Hinweis Discord-Status, Thread-Inhalt |
| `Raid.url.view` | Raid direkt im Browser über stabile URL aufrufbar (z. B. /guild/&lt;guildId&gt;/raid/&lt;raidId&gt;). Berechtigungsprüfung bei jedem Aufruf (Login, RaidFlow-Raider, ggf. Raidflowgroup); keine Umgehung – bei fehlender Berechtigung Redirect/Fehlerseite. | Thread-Link, Raid-Detail, E-Mails/Sharing |
| `Raid.url.signup` | Raid-Teilnahme (Anmelden/Abmelden/Status) direkt im Browser über stabile URL aufrufbar (z. B. …/raid/&lt;raidId&gt;/signup). Gleiche Berechtigungsprüfung bei jedem Aufruf. | Thread-Link, Raid-Detail |
| (Benachrichtigung) | Spieler über Discord informieren wenn Raid „gesetzt“ wurde | Raid bearbeiten, Aktion „Raid setzen“ |
| `Discord.bot.channels.read` | Bot liest alle Discord-Channels des Servers aus (für Gildenverwaltung) | Gildenverwaltung, Button „Channels lesen“, Dropdown |
| `Guild.allowed_thread_channels` | Erlaubte Channels für Raid-Threads speichern und als Dropdown anbieten | Gildenverwaltung (Channel-Auswahl), Neuer Raid (Channel-Dropdown) |
| `Guild.channel_validation` | Prüfen ob ein gespeicherter Channel noch existiert; nicht mehr existierende aus Auswahl entfernen | Gildenverwaltung, Neuer Raid (beim Laden/Anzeigen) |

---

## Eigenes Profil

| ID | Beschreibung | Ref UI |
|----|--------------|--------|
| `OwnProfile.Theme` | Anzeige-Modus (Hell/Dunkel) wählen; Speicherung im User-Profil (rf_user.theme_preference) und per Cookie (raidflow-theme). | Profil, Anzeige-Modus (Theme) |
| `OwnProfile.Raidtimes` | Präferierte Raidtage und Zeiten pflegen | Profil, Raidzeiten-Block |
| `OwnProfile.Raidtimes.timepreferences` | Unterscheidung „wahrscheinlich“ / „eventuell“ pro Slot | Profil, Raidzeiten-Block |
| `OwnProfile.Raidtimes.weekpreferences` | Fokus Werktage oder Wochenende | Profil, Raidzeiten-Block |
| `OwnProfile.Chars` | Charaktere anlegen, bearbeiten, löschen (Name, Gilde, Spec, Off-Spec) | Profil, Charakterliste |
| `OwnProfile.Raidstatistik` | Übersicht teilgenommene Raids je Dungeon und je Gilde anzeigen | Profil, Raidstatistik |
| `OwnProfile.Loottable` | Loot-Historie je Gilde je Dungeon anzeigen (erhaltener Loot) | Profil, Loottabelle |

---

## Gildenprofil

| ID | Beschreibung | Ref UI |
|----|--------------|--------|
| `Guild.groups` | Raidgruppen definieren (anlegen, bearbeiten, sortieren) | Gildenverwaltung, Raidgruppen |
| `Guild.members` | Übersicht der Chars/Mitglieder in der Gilde | Gildenverwaltung, Mitgliederliste |
| `Guild.members.groups` | Gruppenzuteilung von Mitgliedern zu Raidgruppen in der App | Gildenverwaltung, Gruppenzuteilung |

---

## Raidplaner (Daten / Neuer Raid)

| ID | Beschreibung | Ref UI |
|----|--------------|--------|
| `Raidplaner.New` | Neuen Raid anlegen (Gesamtaktion) | Neuer Raid, Formular |
| `Raidplaner.Data` | Grunddaten des Raids (Dungeon, Name, Lead, Lootmaster, Notiz, max players, Datum, Anmeldung bis, Sichtbarkeit) | Neuer Raid, Bearbeiten (Grunddaten) |
| `Raidplaner.Data.dungeon` | Dungeon auswählen | Neuer Raid, Grunddaten |
| `Raidplaner.Data.altname` | Raid-Name (Alternativname) | Neuer Raid, Grunddaten |
| `Raidplaner.Data.lead` | Raidleader auswählen | Neuer Raid, Bearbeiten (Auswahl Lead) |
| `Raidplaner.Data.Lootmaster` | Lootmaster auswählen | Neuer Raid, Bearbeiten (Auswahl Lootmaster) |
| `Raidplaner.Data.Note` | Raid-Notiz / Bemerkung | Neuer Raid, Bearbeiten (Grunddaten) |
| `Raidplaner.Data.maxplayers` | Max Teilnehmer | Neuer Raid, Bearbeiten (Grunddaten) |
| `Raidplaner.Data.date` | Raidtermin (Datum) | Neuer Raid, Bearbeiten (Termin) |
| `Raidplaner.Data.Minimum` | Mindestbesetzung: Rollen (Tank, Melee, Range, Healer) und Min-Specs | Neuer Raid, Bearbeiten (Mindestbesetzung) |
| `Raidplaner.Data.Minimum.Roles` | Mindestanzahl pro Rolle | Neuer Raid, Mindestbesetzung |
| `Raidplaner.Data.Minimum.Specs` | Mindestanzahl pro Spec (z. B. Min Fire Mage) | Neuer Raid, Mindestbesetzung |
| `Raidplaner.raid.restriction` | Optionale Einschränkung auf Raidgruppe | Neuer Raid, Raidgruppen-Einschränkung |
| `Raidplaner.Data.date.picker` | DatePicker: Zeit horizontal (16–03 Uhr), Member-Pool vertikal mit Filter und Verfügbarkeit (grün/orange) | Neuer Raid, DatePicker |
| `Raidplaner.Data.date.picker.time` | Uhrzeit-Slots im DatePicker (16–03 Uhr) | Neuer Raid, DatePicker |
| `Raidplaner.data.date.open` | „Anmeldung bis“ (Datum/Zeit); nach Ablauf nur Reserve-Anmeldung | Neuer Raid, Bearbeiten (Grunddaten) |
| `Raidplaner.availible` | Live-Aktualisierung: Mindestbesetzung und Teilnehmerzahl beim DatePicker | Neuer Raid, Live-Anzeige DatePicker |
| `Raidplaner.Data.lead.raider.select` | Raidleader aus Pool der (gesetzten) Spieler wählen | Raid bearbeiten, Auswahlfeld Raidleader |
| `Raidplaner.Data.raider.select` | Lootmaster aus Pool der (gesetzten) Spieler wählen | Raid bearbeiten, Auswahlfeld Lootmaster |
| `raidplaner.raid.raiders.visibility` | Liste angemeldeter Spieler: öffentlich oder nur Raidleader | Neuer Raid, Bearbeiten (Sichtbarkeit Anmeldungen) |

---

## Raidteilnahme (Member)

| ID | Beschreibung | Ref UI |
|----|--------------|--------|
| `Raid.restriction` | Nur Gildenmember mit Rechten sehen Gilde und Raids | Navigation, Raidliste, Raid-Detail |
| `Raid.join` | Zum Raid anmelden | Raid-Detail (Member), Anmeldung |
| `raid.join.type` | Anmeldetyp: normal / unsicher / Reserve | Raid-Detail, Anmeldung |
| `raid.join.type.allowreserve` | Bei „normal“: „Reserve erlauben?“; Status später ändern | Raid-Detail, Anmeldung / Status ändern |
| `Raid.note` | Kommentar für Raidlead (z. B. „kann erst 15 Min später“) | Raid-Detail, Anmeldung (Kommentar) |
| `raid.data.date.open` | Nach „Anmeldung bis“ nur noch Reserve-Anmeldung möglich | Raid-Detail, Anmeldung |
| `raid.leave` | Vom Raid abmelden | Raid-Detail, Abmelden |
| `raid.raiders.visibility` | Übersicht angemeldeter Spieler anzeigen (je nach Raid-Einstellung) | Raid-Detail, Liste angemeldeter Spieler |

---

## Raidplaner (Bearbeiten / Abspielen)

| ID | Beschreibung | Ref UI |
|----|--------------|--------|
| `raid.data` | Grunddaten des Raids ändern | Raid bearbeiten, Grunddaten ändern |
| `raid.data.date.new` | Termin verschieben; alle Anmeldungen werden zurückgesetzt | Raid bearbeiten, Termin |
| `raid.status` | Raid-Status ändern (z. B. Termin absagen) | Raid bearbeiten, Termin absagen |
| `raid.members.list` | Übersicht aller Anmeldungen: Filter, Spalten normal/unsicher/Reserve, gruppiert nach Rolle, Teilnahmen Dungeon, Notiz-Hinweis, Notiz bei Mouseover; Funktion „Alle Notizen einblenden“; Gesetzt setzen / Pool hinzufügen | Raid bearbeiten, Anmeldungsliste, Gesetzte Spieler |
| (Notizen einblenden) | Alle Spieler-Notizen auf einmal einblenden | Raid bearbeiten, „Alle Notizen einblenden“ |
| (Gesetzt setzen) | Angemeldete Spieler auf „Gesetzt“ setzen; Mindestanforderungen aktualisieren | Raid bearbeiten, Gesetzte Spieler |
| (Pool hinzufügen) | Spieler aus Gildenpool manuell hinzufügen (nicht angemeldet) | Raid bearbeiten, Raid abschließen |
| (2 Gruppen prüfen) | Prüfen ob genug Anmeldungen für 2 Gruppen (2× Max, 2× Min Rollen, 2× Min Specs) | Raid bearbeiten, Prüfung 2 Gruppen |
| (Raid setzen) | Status „fertig“; Liste gesetzter Spieler veröffentlichen (wenn nicht öffentlich); Discord-Benachrichtigung; Thread aktualisieren | Raid bearbeiten, Button „Raid setzen“ |
| (Abschließen) | Zähler 0–1 (dezimal) je Spieler; Spieler aus Pool hinzufügen; Button „Abschließen“ → Status „Abgeschlossen“, Zähler pro Spieler/Dungeon/Gilde gutschreiben | Raid abschließen, Zähler, Button „Abschließen“ |

---

## Admin (Application-Admin)

| ID | Beschreibung | Ref UI |
|----|--------------|--------|
| `Admin.guilds.delete` | Gilden löschen (inkl. zugehörige Daten: Raids, Anmeldungen, Rollen, erlaubte Channels) | Admin, Gilden verwalten |
| `Admin.whitelist_blacklist` | Whitelist oder Blacklist aktivieren; Server-IDs erlauben oder aussperren | Admin, Whitelist/Blacklist |
| `Admin.admins.manage` | Weitere Admins ernennen oder entfernen (über Discord-ID); Owner (feste Discord-ID in AppConfig) kann nicht entfernt werden | Admin, Admins verwalten |

---

## Audit-Log (Änderungsprotokoll)

Bei folgenden Aktionen muss in **rf_audit_log** protokolliert werden: **Wer** (changed_by_user_id), **was** (Aktion/Feld), **alter Wert**, **neuer Wert**, **wann** (created_at). Siehe [db_schema.md](db_schema.md) Abschnitt „Audit-Log“.

| ID | Beschreibung | Wann schreiben |
|----|--------------|----------------|
| `Audit.guild_settings` | Jede Änderung an Gildeneinstellungen (rf_guild, rf_raid_group, rf_guild_allowed_channel, …) | Nach Speichern in Gildenverwaltung: pro geändertem Feld eine Zeile; entity_type = `guild_settings`, entity_id = betroffene Tabelle/ID, field_name, old_value, new_value |
| `Audit.raid` | Raid angelegt, geändert, gelöscht | Beim Anlegen: eine Zeile action = `created`, new_value = Snapshot. Bei Bearbeitung: pro geändertem Feld eine Zeile action = `updated`. Beim Löschen: eine Zeile action = `deleted`, old_value = Snapshot |
| `Audit.raid_signup` | Raid-Teilnahme: Anmeldung und Historie aller Statusänderungen | Bei Anmeldung: eine Zeile action = `created`. Bei jeder Änderung (type, set_confirmed, note, …): pro geändertem Feld eine Zeile action = `updated` (Historie pro Spieler/Raid) |

**Ref UI:** Gildenverwaltung (implizit beim Speichern), Neuer Raid / Raid bearbeiten (implizit), Raid-Detail Anmeldung/Status (implizit). Optional: Admin oder Gildenverwaltung kann Logs einsehbar machen (z. B. „Änderungsprotokoll“).

---

## Querschnittstabelle: Funktion → Seite

| Funktion (ID) | Seite(n) |
|---------------|----------|
| Rights.guildmaster, Rights.raidleader, Rights.raider, Rights.admin | Burger, Dashboard, Gildenverwaltung, Raidplaner, Raid-Detail, Admin |
| Discord.integration | Landing Page, Login |
| Discord.bot.invite, Discord.bot.invite.server_rights | Landing Page, Burger, Gilde anlegen (nur Server mit Owner/Manager-Recht) |
| Auth.logout | Topbar |
| Discord.Guild.additionalgroups | Gildenverwaltung |
| Discord.bot.threads, Discord.bot.channels.read, Guild.allowed_thread_channels, Guild.channel_validation | Gildenverwaltung, Neuer Raid |
| Discord.bot.threads.update, Discord.bot.threads.content | Raid bearbeiten, Raid-Detail, Discord-Thread (Bot) |
| Discord.member.raid.status | Raid-Detail, Discord-Thread |
| Raid.url.view, Raid.url.signup | Discord-Thread (Links), Raid-Detail (Teilen), direkter URL-Zugriff (mit Berechtigungsprüfung) |
| OwnProfile.* | Profil |
| Guild.groups, Guild.members, Guild.members.groups | Gildenverwaltung |
| Raidplaner.* (Data, Minimum, restriction, date.picker, availible, raiders.visibility) | Neuer Raid, Raid bearbeiten |
| Raid.restriction, Raid.join, raid.* | Raid-Detail, Dashboard/Raidliste |
| raid.data, raid.status, raid.members.list, Gesetzt/Pool/2 Gruppen/Raid setzen | Raid bearbeiten |
| Abschließen (Zähler, Status, gutschreiben) | Raid abschließen |
| Admin.guilds.delete, Admin.whitelist_blacklist, Admin.admins.manage | Admin |
| Audit.guild_settings, Audit.raid, Audit.raid_signup | Implizit bei Gildenverwaltung, Raid CRUD, Raid-Anmeldung/Status; optional Admin/Gildenverwaltung „Änderungsprotokoll“ |
