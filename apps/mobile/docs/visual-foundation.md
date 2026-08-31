# KeylorFit visual foundation

The light-theme tokens live in `components/ui/tokens.ts`. Reusable primitives
live beside them in `components/ui/`: `Screen`, `Card`, `Button`, form controls,
and `LoadingState`. `Screen` owns scrolling and safe-area handling so feature
screens do not duplicate system-bar inset logic.

M2 screens should compose these primitives first, use tokens rather than raw
color or spacing values, and add a primitive only when it can serve more than
one feature. Product-specific layout belongs with the feature, not the UI
foundation.

Dark mode is intentionally deferred. Keep the native appearance light until a
product decision introduces a dark palette with verified contrast; do not add a
theme framework in the meantime.
