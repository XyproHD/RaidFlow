# Anleitung: Gearscore selbst berechnen (mit Battle.net API Itemdaten)

Diese Anleitung beschreibt exakt die Berechnungslogik aus dem AddOn `TacoTip` (`gearscore.lua`), damit du den Gearscore außerhalb von WoW selbst berechnen kannst.

Ziel:
- Pro Item einen Gearscore berechnen
- Danach den Gesamt-Gearscore eines Charakters bestimmen
- Itemdaten kommen aus der Battle.net API

---

## 1) Benoetigte Itemdaten aus der Battle.net API

Du brauchst pro ausgeruestetem Item mindestens:

- `item_level` (z. B. 245)
- `quality.type` (z. B. `EPIC`, `RARE`, `UNCOMMON`, `LEGENDARY`, ...)
- `inventory_type.type` (z. B. `HEAD`, `TRINKET`, `TWOHWEAPON`, `RANGEDRIGHT`, ...)

Aus dem Character-Endpoint bekommst du zusaetzlich:
- Alle ausgeruesteten Items (Slots)
- Klasse des Charakters (fuer Hunter-Sonderlogik)

Wichtig:
- Shirt/Body-Slot wird ignoriert.
- Der Slot "offhand" wird separat behandelt (wie im AddOn).

---

## 2) Konfigurationskonstanten

Das AddOn verwendet je Expansion unterschiedliche Brackets:

- Wrath (WotLK): `BRACKET_SIZE = 1000`
- TBC: `BRACKET_SIZE = 400`
- Classic Era: `BRACKET_SIZE = 200`

Danach:

- `MAX_SCORE = BRACKET_SIZE * 6 - 1`
- `Scale = 1.8618`

Wenn du Wrath nachbilden willst, nutze `BRACKET_SIZE = 1000`.

---

## 3) Slot-Multiplikatoren (`SlotMOD`)

Mappe den API-Inventory-Typ auf folgenden Multiplikator:

| Inventory Type | SlotMOD |
|---|---:|
| `RELIC` | 0.3164 |
| `TRINKET` | 0.5625 |
| `TWOHWEAPON` | 2.0000 |
| `WEAPONMAINHAND` | 1.0000 |
| `WEAPONOFFHAND` | 1.0000 |
| `RANGED` | 0.3164 |
| `THROWN` | 0.3164 |
| `RANGEDRIGHT` | 0.3164 |
| `SHIELD` | 1.0000 |
| `WEAPON` | 1.0000 |
| `HOLDABLE` | 1.0000 |
| `HEAD` | 1.0000 |
| `NECK` | 0.5625 |
| `SHOULDER` | 0.7500 |
| `CHEST` | 1.0000 |
| `ROBE` | 1.0000 |
| `WAIST` | 0.7500 |
| `LEGS` | 1.0000 |
| `FEET` | 0.7500 |
| `WRIST` | 0.5625 |
| `HAND` | 0.7500 |
| `FINGER` | 0.5625 |
| `CLOAK` | 0.5625 |
| `BODY` | 0.0000 (praktisch ignorieren) |

Hinweis:
- In der Original-Lua sind interne Slot-IDs (`ItemSlot`) mit drin, aber fuer die Scoreformel brauchst du nur `SlotMOD`.

---

## 4) Quality-Normalisierung (sehr wichtig)

Interne Rarity-Codes wie im AddOn:

- `2 = Uncommon`
- `3 = Rare`
- `4 = Epic`

Vor der Formel wird normalisiert:

1. **Legendary**
   - Wenn API-Qualitaet `LEGENDARY`:
   - `QualityScale = 1.3`
   - interne Rarity auf `4` (Epic) setzen

2. **Common / Poor**
   - Wenn API-Qualitaet `COMMON` oder `POOR`:
   - `QualityScale = 0.005`
   - interne Rarity auf `2` setzen

3. **Heirloom**
   - Wenn API-Qualitaet `HEIRLOOM`:
   - interne Rarity auf `3`
   - `item_level = 187.05`

4. **Alle anderen**
   - `UNCOMMON -> 2`, `RARE -> 3`, `EPIC -> 4`
   - `QualityScale = 1.0`

---

## 5) Formel-Tabellen A/B/C

Je nach Itemlevel und Rarity wird Tabelle A, B oder C verwendet.
Jede Tabelle liefert pro Rarity zwei Koeffizienten: `FormulaA` und `FormulaB`.

### Tabelle A

- Rarity 4: `A = 91.45`, `B = 0.65`
- Rarity 3: `A = 81.375`, `B = 0.8125`
- Rarity 2: `A = 73.0`, `B = 1.0`

### Tabelle B

- Rarity 4: `A = 26.0`, `B = 1.2`
- Rarity 3: `A = 0.75`, `B = 1.8`
- Rarity 2: `A = 8.0`, `B = 2.0`
- Rarity 1: `A = 0.0`, `B = 2.25` (in Praxis kaum relevant, weil vorher normalisiert)

### Tabelle C

- Nur Rarity 4: `A = 0.25`, `B = 1.6275`

---

## 6) Tabellenauswahl (A/B/C)

Die Auswahlregeln sind exakt:

