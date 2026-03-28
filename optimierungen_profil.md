# Optimierungen „Eigenes Profil“ – Umsetzungsplan

Diese Datei dient als zentrale Referenz für die Umsetzung aller Optimierungen der Profilseite (`/[locale]/profile`). Jeder Punkt enthält Ziel, betroffene Dateien, konkrete Schritte und ein **Progress**-Feld. Bei Umsetzung: `[ ]` durch `[x]` ersetzen und optional Datum/Initialen ergänzen.

**Betroffene Kernbereiche:**
- `app/[locale]/(protected)/profile/page.tsx` – Server-Komponente, Daten laden
- `app/[locale]/(protected)/profile/profile-raid-times.tsx` – Raidzeiten-Client
- `app/[locale]/(protected)/profile/profile-characters.tsx` – Charaktere-Client
- `components/availability-grid.tsx` – Grid für Raidzeiten (Klick/Ziehen)
- `app/api/user/raid-times/bulk/route.ts` – Bulk-Speichern Raidzeiten
- `app/api/user/characters/route.ts`, `app/api/user/characters/[id]/route.ts` – Charakter-CRUD (optional `battlenetProfile`)
- `app/api/user/characters/battlenet-fetch/route.ts` – Battle.net-Vorschau für Sync
- `lib/battlenet.ts`, `lib/battlenet-character-persist.ts`, `lib/character-api-dto.ts` – BNet-Auflösung & Persistenz
- `lib/user-guilds.ts` – `battlenetRealmId` pro Gilde für Realm-Vorbelegung
- `lib/profile-constants.ts` – Slots, Wochentage, Präferenzen  
**Dokumentation:** [BNET_INTEGRATION.md](BNET_INTEGRATION.md), [wowrealms.md](wowrealms.md)

---

## 1. Fehler beheben

### 1.1 AvailabilityGrid: Touch/Pointer-Unterstützung (Mobile bedienbar)

**Ziel:** Raidzeiten-Grid auf Mobilgeräten zuverlässig bedienbar machen (aktuell nur Maus-Events).

**Betroffene Datei:** `components/availability-grid.tsx`

**Schritte:**

1. **Konstanten für Whitelist nutzen (für spätere API-Validierung):**
   - Sicherstellen, dass `WEEKDAYS` und `TIME_SLOTS_30MIN` aus `@/lib/profile-constants` importiert werden (bereits der Fall).

2. **Pointer-Events statt ausschließlich Mouse-Events:**
   - `onMouseDown` → zusätzlich/ersetzt durch `onPointerDown` (mit `e.pointerType` auswerten, um Maus/Touch gleich zu behandeln).
   - `onMouseEnter` → für Drag während Ziehen: `onPointerMove` auf der Tabelle bzw. den Zellen nutzen (mit `setPointerCapture(pointerId)` beim PointerDown auf einer Zelle).
   - `onMouseUp` → `onPointerUp` und `onPointerCancel` (sowie `onPointerLeave` der Tabelle) nutzen; `releasePointerCapture` aufrufen.
   - In allen Handler-Callbacks `e.preventDefault()` nur wo nötig (z. B. um natives Bildziehen zu verhindern), um Fokus/Scroll nicht zu brechen.

3. **Touch-spezifisches Verhalten (optional, aber empfohlen):**
   - Einzelner Tap (ohne Drag): Zelle toggeln (leer → aktuelle Präferenz, gesetzt → leer oder Wechsel Präferenz).
   - Längerer Druck (z. B. > 200 ms) oder zweiter Finger: „Zeichenmodus“ aktivieren, danach Ziehen zum Markieren/Löschen (wie aktuell mit Maus).
   - Oder vereinfacht: Nur Tap-to-Toggle pro Zelle, kein Drag auf Touch – dann reicht `onPointerDown` + Toggle-Logik (kein Capture nötig).

4. **Zugänglichkeit:**
   - `role="grid"` und `aria-label` beibehalten.
   - Pro Zelle `role="gridcell"`, `aria-selected` und ggf. `tabIndex={0}` für Tastatur (Enter/Space zum Toggle), wenn kein Drag nötig.

