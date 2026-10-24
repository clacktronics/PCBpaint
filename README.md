# PCB Paint

A browser-based PCB layout tool where you make connections the way you would in a paint app: pick a colour of paint (a net) and brush copper between pads. The app tidies wobbly strokes, snaps to pad centres, keeps nets apart and nudges other traces out of the way.

## Try it

The prototype is a single, dependency-free HTML file. Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server
# then visit http://localhost:8000
```

Boards autosave to your browser's `localStorage`. Use **Save .json** / **Open…** to keep boards as `.pcbp.json` files, and **Make it →** to download the top copper as a 1:1 SVG.

## Keys

| Key | Action |
|---|---|
| `B` / `V` / `E` | Brush / Move / Eraser |
| `N` | New net |
| `1`–`9` | Select paint pot |
| `[` `]` | Brush size − / + |
| `R` | Rotate part |
| `Space`-drag | Pan |
| `Ctrl/⌘ Z`, `Shift+Ctrl/⌘ Z` | Undo / redo |

## Docs

- [Product spec](docs/spec.md): behaviour, data model, visual language and milestones.

## Status

Milestone 1 (prototype) is done. Next up is M2, "Real boards": board outline editing, pours, Gerber/Excellon export and fab presets. See §12 of the spec.
