# RaidFlow Konzept: Multiraid (Lockout-basiert)

## Zielbild

Ein **Multiraid** ist ein Raid-Event mit:

- einer gemeinsamen **Lockout-ID** (pro Charakter nur 1 Teilnahme innerhalb des Zeitraums),
- mehreren möglichen **Terminen (Tagen/Slots)**,
- optional mehreren **Gruppen pro Termin**,
- Werkzeugen für Raidleader, um Anmeldungen effizient und fair zu verteilen.

Das Konzept erweitert den bisherigen Single-Raid-Flow, ohne bestehende Funktionen zu brechen.

Lockout-ID und Lockout-Fenster werden aus den offiziellen Dungeon-Resetzeiten abgeleitet.

---

## Kernanforderungen

1. Ein Charakter darf innerhalb eines Lockout-Zeitraums nur **einem** Termin (und einer Gruppe) zugewiesen werden.
2. Spieler geben bei Anmeldung ihre **verfügbaren Termine** an.
3. Pro Termin muss eine konfigurierbare **Mindestbesetzung** erfüllt sein.
4. Bei hoher Nachfrage kann am gleichen Termin eine **zweite oder dritte Gruppe** erstellt werden.
5. Raidleader erhält Vorschläge und kann manuell nachsteuern.

---

## Fachliches Modell

### 1) Neue Objekte

- **RaidSeries** (`rf_raid_series`)
  - Oberobjekt des Multiraids (z. B. "AQ40 ID 2026-12").
  - Enthält Gilde, Dungeon, Lockout-Fenster, Default-Regeln.
- **RaidSeriesSlot** (`rf_raid_series_slot`)
  - Konkrete mögliche Termine (Datum + Startzeit + optional Endzeit).
- **RaidSeriesGroup** (`rf_raid_series_group`)
  - Gruppe innerhalb eines Slots (Group 1, Group 2, ...), jeweils mit Kapazität und Mindestbesetzung.
- **RaidSeriesSignup** (`rf_raid_series_signup`)
  - Anmeldung je Charakter auf Serienebene inkl. Verfügbarkeiten je Slot.
- **RaidSeriesAssignment** (`rf_raid_series_assignment`)
  - Finale Zuordnung Charakter -> Slot -> Gruppe.

### 2) Bezug zum bestehenden `rf_raid`

Empfehlung: Multiraid bleibt zunächst eigenes Planungsobjekt. Beim "Finalisieren" werden pro Gruppe **normale `rf_raid`-Einträge** erzeugt.

Vorteile:

- bestehende Ansichten/Thread-Logik bleiben nutzbar,
- minimal-invasive Einführung,
- klare Trennung zwischen Planung und operativem Raid.

Wichtig: Die operativen Raids bleiben **dauerhaft mit der RaidSeries verlinkt**, damit spaetere Anpassungen zentral moeglich sind.

## Zusätzliche Verknüpfung (für Re-Planung)

- `rf_raid` erhaelt optionale FKs:
  - `raid_series_id` -> `rf_raid_series.id`
  - `raid_series_slot_id` -> `rf_raid_series_slot.id`
  - `raid_series_group_id` -> `rf_raid_series_group.id`
- Dadurch kann aus **"Raid bearbeiten"** jederzeit in die Serienplanung gesprungen werden und umgekehrt.

---

## Datenbankvorschlag (MVP)

## `rf_raid_series`

- `id` (uuid, pk)
- `guild_id` (fk -> `rf_guild.id`)
- `dungeon_id` (fk -> `rf_dungeon.id`)
- `name`
- `lockout_code` (z. B. "aq40-2026w14")
- `lockout_start_at`, `lockout_end_at`
- `signup_deadline_at`
- `max_players_per_group`
- `status` (`draft`, `open`, `planning_locked`, `published`, `cancelled`)
- `created_by`, `created_at`, `updated_at`

## `rf_raid_series_slot`

- `id` (uuid, pk)
- `raid_series_id` (fk)
- `starts_at`, `ends_at`
- `is_active` (bool)
- `target_group_count` (int, default 1)

## `rf_raid_series_group`

- `id` (uuid, pk)
- `raid_series_slot_id` (fk)
- `group_index` (1..n)
- `max_players`
- `min_tank`, `min_healer`, `min_melee`, `min_ranged`
- optional: `min_specs_json` (wie in bestehendem Raidmodell)

## `rf_raid_series_signup`

- `id` (uuid, pk)
- `raid_series_id` (fk)
- `character_id` (fk -> `rf_character.id`)
- `signup_type` (`normal`, `uncertain`, `reserve`)
- `allow_offspec` (bool)
- `late_flag` (bool)
- `late_note` (text, required wenn `late_flag = true`)
- `note` (text)
- `created_at`, `updated_at`

## `rf_raid_series_signup_slot`

- `id` (uuid, pk)
- `raid_series_signup_id` (fk)
- `raid_series_slot_id` (fk)
- `availability` (`available`, `maybe`)

