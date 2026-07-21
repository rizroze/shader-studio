// True-vector (SVG) export. The mark-based effects (halftone, dither, ascii) are
// grids of discrete shapes, so we can re-derive those shapes on the CPU and emit
// real <circle>/<rect>/<path> elements — infinitely scalable, editable in Figma.

import { createRenderTarget, resizeRenderTarget } from '../engine/gl.js';

const VECTORIZABLE = new Set(['halftone', 'dither', 'ascii']);

function download(text, mime, name) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// GLSL hash21 replica so the ascii scatter matches the live preview.
const fract = (x) => x - Math.floor(x);
function hash21(px, py) {
  let p3x = fract(px * 0.1031), p3y = fract(py * 0.1031), p3z = fract(px * 0.1031);
  const d = p3x * (p3y + 33.33) + p3y * (p3z + 33.33) + p3z * (p3x + 33.33);
  p3x += d; p3y += d; p3z += d;
  return fract((p3x + p3y) * p3z);
}

const luma = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

// Render the stack up to (not including) the final mark effect, so the marks are
// derived from whatever feeds them (e.g. a Warp underneath). Empty sub-stack =
// the raw source, with its alpha preserved.
function toneField(ctx, w, h, lastIdx) {
  const { gl, chain, state } = ctx;
  ctx._rt = ctx._rt ? resizeRenderTarget(gl, ctx._rt, w, h) : createRenderTarget(gl, w, h);
  const sub = state.stack.slice(0, lastIdx).filter((s) => s.enabled);
  chain.render({
    sourceTex: ctx.source(),
    stack: sub,
    palette: state.palette,
    time: ctx.baseTime(),
    width: w,
    height: h,
    transparent: false,
    finalTarget: ctx._rt,
  });
  const px = new Uint8Array(w * h * 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, ctx._rt.fbo);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  // flip to top-down
  const out = new Uint8Array(w * h * 4);
  const row = w * 4;
  for (let y = 0; y < h; y++) out.set(px.subarray((h - 1 - y) * row, (h - 1 - y) * row + row), y * row);
  return out;
}

function paletteQuantHex(t, entries, pos) {
  t = Math.min(Math.max(t, 0), 1);
  for (let i = 0; i < entries.length; i++) if (t < pos[i + 1]) return entries[i].hex;
  return entries[entries.length - 1].hex;
}

// ---- per-effect vectorizers -> array of SVG element strings ----
function vecHalftone(data, w, h, p, state) {
  const cell = p.u_scale, ink = state.paletteEntries[0].hex, out = [];
  const a = p.u_angle, ca = Math.cos(a), sa = Math.sin(a), deg = (a * 180) / Math.PI;
  const sample = (x, y) => {
    const xi = Math.min(w - 1, Math.max(0, Math.round(x))), yi = Math.min(h - 1, Math.max(0, Math.round(y)));
    return (yi * w + xi) * 4;
  };
  // walk a rotated lattice covering the image
  const diag = Math.ceil(Math.hypot(w, h) / cell) + 2;
  for (let j = -diag; j < diag; j++) {
    for (let i = -diag; i < diag; i++) {
      const rx = (i + 0.5) * cell, ry = (j + 0.5) * cell;   // rotated-space center
      const cx = rx * ca + ry * sa, cy = -rx * sa + ry * ca; // back to image space
      if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
      const k = sample(cx, cy);
      if (state.transparent && data[k + 3] < 128) continue;
      const dark = Math.min(1, (1 - luma(data[k], data[k + 1], data[k + 2])) * p.u_gain);
      const r = Math.sqrt(dark) * cell * 0.5;
      if (r < 0.15) continue;
      if (p.u_shape >= 0.5 && p.u_shape < 1.5) {
        out.push(`<rect x="${(cx - r).toFixed(2)}" y="${(cy - r).toFixed(2)}" width="${(2 * r).toFixed(2)}" height="${(2 * r).toFixed(2)}" fill="${ink}" transform="rotate(${deg.toFixed(2)} ${cx.toFixed(2)} ${cy.toFixed(2)})"/>`);
      } else {
        out.push(`<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${r.toFixed(2)}" fill="${ink}"/>`);
      }
    }
  }
  return out;
}

function vecDither(data, w, h, p, state) {
  const cell = p.u_cell, out = [];
  const entries = state.paletteEntries, pos = state.palette.pos, paper = entries[entries.length - 1].hex;
  const BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];
  const nx = Math.ceil(w / cell), ny = Math.ceil(h / cell);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const cx = Math.min(w - 1, Math.round((i + 0.5) * cell)), cy = Math.min(h - 1, Math.round((j + 0.5) * cell));
      const k = (cy * w + cx) * 4;
      if (state.transparent && data[k + 3] < 128) continue;
      let t = luma(data[k], data[k + 1], data[k + 2]);
      t = (t - 0.5) * p.u_contrast + 0.5 + p.u_bright;
      const thr = BAYER[(j & 7) * 8 + (i & 7)] / 64;
      const col = paletteQuantHex(t + (thr - 0.5) * p.u_amount, entries, pos);
      if (state.transparent && col === paper) continue;
      out.push(`<rect x="${(i * cell).toFixed(2)}" y="${(j * cell).toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" fill="${col}"/>`);
    }
  }
  return out;
}

