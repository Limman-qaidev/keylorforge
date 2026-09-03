# KeylorFit brand assets

## Canonical mark

`keylorfit-g4-mark.svg` is the canonical KeylorFit G4 mark approved by the Product Owner. It uses `currentColor`, so consuming clients can recolor the mark without modifying the path.

The fixed-color exports are convenience variants derived from the same vector geometry:

- `keylorfit-g4-mark-white.svg` — dark/photo backgrounds
- `keylorfit-g4-mark-yellow.svg` — primary auth/energy accent
- `keylorfit-g4-mark-teal.svg` — secondary brand accent
- `keylorfit-g4-mark-black.svg` — light backgrounds / print

## Canonical lockups

Use these pre-outlined SVG lockups when a complete `KEYLORFIT` logo is required. The lettering is stored as vector paths, so rendering does not depend on fonts installed on the consuming platform.

- `keylorfit-g4-lockup-horizontal-dark.svg` — yellow mark + white `KEYLOR` + teal `FIT`; default for dark auth surfaces
- `keylorfit-g4-lockup-horizontal-photo.svg` — white mark + white `KEYLOR` + teal `FIT`; default over dark photography / Welcome
- `keylorfit-g4-lockup-horizontal-light.svg` — black mark + black `KEYLOR` + teal `FIT`; light surfaces
- `keylorfit-g4-lockup-stacked-dark.svg` — stacked yellow/white/teal treatment for narrow dark layouts
- `keylorfit-g4-lockup-stacked-light.svg` — stacked black/teal treatment for narrow light layouts

See [`PREVIEW.md`](./PREVIEW.md) for the visual review sheet rendered from the exact repository assets.

## Brand colors

- Yellow: `#FFC107`
- Teal: `#00D1C1`
- White: `#FFFFFF`
- Black: `#0B0B0D`

## Usage

Use the SVG master whenever the platform supports vectors. Do not redraw the mark, substitute emoji lightning, or create screen-specific geometry. Runtime platforms that cannot consume SVG directly should derive raster exports or a platform component from this master while preserving the same silhouette.

For Welcome, prefer the photo lockup. For Sign In / Create Account and other dark non-photographic identity surfaces, prefer the dark lockup. The standalone mark is appropriate for app icons, compact navigation, avatars/marks, favicons and other spaces where the full wordmark would not remain legible.