5. **Keine doppelten Events:** Wenn sowohl Pointer als auch Mouse genutzt werden, in einem Handler zusammenfassen und nur einmal `setCell`/`setIsDragging` etc. aufrufen (Browser feuert beide).

**Akzeptanzkriterium:** Auf einem echten Touch-Gerät (oder Chrome DevTools Device-Mode mit Touch-Emulation) können Slots zuverlässig markiert/entfernt werden (Tap oder Drag).

**Progress:** [x]

---

### 1.2 API Raidzeiten Bulk: Strikte Validierung (weekday, timeSlot)

**Ziel:** Nur erlaubte Werte speichern; bei ungültigen Einträgen 400 mit klarer Fehlermeldung statt stilles Filtern.

**Betroffene Datei:** `app/api/user/raid-times/bulk/route.ts`

**Referenz (Whitelists):**  
- Wochentage: `WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']` aus `lib/profile-constants.ts`.  
- Slots: `TIME_SLOTS_30MIN` (22 Einträge von '16:00' bis '03:00'), gleiche Datei.  
- Präferenz: `'likely' | 'maybe'`.  
- weekFocus (optional): `'weekday' | 'weekend' | null`.

**Schritte:**

1. **Whitelists in der Route nutzen:**
   - `WEEKDAYS` und `TIME_SLOTS_30MIN` aus `@/lib/profile-constants` importieren (oder eine schlanke Validierungsfunktion aus einer gemeinsamen Util, z. B. `lib/validate-raid-times.ts`).

2. **Validierung pro Slot:**
   - Für jedes Element in `slots` prüfen:
     - `weekday`: muss in `WEEKDAYS` sein (exakter String).
     - `timeSlot`: muss in `TIME_SLOTS_30MIN` sein.
     - `preference`: muss `'likely'` oder `'maybe'` sein.
   - Wenn mindestens ein Slot ungültig ist: `return NextResponse.json({ error: 'Ungültige Raidzeiten: weekday, timeSlot und preference müssen erlaubte Werte haben.' }, { status: 400 });` (optional: Index oder Liste der fehlerhaften Indizes im Body für Debug).

3. **weekFocus validieren (falls gesendet):**
   - Wenn `weekFocus` gesetzt und nicht `null`: nur `'weekday'` oder `'weekend'` erlauben, sonst 400.

4. **Kein stilles Filtern:** Die bisherige Zeile `const validSlots = slots.filter(...)` durch die strenge Prüfung ersetzen: entweder alle gültig → weiter mit `slots`, oder 400.

**Akzeptanzkriterium:** Request mit z. B. `weekday: "Montag"` oder `timeSlot: "12:00"` liefert 400; nur Requests mit ausschließlich gültigen Werten führen zu 200 und Speicherung.

**Progress:** [x]

---

### 1.3 Raidzeiten Bulk: createMany + redundantes weekFocus vermeiden

**Ziel:** Weniger DB-Operationen, bessere Skalierung; weekFocus nicht in jeder Zeile wiederholen.

**Betroffene Dateien:**  
- `app/api/user/raid-times/bulk/route.ts`  
- Optional: `prisma/schema.prisma` + Migration, falls weekFocus an User verschoben wird (siehe Alternative unten).

**Schritte (Variante A – weekFocus weiterhin pro Slot, aber nur einmal gesetzt):**

1. **deleteMany + createMany:**
   - Nach `deleteMany` nicht mehr `validSlots.map(s => prisma.rfRaidTimePreference.create(...))` ausführen.
   - Stattdessen: `prisma.rfRaidTimePreference.createMany({ data: validSlots.map(s => ({ userId, weekday: s.weekday, timeSlot: s.timeSlot, preference: s.preference, weekFocus: weekFocus ?? null })) })`.
   - Hinweis: `createMany` gibt keine erstellten Records zurück; für „count“ reicht `validSlots.length` oder `createMany`-Resultat (je nach Prisma-Version).

2. **Transaktion beibehalten:**  
   `await prisma.$transaction([ prisma.rfRaidTimePreference.deleteMany({ where: { userId } }), prisma.rfRaidTimePreference.createMany({ data: ... }) ])`.

