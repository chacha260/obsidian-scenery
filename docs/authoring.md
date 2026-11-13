# Writing a wallpaper package

A package is a wallpaper written in HTML, CSS and JavaScript. If you would rather not write code, see *Scenes* in the README.

[日本語版はこちら](authoring.ja.md)

## Getting started

1. Run the command **Scenery: Create wallpaper package** and type a name.
2. A working example (`scenery.json` and `index.html`) is created in `Scenery/<name>/` and shown as your wallpaper.
3. Edit the two files in any editor. **Saving reloads the wallpaper.**

To use an existing folder, choose it with **Settings → Scenery → + → Vault folder**. It must contain `scenery.json`.

## Folder layout

```
Scenery/my-wallpaper/
├── scenery.json   manifest (required)
├── index.html     the page that is loaded
└── …              images, scripts, CSS; reference them with relative paths
```

## scenery.json

```json
{
  "name": "My wallpaper",
  "author": "you",
  "version": "1.0.0",
  "description": "Shown in the settings",
  "entry": "index.html",
  "permissions": [],
  "properties": {
    "count": { "type": "slider", "label": "Number of orbs", "min": 5, "max": 200, "step": 5, "default": 60 },
    "color": { "type": "color", "label": "Colour", "default": "#7fd4ff" },
    "trails": { "type": "toggle", "label": "Trails", "default": true },
    "shape": { "type": "select", "label": "Shape", "options": { "glow": "Glow", "ring": "Ring" }, "default": "glow" },
    "message": { "type": "text", "label": "Message", "default": "" }
  }
}
```

Every field is optional. `entry` defaults to `index.html`.

### properties

Each property becomes a control under “Settings for ‹wallpaper›” in the Scenery settings. The values a user picks are saved per wallpaper.

| type | Value your page receives | Extra fields |
| --- | --- | --- |
| `slider` | number | `min` (default 0), `max` (default 100), `step` (default 1) |
| `color` | string, `"#rrggbb"` | |
| `toggle` | `true` or `false` | |
| `select` | string, the chosen value | `options`: a list of values, or an object mapping value to label |
| `text` | string | |

All types accept `label`, `description` and `default`. Numbers outside the range and values that are not among the options are corrected before they reach your page.

### permissions

| Value | Meaning |
| --- | --- |
| `"note"` | The wallpaper wants the name and path of the open note |

Listing `"note"` adds a toggle to the wallpaper's settings. Until the user turns it on, `scenery.note` is `null`.

## API: `window.scenery`

Scenery defines `scenery` before your scripts run. There is nothing to include.

### `scenery.on(key, fn)`

Calls `fn` **once immediately** with the current value, then again whenever the value changes. Returns a function that removes the listener.

```js
scenery.on("props", function (props) {
  // runs now, and every time the user changes a setting
});
```

| key | Value | Changes when |
| --- | --- | --- |
| `"props"` | Object with one entry per property in `scenery.json` | The user changes a setting |
| `"theme"` | Theme information, see below | The theme or light/dark mode changes |
| `"pointer"` | `{ x, y }`, pointer position in the window, 0 to 1 | The pointer moves |
| `"paused"` | `true` or `false` | Obsidian goes to the background, or the user pauses |
| `"note"` | `{ name, path }` or `null` | Another note is opened |

The same values can be read at any time from `scenery.props`, `scenery.theme`, `scenery.pointer`, `scenery.paused` and `scenery.note`.

### Theme information

```js
{
  dark: true,                       // true for dark themes
  accent: "rgb(138, 92, 245)",      // accent colour
  background: "rgb(30, 30, 30)",    // main background
  backgroundAlt: "rgb(38, 38, 38)", // sidebars and similar
  text: "rgb(218, 218, 218)",       // body text
  textMuted: "rgb(153, 153, 153)"   // secondary text
}
```

Colours are `rgb()` strings and work in CSS and on a canvas.

## Things to know

- **Pausing is automatic.** While paused, Scenery holds `requestAnimationFrame` callbacks and releases them on resume. If you draw with `requestAnimationFrame`, you stop in the background without doing anything. `setInterval`, CSS animations and videos keep running; listen to `"paused"` if that matters.
- **Your page never receives clicks or key presses.** It sits behind the workspace. Use `"pointer"` for the pointer position.
- **Your page runs in a sandboxed frame.** It cannot touch the vault or the app. `localStorage` and `sessionStorage` can be called, but they are temporary and empty after a reload. Cookies are not available. Anything worth keeping should be a property.
- **`fetch()` cannot read files in the package**, and ES modules (`<script type="module">`) may fail for the same reason. Images, ordinary `<script src>` and `<link rel="stylesheet">` load fine with relative paths. Put data in a `.js` file and load it with `<script>`.
- **Readability dimming sits on top.** The theme's background colour is laid over the wallpaper at a strength the user chooses. Subtle visuals can get lost.

## Using a package as a scene layer

A package can be stacked with other layers in the scene editor: **Add layer → Package**. Its properties appear in the layer's settings.

- **Leave the page background unset if it is meant for layering.** Without a background on `body`, the layers below show through.
- As a layer, a package always sees `scenery.note` as `null`.

## Sharing

A package is just a folder. Zip it and send it; the recipient unpacks it into a vault and adds it with **Vault folder**.
