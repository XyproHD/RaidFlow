# RaidFlow – Fortschritts-Tracker

Dieses Dokument dient **KI-Agenten** dazu, erledigte Schritte aus der [Roadmap.md](Roadmap.md) zu markieren, und dem **Anwender** (Entwicklungsüberwachung) dazu, jede Phase anhand fester **Akzeptanzkriterien** zu testen und freizugeben.

**Regel:** Eine neue Phase darf erst begonnen werden, wenn die vorherige Phase vom Anwender **freigegeben** wurde (Freigabe-Kästchen angehakt und optional Datum/Name eingetragen).

---

## Verwendung

- **KI-Agenten:** Erledigte Schritte mit `[x]` markieren. Nach Abschluss aller Schritte einer Phase die Phase als „zur Prüfung bereit“ kennzeichnen (z. B. alle Schritte angehakt).
- **Anwender:** Akzeptanzkriterien der Phase durchgehen, testen und prüfen. Sind alle Kriterien erfüllt, **Freigabe Phase** ankreuzen und optional Datum sowie Namen eintragen. Sind Kriterien nicht erfüllt, die Phase nicht freigeben und Rückmeldung geben (z. B. in Kommentar oder Issue).

---

## Phase 0: Projekt-Grundlage

**Referenz:** [Roadmap.md](Roadmap.md) – Phase 0.

### Erledigung durch KI-Agenten

- [x] Schritt 0.1: Next.js-Projekt (App Router, TypeScript) angelegt
- [x] Schritt 0.2: Tailwind CSS integriert und konfiguriert
- [x] Schritt 0.3: Prisma + Supabase eingerichtet, Schema aus db_schema.md umgesetzt, Migrationen ausgeführt
- [x] Schritt 0.4: shadcn/ui initialisiert
- [x] Schritt 0.5: next-intl (oder vergleichbar) vorbereitet – [locale], messages, Middleware, Default Browsersprache
- [x] Schritt 0.6: .env.example mit allen benötigten Variablen dokumentiert

### Akzeptanzkriterien (Anwender prüft)

| Nr. | Kriterium | Prüfung (wie testen) |
|-----|-----------|------------------------|
| 0.1 | Die Anwendung startet ohne Fehler (`npm run dev` bzw. im Projekt definierter Befehl). | Startbefehl ausführen; Browser öffnet Startseite; keine Konsolen-/Build-Fehler. |
| 0.2 | Die Datenbank ist erreichbar; alle Tabellen aus db_schema.md existieren (rf_user, rf_guild, rf_user_guild, rf_raid_group, rf_guild_member, rf_character, rf_raid_time_preference, rf_dungeon, rf_raid, rf_raid_signup, rf_raid_completion, rf_guild_allowed_channel, rf_app_admin, rf_app_config, rf_audit_log). | Prisma Studio oder DB-Tool: Tabellen prüfen; optional `npx prisma db pull` / Schema vergleichen. |
| 0.3 | Es gibt eine (ggf. leere) Startseite oder Root-Route, die angezeigt wird. | Root-URL im Browser aufrufen; Seite wird gerendert. |
| 0.4 | In README oder anderer Doku sind project.md, UI.md, functions.md, db_schema.md als Referenz genannt. | README/Contributing/Doku öffnen; Verweise auf die genannten Dateien vorhanden. |
| 0.5 | .env.example listet Discord Client ID/Secret, Datenbank-URL und ggf. Bot-Token/API-URL; keine echten Secrets in .env.example. | .env.example öffnen; Variablen prüfen; keine Passwörter/Token-Werte. |

### Freigabe Phase 0

- [x] **Phase 0 freigegeben.** Alle Akzeptanzkriterien erfüllt.
- Datum: 070326
- Bestätigt von: Daniel

---

## Phase 1: Auth und Shell

**Referenz:** [Roadmap.md](Roadmap.md) – Phase 1. **Abhängigkeit:** Phase 0 freigegeben.

### Erledigung durch KI-Agenten

- [ ] Schritt 1.1: NextAuth.js mit Discord Provider; minimale Scopes; nur id + discord_id in DB
- [ ] Schritt 1.2: Landing Page (RaidFlow, Login, Bot-Link, Footer Impressum/Disclaimer)
- [ ] Schritt 1.3: Geschütztes Layout – Topbar (RaidFlow, Burger, Logout), Sprachauswahl (rechts, Default Browsersprache)
- [ ] Schritt 1.4: Burger-Menü (Mein Profil, Gildenverwaltung, Discord Bot einladen, Admin) mit Sichtbarkeit nach Rolle
- [ ] Schritt 1.5: Dashboard mit Gildenliste und Raidliste (Platzhalter oder echte Daten)

### Akzeptanzkriterien (Anwender prüft)

