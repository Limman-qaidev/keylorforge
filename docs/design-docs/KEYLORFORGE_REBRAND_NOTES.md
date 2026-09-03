# KeylorForge rebrand notes

This branch adopts **KeylorForge** as the live product identity.

## Identity changes

- Product name: `KeylorForge`
- Expo slug and custom URI scheme: `keylorforge`
- Android application id: `com.jonathansalgadonieto.keylorforge`
- Mobile package namespace: `@keylorforge/mobile`
- Auth callbacks: `keylorforge://auth/confirm` and `keylorforge://auth/recovery`
- Runtime and canonical brand asset filenames use `keylorforge-*`

## Brand geometry

The approved G4 mark geometry is unchanged. The new lockups preserve the existing `KEYLOR` outlined lettering and replace the former suffix with outlined `FORGE` lettering using the same Inter Bold Italic treatment. Dark/photo surfaces use teal `#00D1C1`; light lockups retain the existing higher-contrast teal `#00AFA1`.

## Historical visual references

Previously approved UI reference screenshots are immutable historical design evidence. Their repository filenames were renamed to the current product namespace, but their embedded pixels were not redrawn as part of the mechanical rebrand. Live runtime surfaces use the new KeylorForge lockups.

## External configuration required before merge

Supabase Auth redirect allow-lists/templates/SMTP sender identity, Resend sender/domain branding, Cloudflare DNS/domain configuration, and the repository display name must be checked against the new product identity. These are external control-plane settings rather than application source code.

## Merge gate

Do not merge until CI is green and the Product Owner has physically validated the new development build on Android, including signup confirmation deep links.
