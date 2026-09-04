# Changelog

## 0.1.0

Initial release, extracted from the Zenlayer marketing CMS where it ran in
production as an inline plugin.

- `puck:canvas` field widget: edits any `json` field as a Puck document in a
  full-screen overlay, with Cancel / Save layout, an unsaved-changes guard and
  a searchable block panel with live hover previews.
- `emdash-plugin-puck/render`: `createPuckPage`, `parseLayout`,
  per-section error boundaries, `Editable` and `hasDesignedComponents`.
- `emdash-plugin-puck/render/designed`: the separate island for pages that
  carry Puck AI design-mode components.
- `emdash-plugin-puck/fields`: `mediaField()`, the EmDash media library as a
  Puck field.
- `emdash-plugin-puck/ai` and `emdash-plugin-puck/ai/handler`: Puck AI in the
  editor and the authenticated Puck Cloud route behind it.
- `emdash-plugin-puck/theme.css`: Puck's tokens aliased onto the EmDash
  admin's, so the editor follows the admin's palette and light/dark mode.