**Schritte (Variante B – weekFocus am User, einmal pro User):**

1. **Schema:** In `prisma/schema.prisma` beim Modell `RfUser` optionales Feld hinzufügen, z. B. `weekFocus String? @map("week_focus")`.
2. **Migration:** `npx prisma migrate dev --name add_user_week_focus` (oder manuell SQL).
3. **Bulk-Route:**  
   - Slots nur noch mit `weekday`, `timeSlot`, `preference` speichern (kein `weekFocus` in `rf_raid_time_preference`).  
   - Nach dem createMany: `prisma.rfUser.update({ where: { id: userId }, data: { weekFocus: weekFocus ?? null } })` (in derselben Transaktion).
4. **Profilseite:** Beim Laden von Raidzeiten `weekFocus` aus dem User lesen (z. B. zusätzliche Abfrage `prisma.rfUser.findUnique({ where: { id: userId }, select: { weekFocus: true } })`) und an `ProfileRaidTimes` / `AvailabilityGrid` übergeben; nicht mehr aus `raidTimeRows[0].weekFocus`.

**Akzeptanzkriterium:** Speichern funktioniert wie bisher; Anzahl einzelner DB-Writes reduziert (createMany); bei Variante B ist weekFocus nur noch einmal pro User in der DB.

**Progress:** [x]

---

### 1.4 Charakterliste: Responsives Layout (Mobile)

**Ziel:** Auf schmalen Viewports kein horizontales „Sprengen“; Karten lesbar und Touch-Ziele ausreichend groß.

**Betroffene Datei:** `app/[locale]/(protected)/profile/profile-characters.tsx`

**Schritte:**

1. **Container:**  
   - Um die Charakterkarten-Liste einen Container mit `overflow-x-auto` nur als Fallback beibehalten oder durch ein flexibles Layout ersetzen, das unter ~640px umbricht.

2. **Responsive Grid:**
   - Aktuell: `style={{ gridTemplateColumns: '...' }}` mit festen Spalten.
   - Ersetzen durch Tailwind-Klassen, z. B.:
     - **Desktop (default):** gleiche logische Spalten (Main-Symbol, Klassen-Icon, Spec(s), Name, Gilde, Menü), z. B. `grid grid-cols-[auto_auto_auto_1fr_minmax(4rem,1fr)_auto]` oder äquivalent.
     - **Mobile (z. B. `max-sm:`):** Karte in zwei Zeilen: Zeile 1 = Main-Symbol + Klassen-Icon + Spec-Icons + Name + Menü (⋮); Zeile 2 = Gilde (optional kleinerer Text).  
     - Beispiel: `grid grid-cols-[auto_auto_1fr_auto] sm:grid-cols-[...]` und auf Mobile die Spalte „Gilde“ in eine zweite Zeile mit `col-span-...` oder eigenem Wrapper.

3. **Konkrete Umsetzung (Vorschlag):**
   - Wrapper pro Karte: `className="grid items-center gap-2 rounded-lg border ... grid-cols-[32px_28px_1fr_40px] sm:grid-cols-[32px_28px_auto_1fr_minmax(4rem,1fr)_40px]"` (Mobile: 4 Spalten, ab sm 6 Spalten).
   - Auf Mobile: Name und Specs in eine Zelle (flex wrap oder truncate), Gilde als eigene Zeile darunter mit `sm:col-span-1 col-span-2` oder per `max-sm:block` eine zweite Zeile „Gilde: …“.
   - So bleibt das ⋮-Button rechts immer sichtbar und mind. ~40px Touch-Ziel.

4. **min-w / max-w:**  
   Keine festen min-widths, die auf kleinen Screens Overflow erzwingen; stattdessen `min-w-0` für Text-Spalten mit `truncate`.

**Akzeptanzkriterium:** Profilseite auf 320px–400px Breite ohne horizontalen Scroll; alle Buttons/Menüs mit mind. 44px Touch-Ziel bedienbar.

**Progress:** [x]

---

