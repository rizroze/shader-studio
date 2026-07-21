# Shader Studio

Turn any image into a design language. Real-time GPU post-processing —
**halftone, dither, cross-hatch, ASCII/symbols** — for any brand palette,
still or animated. Export as **SVG (true vector), PNG (4K, transparent), GIF, MP4**.

Made by [@rizroze](https://x.com/rizroze).

## Stack
- Vanilla JS + [Vite](https://vitejs.dev) (no framework)
- WebGL2 fragment-shader pass-chain (`src/engine`)
- Effects as `.glsl` files with an auto-generated control panel (`src/effects`)
- CPU error-diffusion dither (Atkinson / Floyd–Steinberg) bridged into the GPU pipeline
- Export: `gifenc` (GIF), `mp4-muxer` + WebCodecs (MP4), custom SVG vectorizer

## Develop
```bash
npm install
npm run dev      # http://localhost:5178
npm run build    # -> dist/
```

## Effects
| Effect | Notes |
|---|---|
| **Dither** | Ordered (Bayer) + error-diffusion (Atkinson/FS). Exposure · Contrast · Gamma · Detail |
| **Halftone** | AM screen, dot/square/line, rotatable, full tonal controls |
| **Cross-hatch** | Tonal-Art-Map layered hatching (engraving look) |
| **ASCII / Symbols** | Brightness-driven glyph dither with scatter |

**Color:** original image colors or a brand palette (with duo-swap).
**Background:** paper or transparent (cutout-aware, kept in PNG/SVG).
