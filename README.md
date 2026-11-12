# Scenery

Animated wallpapers behind your Obsidian workspace, in the spirit of Wallpaper Engine: images, videos, web pages, built-in effects, and wallpapers you compose or code yourself.

[日本語の README はこちら](README.ja.md)

> **Network use.** Scenery itself makes no network requests. Web-page wallpapers and wallpaper packages are HTML pages, and the code in them **can** reach the internet, like any web page. Only add pages and packages you trust. See [Privacy and security](#privacy-and-security).

## Wallpaper types

| Type | What it is |
| --- | --- |
| Image | png, jpg, gif, webp, avif, svg and more |
| Video | mp4, webm, mov and more. Loops; volume and speed are adjustable |
| Web page | An `.html` file in your vault, or a URL |
| Effect | Aurora, Starfield, Particles, Snow, Fireflies, Rain. They follow your theme's accent colour |
| Scene | Layers of images, videos, effects, colours and packages that you arrange in an editor, no code needed |
| Package | A wallpaper written in HTML and JavaScript that declares its own settings |

## Features

- **Library** with thumbnails. Add vault files, a whole folder, or a URL or absolute path. Drag rows to reorder, rename anything.
- **Slideshow**: switch on a timer, in order or shuffled, with a cross-fade.
- **Appearance**: readability dimming, sidebar tint, blur, brightness, saturation, fit mode, mouse parallax.
- **Battery-friendly**: videos and effects stop while no Obsidian window is focused.
- **Pop-out windows** show the wallpaper too (can be turned off).
- **File menu**: right-click an image or video and choose *Set as wallpaper*.
- **Commands**: toggle, next, previous, random, pause, choose wallpaper, create scene, edit scene, export scene, create wallpaper package, reload wallpaper.
- The settings are available in English and Japanese.

## Getting started

Enable the plugin and the Aurora effect appears. Open **Settings → Scenery**, add wallpapers to the library and press **Use**. If text becomes hard to read, raise **Readability dimming**.

## Scenes: compose a wallpaper without code

1. Run the command **Scenery: Create scene** (or press **Create scene** in the library).
2. The scene editor opens in the right sidebar, and the scene is shown as your wallpaper while you edit it.
3. Press **Add layer** to stack images, videos, effects, colours or gradients, and packages.

Each layer has:

- visibility, order (drag the rows), duplicate, delete
- opacity, blend mode (screen, multiply, overlay and more), blur
- scale, position and fit
- motion (sway, drift, slow zoom, rotate, pulse) with amount and cycle length
- parallax depth, so layers move by different amounts with the pointer
- for effects, the theme accent colour or a colour of your choice

**Preview without dimming** temporarily hides the readability dimming so you can judge the scene itself.

### Export and import

The export button next to the scene's name (or the command **Export scene to a folder**) writes the scene to `Scenery/<scene name>/` in your vault. Images, videos and packages from the vault are copied into that folder, so you can zip it and share it. URLs and paths outside the vault are recorded as they are, not copied.

To import, put the folder in a vault and choose it with **Vault folder** in the library. It arrives as an ordinary, editable scene.

## Packages: write a wallpaper in HTML and JavaScript

The command **Scenery: Create wallpaper package** creates a working example in `Scenery/<name>/`.

- Declare sliders, colours, toggles, selects and text fields in `scenery.json`; they appear in the settings automatically.
- In the page, `scenery.on("props" | "theme" | "pointer" | "paused" | "note", fn)` delivers the values.
- Saving a file in the package reloads the wallpaper.
- Drawing with `requestAnimationFrame` stops by itself while Obsidian is in the background.

The full reference is in [docs/authoring.md](docs/authoring.md).

### Wallpaper Engine web wallpapers (experimental)

A folder containing a Wallpaper Engine **web** wallpaper (`project.json`) can be added with **Vault folder** and is loaded as a package.

- User properties from `project.json` (slider, colour, checkbox, combo, text input) appear in the settings and are passed to `wallpaperPropertyListener.applyUserProperties`. `applyGeneralProperties` and `setPaused` are called as well.
- There is no audio capture: audio listeners receive silence, so audio-reactive wallpapers will not react.
- Wallpapers that read local files with `fetch()` or ES modules, or that use file-picker properties, may not work.
- Scene, video and application wallpapers are not supported.
- This was built from the documented API and has not been tested against Workshop items. Use it with wallpapers you have the right to use.

## Privacy and security

- Scenery makes no network requests and collects nothing.
- Web-page wallpapers and packages run in a sandboxed frame (`sandbox="allow-scripts"`). They cannot read your vault, your notes or the app. They can, however, make network requests like any web page.
- A package can ask to learn the name and path of the note you have open. It only receives them if you turn that on for that wallpaper; it is off by default.
- Wallpapers are behind the workspace and never receive clicks or key presses.

## Compatibility

- Desktop only.
- Requires Obsidian 1.7.2 or later.
- Tested with the default theme and with Minimal. Themes that force their own opaque backgrounds may leave some panels non-transparent.
- The settings window is never made transparent.

## Limitations

- No audio-reactive wallpapers.
- Heavy videos combined with blur can use noticeable GPU time. Lower the effect frame rate or turn blur off if needed.

## Installing manually

1. Download `main.js`, `manifest.json` and `styles.css` from the latest release.
2. Put them in `<vault>/.obsidian/plugins/scenery/`.
3. Enable **Scenery** under **Settings → Community plugins**.

## Development

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

`npm test` builds the plugin against a small stand-in for the Obsidian API (`test/harness/stub.js`) and exercises it in headless Chromium. It checks the plugin's own logic; it does not replace trying a change in Obsidian. The first time, install the browser with `npx playwright install chromium`.

`npm run lint` runs `eslint-plugin-obsidianmd`, the rule set the Obsidian community directory applies to submissions.

To release, bump the version with `npm version <new version>`, push, then either push a tag equal to that version or run the **Release** workflow from the Actions tab. The workflow lints, tests, builds, attests the build provenance and publishes the release.

## Licence

MIT