## 2. Probleme (Logik / Performance / Darstellung)

### 2.1 Raidstatistik: Aggregation in der Datenbank

**Ziel:** Statistik „Teilnahmen je Dungeon und Gilde“ per DB-Aggregation statt im Node-Prozess; weniger Speicher und CPU.

**Betroffene Dateien:**  
- `app/[locale]/(protected)/profile/page.tsx`

**Schritte:**

1. **Aktuelle Logik ersetzen:**  
   Statt `rfRaidCompletion.findMany` mit allen Rows und anschließendem `statsMap` in einer Schleife:

2. **Prisma groupBy nutzen:**  
   - Modell: `RfRaidCompletion` hat `raidId`, `userId`, `participationCounter`; Raid hat `guildId`, `dungeonId` und Relation zu `guild`/`dungeon` (name).
   - Option A: Zwei Queries – (1) Completions mit `include: { raid: { select: { guildId, dungeonId, guild: { select: { name: true } }, dungeon: { select: { name: true } } } } }` und `where: { userId }`, dann in JS mit `reduce`/Map nach `guildId+dungeonId` summieren (bleibt eine Query, aber Aggregation in JS).  
   - Option B (empfohlen): Raw-Query oder Prisma `groupBy` auf Completions: Nach `raid.guildId` und `raid.dungeonId` gruppieren und `_sum: { participationCounter: true }` (Prisma unterstützt bei groupBy keine verschachtelten Felder direkt).  
   - Praktikabel: Completions mit `include: { raid: { select: { guildId, dungeonId, guild: { select: { name: true } }, dungeon: { select: { name: true } } } } }` laden, dann in einer Schleife pro `raid.guildId + raid.dungeonId` die `participationCounter` aufsummieren (wie jetzt, aber ohne mehrfaches findMany – eine findMany reicht). Das ist bereits eine Verbesserung, wenn die aktuelle Implementierung N+1 vermeidet.  
   - Beste Performance: SQL `SELECT guild_id, dungeon_id, SUM(participation_counter) ... FROM rf_raid_completion c JOIN rf_raid r ON c.raid_id = r.id WHERE c.user_id = ? GROUP BY r.guild_id, r.dungeon_id` und Join zu Gilden-/Dungeon-Namen; mit Prisma `$queryRaw` oder einer View.

3. **Konkrete Umsetzung mit Prisma (ohne Raw):**  
   - `const completions = await prisma.rfRaidCompletion.findMany({ where: { userId }, include: { raid: { select: { guildId, dungeonId, guild: { select: { name: true } }, dungeon: { select: { name: true } } } } } });`  
   - Dann: `const statsMap = new Map<string, { guildId, guildName, dungeonId, dungeonName, participationCount }>();` und für jede Completion den Key `raid.guildId:raid.dungeonId` nutzen, `participationCounter` addieren (Number(c.participationCounter)).  
   - Das entspricht der aktuellen Logik; „Optimierung“ hier = sicherstellen, dass nur eine Query ausgeführt wird und keine weiteren roundtrips. Wenn ihr Raw erlaubt, könnt ihr die Aggregation komplett in die DB legen.

**Akzeptanzkriterium:** Keine zusätzlichen DB-Roundtrips; gleiche Ausgabe wie bisher (Tabelle Raidstatistik).

**Progress:** [x]

---

### 2.2 Loot-Tabelle: Pagination + optional Filter

**Ziel:** Bei vielen Loot-Einträgen die Seite entlasten (weniger Daten, bessere Ladezeit und Darstellung).

**Betroffene Dateien:**  
- `app/[locale]/(protected)/profile/page.tsx` (Loot-Daten laden)  
- Optional: neue Client-Komponente für Loot-Bereich mit „Mehr laden“ oder Seitennummern.

**Schritte:**

1. **Seitenweite definieren:** z. B. `LOOT_PAGE_SIZE = 20` (Konstante in page oder Config).

