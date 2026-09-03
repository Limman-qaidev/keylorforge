# KeylorForge brand assets

## Canonical mark

`keylorforge-g4-mark.svg` is the canonical KeylorForge G4 mark approved by the Product Owner. It uses `currentColor` and is intended for inline SVG or component-based consumption where the consumer controls the CSS/current color value.

When the SVG is used as an external image resource (for example an HTML `<img>`), the parent page's `color` does not cascade into the SVG document. External/static consumers should therefore use one of the fixed-color exports below instead of relying on `currentColor`.

The fixed-color exports are convenience variants derived from the same vector geometry:

- `keylorforge-g4-mark-white.svg` — dark/photo backgrounds
- `keylorforge-g4-mark-yellow.svg` — primary auth/energy accent
- `keylorforge-g4-mark-teal.svg` — secondary brand accent
- `keylorforge-g4-mark-black.svg` — light backgrounds / print

## Canonical lockups

Use these pre-outlined SVG lockups when a complete `KEYLORFORGE` logo is required. The lettering is stored as vector paths, so rendering does not depend on fonts installed on the consuming platform.

- `keylorforge-g4-lockup-horizontal-dark.svg` — yellow mark + white `KEYLOR` + teal `FORGE`; default for dark auth surfaces
- `keylorforge-g4-lockup-horizontal-photo.svg` — white mark + white `KEYLOR` + teal `FORGE`; default over dark photography / Welcome
- `keylorforge-g4-lockup-horizontal-light.svg` — black mark + black `KEYLOR` + teal `FORGE`; light surfaces
- `keylorforge-g4-lockup-stacked-dark.svg` — stacked yellow/white/teal treatment for narrow dark layouts
- `keylorforge-g4-lockup-stacked-light.svg` — stacked black/teal treatment for narrow light layouts

See [`PREVIEW.md`](./PREVIEW.md) for the visual review sheet rendered from the exact repository assets.

## Brand colors

- Yellow: `#FFC107`
- Teal: `#00D1C1`
- Teal on light surfaces: `#00AFA1`
- White: `#FFFFFF`
- Black: `#0B0B0D`

## Usage

Use the SVG master when the platform supports inline vectors/components and dynamic recoloring is required. Use the fixed-color exports or outlined lockups for external/static image consumption. Do not redraw the mark, substitute emoji lightning, or create screen-specific geometry.

Runtime platforms that cannot consume SVG directly should derive raster exports or a platform component from this master while preserving the same silhouette.

For Welcome, prefer the photo lockup. For Sign In / Create Account and other dark non-photographic identity surfaces, prefer the dark lockup. The standalone mark is appropriate for app icons, compact navigation, avatars/marks, favicons and other spaces where the full wordmark would not remain legible.
