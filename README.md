# LovelaceSettings

A settings interface for the [Lovelace](https://github.com/Enjuchan/Lovelace)
Discord theme. Toggle features, pick colours and adjust blur without opening a
CSS file.

The button appears in the Discord toolbar next to
[DynamicBackgrounds](https://github.com/Enjuchan/DynamicBackgrounds), and only
while the Lovelace theme is enabled.

---

## What it does

**Features** - switch individual parts of the theme on and off: heart-shaped
avatars, the glow, the collapsing bottom-left panel, the merged title bar, the
list backgrounds, full timestamps and the enlarged emoji picker.

**Colours** - set the two glow tones with swatches or a hex field. One colour
produces both the resting and the active variant, so the two never drift apart.
Five presets are included: Lovelace, Frost, Ember, Moss and Amethyst.

**Background** - point the theme at any image URL.

**Adjustments** - panel width, fill opacity, blur for menus and lists,
background blur and brightness, Spotify cover treatment. Every slider gets a
reset button once it differs from the default.

---

## Requirements

- [BetterDiscord](https://betterdiscord.app)
- [Lovelace](https://github.com/Enjuchan/Lovelace) **2.0.0 or newer**

Older Lovelace versions do not know the switch variables, so colours and
sliders still work but the feature toggles do nothing.

---

## Installation

1. Download `LovelaceSettings.plugin.js`
2. Put it in your BetterDiscord plugins folder
   - Windows: `%appdata%\BetterDiscord\plugins`
   - macOS: `~/Library/Application Support/BetterDiscord/plugins`
   - Linux: `~/.config/BetterDiscord/plugins`
3. Enable it under Settings → Plugins

If the toolbar button does not show up right away, switch channels once - the
toolbar redraws and the button appears.

---

## Updates

From 1.1.0 on the plugin keeps **itself and the Lovelace theme** up to date. A
few seconds after start it fetches both files from GitHub and compares the
version in each header. For anything outdated a notice appears with an
**Update** button - one click replaces the file, BetterDiscord reloads
it, and that is it.

The theme is included because it cannot do this itself: `Lovelace.theme.css` is
plain CSS and executes no code. This plugin is the theme's counterpart anyway,
so it does the checking for both. If the theme is not installed, that check is
skipped.

> Using Lovelace **without** this plugin means no update notices for the theme.
> That is the one thing the plugin does which cannot be replicated by hand in
> Custom CSS.

If the check fails, nothing happens beyond a line in the console. Nothing is
downloaded or written without pressing that button.

---

## How it works

The plugin writes CSS custom properties into a single `<style>` element and
toggles three classes on the `<html>` element. That is all it does to your
client, and it never modifies the theme file - except when you ask it to update
the theme, see [Updates](#updates).

The classes exist because a variable can change a value but cannot switch a
rule off, and three of the features span several rules each.

The settings panel is a plain positioned element rather than one of Discord's
internal popout components, so a Discord update cannot break it.

That has a useful consequence: disable the plugin and the theme falls straight
back to its built-in defaults. Nothing is left behind.

Everything it sets can also be written by hand in Custom CSS - the plugin is
convenience, not a requirement. See the Lovelace README for the variable list.

---

## License

MIT