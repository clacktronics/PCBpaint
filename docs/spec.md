# PCB Paint — Product Spec

*Version 0.1 · 24 Oct 2026 · companion prototype: [`index.html`](../index.html)*

## 1. What it is

PCB Paint is a browser-based PCB layout tool. You make connections the way you would in a paint or vector app, not by pushing around rubber-band ratsnest lines.

You put footprints on a board, pick a colour of paint (a net), and brush copper between pads. The app handles the fussy parts for you:

- tidying wobbly strokes;
- snapping to pad centres;
- keeping nets apart;
- nudging other traces out of the way.

The look is the "Studio" direction: calm, light, rounded, colourful nets on a dark-green board, with very little chrome.

### Who it's for
- Makers, artists and students who find KiCad/Eagle intimidating.
- Experienced engineers who want a fast sketch-to-board tool for small, simple boards (one or two layers, mostly through-hole or chunky SMD), Eurorack utilities and art PCBs.
- Home fabrication: milled boards and laser-ablated boards, where simple geometry and generous clearances matter.

### Non-goals (v1)
- High-speed design, impedance control, differential pairs.
- Boards with more than two layers.
- A full schematic editor. Nets are created by painting (see §4). Netlist import is a later option.

---

## 2. Design principles

1. **The brush knows what it touches.** A stroke that starts on copper belongs to that copper's net. You never pick a net and then hunt for the right pad.
2. **Nets are paint pots.** Each net has a colour, a name and a pot in the sidebar. Making a new one is a single click (or `N`).
3. **Strokes never short.** Paint from one net cannot touch another net. It stops before foreign pads and shoves foreign traces aside.
4. **Messy in, tidy out.** Freehand input becomes clean, manufacturable geometry when you let go.
5. **Always undoable, always saved.** Every action is one undo step, and the board autosaves.
6. **Friendly words.** The app says "too close" rather than "DRC violation", and "Make it" rather than "Generate fabrication outputs".

---

## 3. Screen layout (Studio)

```
┌───────────────────────────────────────────────────────────────────────┐
│ Logo  File Edit View Board Help │ [Top copper][Bottom][Silk][Shape] │ Check  Make it → │
├───────────────────────────────────────────────────────────────────────┤
│ ● Brush · GND   Size ━━○━ 0.60 mm   Corners [Round|45°|Free]   ☑ Tidy  ☑ Snap  ☑ Shove  Gap │
├──────┬───────────────────────────────────────────────┬────────────────┤
│Tools │                                               │ Paint pots     │
│Brush │              board canvas                      │ ● VCC   4 pads │
│Move  │        (dotted grid, zoom + pan)               │ ● GND   5 pads │
│Pour  │                                               │ ● OUT   …      │
│Eraser│                                    Tip card   │ [+ New net]    │
│Via   │  [− 140% + Fit]            [✓ 0 clashes]      │ Parts drawer   │
│Silk  │                                               │ ▢ ▢ ▢ ▢ ▢ ▢    │
├──────┴───────────────────────────────────────────────┴────────────────┤
│ file · board size · counts · cursor mm                      saved     │
└───────────────────────────────────────────────────────────────────────┘
```

- **Header**: menus, a layer switcher (active layer is filled black), **Check board** and **Make it** (export).
- **Tool options bar**: changes with the active tool. For the Brush it shows: current net and colour, size, corner style, Tidy, Snap to pad centres, Shove, and Gap (clearance).
- **Tool rail**: big icon-and-label buttons, each with a single-key shortcut.
- **Canvas**: the board on a dotted grid. The cursor is a ring the size of the brush, with a small tag naming the net you would paint with.
- **Right panel**: Paint pots (nets) on top, Parts drawer below.
- **Status bar**: file name, board size, counts, cursor position in mm, save state.
- **Responsive**: below about 900 px the side panel moves under the canvas and the tool rail goes horizontal.

---