2. **API-Option (empfohlen):**  
   - Neuen Endpoint `GET /api/user/loot?page=1&limit=20` (oder `cursor=...`) implementieren bzw. bestehenden erweitern.  
   - In `app/api/user/loot/route.ts`: Query-Parameter `page`, `limit` auslesen; `prisma.rfLoot.findMany({ where: { userId }, include: {...}, orderBy: { receivedAt: 'desc' }, take: limit, skip: (page - 1) * limit })`; Gesamtanzahl mit `prisma.rfLoot.count({ where: { userId } })` für „Seite X von Y“ oder „Mehr laden“.

3. **Profilseite anpassen:**  
   - Entweder: Loot-Block als Client-Komponente (`ProfileLoot`), die initial leer ist oder erste Seite vom Server mitgibt und weitere Seiten per `fetch('/api/user/loot?page=2')` nachlädt.  
   - Oder: Server lädt nur erste Seite (z. B. 20), Client zeigt „Weitere 20 laden“-Button und ruft API auf.

4. **Filter (optional):** Query-Parameter `guildId`, `dungeonId`, `from`, `to` (Datum) in der Loot-API; in Prisma `where` einbauen.

5. **Fallback:** Wenn ihr vorerst keine neue API wollt: In `page.tsx` nur die ersten N Einträge laden (`take: 30`) und darunter „Nur die letzten 30 Einträge werden angezeigt“ + Link „Alle anzeigen“ (dann z. B. eigene Route oder Modal mit voller Liste).

**Akzeptanzkriterium:** Bei vielen Loot-Einträgen lädt die Profilseite nur einen begrenzten Satz; Nutzer kann weitere laden oder Seiten blättern.

**Progress:** [x]

---

### 2.3 Caching / dynamic der Profilseite

**Ziel:** Nicht jeden Aufruf der Profilseite mit `force-dynamic` komplett uncached ausliefern, wo es nicht nötig ist.

**Betroffene Datei:** `app/[locale]/(protected)/profile/page.tsx`

**Schritte:**

1. **Option A – revalidate:**  
   - `export const revalidate = 60` (oder 30) setzen und `dynamic = 'force-dynamic'` entfernen. Dann wird die Seite maximal alle 60 Sekunden neu generiert; Nutzer mit Session sehen ggf. bis zu 60 s alte Daten (für Profil oft akzeptabel).

2. **Option B – dynamisch nur bei Bedarf:**  
   - `dynamic = 'force-dynamic'` entfernen und keine globale revalidate setzen; Next.js entscheidet. Wenn keine `cookies()`/`headers()` in der Page genutzt werden, könnte sie statisch sein – dann Session-Check in Layout/Middleware belassen und Profil-Daten per Client-Fetch oder in einer dynamischen Child-Komponente laden.

3. **Option C – Segment-basiert:**  
   - Schwergewichtige Blöcke (Loot, Completions) in Client-Komponenten auslagern, die nach Mount Daten von API holen; obere Teile (Raidzeiten, Charaktere) weiter server-seitig mit kürzerem revalidate.

**Empfehlung:** Zunächst `revalidate = 60` testen und `force-dynamic` entfernen; wenn Anmeldung/Änderungen sofort sichtbar sein müssen, revalidate kleiner (z. B. 10) oder nur für Loot/Stats Client-Fetch nutzen.

**Akzeptanzkriterium:** Weniger Last auf dem Server bei wiederholten Profil-Aufrufen; fachlich korrektes Verhalten (Daten nicht unangemessen veraltet).

**Progress:** [x]

---

### 2.4 AvailabilityGrid: Dirty-Check optimieren

**Ziel:** Weniger Arbeit pro Render beim Vergleich „Grid geändert?“ (aktuell wird bei jeder Änderung das komplette initiale Grid neu gebaut und Zelle für Zelle verglichen).

**Betroffene Datei:** `components/availability-grid.tsx`

**Schritte:**