| Nr. | Kriterium | Prüfung (wie testen) |
|-----|-----------|------------------------|
| 1.1 | Ohne Login wird die Landing Page angezeigt (zentral „RaidFlow“, zentraler Login-Button, dezentraler Button „Discord-Bot einladen“, Footer mit Impressum, Disclaimer). | Nicht eingeloggt Root aufrufen; alle genannten Elemente sichtbar und klickbar. |
| 1.2 | Klick auf „Login mit Discord“ startet den Discord-OAuth-Flow und leitet auf Discord weiter. | Login-Button klicken; Redirect zu Discord; nach Autorisierung Rückkehr in die App. |
| 1.3 | Nach erfolgreichem Login erscheint die geschützte Ansicht: Topbar mit „RaidFlow“ (links), Burger-Menü, Logout-Button (rechts), Sprachauswahl (rechts, nahe Logout). | Einloggen; Topbar prüfen; Logout und Sprachauswahl sichtbar und nutzbar. |
| 1.4 | Burger-Menü öffnet sich und zeigt mindestens „Mein Profil“, „Discord Bot einladen“; „Gildenverwaltung“ und „Admin“ erscheinen nur, wenn User die entsprechende Rolle/Admin-Recht hat (oder werden ausgeblendet/Platzhalter). | Burger öffnen; Einträge prüfen; mit Test-User ohne Gildenmeister/Admin: Gildenverwaltung/Admin ausgeblendet oder klar gekennzeichnet. |
| 1.5 | Dashboard zeigt einen Bereich „Gilden“ und einen Bereich „Raids“ (auch wenn leer). Nach Logout landet der User wieder auf der Landing Page. | Nach Login Dashboard prüfen; Logout klicken; Landing Page wieder sichtbar. |
| 1.6 | Sprachauswahl ändert die Oberflächensprache; nach Neuladen bleibt die gewählte Sprache erhalten (Cookie/localStorage). Default bei erstem Besuch = Browsersprache (oder Fallback). | Sprachwahl umschalten; Texte wechseln; Seite neu laden; gewählte Sprache bleibt. |
| 1.7 | In der Datenbank wird für den eingeloggten User nur ein Eintrag mit id, discord_id, created_at, updated_at angelegt; keine E-Mail, kein Anzeigename gespeichert (Datenminimierung). | Nach erstem Login in User-Tabelle prüfen: nur die genannten Felder befüllt. |

### Freigabe Phase 1

- [ ] **Phase 1 freigegeben.** Alle Akzeptanzkriterien erfüllt.
- Datum: _______________
- Bestätigt von: _______________

---

## Phase 2: Discord-Bot (Kern)

**Referenz:** [Roadmap.md](Roadmap.md) – Phase 2. **Abhängigkeit:** Phase 0 freigegeben.

### Erledigung durch KI-Agenten

- [ ] Schritt 2.1: Discord-Bot angelegt; Slash-Commands `/raidflow setup`, `/raidflow group` registriert; Bot in Test-Guild eingeladen
- [ ] Schritt 2.2: `/raidflow setup` nur ausführbar für User mit Gründer- oder Manager-Recht (Owner oder ADMINISTRATOR oder MANAGE_GUILD); legt Guild in DB an und erstellt Rollen; Rollen-IDs in Guild gespeichert. Siehe [DiscordBot.md](DiscordBot.md) Abschnitt 0.
- [ ] Schritt 2.3: `/raidflow group <Groupname>` nur mit gleicher Rechteprüfung; erstellt Rolle Raidflowgroup-<Name> auf Discord und RaidGroup in Webapp mit discord_role_id.
- [ ] Schritt 2.4: API/Service liefert für User + Guild-ID die Discord-Rollen des Users.
- [ ] Schritt 2.5: Bot-Einladung in Webapp (Landing + Burger): Einladung nur für Server, auf denen der User Gründer (Owner) oder Manager (ADMINISTRATOR oder MANAGE_GUILD) ist.
- [ ] Schritt 2.6: Bot-Einladungslink für berechtigte Server klickbar und funktionsfähig.

### Akzeptanzkriterien (Anwender prüft)