## 4. Nets = paint pots

### 4.1 The pot
Each net appears as a row in **Paint pots**:

| Element | Behaviour |
|---|---|
| Colour swatch | Click to open a colour picker. The new colour shows live on the canvas. |
| Name | Editable in place (click, type, Enter). Defaults to `NET n`. |
| Stats | `n pads · m strokes`, updating live. |
| Number key | Pots 1–9 can be selected with keys `1`–`9`. |
| Delete (×) | Shown on hover or focus. If the net has strokes, asks for confirmation and then removes them. |
| Selected state | Dark outline. This is the net used for strokes that start on empty board. |

### 4.2 Creating a net
- The **+ New net** button (or `N`) creates a pot, selects it and puts the cursor in its name field.
- **Colour** is the next unused colour from a 12-colour palette, chosen for contrast on dark-green mask. Once all 12 are used, it picks a random HSL colour with good contrast.
- **Implicit creation**: if no nets exist and you start painting, a net is created for you.
- **Planned**: if you paint from an empty pad while holding `Alt`, a fresh net is created for that stroke, so you can start a new net without visiting the panel.

### 4.3 Which pads belong to a net
Pads have **no stored net**. A pad's net is worked out from the copper touching it:
- A pad touched by a stroke of net X belongs to X.
- A pad touched by nothing is **empty** (grey outline).
- A pad touched by two nets is a **clash**: red outline, counted in the status chip. Normally this can't happen (see §6), but it can after moving parts.

So erasing the last stroke on a pad frees it, and you never manage pad nets by hand.

*Future*: a pad can be **pinned** to a net (for example from an imported netlist). A pinned pad behaves like copper of that net even before any stroke touches it.

### 4.4 Merging and splitting
- **Merge (planned)**: drag one pot onto another. Its strokes are recoloured and the first pot is removed. This is the only way two nets can become one.
- **Split**: erasing the stroke that joined two islands leaves two islands on the same net. **Check board** reports "GND is in 2 pieces".

---

## 5. Brush

### 5.1 Which net a stroke paints

When you press down, the stroke's net is chosen from what is under the brush, in this order:

1. **A pad that has a net**: you paint with that pad's net.
2. **A trace**: you paint with that trace's net.
3. **An empty pad or empty board**: you paint with the **selected pot**.

If the net picked up from the board differs from the selected pot, the selected pot switches to it and briefly pulses. Before you press, the cursor tag shows what you'll get, for example `GND (picked up)` or `OUT`.

### 5.2 During the stroke
- The raw path is sampled at about 1.2 units (0.12 mm) and previewed live in the net's colour, with a faint white line showing the raw input.
- The shove preview runs live (§6). Traces being pushed are drawn in their new position, with a faint dashed ghost where they were.
- If the stroke would hit a foreign pad or cross a foreign trace, the preview stops at the limit and a message explains why on release.

### 5.3 On release ("Tidy stroke")
1. **Snap ends**: if a stroke starts or ends on an empty or same-net pad, that end jumps to the pad centre (when Snap is on).
2. **Simplify** using Ramer–Douglas–Peucker (tolerance 0.4 mm).
3. **Corner style**:
   - **Round** (default): turn into 45°/90° segments, then soften the corners (two passes of Chaikin smoothing, 20% cut).
   - **45°**: horizontal, vertical and diagonal segments only. Each leg is a straight run followed by a diagonal.
   - **Freehand**: light simplification plus smoothing; any angle allowed.
4. **Limit checks**: §6.1 and §6.2.
5. **Shove** other nets (§6.3).
6. **Commit** as one undo step. Empty pads the stroke touches now belong to its net.

With Tidy off, strokes are only lightly simplified (0.08 mm).