1. **Inkrementelles Dirty-Flag:**  
   - Beim Setzen einer Zelle (`setCell`) sofort prüfen, ob der neue Wert vom initialen Wert abweicht; ein `isDirtyRef` oder State „hasChange“ setzen.  
   - Initial beim Mount: „initialSlots“ in ein Set serialisieren, z. B. `Set<string>` mit Einträgen `day|slot|preference` für alle belegten Slots; beim setCell prüfen, ob aktuelle Grid-State vs. dieses Set abweicht (neuer Slot hinzugefügt, Slot entfernt, Präferenz geändert).  
   - Alternativ: `isGridDirty` nur dann neu berechnen, wenn `grid` sich geändert hat und ein „initialSnapshot“ (z. B. JSON.stringify der initialen Slots oder Set) einmalig beim ersten Render und bei initialSlots-Update gespeichert wird; Vergleich dann über normierte Slots (collectSlots-Ergebnis vs. initiale Slots).

2. **Normalisierte initiale Slots:**  
   - Hilfsfunktion `initialSlotsToSet(initialSlots): Set<string>` mit Einträgen `day|slot|preference`.  
   - `isGridDirty = (collectSlots() zu Set) !== initialSlotsToSet(initialSlots)` (Mengenvergleich). So muss nicht über 7×22 Zellen iteriert werden, sondern nur über die gesetzten Slots (typisch deutlich weniger).

3. **useMemo mit Abhängigkeit grid + initialSlots:**  
   - `const initialSet = useMemo(() => slotsToSet(initialSlots), [initialSlots]);`  
   - `const isGridDirty = useMemo(() => !setsEqual(slotsToSet(collectSlotsFromGrid(grid)), initialSet), [grid, initialSet]);`  
   - Dafür `collectSlotsFromGrid(grid)` als reine Funktion die aus `grid` die Slots baut (wie aktuell collectSlots, aber mit grid als Parameter). So entfällt das doppelte Aufbauen des initialen Grids in buildGridFromSlots.

**Akzeptanzkriterium:** Keine funktionale Änderung; bei vielen Nutzerinteraktionen (Drag) weniger CPU-Last pro Frame.

**Progress:** [x]

---

### 2.5 Charakter „Als Main setzen“: setList-Update vereinfachen

**Ziel:** Kein redundantes `prev.find` innerhalb der `map`-Callback-Funktion.

**Betroffene Datei:** `app/[locale]/(protected)/profile/profile-characters.tsx`

**Schritte:**

1. In `handleSetMain` nach `if (res.ok)` die aktuelle Liste mit einer Variable für den geänderten Charakter neu aufsetzen:
   - `const char = list.find((x) => x.id === id);` (oder aus Response, falls ihr den aktualisierten Char zurückgebt).
   - `setList((prev) => { const target = prev.find((x) => x.id === id); if (!target) return prev; const sameGuildId = target.guildId; return prev.map((r) => (r.id === id ? { ...r, isMain: true } : sameGuildId && r.guildId === sameGuildId ? { ...r, isMain: false } : r)); });`
   - So wird nur einmal `find` pro Update ausgeführt.

**Akzeptanzkriterium:** Gleiches Verhalten wie bisher; weniger Aufwand pro setList-Aufruf.

**Progress:** [x]

---

### 2.6 Modal Charakter: Focus-Trap, ESC, Backdrop-Click, Scroll-Lock

**Ziel:** Bessere Tastatur- und Screenreader-Nutzung; Modal schließt mit ESC und Klick auf Overlay; Hintergrund scrollt nicht.

**Betroffene Datei:** `app/[locale]/(protected)/profile/profile-characters.tsx`

**Schritte:**

1. **ESC zum Schließen:**  
   - `useEffect`, der bei `modalOpen === 'add' | 'edit'` einen Listener `keydown` registriert: wenn `e.key === 'Escape'`, `closeModal()` aufrufen und Listener beim Cleanup entfernen.

2. **Klick auf Overlay (Backdrop):**  
   - Auf dem `div` mit `fixed inset-0 ... bg-black/50` einen `onClick` mit `closeModal`.  
   - Auf dem inneren Modal-Container `onClick={(e) => e.stopPropagation()}`, damit Klicks ins Modal nicht schließen.

3. **Scroll-Lock:**  
   - Bei geöffnetem Modal: `document.body.style.overflow = 'hidden'` setzen (in useEffect); beim Schließen oder Unmount `document.body.style.overflow = ''` zurücksetzen.

