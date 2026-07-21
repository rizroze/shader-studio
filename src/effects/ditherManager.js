// Bridges CPU error-diffusion into the GPU pipeline. It keeps a small nearest-
// filtered texture (one texel per dither cell) that the GPU copy-pass upscales.
// The heavy error diffusion only re-runs when the source/exposure/cell change;
// palette + transparency changes just re-bake colors onto the cached grid.

import { computeLevelGrid } from './cpuDither.js';
import { hexToRgb01 } from '../palette/palette.js';

export class DitherManager {
  constructor(gl) {
    this.gl = gl;
    this.tex = null;
    this.canvas2d = document.createElement('canvas');
    this.grid = null;
    this.gw = 0; this.gh = 0; this.cell = 1;
    this.gridSig = ''; this.bakeSig = '';
  }

  // True when the dither effect is set to an error-diffusion algorithm.
  isActive(effect) { return effect.id === 'dither' && effect.params.u_algo >= 1; }

  _nearestTex() {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  update(media, effect, state, outW, outH) {
    const p = effect.params;
    const cell = Math.max(1, Math.round(p.u_cell));
    const gw = Math.max(2, Math.round(outW / cell));
    const gh = Math.max(2, Math.round(outH / cell));
    const algo = p.u_algo === 2 ? 'atkinson' : p.u_algo === 1 ? 'fs' : 'threshold';
    const L = state.palette.count;
    const frameKey = media.isAnimated ? Math.floor(performance.now() / 40) : (media.el && media.el.src) || '';
    const gridSig = [frameKey, gw, gh, algo, p.u_exposure, p.u_contrast, p.u_gamma, p.u_sharpen, L].join('|');

    if (gridSig !== this.gridSig) {
      const c = this.canvas2d; c.width = gw; c.height = gh;
      const cx = c.getContext('2d', { willReadFrequently: true });
      cx.clearRect(0, 0, gw, gh);
      if (media.el) cx.drawImage(media.el, 0, 0, gw, gh);
      const img = cx.getImageData(0, 0, gw, gh);
      this.srcData = img.data; // keep source colors for original-color baking
      this.grid = computeLevelGrid(img, gw, gh, {
        algo, levels: L,
        exposure: p.u_exposure, contrast: p.u_contrast, gamma: p.u_gamma, sharpen: p.u_sharpen,
      });
      this.gw = gw; this.gh = gh; this.cell = cell;
      this.gridSig = gridSig; this.bakeSig = '';
    }

    const palKey = state.paletteEntries.map((e) => e.hex).join(',');
    const bakeSig = [this.gridSig, palKey, state.transparent, state.original].join('|');
    if (bakeSig !== this.bakeSig) { this._bake(state); this.bakeSig = bakeSig; }
  }

  _bake(state) {
    const gl = this.gl;
    const { grid, gw, gh } = this;
    const entries = state.paletteEntries;
    const rgb = entries.map((e) => hexToRgb01(e.hex).map((v) => Math.round(v * 255)));
    const paper = rgb[rgb.length - 1];
    const out = new ImageData(gw, gh);

    const src = this.srcData;
    for (let i = 0; i < gw * gh; i++) {
      let c, a;
      if (grid.alpha[i] < 128) {
        // cutout background: paper (opaque) or fully transparent
        c = paper; a = state.transparent ? 0 : 255;
      } else {
        const lvl = Math.min(grid.level[i], rgb.length - 1);
        const isPaper = lvl >= entries.length - 1;
        // Original mode: inked cells keep the source color.
        c = (state.original && !isPaper && src) ? [src[i * 4], src[i * 4 + 1], src[i * 4 + 2]] : rgb[lvl];
        a = (state.transparent && isPaper) ? 0 : 255;
      }
      out.data[i * 4] = c[0]; out.data[i * 4 + 1] = c[1]; out.data[i * 4 + 2] = c[2]; out.data[i * 4 + 3] = a;
    }

    const c2 = this.canvas2d; c2.width = gw; c2.height = gh;
    c2.getContext('2d').putImageData(out, 0, 0);
    if (!this.tex) this.tex = this._nearestTex();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c2);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  info() { return { grid: this.grid, gw: this.gw, gh: this.gh, cell: this.cell }; }
}