### 5.4 Brush settings
| Setting | Range | Default | Notes |
|---|---|---|---|
| Size (trace width) | 0.2–2.0 mm | 0.6 mm | `[` / `]` to change |
| Gap (clearance) | 0.1–0.8 mm | 0.25 mm | Global in v1; per-net later |
| Corners | Round / 45° / Freehand | Round | |
| Tidy on release | on/off | on | |
| Snap to pad centres | on/off | on | |
| Shove other nets | on/off | on | When off, clashes are only flagged |

*Later*: per-net default width (for example, power nets automatically 0.8 mm); pressure-sensitive width that snaps to standard sizes when using a pen.

---

## 6. Keeping nets apart

**A stroke may never connect two different nets.** Three mechanisms enforce this.

### 6.1 Foreign pads → stop short
A **foreign pad** is a pad already on another net. The stroke is cut at the last point that keeps `width/2 + gap` away from any foreign pad. Message: *"Stopped short of U1 — that pad is on GND."*

Empty pads are not foreign. Painting across an empty pad claims it.

### 6.2 Crossing a foreign trace → stop before the crossing
A single layer cannot cross another net. If the stroke's centreline crosses a foreign trace, it is cut back to a point before the crossing, leaving a full gap. Message: *"Can't cross OUT on one layer — go around it."*

*With two layers (milestone 3)*: hold `Alt` (or switch layer mid-stroke) to drop a via and continue on the other side.

### 6.3 Shove: meeting traces nudge each other

When a stroke comes within the gap of another net's trace (but doesn't cross it), the other trace bends out of the way.

**Rules**
- **Fixed**: pads, and trace points lying on pads. A shoved trace stays connected at both ends.
- **Movable**: free points on other nets' traces.
- **Required distance**: `req = aggressorWidth/2 + victimWidth/2 + gap`.
- **Same net**: no shove. The strokes simply merge.

**Algorithm** (as in the prototype)
1. Quick reject: if the minimum distance between the two polylines is already at least `req`, do nothing.
2. Resample the victim every 0.25 mm.
3. **Push**: move each free point closer than `req` straight away from its nearest point on the aggressor, by `(req − d) + 0.035 mm`. If a point lies exactly on the aggressor, push along the victim's normal.
4. **Relax**: points within `3 × req` of the aggressor are smoothed (each becomes 50% itself and 25% each neighbour, two passes). This turns the dent into a gentle bump rather than a kink.
5. Repeat push and relax 8 times, finishing with a push.
6. Simplify the result (tolerance 0.06 mm).
7. **Cascade one level**: each shoved victim is shoved against the remaining other-net traces once, so a nudge can ripple to its neighbour.
8. **Failure**: if a victim can't clear because its fixed points are too close, or it would be pushed into a foreign pad, keep the best result and mark the spot for **Check board**.

**Feel**
- A shove is "a little": victims bend only as much as needed, plus the gap.
- Shoves preview live while painting and commit in the same undo step as the stroke.
- Toast after commit: *"Nudged GND out of the way."*

**Later**
- A **Shove strength** setting (Gentle / Firm). Firm lets a victim slide along its pads.
- A **Walk-around** mode where the stroke bends around the obstacle instead of pushing it.
- **Shove pads**: pushing unlocked parts.

---

## 7. Other tools (v1)

| Tool | Key | Behaviour |
|---|---|---|
| Move | `V` | Drag a part. Trace ends sitting on its pads follow. Drag empty board to pan. `R` rotates by 90°; `Delete` removes the part. |
| Eraser | `E` | Click or drag over traces to delete whole strokes. *Later*: a partial eraser that splits a stroke. |
| Pour | `G` | Bucket fill: click empty board to flood a region with the selected net. It keeps the gap from other nets and from empty pads, adds thermal spokes on same-net pads and warns about islands. A pour is stored as its seed point and refills whenever the board changes. |
| Via | `X` | Stamp, or `Alt` while painting. |
| Silk | `S` | Silkscreen brush (drag) and text (click). Lines are kept to at least 0.15 mm and trimmed off pads on export. |
| Shape | `O` | Board outline: drag handles to resize the rectangle, or draw any polygon and drag, add or Alt-click-remove its corners. |
| Pan / zoom | Space-drag, middle-drag, wheel | Zoom about the cursor; **Fit board** resets the view. |