| Nr. | Kriterium | Prüfung (wie testen) |
|-----|-----------|------------------------|
| 2.1 | In einem Discord-Test-Server erscheinen die Slash-Commands `/raidflow setup` und `/raidflow group` (mit Parameter/Option Groupname). | Discord öffnen; Slash eingeben; beide Befehle sichtbar. |
| 2.2 | Nach Ausführen von `/raidflow setup` (als Owner oder mit Administrator/„Server verwalten“) existiert in der Webapp-DB ein Guild-Eintrag; die drei Rollen existieren auf dem Server; Rollen-IDs in Guild gesetzt. **Ohne** diese Rechte lehnt der Bot den Befehl ab. | Setup als berechtigter User ausführen; DB und Discord prüfen. Mit User ohne Owner/Administrator/ManageGuild: Befehl muss fehlschlagen. |
| 2.3 | Nach Ausführen von `/raidflow group Testgruppe` (als Owner oder mit Administrator/ManageGuild) existieren Rolle auf Discord und RaidGroup in der Webapp. **Ohne** diese Rechte lehnt der Bot den Befehl ab. | Group als berechtigter User ausführen; mit nicht berechtigtem User: Befehl muss fehlschlagen. |
| 2.4 | Die Webapp (oder ein getesteter API-Endpunkt) kann für einen gegebenen User (discord_id) und eine Guild-ID die Liste der Rollen-IDs dieses Users auf diesem Server zurückgeben. | Mit Test-User und Test-Guild API aufrufen oder Funktion in App nutzen; Rollen-Liste plausibel. |
| 2.5 | „Discord Bot einladen“ zeigt nur Server an, auf denen der User Gründer oder Manager (Administrator/„Server verwalten“) ist; Einladung für einen solchen Server funktioniert. | Als User mit und ohne Manager-Recht prüfen; nur berechtigte Server sichtbar; Link fügt Bot korrekt hinzu. |
| 2.6 | Der Einladungslink führt für einen ausgewählten berechtigten Server zu einer gültigen OAuth2-URL, mit der der Bot dem Server hinzugefügt werden kann. | Server wählen; URL prüfen; Bot auf Test-Server hinzufügen. |

### Freigabe Phase 2

- [ ] **Phase 2 freigegeben.** Alle Akzeptanzkriterien erfüllt.
- Datum: _______________
- Bestätigt von: _______________

---

## Phase 3: Gilden, Profil, Rechte

**Referenz:** [Roadmap.md](Roadmap.md) – Phase 3. **Abhängigkeit:** Phase 1 und 2 freigegeben.

### Erledigung durch KI-Agenten

- [ ] Schritt 3.1: User-Gilden-Zuordnung (UserGuild/GuildMember); Dashboard zeigt nur Gilden des Users; Rechte pro Gilde aus Rollen-API
- [ ] Schritt 3.2: Burger-Menü: Gildenverwaltung nur bei RaidFlow-Gildenmeister; Admin nur bei AppAdmin/Owner
- [ ] Schritt 3.3: Seite „Mein Profil“ – Anzeige-Modus (Theme Hell/Dunkel) wählbar, Speicherung Cookie + User-Profil (rf_user.theme_preference); RaidTimePreference CRUD, Character CRUD, Raidstatistik, Loottabelle (Lesen)
- [ ] Schritt 3.4: Rollen- und Spec-Icons integriert (Mapping, Anzeige mit Tooltip/aria-label)
- [ ] Schritt 3.5: Dungeon-Stammdaten (TBC) in DB vorhanden

### Akzeptanzkriterien (Anwender prüft)

| Nr. | Kriterium | Prüfung (wie testen) |
|-----|-----------|------------------------|
| 3.1 | Im Dashboard werden nur Gilden (Server) angezeigt, in denen der eingeloggte User Mitglied ist. | Mit User A (Mitglied in Guild 1) einloggen; nur Guild 1 in Liste; mit User B (nur Guild 2) nur Guild 2. |
| 3.2 | „Gildenverwaltung“ im Burger-Menü erscheint nur, wenn der User auf mindestens einem Server die Rolle RaidFlow-Gildenmeister hat. „Admin“ nur, wenn User in AppAdmin oder Owner. | Mit Gildenmeister-User: Gildenverwaltung sichtbar; mit Normal-User: nicht sichtbar. Mit Admin-User: Admin sichtbar. |
| 3.3 | Unter „Mein Profil“ ist der Anzeige-Modus (Hell/Dunkel) wählbar; die Einstellung wird per Cookie und im User-Profil gespeichert und bleibt nach Reload erhalten. | Profil öffnen; Modus wechseln; Reload; gewählter Modus bleibt; Cookie „raidflow-theme“ bzw. theme_preference in DB (nach Login) gesetzt. |
| 3.4 | Unter „Mein Profil“ können Raidzeiten-Präferenzen (Tage/Zeiten, wahrscheinlich/eventuell, Werktage/Wochenende) angelegt, bearbeitet und gelöscht werden. | Profil öffnen; Raidzeiten anlegen/ändern/löschen; Speichern; nach Reload Daten korrekt. |
| 3.5 | Unter „Mein Profil“ können Charaktere (Name, Gilde, Spec, Off-Spec) angelegt, bearbeitet und gelöscht werden. | Charakter anlegen/bearbeiten/löschen; Daten in DB und Anzeige stimmen überein. |
| 3.6 | Raidstatistik zeigt (je Dungeon, je Gilde) die aggregierten Teilnahmen des Users – auch wenn aktuell 0. Loottabelle zeigt erfasste Loot-Einträge (Lesen). | Profil öffnen; Raidstatistik- und Loot-Bereich prüfen; ggf. nach Phase 8 Testdaten anlegen und Anzeige prüfen. |
| 3.7 | Wo Rollen (Tank, Melee, Range, Healer) oder Specs angezeigt werden, erscheinen Icons mit Tooltip oder aria-label (kein reiner Text ohne Icon). | Profil, Charakterliste, ggf. Mindestbesetzung prüfen; Icons sichtbar; Tooltip oder Accessibility-Label vorhanden. |
| 3.8 | In der Tabelle Dungeon sind TBC-Dungeons (z. B. Karazhan, SSC) vorhanden; beim Anlegen eines Raids (Phase 5) ist ein Dungeon wählbar. | DB prüfen oder später Raid-Anlage: Dungeon-Dropdown befüllt. |