4. **Focus-Trap (optional, aber empfohlen):**  
   - Beim Öffnen: Fokus auf das erste fokussierbare Element im Modal setzen (z. B. Namensfeld oder „Speichern“).  
   - Beim Schließen: Fokus auf den Button zurück, der das Modal geöffnet hat („Charakter anlegen“ bzw. das ⋮-Menü).  
   - Focus innerhalb des Modals halten: bei Tab vom letzten Element zum ersten springen (und umgekehrt). Dafür entweder eine kleine Hilfsfunktion („alle fokussierbaren Elemente im Modal sammeln, bei Tab am Ende/Anfang umleiten“) oder eine Bibliothek wie `focus-trap-react` / Radix Dialog nutzen.

**Akzeptanzkriterium:** Modal schließt mit ESC und Backdrop-Klick; Body scrollt nicht, wenn Modal offen ist; Tastatur-Navigation bleibt im Modal bis zum Schließen.

**Progress:** [x]

---

### 2.7 Loot-Tabelle: Datumsformat mit Locale

**Ziel:** `receivedAt` in der Loot-Tabelle sprachabhängig und konsistent formatieren.

**Betroffene Datei:** `app/[locale]/(protected)/profile/page.tsx`

**Schritte:**

1. In der Profil-Page die aktive Locale ermitteln (z. B. aus `params.locale` oder `getLocale()` von next-intl).
2. Beim Rendern der Loot-Zeile statt `new Date(l.receivedAt).toLocaleDateString()` z. B. `new Date(l.receivedAt).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })` verwenden (oder über next-intl `useFormatter()` / `formatDateTime` in einer kleinen Client-Komponente nur für die Zelle).

**Hinweis:** Wenn die ganze Tabelle Server-Komponente bleibt, Locale aus Page-Param oder getLocale an die Darstellung übergeben.

**Akzeptanzkriterium:** Datum in der Loot-Tabelle entspricht der gewählten Sprache (de/en).

**Progress:** [ ]

---

## 3. Mobile-spezifische Anpassungen (Kurzreferenz)

- **Raidzeiten:** Siehe 1.1 (Pointer/Touch).
- **Charakterkarten:** Siehe 1.4 (responsives Layout).
- **Tabellen Stats/Loot:**  
  - Bereits `overflow-x-auto`; optional auf kleinen Screens Card-Ansicht (eine Zeile = eine Karte mit Label-Wert-Paaren) oder sticky erste Spalte, um Lesbarkeit zu verbessern.  
  - Kein eigener Punkt hier; bei Bedarf als „Idea“ in Abschnitt 5 aufnehmen.

**Progress (nur Querverweis):** [ ] – siehe 1.1, 1.4.

---

## 4. Weitere Optimierungen (technisch)

### 4.1 buildGridFromSlots (in 1.1/2.4 umgesetzt): Unbekannte timeSlots ignorieren

**Ziel:** Slots mit `timeSlot`, die nicht in `TIME_SLOTS_30MIN` stehen, nicht ins Grid übernehmen (vermeidet „unsichtbare“ Daten und konsistentes Verhalten mit API).

**Betroffene Datei:** `components/availability-grid.tsx`

**Schritte:**

1. In `buildGridFromSlots` beim Befüllen prüfen:  
   `if (TIME_SLOTS_30MIN.includes(s.timeSlot as (typeof TIME_SLOTS_30MIN)[number]) && ...)` – nur dann `g[s.weekday][s.timeSlot] = val` setzen.  
   So erscheinen nur erlaubte Slots im Grid; alles andere wird ignoriert (und bei strikter API-Validierung ohnehin nicht mehr gespeichert).

**Progress:** [x]

---

### 4.2 Profilseite: Klassen-Namen für Charakter-Rows einheitlich (classId)

**Ziel:** Sicherstellen, dass `characterRows` ein Feld `classId` hat (falls ihr es für Icons/Filter nutzt), ohne doppelte Ableitung aus mainSpec.

**Betroffene Dateien:**  
- `app/[locale]/(protected)/profile/page.tsx` (characterRows bauen)  
- `app/[locale]/(protected)/profile/profile-characters.tsx` (Anzeige)

