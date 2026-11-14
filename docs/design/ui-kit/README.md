# Heliopause UI kit v1

Pixel-art UI for a 640x360 native game, scaled up with nearest-neighbour.
Hybrid style: gunmetal frames, cyan holo for interactive parts, amber for
primary actions and resources, red for danger.

## Files

- `heliopause_ui.png` + `heliopause_ui.json`: Phaser atlas (JSON hash, 93 frames)
- `sprites/<category>/*.png`: every frame as its own PNG
- `cursors_css/*@2x.png`, `*@3x.png`: browser cursors (CSS cursors are not scaled by the game)
- `heliopauseUI.ts`: nine-slice sizes, cursor hotspots, `addNine`, `addButton`, `setCursor` helpers
- `ui_meta.json`: size, slice margins, hotspot and usage note per frame
- `palette.json`, `heliopause.gpl` (Aseprite/LibreSprite), `palette.png`

## Phaser setup

```ts
// game config
pixelArt: true,                       // nearest filtering, no smoothing
scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 640, height: 360 },

// preload
this.load.atlas("ui", "assets/ui/heliopause_ui.png", "assets/ui/heliopause_ui.json");

// create
import { addNine, addButton, setCursor } from "./heliopauseUI";
addNine(this, 24, 64, "panel_metal", 168, 216).setOrigin(0);
addButton(this, 36, 96, 144, "NEW MISSION", "primary", () => this.scene.start("Mission"));
this.add.image(30, 20, "ui", "res_fuel");
setCursor(this, "cursor_pointer");
```

Phaser NineSlice needs Phaser 3.60 or newer. The atlas also stores `scale9Borders`, but `addNine` passes the slice widths explicitly, so it does not depend on that.

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