## `rf_raid_series_assignment`

- `id` (uuid, pk)
- `raid_series_id` (fk)
- `character_id` (fk)
- `raid_series_slot_id` (fk)
- `raid_series_group_id` (fk)
- `assigned_role` (`tank`, `healer`, `melee`, `ranged`)
- `is_offspec` (bool)
- `locked` (bool)
- `created_at`, `updated_at`

## Wichtige Constraints

1. **Ein Charakter nur einmal pro Serie**  
   Unique Index auf (`raid_series_id`, `character_id`) in `rf_raid_series_assignment`.

2. **Keine doppelten Slot-Auswahlen in Anmeldung**  
   Unique Index auf (`raid_series_signup_id`, `raid_series_slot_id`).

3. **Pro Slot keine doppelte Gruppenindex-Kollision**  
   Unique Index auf (`raid_series_slot_id`, `group_index`).

---

## UX-Ablauf (Raidleader)

1. **Multiraid erstellen**
   - Dungeon, Name, Lockout-Zeitraum, Signup-Deadline, Gruppengröße, Mindestbesetzung definieren.
2. **Termine hinzufügen**
   - z. B. Mi/Do/So 20:00.
3. **Signup öffnen**
   - Spieler wählen 1..n mögliche Termine (available/maybe).
4. **Auto-Verteilung ausführen**
   - System erstellt bestmögliche Zuordnung mit Validierungsbericht.
5. **Manuell nachjustieren**
   - Drag & Drop zwischen Slots/Gruppen; Warnungen bei Regelbruch.
6. **Gruppen je Termin erhöhen**
   - "Neue Gruppe in Slot X" bei ausreichender Nachfrage.
7. **Finalisieren**
   - Aus jeder finalen Gruppe wird ein normaler `rf_raid` erzeugt (inkl. Discord-Thread).
8. **Operativ bearbeiten / umplanen**
   - In `Raid bearbeiten` bleibt der Bezug zur RaidSeries sichtbar.
   - Bei kurzfristigen Absagen kann gruppenuebergreifend getauscht werden (z. B. Group 1 <-> Group 2 im gleichen Slot oder zwischen Slots).
   - Nach Tausch werden Mindestbesetzung und Lockout-Regel sofort neu validiert.

---

## UX-Ablauf (Spieler)

1. Multiraid öffnen.
2. Charakter wählen.
3. Verfügbare Termine markieren:
   - **Kann sicher**
   - **Kann eventuell**
4. Optional: Reserve, Offspec erlaubt, "komme verspätet" + Pflichtnotiz.
5. Speichern, später bearbeiten bis Deadline.

---

## Verteilungslogik (praktikabel, technisch umsetzbar)

## Zielprioritäten

1. Harte Regeln erfüllen:
   - ein Charakter nur einmal,
   - Kapazität je Gruppe,
   - Mindestbesetzung je Gruppe.
2. Danach optimieren:
   - möglichst viele `available` statt `maybe`,
   - faire Verteilung über Gruppen,
   - möglichst wenig manuelle Nacharbeit.

## Algorithmus für MVP (heuristisch)

1. **Kandidatenmatrix bauen**
   - Fuer jeden Charakter: moegliche Slots mit Gewicht (`available=2`, `maybe=0`).
   - `maybe` wird nicht fuer die eigentliche Priorisierung verwendet, sondern als Risiko-Markierung angezeigt.
2. **Slot-Bedarf berechnen**
   - Für jede Gruppe je Slot Mindestrollenbedarf als "offene Plätze".
3. **Phase A: Mindestbesetzung sichern**
   - Priorisiert Tanks/Healer, dann restliche Rollen.
   - Charaktere mit wenig Alternativen zuerst zuweisen.
4. **Phase B: Restplätze auffüllen**
   - Nach `available`, Rollenbalance und ggf. Teilnahmehistorie.
5. **Phase C: Local Repair**
   - Tausche Charaktere zwischen Gruppen/Slots, um Regelverletzungen zu beheben oder Score zu erhöhen.
6. **Phase D: Gruppen-Erweiterungsvorschlag**
   - Wenn in Slot X noch genug unzugewiesene passende Anmeldungen vorhanden sind: Vorschlag "Gruppe +1".

Diese Logik ist schnell implementierbar und transparent. Optional kann später ein ILP/Solver-Modus ergänzt werden.

---

## Entscheidungs- und Warnsystem für Raidleader

- **Ampel je Slot**
  - Gruen: Mindestbesetzung erfüllt.
  - Gelb: knapp/unsichere (`maybe`) Slots kritisch.
  - Rot: Mindestbesetzung nicht erreichbar.
- **Konfliktliste**
  - "Charakter nur mit Maybe-Ueberschneidung verfuegbar"
  - "Nur 1 Tank im Slot"
  - "Zu viele unzugewiesene Melees"
