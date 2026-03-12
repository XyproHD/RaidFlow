# WoW TBC Icons (PNG)

Alle Icons sind PNG-Dateien und werden mit dem Projekt per Git committed, damit sie auf Vercel (Preview und Production) verfügbar sind.

- **Rollen:** `roles/tank.png`, `roles/melee.png`, `roles/range.png`, `roles/heal.png`
- **Klassen:** `classes/<classId>.png` (z. B. `druid.png`, `mage.png`)
- **Specs:** `specs/<class>/<spec>.png` (z. B. `specs/mage/fire.png`, `specs/druid/feral.png`)

Mapping: `lib/role-spec-icons.ts` (SPEC_ICON_PATHS, getClassIconPath, getSpecIconPath, getRoleIcon).
