// Export pipeline. PNG keeps transparency (for dropping cutouts into designs);
// GIF and MP4 are flattened onto the paper color (video/gif have no real alpha).

import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { createRenderTarget, resizeRenderTarget } from '../engine/gl.js';
import { exportSVG } from './vector.js';

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const stamp = (ext) => `shaderstudio-${Date.now()}.${ext}`;

// Scale (w,h) down so w*h <= budget, preserving aspect.
function fitBudget(w, h, budget) {
  const s = Math.min(1, Math.sqrt(budget / (w * h)));
  return { w: Math.max(2, Math.floor(w * s)), h: Math.max(2, Math.floor(h * s)) };
}

// Pixel-sized uniforms — scaled up when super-sampling so the look is identical.
const PIXEL_UNIFORMS = { halftone: ['u_scale'], dither: ['u_cell'], ascii: ['u_cell'], hatch: ['u_spacing'] };

function scaleStack(stack, factor) {
  return stack.map((s) => {
    const keys = PIXEL_UNIFORMS[s.id];
    if (!keys) return s;
    const params = { ...s.params };
    for (const k of keys) if (params[k] != null) params[k] *= factor;
    return { ...s, params };
  });
}

// Render one frame off-screen into an FBO and read it back as ImageData
// (rows flipped so it's top-down like a normal image).
function renderToImageData(ctx, w, h, time, transparent, stack) {
  const { gl, chain, state } = ctx;
  ctx.prepare?.();
  if (!stack) stack = ctx.renderStack ? ctx.renderStack() : state.stack;
  if (!ctx._rt) ctx._rt = createRenderTarget(gl, w, h);
  else ctx._rt = resizeRenderTarget(gl, ctx._rt, w, h);

  chain.render({
    sourceTex: ctx.source(),
    stack,
    palette: state.palette,
    time,
    width: w,
    height: h,
    transparent,
    original: state.original,
    finalTarget: ctx._rt,
  });

  const pixels = new Uint8Array(w * h * 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, ctx._rt.fbo);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const img = new ImageData(w, h);
  const row = w * 4;
  for (let y = 0; y < h; y++) {
    const src = (h - 1 - y) * row;
    img.data.set(pixels.subarray(src, src + row), y * row);
  }
  return img;
}

// ---- PNG (still, super-sampled, keeps transparency) ----
// Renders at up to 4096px long edge with pixel-uniforms scaled to match, so the
// look is identical to the preview but far crisper for print/large designs.
export async function exportPNG(ctx, { maxSide = 4096 } = {}) {
  const cw = ctx.canvas.width, ch = ctx.canvas.height;
  const factor = Math.max(1, Math.min(4, Math.floor(maxSide / Math.max(cw, ch))));
  const w = cw * factor, h = ch * factor;
  const baseStack = ctx.renderStack ? ctx.renderStack() : ctx.state.stack;
  const img = renderToImageData(ctx, w, h, ctx.baseTime(), ctx.state.transparent, scaleStack(baseStack, factor));

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d').putImageData(img, 0, 0);
  const blob = await new Promise((res) => out.toBlob(res, 'image/png'));
  download(blob, stamp('png'));
}

// ---- GIF (animated, flattened) ----
export async function exportGIF(ctx, { duration = 2, fps = 15 } = {}) {
  const { w, h } = fitBudget(ctx.canvas.width, ctx.canvas.height, 640 * 640);
  const enc = GIFEncoder();
  const frames = Math.max(1, Math.round(duration * fps));
  for (let i = 0; i < frames; i++) {
    const t = ctx.baseTime() + i / fps;
    const img = renderToImageData(ctx, w, h, t, false);
    const palette = quantize(img.data, 256);
    const index = applyPalette(img.data, palette);
    enc.writeFrame(index, w, h, { palette, delay: Math.round(1000 / fps) });
  }
  enc.finish();
  download(new Blob([enc.bytes()], { type: 'image/gif' }), stamp('gif'));
}

// ---- MP4 (animated, flattened) ----
export async function exportMP4(ctx, { duration = 3, fps = 30 } = {}) {
  if (typeof VideoEncoder === 'undefined') {
    throw new Error('WebCodecs (VideoEncoder) not available in this browser.');
  }
  let { w, h } = fitBudget(ctx.canvas.width, ctx.canvas.height, 1920 * 1080);
  w -= w % 2;
  h -= h % 2; // H.264 needs even dimensions

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: w, height: h },
    fastStart: 'in-memory',
  });
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => console.error('encoder error', e),
  });
  // Baseline L4.0 + software encoder — the config proven out in radshader.
  encoder.configure({
    codec: 'avc1.420028',
    width: w,
    height: h,
    bitrate: 8_000_000,
    framerate: fps,
    hardwareAcceleration: 'prefer-software',
  });

  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const octx = off.getContext('2d');

  const frames = Math.max(1, Math.round(duration * fps));
  for (let i = 0; i < frames; i++) {
    const t = ctx.baseTime() + i / fps;
    const img = renderToImageData(ctx, w, h, t, false);
    octx.putImageData(img, 0, 0);
    const frame = new VideoFrame(off, { timestamp: (i * 1e6) / fps, duration: 1e6 / fps });
    encoder.encode(frame, { keyFrame: i % fps === 0 });
    frame.close();
  }
  await encoder.flush();
  muxer.finalize();
  download(new Blob([muxer.target.buffer], { type: 'video/mp4' }), stamp('mp4'));
}

export const EXPORTERS = { svg: exportSVG, png: exportPNG, gif: exportGIF, mp4: exportMP4 };