function vecAscii(data, w, h, p, state) {
  const cell = p.u_cell, ink = state.paletteEntries[0].hex, out = [];
  const nx = Math.ceil(w / cell), ny = Math.ceil(h / cell);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const cx = Math.min(w - 1, Math.round((i + 0.5) * cell)), cy = Math.min(h - 1, Math.round((j + 0.5) * cell));
      const k = (cy * w + cx) * 4;
      if (data[k + 3] < 128) { if (state.transparent) continue; }
      let b = (luma(data[k], data[k + 1], data[k + 2]) - p.u_floor) / Math.max(1 - p.u_floor, 0.001);
      b = Math.min(Math.max(b, 0), 1) * p.u_gain - hash21(i, j) * p.u_jitter;
      b = Math.min(Math.max(b, 0), 1);
      if (b <= 0.02) continue;
      const ox = (i + 0.5) * cell, oy = (j + 0.5) * cell;
      let g = p.u_style < 0.5 ? Math.min(5, Math.floor(b * 6)) : p.u_style < 1.5 ? 0 : 5;
      out.push(glyphSVG(g, ox, oy, cell, ink));
    }
  }
  return out;
}

function glyphSVG(g, x, y, c, ink) {
  const f = (n) => n.toFixed(2);
  if (g === 0) return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(0.16 * c)}" fill="${ink}"/>`;
  if (g === 1) return `<path d="M${f(x - 0.3 * c)} ${f(y - 0.06 * c)}h${f(0.6 * c)}v${f(0.12 * c)}h${f(-0.6 * c)}z M${f(x - 0.06 * c)} ${f(y - 0.3 * c)}h${f(0.12 * c)}v${f(0.6 * c)}h${f(-0.12 * c)}z" fill="${ink}"/>`;
  if (g === 2) return `<g transform="rotate(45 ${f(x)} ${f(y)})">${glyphSVG(1, x, y, c, ink)}</g>`;
  if (g === 3) return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(0.22 * c)}" fill="none" stroke="${ink}" stroke-width="${f(0.1 * c)}"/>`;
  if (g === 4) return `<rect x="${f(x - 0.28 * c)}" y="${f(y - 0.28 * c)}" width="${f(0.56 * c)}" height="${f(0.56 * c)}" fill="none" stroke="${ink}" stroke-width="${f(0.09 * c)}"/>`;
  return `<rect x="${f(x - 0.32 * c)}" y="${f(y - 0.32 * c)}" width="${f(0.64 * c)}" height="${f(0.64 * c)}" fill="${ink}"/>`;
}

// Vectorize the CPU error-diffusion grid: one crisp rect per inked cell.
function ditherGridSVG(ctx) {
  const info = ctx.ditherInfo && ctx.ditherInfo();
  if (!info || !info.grid) throw new Error('Dither grid not ready — try again.');
  const { grid, gw, gh, cell } = info;
  const entries = ctx.state.paletteEntries;
  const last = entries.length - 1;
  const w = gw * cell, h = gh * cell;
  const out = [];
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const k = j * gw + i;
      if (grid.alpha[k] < 128) continue;                 // cutout background
      const lvl = Math.min(grid.level[k], last);
      if (lvl >= last) continue;                          // paper -> ground
      out.push(`<rect x="${i * cell}" y="${j * cell}" width="${cell}" height="${cell}" fill="${entries[lvl].hex}"/>`);
    }
  }
  const paper = entries[last].hex;
  const bg = ctx.state.transparent ? '' : `<rect width="${w}" height="${h}" fill="${paper}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${bg}${out.join('')}</svg>`;
  download(svg, 'image/svg+xml', `shaderstudio-${Date.now()}.svg`);
}

const VEC = { halftone: vecHalftone, dither: vecDither, ascii: vecAscii };

export async function exportSVG(ctx) {
  // Error-diffusion dither is a CPU grid — vectorize one rect per inked cell.
  const active = ctx.state.effect;
  if (active && active.id === 'dither' && active.params.u_algo >= 1) {
    ctx.prepare?.();
    return ditherGridSVG(ctx);
  }

  const stack = ctx.state.stack;
  let lastIdx = -1;
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].enabled && VECTORIZABLE.has(stack[i].id)) { lastIdx = i; break; }
  }
  if (lastIdx < 0) throw new Error('SVG needs a Halftone, Dither, or ASCII effect as the top mark layer.');

  const w = ctx.canvas.width, h = ctx.canvas.height;
  const data = toneField(ctx, w, h, lastIdx);
  const eff = stack[lastIdx];
  const marks = VEC[eff.id](data, w, h, eff.params, ctx.state);

  const paper = ctx.state.paletteEntries[ctx.state.paletteEntries.length - 1].hex;
  const bg = ctx.state.transparent ? '' : `<rect width="${w}" height="${h}" fill="${paper}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="geometricPrecision">${bg}${marks.join('')}</svg>`;
  download(svg, 'image/svg+xml', `shaderstudio-${Date.now()}.svg`);
}
