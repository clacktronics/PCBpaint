# PCB Paint

A browser-based PCB layout tool where you make connections the way you would in a paint app: pick a colour of paint (a net) and brush copper between pads. The app tidies wobbly strokes, snaps to pad centres, keeps nets apart and nudges other traces out of the way.

**Try it:** https://clacktronics.github.io/PCBpaint/

## Run it locally

There's no build step and there are no dependencies. Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server
# then visit http://localhost:8000
```

Boards autosave to your browser's `localStorage`. Use **Save .json** / **Open…** to keep boards as `.pcbp.json` files.

## What it does

- **Brush**: net-aware painting with tidy (Round / 45° / Freehand), pad snapping, stop-short and no-cross rules, and live shove of other nets.
- **Two layers**: top and bottom copper. The inactive side is ghosted. Press `Alt` mid-stroke to drop a via and carry on on the other side.
- **Vias**: stamp them with the Via tool, or drop them mid-stroke.
- **Pour**: bucket-fill copper for a net. It keeps the gap from other copper, adds thermal spokes on its own pads and refills as you edit.
- **Silkscreen**: freehand lines and text, plus part outlines and references. Text uses a built-in single-stroke font, so what you see is what gets made.
- **Board shape**: resize the rectangle and round its corners, or draw any outline.
- **Check board**: flags things that are too close, nets in pieces, copper near the edge, and widths, drills or gaps below the chosen fab's limits.
- **Make it →**: pick a fab preset (JLCPCB, PCBWay, home milling, laser ablation) and download a zip of Gerber RS-274X files (with X2 attributes) plus an Excellon drill file. You can also get 1:1 copper SVGs.

The zip contains `F_Cu`, `B_Cu`, `F_Mask`, `B_Mask`, `F_Paste`, `F_Silkscreen`, `Edge_Cuts` and `PTH.drl`. They use KiCad-style names, so fab uploaders recognise the layers. All coordinates are in mm, with the origin at the board's bottom-left corner.

## Keys

| Key | Action |
|---|---|
| `B` / `V` / `G` / `X` / `E` / `S` / `O` | Brush / Move / Pour / Via / Eraser / Silk / Shape |
| `L` | Swap top / bottom copper |
| `Alt` | While painting: via and swap sides. Starting on an empty pad: new net |
| `N` | New net |
| `1`–`9` | Select paint pot |
| `[` `]` | Brush size − / + |
| `R` | Rotate part |
| `Delete` | Remove part under the cursor (Move tool) |
| `Space`-drag | Pan |
| `Ctrl/⌘ Z`, `Shift+Ctrl/⌘ Z` | Undo / redo |

## Code

| File | What's in it |
|---|---|
| `index.html`, `css/app.css` | Markup and styles |
| `js/geom.js` | Geometry helpers |
| `js/font.js` | Single-stroke silkscreen font |
| `js/model.js` | Footprints, board data, net derivation, pour fill, connectivity |
| `js/export.js` | Gerber, Excellon, SVG and zip writers |
| `js/app.js` | Rendering, tools and UI |

## Docs

- [Product spec](docs/spec.md): behaviour, data model, visual language and milestones.

## Status

Milestones 1–3 are done, along with silkscreen from M4 and pot merging from M5. Still to come are the mask colour and finish preview, a 3D peek, KiCad footprint and netlist import, `.kicad_pcb` export, and BOM / pick-and-place output.
