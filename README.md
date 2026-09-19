# shallot-grid

an infinite world grid with axis lines for [shallot](https://github.com/dylanebert/shallot). one fullscreen pass draws the y=0 plane, cross-fading between decade levels so it reads at any zoom without popping.

```bash
bun add @dylanebert/shallot-grid
```

name it in `shallot.json`:

```json
{
    "scene": "scenes/main.scene",
    "plugins": {
        "Grid": "@dylanebert/shallot-grid"
    }
}
```

add a `<a grid />` singleton to your scene:

```
<a grid />
```

every field is optional. Colors are sRGB hex with alpha (`0xRRGGBBAA`), and an axis with alpha `00` is hidden:

```
<a grid="neutral: 0x504945ff; axis-x: 0xcc241dff; axis-y: 0x6b9d65ff; axis-z: 0x458588ff; opacity: 1; fade: 20; cells: 40; floor: 1; xray: 0" />
```

axes are drawn 1 px wide, the same as grid lines, so color and alpha are the only difference. The Y axis always draws over the grid lines, and below the ground it draws at half its alpha.

- `opacity`: the whole grid's opacity.
- `fade`: horizon fade reach in camera heights; `0` turns it off.
- `cells`: pixels per cell at a decade boundary; the finest level fades in as its cells grow from `cells / 10` to `cells` pixels, so at `40` it is gone by 4 px and full by 40 px.
- `floor`: the smallest cell in metres; no finer decade draws, and closer in that level grows on screen.
- `xray`: how much of the grid draws through scene geometry, from `0` to `1`. At `0` objects hide the grid behind them, at `1` it draws over them, and values in between ghost it.

the example: `bunx shallot dev examples/world-grid`. changing it: [`CONTRIBUTING.md`](CONTRIBUTING.md). mit.
