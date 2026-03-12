# WoW TBC Icons

Icons für Klassen und Specs werden hier abgelegt. **Damit Icons beim Deploy (z. B. Vercel) verfügbar sind, müssen die Dateien ins Git committed werden** – alles unter `public/` wird mit ausgeliefert.

## Klassen (`classes/`)

- Dateiname: `<classId>.png` (z. B. `druid.png`, `mage.png`, `warrior.png`)
- Class-IDs siehe `lib/wow-tbc-classes.ts`: `druid`, `hunter`, `mage`, `paladin`, `priest`, `rogue`, `shaman`, `warlock`, `warrior`

## Specs (`specs/`)

- Dateinamen wie in `lib/role-spec-icons.ts` unter `SPEC_ICON_FILES` (z. B. `fire-mage.png`, `restoration-shaman.png`)

Icons aus `C:\tmp\wow` hierher kopieren, dann committen und pushen – dann sind sie auch auf Preview/Production sichtbar.