### Freigabe Phase 3

- [ ] **Phase 3 freigegeben.** Alle Akzeptanzkriterien erfüllt.
- Datum: _______________
- Bestätigt von: _______________

---

## Phase 4: Gildenverwaltung

**Referenz:** [Roadmap.md](Roadmap.md) – Phase 4. **Abhängigkeit:** Phase 3 freigegeben.

### Erledigung durch KI-Agenten

- [ ] Schritt 4.1: Seite Gildenverwaltung – nur für RaidFlow-Gildenmeister; Raidgruppen CRUD mit Bot-Anbindung (Rolle anlegen, discord_role_id speichern)
- [ ] Schritt 4.2: Mitgliederliste und Gruppenzuteilung (Raidgruppe pro Member)
- [ ] Schritt 4.3: „Lese Channels“ – Bot liefert Channel-Liste; Gildenmeister wählt erlaubte Thread-Channels; Speicherung in GuildAllowedChannel
- [ ] Schritt 4.4: Channel-Validierung – nicht mehr existierende Channels werden aus GuildAllowedChannel entfernt

### Akzeptanzkriterien (Anwender prüft)

| Nr. | Kriterium | Prüfung (wie testen) |
|-----|-----------|------------------------|
| 4.1 | Nur User mit Rolle RaidFlow-Gildenmeister auf der gewählten Gilde können die Gildenverwaltung öffnen und nutzen. | Mit Raider ohne Gildenmeister: Zugriff verweigert oder Link nicht sichtbar. Mit Gildenmeister: Seite erreichbar. |
| 4.2 | Raidgruppen können angelegt, bearbeitet und gelöscht werden. Beim Anlegen erscheint auf Discord die Rolle „Raidflowgroup-<Name>“; in der Webapp ist RaidGroup mit discord_role_id gespeichert. | Neue Raidgruppe anlegen; Discord prüfen; DB RaidGroup prüfen. |
| 4.3 | Die Mitgliederliste der Gilde wird angezeigt; pro Member kann eine Raidgruppe zugewiesen werden (Speicherung in DB). | Gildenverwaltung öffnen; Mitglieder sichtbar; Gruppenzuteilung ändern und speichern; DB prüfen. |
| 4.4 | „Lese Channels“ liefert eine Liste der Discord-Text-Channels des Servers; Gildenmeister kann Channels auswählen und als „erlaubt für Raid-Threads“ speichern. In der DB sind die gewählten Channels in GuildAllowedChannel gespeichert. | Button klicken; Channel-Liste erscheint; Channels auswählen und speichern; GuildAllowedChannel in DB prüfen. |
| 4.5 | Beim Laden der erlaubten Channels (z. B. in Raidplaner Phase 5) werden nur noch existierende Discord-Channels angezeigt; gelöschte Channels sind aus GuildAllowedChannel entfernt oder werden übersprungen. | Channel auf Discord löschen (oder Mock); erneut „erlaubte Channels“ laden oder Raid anlegen; gelöschter Channel erscheint nicht mehr. |

### Freigabe Phase 4

- [ ] **Phase 4 freigegeben.** Alle Akzeptanzkriterien erfüllt.
- Datum: _______________
- Bestätigt von: _______________

---

## Phase 5: Raid anlegen (Raidplaner)

**Referenz:** [Roadmap.md](Roadmap.md) – Phase 5. **Abhängigkeit:** Phase 3 und 4 freigegeben.

### Erledigung durch KI-Agenten

- [ ] Schritt 5.1: Formular „Neuer Raid“ – alle Grunddaten, Mindestbesetzung, Raidgruppe, Channel für Thread, Checkbox Discord-Thread; Speichern in DB; optional Bot-API Thread-Erstellung
- [ ] Schritt 5.2: Termin (shadcn Calendar) + Zeit-Slots 16–03 Uhr
- [ ] Schritt 5.3: Verfügbarkeits-Grid (Member × Zeit); Farben grün/orange aus RaidTimePreference; Live Mindestbesetzung/Teilnehmer
- [ ] Schritt 5.4: Zugriff nur für RaidFlow-Raidleader

### Akzeptanzkriterien (Anwender prüft)

