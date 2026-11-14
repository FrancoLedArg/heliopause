# Heliopause UI kit v1

Pixel-art UI for a 640x360 native game, scaled up with nearest-neighbour.
Hybrid style: gunmetal frames, cyan holo for interactive parts, amber for
primary actions and resources, red for danger.

## Files

In `public/assets/ui/` (served by the game):

- `heliopause_ui.png` + `heliopause_ui.json`: Phaser atlas (JSON hash, 93 frames)
- `ui_meta.json`: size, slice margins, hotspot and usage note per frame
- `palette.json`: the palette
- `cursors/*@2x.png`, `*@3x.png`: browser cursors (CSS cursors are not scaled by the game)

In `docs/design/ui-kit/` (reference only): `heliopause.gpl` (Aseprite/LibreSprite palette), `palette.png`, `preview_sheet.png`, `mock_menu_3x.png`.

Not yet implemented: per-frame PNGs and cursor helpers (hotspots are in `ui_meta.json`).

## Using the kit in the game

The game already runs at 640x360 with `pixelArt: true`, and the atlas is in the asset manifest under the key `ui`, so Phaser loads it with everything else. Text panels are React, drawn over the canvas in the same 640x360 coordinates:

- `src/ui/kit/kit.ts`: typed frame names (`KitFrameName`) and `sliceKitFrame(name, width, height)`, the nine-slice / three-slice geometry read from `ui_meta.json`. It throws for a size a frame cannot take.
- `src/ui/kit/KitFrame.tsx`: `<KitFrame frame="panel_metal" width={176} height={66} />` draws any frame at any size its slices allow.
- `src/ui/kit/KitButton.tsx`: `<KitButton variant="primary" width={144}>` is a real `<button>` with the kit's normal, hover, pressed and disabled faces, a cyan focus ring and the 2px press drop.
- `src/ui/kit/palette.ts`: palette colours for Phaser (`paletteNumber`) and CSS (`--cy3` etc. on `#app`).

In Phaser, draw a single frame with `this.add.image(x, y, "ui", "res_fuel")`. If a scene ever needs a stretched frame on the canvas, build it from `sliceKitFrame` (or Phaser 4's NineSlice fed with the same margins). The atlas also stores `scale9Borders`, but the slice widths in `ui_meta.json` are the source of truth.

Labels use Silkscreen (pixel caps, 8px or 16px) and VT323 (body text), both bundled through Fontsource (SIL Open Font License).

## Frames

| Group               | Frames                                                                                                                                     | Size                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| Menu buttons        | `btn_{default,primary,danger}_{normal,hover,pressed,disabled}`                                                                             | 96x24, 9-slice 12/12/7/8        |
| Icon buttons        | `btn_icon_{normal,hover,pressed,disabled}`                                                                                                 | 24x24 (icon at 4,3)             |
| Panels              | `panel_metal`, `panel_holo`                                                                                                                | 48x48, 9-slice                  |
| Tooltips            | `tooltip`, `tooltip_warn`                                                                                                                  | 16x16, 9-slice 4                |
| Title bar / divider | `titlebar`, `divider`                                                                                                                      | 3-slice (horizontal only)       |
| Ship part slots     | `slot_{empty,hover,selected,locked}`                                                                                                       | 36x36 (part at 2,2)             |
| Controls            | `toggle_on/off`, `checkbox_on/off/disabled`, `radio_on/off`, `slider_track`, `slider_fill`, `slider_knob_{normal,hover,pressed}`           |                                 |
| Bars                | `bar_frame`, `bar_fill_{cy,am,rd,gr}`, `bar_seg_{cy,am,rd,gr,empty}`                                                                       | fill sits at (2,2) inside frame |
| Resource icons      | `res_{fuel,power,mass,delta_v,budget,crew,thrust,oxygen,comms,heat,time,science,radiation,payload,orbit}`                                  | 32x32                           |
| System icons        | `icon_{play,pause,fast_forward,settings,close,back,home,save,load,sound_on,sound_off,info,help,plus,minus,check,rotate,trash,menu,launch}` | 16x16, light base: tint freely  |
| Badges              | `badge_{alert,warning,ok,info,lock}`                                                                                                       | 12x12                           |
| Cursors             | `cursor_{pointer,hand,grab,crosshair,forbidden}`                                                                                           | 16x16                           |

On pressed buttons the face drops 2px: move the label down 2px too.
Labels: use a pixel font at 1x (the mock uses a 5x7 font). Free options include m5x7 / m6x11 by Daniel Linssen or Press Start 2P (check each license).
