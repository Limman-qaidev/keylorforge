# KeylorFit brand assets

## Canonical mark

`keylorfit-g4-mark.svg` is the canonical KeylorFit G4 mark approved by the Product Owner. It uses `currentColor`, so consuming clients can recolor the mark without modifying the path.

The fixed-color exports are convenience variants derived from the same vector geometry:

- `keylorfit-g4-mark-white.svg` — dark/photo backgrounds
- `keylorfit-g4-mark-yellow.svg` — primary auth/energy accent
- `keylorfit-g4-mark-teal.svg` — secondary brand accent
- `keylorfit-g4-mark-black.svg` — light backgrounds / print

## Brand colors

- Yellow: `#FFC107`
- Teal: `#00D1C1`
- White: `#FFFFFF`
- Black: `#0B0B0D`

## Usage

Use the SVG master whenever the platform supports vectors. Do not redraw the mark, substitute emoji lightning, or create screen-specific geometry. Runtime platforms that cannot consume SVG directly should derive raster exports or a platform component from this master while preserving the same silhouette.

The wordmark `KEYLORFIT` is separate from the mark. Keep `KEYLOR` neutral/white or dark according to background and use teal for `FIT` unless an explicitly approved monochrome treatment is required.
