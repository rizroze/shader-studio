import './ui/styles.css';
import { createContext, createFullscreenTriangle } from './engine/gl.js';
import { PassChain } from './engine/passchain.js';
import { MediaSource } from './source/media.js';
import { buildPalette } from './palette/palette.js';
import { instantiate } from './effects/registry.js';
import { DitherManager } from './effects/ditherManager.js';
import { buildPanel } from './ui/panel.js';
import { EXPORTERS } from './export/exporters.js';

import neutral from './brands/neutral.json';
import noir from './brands/noir.json';
import blue from './brands/blue.json';
import riso from './brands/riso.json';

const MAX_SIDE = 1440; // cap the render resolution's long edge

const canvas = document.getElementById('gl');
const gl = createContext(canvas);
const vao = createFullscreenTriangle(gl);
const chain = new PassChain(gl, vao);
const media = new MediaSource(gl);
const ditherMgr = new DitherManager(gl);
const fileInput = document.getElementById('file-input');

// Pass used to display a CPU-computed texture (error-diffusion dither) unchanged.
const COPY_STACK = [{ id: 'copy', params: {}, enabled: true }];

const brands = { neutral, noir, blue, riso };

const state = {
  brands,
  brandKey: 'neutral',
  paletteEntries: neutral.palette.map((p) => ({ ...p })),
  palette: buildPalette(neutral.palette),
  effect: instantiate('halftone'),
  transparent: false,
  original: true, // open in original-colors mode by default
  // One effect at a time; the engine/exporters consume a list, so expose one.
  get stack() { return [this.effect]; },
};

// ---- render sizing: fit media aspect within MAX_SIDE ----
function renderSize() {
  const ar = media.width / media.height || 1;
  let w, h;
  if (ar >= 1) { w = Math.min(MAX_SIDE, media.width); h = Math.round(w / ar); }
  else { h = Math.min(MAX_SIDE, media.height); w = Math.round(h * ar); }
  return { w: Math.max(2, w), h: Math.max(2, h) };
}

function syncCanvas() {
  const { w, h } = renderSize();
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

// ---- actions wired into the panel ----
const actions = {
  upload: () => fileInput.click(),
  setBrand: (key) => {
    state.brandKey = key;
    state.paletteEntries = brands[key].palette.map((p) => ({ ...p }));
    state.palette = buildPalette(state.paletteEntries);
    rebuild();
  },
  setPaletteColor: (i, hex) => {
    state.paletteEntries[i].hex = hex;
    state.palette = buildPalette(state.paletteEntries);
  },
  swapPalette: () => {
    state.paletteEntries.reverse();
    state.palette = buildPalette(state.paletteEntries);
    rebuild();
  },
  setEffect: (id) => { state.effect = instantiate(id); rebuild(); },
  setParam: (key, v) => { state.effect.params[key] = v; },
};

const controlsRoot = document.getElementById('controls');
function rebuild() { buildPanel(controlsRoot, state, actions); }

fileInput.onchange = async () => {
  if (!fileInput.files[0]) return;
  await media.loadFile(fileInput.files[0]);
  syncCanvas();
};

// drag & drop onto the stage
const stage = document.getElementById('stage');
stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('drag'); });
stage.addEventListener('dragleave', () => stage.classList.remove('drag'));
stage.addEventListener('drop', async (e) => {
  e.preventDefault();
  stage.classList.remove('drag');
  const f = e.dataTransfer.files[0];
  if (f) { await media.loadFile(f); syncCanvas(); }
});

// Paste an image straight from the clipboard (Cmd/Ctrl+V).
window.addEventListener('paste', async (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image'));
  if (!item) return;
  const f = item.getAsFile();
  if (f) { await media.loadFile(f); syncCanvas(); }
});

// ---- render ----
const start = performance.now();
const now = () => (performance.now() - start) / 1000;

function renderScene(time = now()) {
  if (!media.ready) return;
  syncCanvas();

  // Error-diffusion dither: CPU builds the texture, GPU just upscales it.
  if (ditherMgr.isActive(state.effect)) {
    ditherMgr.update(media, state.effect, state, canvas.width, canvas.height);
    chain.render({
      sourceTex: ditherMgr.tex,
      stack: COPY_STACK,
      palette: state.palette,
      time,
      width: canvas.width,
      height: canvas.height,
      transparent: false, // alpha is already baked into the texture
    });
    return;
  }

  chain.render({
    sourceTex: media.tex,
    stack: state.stack,
    palette: state.palette,
    time,
    width: canvas.width,
    height: canvas.height,
    transparent: state.transparent,
    original: state.original,
  });
}

function frame() {
  media.update();
  renderScene();
  requestAnimationFrame(frame);
}

// ---- export context ----
const exportCtx = {
  gl,
  chain,
  canvas,
  state,
  source: () => (ditherMgr.isActive(state.effect) ? ditherMgr.tex : media.tex),
  renderStack: () => (ditherMgr.isActive(state.effect) ? COPY_STACK : state.stack),
  prepare: () => { if (ditherMgr.isActive(state.effect)) ditherMgr.update(media, state.effect, state, canvas.width, canvas.height); },
  ditherInfo: () => (ditherMgr.isActive(state.effect) ? ditherMgr.info() : null),
  baseTime: () => now(),
  renderNow: () => renderScene(),
  _rt: null,
};
actions.export = async (fmt) => {
  try {
    await EXPORTERS[fmt](exportCtx);
  } catch (err) {
    console.error(`${fmt} export failed:`, err);
    alert(`${fmt.toUpperCase()} export failed: ${err.message}`);
  }
};
actions.setTransparent = (v) => {
  state.transparent = v;
  canvas.classList.toggle('alpha-bg', v); // checkerboard behind transparent areas
};
actions.setOriginal = (v) => { state.original = v; };

// Dev hook: inspect/drive state from the console or automated tests.
window.studio = {
  state,
  actions,
  media,
  exportCtx,
  loadUrl: async (url) => { await media.loadImage(url); syncCanvas(); },
  setEffect(id) { state.effect = instantiate(id); rebuild(); },
};

(async () => {
  rebuild();
  await media.loadImage('/sample.jpg');
  syncCanvas();
  requestAnimationFrame(frame);
})();
