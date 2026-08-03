# Changelog

Versioning follows [Semantic Versioning](https://semver.org):

- **PATCH** (x.y.Z) - bug fixes only.
- **MINOR** (x.Y.0) - new controls, existing settings keep working.
- **MAJOR** (X.0.0) - settings are renamed or removed and have to be set again.

---

## 1.3.0

### Added

- A colour picker next to the hex field, and saved colours.

  The hex field only helps if you already know the value you want - there was
  no way to *find* a colour. The picker is the native one, which is why it was
  left out originally: it is drawn by the operating system and matches no
  theme. But it is the only control that lets you search rather than recall, so
  it now sits beside the hex field instead of replacing it. Its frame and
  padding are stripped so it does not break out of the panel.

  The star button saves the current colour; saved ones appear as their own row
  below the presets, separated by a dashed line so the fixed swatches stay
  distinguishable. Right-click removes one - the swatches are 14px wide, an ✕
  on them would be larger than the colour itself.

  Both colour fields share one list. A tone that works as a cool shade often
  works as a warm one too, and two separate lists would be double bookkeeping
  for the same purpose. Eight at most, newest first, oldest drops out.

---

## 1.2.0

Pairs with **Lovelace 2.3.0**. Works with older theme versions too - the glow
toggle then behaves as before.

### Fixed

- The glow toggle only stopped the breathing; the resting glow stayed lit. It
  worked purely through `--lv-glow-anim: none`, and a variable can change a
  value but cannot switch a rule off - several glow rules carry fixed values
  that no variable reaches.

  It now also sets `lv-no-glow` on the `<html>` element, the same approach
  already used for hearts, title bar and panel. Lovelace 2.3.0 hangs every glow
  rule on that class. The variable is still written as well, so nothing changes
  for anyone on an older theme.

---

## 1.1.3

### Fixed

- All user-facing text is English again. The update notices added in 1.1.0 were
  written in German (`Aktualisieren`, `ist verfuegbar`, `Update fehlgeschlagen`)
  while the rest of the interface is English.

Code comments stay German - they explain reasoning to whoever edits the file,
not to whoever uses it.

### Changed

- Update notices now close themselves once the update has been written. They
  used to stay on screen after a successful update, leaving an offer for a
  version that was already installed - and with three notices at once, that got
  in the way.

  BetterDiscord hands the button handler a dismiss function as its first
  argument; it was simply being ignored. If the write fails the notice stays on
  purpose, so the update can be retried.

---

## 1.1.1

### Fixed

- The update button did nothing except log `Cannot read properties of
  undefined (reading 'writeFile')`. The download and the version comparison
  worked, but writing the file used `fs.promises.writeFile`, and the `fs`
  module Discord's renderer hands out through `require` has no `promises`
  property. It now uses the callback form of `writeFile`, which is what every
  other plugin in the wild does. This affected the theme update as well, since
  both go through the same function.

---

## 1.1.0

### Added

- Update check for both the plugin and the Lovelace theme. On start the plugin
  fetches both files from GitHub, compares the `@version` in each header, and
  offers a notice with an "Aktualisieren" button for anything outdated.
  Accepting it rewrites the file; BetterDiscord picks up the change and reloads
  on its own. The theme check is skipped when Lovelace is not installed.

### Fixed

- The settings panel was see-through - chat text behind it showed through and
  made it hard to read. It used `var(--background-surface-high)`, and Lovelace
  sets that variable to `rgba(255, 255, 255, 0.15)`, so the panel inherited the
  theme's frosted glass. It now uses a fixed `#232428`, the tone Discord uses
  for its own popouts. This is why DynamicBackgrounds never had the problem: it
  uses Discord's popout component and gets an opaque background with it.
- Hovering the toolbar button showed no name. It relied on the `title`
  attribute, which Discord suppresses in the toolbar. It now uses Discord's own
  tooltip component, the same one DynamicBackgrounds uses, and falls back to
  `title` if that component cannot be found.
- The `@updateUrl` in the header pointed at `LovelaceSettings.plugin.js`, but
  the file in the repository was named `Lovelacesettings.plugin.js`. The URL
  returned 404, so the update check could never have worked. The file is now
  named to match its `@name`.

### Notes

The theme is covered here because it cannot cover itself: `Lovelace.theme.css`
is plain CSS and executes no code. This plugin is the theme's counterpart
anyway, so it does the checking for both.

The download goes through `BdApi.Net.fetch`, not `fetch`: Discord's content
security policy blocks requests to outside hosts from the renderer.

The downloaded text is checked for a parseable `@version` before anything is
written. A wrong URL returns an HTML error page with status 200 - exactly what
the broken URL above was returning - and writing that over a working addon
would break it.

---

## 1.0.0

First release.

### Added

- Toolbar button that opens the settings panel, shown only while the Lovelace
  theme is enabled
- Seven feature toggles: heart avatars, glow, collapsing panel, merged title
  bar, list backgrounds, full timestamps, enlarged picker
- Two colour fields with swatches and hex entry; each tone generates both its
  resting and active variant
- Five colour presets: Lovelace, Frost, Ember, Moss, Amethyst
- Background image field
- Nine sliders for panel width, fill opacity, blur and brightness, each with a
  reset button that appears once the value differs from the default
- Reset-all button with confirmation
- A notice when the Lovelace theme is not enabled, since the settings have no
  effect without it

### Notes

The panel is built from a positioned element rather than Discord's internal
popout component, and the only Discord internal the plugin touches is the
toolbar patch that places the button. If that ever stops working, the button
appears on the next channel switch and nothing else is affected.

Every declaration is written with `!important`. BetterDiscord injects themes
after plugin styles, and both write to `:root` - without it the values would be
calculated correctly and then silently overridden by the theme.