| Nr. | Kriterium | Prüfung (wie testen) |
|-----|-----------|------------------------|
| 5.1 | Nur User mit Rolle RaidFlow-Raidleader auf der Gilde können „Neuer Raid“ aufrufen und das Formular absenden. | Mit Raider ohne Raidleader: keine Möglichkeit oder Zugriff verweigert. Mit Raidleader: Formular sichtbar und ausfüllbar. |
| 5.2 | Das Formular enthält: Dungeon (aus DB), Name, Raidleader, Lootmaster, Notiz, Max Teilnehmer, Raidtermin (Datum + Uhrzeit), „Anmeldung bis“, Sichtbarkeit (öffentlich/nur Raidleader), Mindestbesetzung (Tank, Melee, Range, Healer + Min-Specs), optionale Raidgruppen-Einschränkung, Channel für Discord-Thread (nur aus GuildAllowedChannel), Checkbox „Discord-Thread anlegen“. | Formular durchgehen; alle Felder vorhanden; Dropdowns befüllt; Speichern legt Raid in DB an. |
| 5.3 | Nach Speichern existiert der Raid in der DB mit Status open (oder draft); bei aktivierter Option wird ein Discord-Thread erstellt und discord_thread_id sowie discord_channel_id am Raid gespeichert. | Raid anlegen und speichern; DB Raid prüfen; optional Discord: Thread im gewählten Channel sichtbar. |
| 5.4 | Das Verfügbarkeits-Grid zeigt Member (Zeilen) und Zeit-Slots 16–03 Uhr (Spalten); Zellen sind grün (wahrscheinlich), orange (eventuell) oder neutral, basierend auf RaidTimePreference. | Raidzeiten im Profil setzen; neuer Raid; Grid prüfen; Farben entsprechen Präferenzen. |
| 5.5 | Beim Ändern von Datum/Zeit oder Auswahl wird die Erfüllung der Mindestbesetzung und die aktuelle Teilnehmerzahl live angezeigt. | Werte im Formular ändern; Anzeige aktualisiert sich. |

### Freigabe Phase 5

- [ ] **Phase 5 freigegeben.** Alle Akzeptanzkriterien erfüllt.
- Datum: _______________
- Bestätigt von: _______________

---

## Phase 6: Raidteilnahme (Member)

**Referenz:** [Roadmap.md](Roadmap.md) – Phase 6. **Abhängigkeit:** Phase 5 freigegeben.

### Erledigung durch KI-Agenten

- [ ] Schritt 6.1: Raid-Detail-Seite für Raider (Zugriff nach Rechten); Raid-Infos, Termin, Dungeon, Mindestbesetzung, Anmeldestand; **stabile URLs** für Raid-Ansicht und Raid-Teilnahme; **Berechtigungsprüfung bei jedem URL-Aufruf** (keine Umgehung)
- [ ] Schritt 6.2: Anmelden (Typ normal/unsicher/Reserve, Reserve erlauben?, Kommentar); nach „Anmeldung bis“ nur Reserve; RaidSignup anlegen; Bot aktualisiert Thread
- [ ] Schritt 6.3: Abmelden und Status ändern; Thread-Update
- [ ] Schritt 6.4: Liste angemeldeter Spieler je nach signup_visibility; Hinweis „Mein Status im Discord-Thread“; Links Raid im Browser / Raid-Teilnahme im Browser
- [ ] Schritt 6.5: **Discord-Thread-Inhalt minimalistisch**: Dungeon, Name, Anmeldungen/max_players, fehlende Mindestbesetzung, „Mein Status“, Link Raid im Browser, Link Raid-Teilnahme (Bot-Update bei Änderungen)

### Akzeptanzkriterien (Anwender prüft)

