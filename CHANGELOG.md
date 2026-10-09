# Changelog

## 0.3.0

- Supports EmDash 1.x: the `emdash` peer range is now `>=0.35.0 <2.0.0`,
  and the plugin builds and type-checks against EmDash 1.2.
- `mediaField(label, hint, { kind: "video" })` picks videos: the library lists
  only `video/*` media, uploads accept only video files, and thumbnails
  render as a muted first frame. `kind` defaults to `"image"`, so existing
  fields are unchanged. `MediaFieldOptions` and `MediaKind` are exported from
  `emdash-plugin-puck/fields`.
- The media name index now covers every kind of media, so a video value shows
  its filename instead of the URL's last segment.

## 0.2.0

- `emdash-plugin-puck/blocks`: `createBlocks()`, a starter kit of ten
  composable blocks (Grid, Flex, Space, Heading, Text, Prose, Card, Stats,
  Logos, Button) ported from Puck's demo app, with parent-aware layout
  controls, inline editing, closed token selects and Puck AI instructions.
  Site hooks: `icons`, `resolveHref`, `disallow`, `buttonActions`,
  `buttonClassName`, `options`.
- `emdash-plugin-puck/blocks.css`: the kit stylesheet, reading `--zk-*`
  variables with fallbacks to conventional site tokens and literals.

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
