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

- **Library** with thumbnails. Add vault files, a whole folder, or a URL or absolute path. Drag rows to reorder, rename anything, filter by name or type. Removing a wallpaper can be undone from the notice that appears.
- **Wallpaper by theme**: pick one wallpaper for the light theme and one for the dark theme; Scenery switches when the theme does.
- **Slideshow**: switch on a timer, in order or shuffled, with a cross-fade.
- **Appearance**: readability dimming, sidebar tint, blur, brightness, saturation, fit mode, mouse parallax. Shared by all wallpapers, or set per wallpaper with **Give this wallpaper its own appearance**.
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

An imported or exported scene stays **linked** to its folder: when `scenery.json` there changes (for example, when the Studio saves into it), the scene in Obsidian is replaced with the new version. Edits made in Obsidian's scene editor since the last export are lost when that happens, so export first if you want to keep them.

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

## Scenery Studio: make wallpapers in the browser

`studio/` holds a small web app for making wallpapers with more room than a sidebar gives you. It draws with the plugin's own rendering code, so what you see is what Obsidian shows.

- **Scene mode**: a large preview with a mock-up of Obsidian on top, so you can judge readability. Drop images and videos onto the page, drag a layer on the preview to move it, scroll to resize it, and edit everything else in the side panel.
- **Package mode**: edit `index.html` and `scenery.json` next to the running page. The settings your package declares appear as controls, and you can switch theme, accent colour and pause to see how the page responds.
- **Save to folder** (Chrome, Edge and other Chromium browsers): choose your vault's `Scenery` folder once and the Studio writes the wallpaper there. After you add that folder in Obsidian with **Vault folder**, saving again from the Studio updates the wallpaper in Obsidian, for packages and scenes alike.
- **Download .zip** works in every browser. Unpack it into your vault.
- **Open folder** loads a scene or package back in, including scenes exported from Obsidian.

Run it locally:

```bash
npm run studio:dev
```

Then open http://localhost:4173. `npm run studio` builds a static copy into `studio/dist/` that can be hosted anywhere; the **Studio** workflow publishes it with GitHub Pages.

Everything stays in your browser: the Studio uploads nothing. Limits: in the Studio's preview a package cannot load its own extra files (images, scripts) by relative path, and package layers inside a scene can be kept but not created or configured.

## Privacy and security

- Scenery makes no network requests and collects nothing.
- It lists the files in your vault only to offer them in its pickers (images, videos, HTML pages and wallpaper folders), and reads the files of the wallpapers you add. It does not read your notes.
- It keeps its settings in the plugin's own data file. The storage calls in its code belong to the sandboxed wallpaper page: a page that asks for `localStorage` gets a temporary in-memory stand-in, and nothing is saved.
- Web-page wallpapers and packages run in a sandboxed frame (`sandbox="allow-scripts"`). They cannot read your vault, your notes or the app. They can, however, make network requests like any web page.
- A package can ask to learn the name and path of the note you have open. It only receives them if you turn that on for that wallpaper; it is off by default.
- Wallpapers are behind the workspace and never receive clicks or key presses.

## Compatibility

- Desktop only.
- Requires Obsidian 1.8.7 or later.
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

`npm test` also checks the Studio. It builds the plugin against a small stand-in for the Obsidian API (`test/harness/stub.js`) and exercises it in headless Chromium. It checks the plugin's own logic; it does not replace trying a change in Obsidian. The first time, install the browser with `npx playwright install chromium`.

`npm run lint` runs `eslint-plugin-obsidianmd`, the rule set the Obsidian community directory applies to submissions.

To release, bump the version with `npm version <new version>`, push, then either push a tag equal to that version or run the **Release** workflow from the Actions tab. The workflow lints, tests, builds, attests the build provenance and publishes the release.

## Licence

MIT