| Nr. | Kriterium | Prüfung (wie testen) |
|-----|-----------|------------------------|
| 6.1 | User mit RaidFlow-Raider (und ggf. Raidflowgroup bei Einschränkung) können die Raid-Detail-Seite öffnen und sehen Raid-Infos, Termin, Dungeon, Mindestbesetzung, Anmeldestand. **Raid und Raid-Teilnahme sind per URL direkt aufrufbar; bei Aufruf ohne Berechtigung erfolgt Redirect/Fehlerseite (keine Umgehung).** | Als Raider Raid aus Dashboard öffnen; alle Infos sichtbar. URL kopieren und in neuem Tab/inkognito öffnen: mit Login und Rechten Zugriff; ohne Rechte Redirect/Fehlerseite. |
| 6.2 | Anmelden mit Typ (normal, unsicher, reserve), bei „normal“ Option „Reserve erlauben?“; Kommentar optional. Nach Speichern existiert RaidSignup in DB; Discord-Thread zeigt aktualisierte Teilnehmerliste. | Anmeldung durchführen; DB RaidSignup prüfen; Discord-Thread prüfen. |
| 6.3 | Nach Ablauf von „Anmeldung bis“ ist nur noch Anmeldung als „Reserve“ möglich (normale Anmeldung deaktiviert oder ausgeblendet). | Systemzeit/Datum anpassen oder Raid mit vergangener „Anmeldung bis“; nur Reserve wählbar. |
| 6.4 | Abmelden entfernt die Anmeldung (RaidSignup gelöscht oder deaktiviert); Thread wird aktualisiert. Bestehende Anmeldung kann bearbeitet werden (Typ, Reserve erlauben?). | Anmelden, dann Abmelden; Eintrag in DB weg; Thread aktualisiert. Erneut anmelden, dann Typ ändern; Speichern; DB und Thread aktuell. |
| 6.5 | Wenn Raid.signup_visibility = public, sehen alle Raider die Liste der angemeldeten Spieler; sonst nur Raidleader (Phase 7). Hinweis/Link „Mein Status im Discord-Thread“ vorhanden. **Links „Raid im Browser“ und „Raid-Teilnahme im Browser“ in der Webapp und im Discord-Thread führen zu den richtigen Seiten; Aufruf unterliegt Berechtigungsprüfung.** | Raid mit öffentlicher Sichtbarkeit: Liste sichtbar. Links in Thread und Webapp klicken; Zielseite korrekt; ohne Rechte Redirect/Fehlerseite. |
| 6.6 | **Discord-Thread** zeigt minimalistisch: Dungeon, Name, Anmeldungen/max_players, fehlende Mindestbesetzung, „Mein Status“ (für berechtigte User), Link Raid im Browser, Link Raid-Teilnahme. Thread wird bei Anmeldungen/Änderungen aktualisiert. | Thread im Discord prüfen; Inhalt wie beschrieben; nach Anmeldung/Update Thread-Inhalt aktuell. |

### Freigabe Phase 6

- [ ] **Phase 6 freigegeben.** Alle Akzeptanzkriterien erfüllt.
- Datum: _______________
- Bestätigt von: _______________

---

## Phase 7: Raid bearbeiten und setzen

**Referenz:** [Roadmap.md](Roadmap.md) – Phase 7. **Abhängigkeit:** Phase 5 und 6 freigegeben.

### Erledigung durch KI-Agenten

- [ ] Schritt 7.1: Raid bearbeiten – Grunddaten, Raidleader/Lootmaster aus Pool
- [ ] Schritt 7.2: Termin ändern (Hinweis Anmeldungen zurückgesetzt); Raid absagen (cancelled)
- [ ] Schritt 7.3: Anmeldungsliste mit Filter, Notizen, Rollen/Specs als Icons; „Alle Notizen einblenden“
- [ ] Schritt 7.4: Gesetzt setzen; Spieler aus Pool hinzufügen; Live Mindestbesetzung
- [ ] Schritt 7.5: Prüfung „2 Gruppen möglich“ angezeigt
- [ ] Schritt 7.6: Raid setzen (Status locked); Liste veröffentlichen falls raid_leader_only; Bot Benachrichtigung + Thread-Update

### Akzeptanzkriterien (Anwender prüft)

| Nr. | Kriterium | Prüfung (wie testen) |
|-----|-----------|------------------------|
| 7.1 | Nur Raidleader der Gilde können „Raid bearbeiten“ öffnen. Grunddaten sind änderbar; Raidleader und Lootmaster können aus Pool der (gesetzten) Spieler gewählt werden. | Als Raidleader Raid bearbeiten; Felder ändern und speichern; Raidleader/Lootmaster aus Dropdown wählen. |
| 7.2 | Beim Ändern des Termins erscheint ein Hinweis, dass alle Anmeldungen zurückgesetzt werden; nach Bestätigung sind Anmeldungen gelöscht/zurückgesetzt. „Raid absagen“ setzt Status auf cancelled. | Termin ändern; Hinweis prüfen; bestätigen; RaidSignups in DB prüfen (leer). Raid absagen; Status = cancelled. |
| 7.3 | Die Anmeldungsliste zeigt Spalten/Filter nach normal/unsicher/Reserve, gruppiert nach Rolle, Anzahl Teilnahmen an diesem Dungeon, Notiz-Hinweis mit Tooltip/Mouseover. Aktion „Alle Notizen einblenden“ zeigt alle Notizen. Rollen/Specs als Icons. | Liste prüfen; Notiz bei Spieler eintragen; Tooltip und „Alle Notizen“ prüfen; Icons sichtbar. |
| 7.4 | Spieler können auf „Gesetzt“ gesetzt werden (set_confirmed = true); weitere Spieler aus Gildenpool können hinzugefügt werden (ohne vorherige Anmeldung). Die Anzeige der Mindestbesetzung aktualisiert sich. | Einzelne Spieler „Gesetzt“ setzen; Spieler aus Pool hinzufügen; Mindestbesetzung prüfen. |
| 7.5 | Die Prüfung „2 Gruppen möglich“ zeigt an, ob 2× max_players, 2× Mindestbesetzung Rollen und 2× Mindestbesetzung Specs durch aktuelle Anmeldungen/Gesetzte abgedeckt sind. | Verschiedene Anmeldestände testen; Hinweis erscheint und ist plausibel. |
| 7.6 | „Raid setzen“ setzt Status auf locked. Wenn signup_visibility = raid_leader_only, wird die Liste der gesetzten Spieler danach für alle sichtbar. Bot sendet Benachrichtigung; Discord-Thread wird aktualisiert. | Raid setzen ausführen; Status in DB = locked; als Raider Raid öffnen: gesetzte Liste sichtbar (wenn vorher nur Raidleader). Discord: Benachrichtigung und Thread-Inhalt prüfen. |

