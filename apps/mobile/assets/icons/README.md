# KeylorForge app launcher icons

The PNGs in this folder are rasterizations of the **canonical KeylorForge G4 symbol** (the stylized K/bolt) from `/brand/keylorforge-g4-mark.svg`. They are **launcher assets**, not alternate brand artwork. **Do not redraw the logo**.

- `keylorforge-app-icon.png` — 512 × 512 opaque blue (`#075BFF`) icon with white G4, for the standard / legacy launcher icon.
- `keylorforge-adaptive-foreground.png` — 512 × 512 transparent foreground with the official white mark centered within Android's adaptive mask safe zone.
- `keylorforge-adaptive-monochrome.png` — 512 × 512 transparent/white mask for optional Android 13+ themed icons; uses the exact same silhouette as foreground.
- Android adaptive background is the solid `#075BFF` declared in `apps/mobile/app.json`.

The three PNG file paths are defined once in `app.json` and automatically inherited by the ordinary app and the **separate-package** QA Real and QA Standalone builds via `app.config.js`. Keep these package identities, and their separate app data, unchanged.

**Visual validation**: build the isolated QA Real APK, install **in place** with `adb install -r`, check the launcher/home-screen icon and Android themed-icon setting, then launch the application. Do not `adb uninstall`, `pm clear`, or erase SQLite/outboxes. Changing an icon **requires a new native build**; Metro/JS reload is not sufficient.

If updating the mark, regenerate all launcher assets from the canonical SVG and verify the adaptive foreground remains padded. No splash/auth content or M3 logic is changed by this branding slice.