1. Wenn `item_level < 100` und `rarity == 4` -> **Tabelle C**
2. Sonst wenn `item_level < 168` und `rarity == 4` -> **Tabelle B**
3. Sonst wenn `item_level < 148` und `rarity == 3` -> **Tabelle B**
4. Sonst wenn `item_level < 138` und `rarity == 2` -> **Tabelle B**
5. Sonst wenn `item_level <= 120` -> **Tabelle B**
6. Sonst -> **Tabelle A**

---

## 7) Item-Gearscore Formel

Wenn `rarity` zwischen 2 und 4 liegt:

```text
raw = ((item_level - FormulaA) / FormulaB) * SlotMOD * Scale * QualityScale
item_gearscore = floor(raw)
```

Mit:
- `Scale = 1.8618`
- `SlotMOD` aus Abschnitt 3
- `QualityScale` aus Abschnitt 4

Regeln:
- Falls `item_gearscore < 0`, dann auf `0` setzen.
- Unbekannte Slots oder fehlende Daten => Itemscore `0`.

---

## 8) Gesamtscore eines Charakters

Wie im AddOn:

1. Starte:
   - `totalScore = 0`
   - `itemCount = 0`
   - `levelTotal = 0`
   - `titanGrip = 1.0`

2. Lies Mainhand und Offhand:
   - Wenn Mainhand **oder** Offhand `TWOHWEAPON` ist -> `titanGrip = 0.5`

3. Offhand zuerst addieren (wenn vorhanden):
   - `temp = itemScore(offhand)`
   - Wenn Klasse `HUNTER`: bei Offhand-Waffentypen wird zusaetzlich mit `0.3164` multipliziert
   - Danach `temp = temp * titanGrip`
   - In Summe aufnehmen

4. Danach alle Slots `1..18` iterieren, aber:
   - Slot 4 (Body/Shirt) ueberspringen
   - Slot 17 (Offhand) ueberspringen (weil schon separat)

5. Fuer jedes Item:
   - `temp = itemScore(item)`
   - Hunter-Spezialfall:
     - Slot 16 (Mainhand): `temp *= 0.3164`
     - Slot 18 (Ranged): `temp *= 5.3224`
   - Wenn Slot 16: `temp *= titanGrip`
   - `totalScore += temp`
   - `itemCount += 1`
   - `levelTotal += item_level`

6. Endergebnis:

```text
character_gearscore = floor(totalScore)
avg_item_level     = floor(levelTotal / itemCount)
```

Wenn keine gueltigen Items vorhanden sind: `0, 0`.

---

## 9) Battle.net API Mapping-Hinweise

Da API-Felder je Endpoint leicht variieren koennen, baue ein robustes Mapping:

- `item_level` -> numerisch
- `quality.type` -> in interne Rarity mappen
- `inventory_type.type` -> auf die SlotMOD-Tabelle mappen
- Character-Klasse -> `HUNTER`-Sonderlogik aktivieren

Empfehlung:
- Verwende eine zentrale `mapQuality()` und `mapInventoryTypeToSlotMod()` Funktion.
- Logge unbekannte `inventory_type.type` Werte und setze deren Score auf `0`.

---

## 10) Referenz-Pseudocode

```python
import math

SCALE = 1.8618

def normalize_quality(api_quality, item_level):
    quality_scale = 1.0
    if api_quality == "LEGENDARY":
        return 4, item_level, 1.3
    if api_quality in ("COMMON", "POOR"):
        return 2, item_level, 0.005
    if api_quality == "HEIRLOOM":
        return 3, 187.05, 1.0
    if api_quality == "EPIC":
        return 4, item_level, 1.0
    if api_quality == "RARE":
        return 3, item_level, 1.0
    if api_quality == "UNCOMMON":
        return 2, item_level, 1.0
    return None, item_level, 1.0

def select_formula_table(ilvl, rarity):
    if ilvl < 100 and rarity == 4:
        return "C"
    if ilvl < 168 and rarity == 4:
        return "B"
    if ilvl < 148 and rarity == 3:
        return "B"
    if ilvl < 138 and rarity == 2:
        return "B"
    if ilvl <= 120:
        return "B"
    return "A"

FORMULA = {
    "A": {4: (91.45, 0.65), 3: (81.375, 0.8125), 2: (73.0, 1.0)},
    "B": {4: (26.0, 1.2), 3: (0.75, 1.8), 2: (8.0, 2.0), 1: (0.0, 2.25)},
    "C": {4: (0.25, 1.6275)},
}

def item_score(item_level, api_quality, slot_mod):
    rarity, ilvl, qscale = normalize_quality(api_quality, item_level)
    if rarity is None or slot_mod is None:
        return 0
    table = select_formula_table(ilvl, rarity)
    if rarity not in FORMULA[table]:
        return 0
    a, b = FORMULA[table][rarity]
    raw = ((ilvl - a) / b) * slot_mod * SCALE * qscale
    return max(0, math.floor(raw))
```

---

## 11) Validierung

Zur Pruefung:

1. Nimm einen Character aus dem Spiel.
2. Ziehe alle ausgeruesteten Items per API.
3. Rechne mit dieser Anleitung.
4. Vergleiche mit TacoTip-Anzeige.

Wenn Abweichungen auftreten, pruefe zuerst:
- Expansion/`BRACKET_SIZE`
- korrektes `inventory_type` Mapping
- Hunter/TitanGrip-Sonderlogik
- Heirloom/Legendary-Normalisierung