### Freigabe Phase 7

- [ ] **Phase 7 freigegeben.** Alle Akzeptanzkriterien erfüllt.
- Datum: _______________
- Bestätigt von: _______________

---

## Phase 8: Raid abschließen

**Referenz:** [Roadmap.md](Roadmap.md) – Phase 8. **Abhängigkeit:** Phase 7 freigegeben.

### Erledigung durch KI-Agenten

- [ ] Schritt 8.1: Seite „Raid abschließen“ – nur für locked Raids und Raidleader; nur gesetzte Spieler bearbeitbar; Teilnahmeanteil 0–1 je Spieler; Spieler aus Pool hinzufügen
- [ ] Schritt 8.2: Button „Abschließen“ – Status completed; RaidCompletion anlegen; RaidParticipationStats aktualisieren; Bot Thread-Update
- [ ] Schritt 8.3: RaidParticipationStats korrekt; in „Mein Profil“ Raidstatistik aktualisiert

### Akzeptanzkriterien (Anwender prüft)

| Nr. | Kriterium | Prüfung (wie testen) |
|-----|-----------|------------------------|
| 8.1 | Nur für Raids mit Status locked und nur für Raidleader ist „Raid abschließen“ / Abschließen-Ansicht erreichbar. Pro gesetztem Spieler ist ein Eingabefeld für Teilnahmeanteil (0–1, dezimal, Default 1) vorhanden; weitere Spieler können aus Pool hinzugefügt werden. | Als Raidleader gesetzten Raid öffnen; Abschließen-View; Zähler je Spieler eingeben (z. B. 0,5); weiteren Spieler hinzufügen. |
| 8.2 | Nach Klick auf „Abschließen“ wechselt der Raid-Status auf completed. In der DB existieren RaidCompletion-Einträge für alle erfassten Spieler mit korrektem participation_counter. | Abschließen klicken; Raid.status = completed; RaidCompletion-Einträge in DB prüfen. |
| 8.3 | Die aggregierte Raidstatistik (RaidParticipationStats bzw. Anzeige in „Mein Profil“) zeigt für die betroffenen User/Gilden/Dungeons die aktualisierten Teilnahme-Summen. | Als User, der im abgeschlossenen Raid war, Profil öffnen; Raidstatistik für den Dungeon/die Gilde prüfen; Summe stimmt. |
| 8.4 | Der Discord-Thread des Raids wird vom Bot als „abgeschlossen“ bzw. mit Endstand aktualisiert. | Discord-Thread nach Abschluss prüfen. |

### Freigabe Phase 8

- [ ] **Phase 8 freigegeben.** Alle Akzeptanzkriterien erfüllt.
- Datum: _______________
- Bestätigt von: _______________

---

## Phase 9: Admin

**Referenz:** [Roadmap.md](Roadmap.md) – Phase 9. **Abhängigkeit:** Phase 1 und 2 freigegeben.

### Erledigung durch KI-Agenten

- [ ] Schritt 9.1: AppConfig (Owner-Discord-ID) und AppAdmin genutzt; Admin-Menü nur für Admins/Owner sichtbar
- [ ] Schritt 9.2: Admin-Seite – Gilden löschen (inkl. abhängiger Daten); Whitelist/Blacklist (nur eine aktiv); Server-IDs pflegen; Zugriff auf Gilden/Raids entsprechend filtern
- [ ] Schritt 9.3: Admins verwalten – Discord-IDs hinzufügen/entfernen; Owner nicht entfernbar

### Akzeptanzkriterien (Anwender prüft)