- **Spielerhinweis**
  - Am zugewiesenen Spieler wird ein klarer Hinweis angezeigt, wenn die Zuordnung auf einem `maybe`-Slot liegt (Ueberschneidung/Unsicherheit).
- **Aktionen**
  - Gruppe hinzufügen/entfernen
  - Mindestbesetzung temporär anpassen
  - Spieler gezielt auf Reserve setzen
  - Spieler zwischen operativen Raid-Gruppen tauschen (mit Live-Validierung)

## Kurzfristige Umplanung (Last-Minute-Absagen)

Wenn ein gesetzter Spieler kurz vor Start absagt:

1. Absage im operativen Raid erfassen.
2. "Ersatz finden" oeffnen (vorgefiltert auf dieselbe RaidSeries und gueltigen Lockout).
3. System zeigt priorisierte Kandidaten:
   - gleiche Rolle + `available`,
   - gleiche Rolle + `maybe`,
   - Offspec-Kandidaten (falls erlaubt).
4. Bei Bedarf Cross-Group-Tausch durchfuehren:
   - Kandidat aus Gruppe B nach Gruppe A,
   - freie Stelle in Gruppe B mit Reserve/weiterem Kandidaten fuellen.
5. Nach jeder Aenderung: Live-Pruefung von Mindestbesetzung, Max-Players und "ein Charakter nur einmal pro Serie".

So bleibt die Planung robust, auch wenn kurzfristig umgestellt werden muss.

---

## Integration in bestehende Features

- Rollen-/Spec-Icons, Offspec-Handling, Late-Flag (`⏱`) und Notiz (`📒`) aus Phase 7/8 wiederverwenden.
- Bestehende Raid-Completion-Statistik bleibt erhalten, da finale Runs als normale `rf_raid` abgeschlossen werden.
- Discord-Bot-Flow bleibt gleich, nur mehrfach pro Serie beim Finalisieren.
- In `Raid bearbeiten` kann die Multiraid-Verknuepfung genutzt werden, um schnell in Serien-Umbuchungen zu wechseln.
- Twinks koennen parallel angemeldet werden; die operative Auswahl bleibt beim Raidleader und kann ueber Filter gesteuert werden.
- Reserven werden entsprechend ihrer Anmeldung im jeweiligen Slot/Gruppe gefuehrt und angezeigt (nicht nur global).

---

## Einfuehrungsplan in 3 Schritten

## Schritt 1 (MVP, schnell lieferbar)

- DB-Tabellen fuer `raid_series`, `slots`, `signups`, `assignments`.
- UI: Multiraid erstellen + Termine waehlen + einfache Auto-Verteilung.
- Finalisieren erzeugt normale Raids.
- Verlinkung in `rf_raid` auf `raid_series/slot/group` fuer spaeteres Umplanen.

## Schritt 2 (Produktiv-Qualitaet)

- Manuelles Board fuer Umbuchungen.
- Konflikt-/Ampelsystem.
- Gruppen-Erweiterungsvorschlaege.
- Last-Minute-Assistent in `Raid bearbeiten` (Ersatzvorschlaege + Cross-Group-Tausch).

## Schritt 3 (Advanced)

- ILP/Solver als optionaler "Best Fit"-Modus.
- Fairnessregeln (z. B. rotierende Teilnahme bei hoher Nachfrage).
- Historische Auswertungen je Lockout.

---

## Akzeptanzkriterien (Vorschlag)

1. Ein Charakter kann in einer Serie maximal einer finalen Gruppe zugewiesen sein.
2. Raidleader kann mindestens 3 Termine in einer Serie anlegen.
3. Spieler kann mehrere Termine markieren und seine Angaben bis Deadline bearbeiten.
4. Auto-Verteilung erzeugt eine valide Zuordnung oder klare Konfliktliste.
5. Bei ausreichenden Anmeldungen kann in einem Slot eine weitere Gruppe angelegt und befuellt werden.
6. Finalisierung erzeugt pro Gruppe einen normalen Raid mit Teilnehmern.

---

## Festgelegte Produktentscheidungen

1. **Lockout-ID/Zeitraum:** wird aus den jeweiligen Dungeon-Resetzeiten abgeleitet.
2. **Twinks:** parallele Anmeldung erlaubt; finale Auswahl und Filterung liegen beim Raidleader.
3. **Maybe:** wird niedrig priorisiert und dient primär als Hinweis auf moegliche Ueberschneidung am Spieler.
4. **Reserven:** werden entsprechend ihrer Anmeldung gelistet (slot-/gruppenbezogen).

---

## Kurzfazit

Der praktikabelste Weg ist ein **zweistufiges Modell**:

- Planung auf **Multiraid-Serienebene**,
- operative Durchfuehrung weiterhin als bewaehrte **normale Raids**.

So bekommt der Raidleader starke Planungswerkzeuge fuer mehrere Tage und Gruppen, waehrend bestehende RaidFlow-Funktionen weiterverwendet werden.
