# KeylorFit visual foundation

The light-theme tokens live in `components/ui/tokens.ts`. Reusable primitives
live beside them in `components/ui/`: `Screen`, `Card`, `Button`, form controls,
and `LoadingState`.

M2 screens should compose these primitives first, use tokens rather than raw
color or spacing values, and add a primitive only when it can serve more than
one feature. Product-specific layout belongs with the feature, not the UI
foundation.

Dark mode is intentionally deferred. Do not add a theme framework or a dark
palette until a product decision covers supported behavior and contrast.