| Nr. | Kriterium | Prüfung (wie testen) |
|-----|-----------|------------------------|
| 9.1 | Nur User, deren discord_id in AppAdmin steht oder mit Owner (AppConfig) übereinstimmt, sehen den Menüpunkt „Admin“ und können die Admin-Seite aufrufen. | Als Normal-User: Admin nicht sichtbar. Als eingetragener Admin oder Owner: Admin sichtbar und erreichbar. |
| 9.2 | Eine Gilde kann gelöscht werden; dabei werden zugehörige Raids, RaidSignups, RaidCompletions, RaidGroups, GuildAllowedChannel und UserGuild/GuildMember-Einträge für diese Gilde bereinigt. | Test-Gilde anlegen; Admin löscht Gilde; DB prüfen: Guild und alle abhängigen Daten für diese Gilde entfernt. |
| 9.3 | Whitelist kann aktiviert werden; Liste von discord_guild_id pflegen. Wenn aktiv, werden nur Gilden aus dieser Liste in der App berücksichtigt (Dashboard, Zugriff). Blacklist kann aktiviert werden; Liste von Server-IDs; wenn aktiv, sind diese Server ausgeschlossen. Nur eine von Whitelist/Blacklist ist gleichzeitig aktiv. | Whitelist aktivieren; eine Guild-ID eintragen; nur diese Gilde erscheint für betroffene User. Blacklist testen: eingetragener Server wird ausgeblendet. |
| 9.4 | Neue Admins können per Discord-ID hinzugefügt werden; bestehende Admins (nicht Owner) können entfernt werden. Die Owner-Discord-ID aus AppConfig kann nicht entfernt werden (nicht in Admin-Liste löschbar oder gesondert geschützt). | Admin hinzufügen; als dieser User einloggen: Admin sichtbar. Admin entfernen; User hat keinen Admin-Zugriff mehr. Owner-Entfernung versuchen: nicht möglich. |

### Freigabe Phase 9

- [ ] **Phase 9 freigegeben.** Alle Akzeptanzkriterien erfüllt.
- Datum: _______________
- Bestätigt von: _______________

---

## Phase 10: Feinschliff (i18n, Icons, Polish)

**Referenz:** [Roadmap.md](Roadmap.md) – Phase 10. **Abhängigkeit:** Phasen 3–9 freigegeben.

### Erledigung durch KI-Agenten

- [ ] Schritt 10.1: Alle UI-Texte in Übersetzungsdateien; Komponenten mit useTranslations/getTranslations; Datums-/Zahlenformate nach Locale
- [ ] Schritt 10.2: Rollen/Spec-Icons überall konsistent; zentrales Mapping; Tooltip/aria-label
- [ ] Schritt 10.3: Designvorgaben (UI.md) für alle relevanten Seiten geprüft und umgesetzt; Mobile First, Touch, Kontrast
- [ ] Schritt 10.4: Impressum und Disclaimer (Seiten oder Links) im Footer
- [ ] Schritt 10.5: Datenminimierung bestätigt (kein E-Mail/Anzeigename; Bot/Webapp nur nötige IDs)

### Akzeptanzkriterien (Anwender prüft)

| Nr. | Kriterium | Prüfung (wie testen) |
|-----|-----------|------------------------|
| 10.1 | Alle sichtbaren Texte der Anwendung kommen aus den Übersetzungsdateien; beim Wechsel der Sprache (Topbar) wechseln alle relevanten Texte. Datum und Zahlen folgen der gewählten Locale. | Sprache umschalten; alle Bereiche durchgehen; keine hart codierten deutschen/englischen Texte; Datumsformat prüfen. |
| 10.2 | Rollen und Specs werden überall (Profil, Mindestbesetzung, Anmeldungsliste, DatePicker, Filter) als Icons mit Tooltip oder aria-label dargestellt; Mapping einheitlich. | Alle genannten Bereiche prüfen; Icons und Accessibility konsistent. |
| 10.3 | Layout und Komponenten entsprechen den Designvorgaben (Position, Größe, Darstellung, Typografie) aus UI.md. Auf mobilen Viewports ist die Anwendung nutzbar (Mobile First); Touch-Ziele ausreichend groß; Kontrast lesbar. | Desktop und Mobile durchklicken; mit UI.md Designvorgaben abgleichen. |
| 10.4 | Footer-Links „Impressum“ und „Disclaimer“ führen zu gültigen Seiten oder konfigurierten URLs (Platzhalter oder finale Inhalte). | Links im Footer klicken; Ziel erreichbar. |
| 10.5 | In der User-Tabelle werden weiterhin keine E-Mail und kein Anzeigename gespeichert. Bot und Webapp tauschen nur Server-/Rollen-/Channel-/Thread-IDs und User discord_id aus (keine zusätzlichen Nutzerdaten). | DB User prüfen; Doku/Bot-Code stichprobenartig auf Datenminimierung prüfen. |

### Freigabe Phase 10

- [ ] **Phase 10 freigegeben.** Alle Akzeptanzkriterien erfüllt.
- Datum: _______________
- Bestätigt von: _______________

---

## Gesamt-Freigabe

- [ ] **Alle Phasen (0–10) freigegeben.** Das Projekt gilt damit als gemäß Roadmap und Akzeptanzkriterien abgenommen.
- Letzte Freigabe (Phase 10) am: _______________
- Bestätigt von: _______________