**Parts drawer**: click a part to pick it up, click the board to place it, `R` to rotate, shift-click to place several, `Esc` to cancel. Reference designators number automatically (`R1`, `R2`…). Starter library: SOIC-8, 0805 resistor and capacitor, 1206, 5 mm LED, 2-pin header, 9 mm pot, 3.5 mm jack, 6 mm button. **Import KiCad footprint…** (or dropping `.kicad_mod` files on the board) adds footprints to the drawer; see *KiCad footprint import* below.

---

## 8. Check board and export

**Check board** circles every problem in red for 5 seconds and summarises in plain words:
- traces of different nets closer than the gap;
- traces too close to a pad that isn't theirs;
- pads touched by two nets;
- *(later)* nets in more than one piece, traces off the board edge, widths below the fab minimum, silk on pads.

**Make it →** exports:
- **v1 prototype**: top copper as a 1:1 SVG in mm. Usable for laser ablation and as a quick visual check.
- **Milestone 2**: Gerber RS-274X (copper, mask, silk, outline) plus Excellon drill, zipped. Presets for JLCPCB/PCBWay rules and conservative home-milling and laser rules (wider gaps and traces).
- **Later**: KiCad `.kicad_pcb` export, BOM CSV and pick-and-place.

---

## 9. Data model

1 board unit = 0.1 mm internally. Files store units, and exports convert to mm.

```jsonc
{
  "v": 2,
  "name": "little-blinker",
  "seq": 100,                                  // id counter
  "board": { "x": 60, "y": 70, "w": 460, "h": 270, "r": 26 },  // later: arbitrary outline path
  "nets":  [ { "id": "n1", "name": "VCC", "color": "#FF6B4A" } ],
  "parts": [ { "id": "p1", "ref": "U1", "fp": "soic8", "x": 300, "y": 200, "rot": 0 } ],
  "traces":[ { "id": "t1", "net": "n1", "width": 8, "layer": "top",
               "pts": [[110,110],[410,110]] } ],
  "vias":  [ { "id": "v1", "net": "n2", "x": 150, "y": 200, "d": 8, "drill": 4 } ],
  "pours": [ { "id": "f1", "net": "n2", "layer": "bottom", "seed": [90,320], "thermal": true } ],
  "silk":  [ { "id": "s1", "kind": "text", "x": 80, "y": 90, "size": 14, "text": "Blinky" },
             { "id": "s2", "kind": "line", "width": 2, "pts": [[380,320],[460,318]] } ],
  "rules": { "gap": 2.5, "preset": "jlcpcb" }
  // board may also carry "poly": [[x,y],…] for a custom outline
  // later: pinned pad nets
}
```

- **Footprints** are a library keyed by `fp`. Each footprint has pads `[dx, dy, w, h, shape, number, drill?]` and a body outline. Built-in footprints live in the app; imported ones live in the board's own `lib` so the file stays self-contained. Imported footprints may also carry `holes` (unplated, `[dx, dy, d]`) and `silk` polylines that replace the body outline on the silkscreen.

### KiCad footprint import