**Schritte:**

1. Beim Mapping der Charaktere in `page.tsx` optional `classId` aus der Spec ableiten (z. B. über `getClassIdForSpec(c.mainSpec)` aus wow-tbc-classes) und in `characterRows` mitgeben.  
2. In `ProfileCharacters` dann `cClassId` aus `c.classId ?? getClassIdForSpec(c.mainSpec)` um Redundanz zu vermeiden.  
   Optional; nur wenn ihr classId mehrfach braucht und eine einzige Quelle wollt.

**Progress:** [x]

---

### 4.3 Charaktere & Battle.net (Profil + API)

**Ziel:** Einheitliches Charakter-Modal mit optionaler Battle.net-Synchronisation; Main-Spec aus dem Talentbaum mit den meisten Punkten; **Battle.net-Logo** in Listen (statt Text-Badge); Gilden-Realm für Vorbelegung.

**Umsetzung (Kurz):**

1. **UI:** Ein Modal (Anlegen/Bearbeiten) mit Realm-Combobox, **„BNet Sync“**, manuell überschreibbare Felder; Hinweis bei API-404 (exakte Schreibweise); **Battle.net-Logo** (`components/battlenet-logo.tsx`, Asset `public/icons/bnet.png`) in der Profil-Charakterliste, wenn `battlenet_character_id` gesetzt ist.
2. **API:** `POST …/battlenet-fetch` (nur Lesen), `POST`/`PATCH …/characters` mit optionalem `battlenetProfile` → `rf_battlenet_character_profile`.
3. **Gilde:** `UserGuildInfo.battlenetRealmId` aus `rf_guild` → bei gewählter Gilde Realm im Modal vorbelegen.
4. **Main-Spec:** Aus Character-Specializations (`spent_points` / `talent_rank`), Fallback `active_spec` (`lib/battlenet.ts`).
5. **Gildenverwaltung:** Mitglieder-API liefert `hasBattlenet`; siehe [BNET_INTEGRATION.md](BNET_INTEGRATION.md) Abschnitt Gildenverwaltung.

**Akzeptanzkriterium:** Nutzer können Chars manuell oder per Sync anlegen; verknüpfte Chars sind in Profil und Gildenliste am Battle.net-Logo erkennbar.

**Progress:** [x]

---

## 5. Ideen (optionale Erweiterungen)

Diese Punkte sind bewusst knapp; bei Umsetzung können sie in dieselbe Struktur (Ziel, Dateien, Schritte, Progress) wie oben ausgebaut werden.

- **Tabs/Accordion für Profil:** Raidzeiten, Charaktere, Statistik, Loot als Tabs oder Accordion; optional lazy Load pro Tab.  
  **Progress:** [ ]

- **Raidzeiten-Presets:** Buttons „Alle Werktage“, „Wochenende“, „Kopieren von [Tag]“; Undo/Redo (z. B. letzte Aktion rückgängig).  
  **Progress:** [ ]

- **Charaktere gruppieren/sortieren:** Nach Gilde gruppieren, innerhalb Gilde Main zuerst; optional Suchfeld.  
  **Progress:** [ ]

- **Loot:** Filter (Gilde, Dungeon, Zeitraum), Tooltip/Link für Item, Export CSV.  
  **Progress:** [ ]

- **Stats-Tabelle mobil als Cards:** Unter einer Breakpoint-Grenze jede Zeile als Karte (Gilde, Dungeon, Teilnahmen) darstellen.  
  **Progress:** [ ]

---

## Fortschritt Gesamt (optional)

| Bereich           | Erledigt | Offen |
|-------------------|----------|-------|
| 1. Fehler         | 4        | 0     |
| 2. Probleme       | 7        | 0     |
| 3. Mobile         | (siehe 1.1, 1.4) | 0 |
| 4. Weitere Opt.   | 3        | 0     |
| 5. Ideen          | 0        | 5     |

Bei Umsetzung die Zähler und die `[ ]`-Angaben in den Abschnitten aktualisieren.