Reads KiCad 5 (`module`) and 6+ (`footprint`) `.kicad_mod` files. Pads on the front copper become SMD pads; `thru_hole` pads keep their own drill; `np_thru_hole` pads become unplated holes (exported as `NPTH.drl`). `circle`/`oval` pads stay round/oval, every other shape becomes its bounding rectangle. Slots become round holes of the slot width; pads at angles other than multiples of 90° become their bounding box; bottom-only SMD pads are skipped. `F.SilkS` lines, rects, circles, arcs and polygons become the part's silkscreen; the body box comes from `F.Fab`, else `F.CrtYd`, else the silk, else the pads. The footprint is re-centred on its middle so it rotates in place. Duplicate pad numbers get suffixes (`5`, `5.2`) so each pad takes its own net. The reference prefix is guessed from the name (`R_…` → R, `PinHeader…` → J, otherwise U). Imported footprints show a × in the drawer while no part uses them.
- **Pad nets are derived at runtime** (§4.3). They are not stored.
- **Undo/redo** keeps whole-document snapshots (cheap at this scale), up to 150 steps.
- **Persistence**: autosave to `localStorage`; Save/Open as `.pcbp.json`.

---

## 10. Keyboard

| Key | Action |
|---|---|
| `B` / `V` / `E` | Brush / Move / Eraser |
| `G` / `X` / `S` / `O` | Pour / Via / Silk / Shape |
| `L` | Swap between top and bottom copper |
| `Alt` | While painting: drop a via and carry on on the other side. When starting a stroke from an empty pad: new net |
| `N` | New net |
| `1`–`9` | Select pot |
| `[` `]` | Brush size − / + |
| `R` | Rotate part being placed or the part under the cursor |
| `Delete` | Remove the part under the cursor (Move tool) |
| `Space`-drag | Pan |
| `Ctrl/⌘ Z`, `Shift+Ctrl/⌘ Z`, `Ctrl Y` | Undo, redo |
| `Esc` | Cancel part placement |

---

## 11. Visual language (Studio)

- **UI**: ground `#E7EAEE`, panels white, lines `#D5DAE0`, ink `#16191D`, accent coral `#FF6B4A` (active tool, primary button).
- **Type**: Bricolage Grotesque for UI, DM Mono for numbers and units.
- **Board**: mask `#1E3B30` with a faint hatched ground hint, pads gold `#E8C27A` outlined in their net colour (grey when empty), silk `#F2F5F1`.
- **Nets**: 12-colour palette — `#FF6B4A #3D7BFD #A35BFF #12B5A5 #FFB020 #FF5DA2 #7CC243 #0EA5C6 #E0569B #8C6D3F #5B6CFF #D9480F`. On export, colour is display-only; all copper is copper.
- **Shape**: 12–14 px radii, chunky touch targets (44 px or more), no heavy shadows.

---

## 12. Milestones

| # | Scope |
|---|---|
| **M1 — Prototype** *(done, `index.html`)* | Studio UI, paint pots (add, rename, recolour, delete), net-aware brush, tidy (Round/45°/Free), pad snap, stop-short and no-cross rules, live shove with one-level cascade, move/rotate/erase, parts drawer, check board, SVG copper export, undo/redo, autosave, JSON save/open |
| **M2 — Real boards** *(done)* | Board outline editing (rectangle → any shape), bucket pour with thermals, Gerber/Excellon export, fab presets, per-net widths, mm grid soft-snap |
| **M3 — Two layers** *(done)* | Bottom copper, vias (stamp and mid-stroke), layer ghosting, crossings via the back |
| **M4 — Make it pretty** *(silk done)* | Silkscreen brush and text, mask colour and finish preview, 3D peek |
| **M5 — Interop** *(pot merge and KiCad footprint import done)* | KiCad footprint import, netlist import (pinned pad nets plus a ratsnest hint), `.kicad_pcb` export, pot merge |

---

## 13. Open questions

1. **Netlist-first or paint-first?** Should an imported netlist *force* nets (painting to the wrong pad is refused) or only *suggest* them (dashed hints)?
2. **Shove versus walk-around as the default.** Shove is more playful; walk-around is less surprising on dense boards.
3. **Can shoving move parts?** Off in v1. Possibly an "unlocked part" flag later.
4. **One gap or per-net gaps** (for example, mains clearance)?
5. **Stroke ends in empty space**: allowed as stubs (current behaviour), or trimmed back to the last pad?
