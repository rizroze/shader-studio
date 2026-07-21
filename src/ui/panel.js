// Builds the control panel from state. Structural changes (add/remove effect,
// brand switch) rebuild the DOM; slider drags mutate state in place (the render
// loop reads state every frame, so no rebuild needed for live values).

import { EFFECTS } from '../effects/registry.js';
import { rgb01ToHex, hexToRgb01 } from '../palette/palette.js';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export function buildPanel(root, state, actions) {
  root.innerHTML = '';

  // ---- Source ----
  const source = el('section', 'group');
  source.append(el('h2', 'group-title', 'Source'));
  const upBtn = el('button', 'btn wide', 'Upload image / video');
  upBtn.onclick = actions.upload;
  source.append(upBtn);
  root.append(source);

  // ---- Brand palette ----
  const brand = el('section', 'group');
  brand.append(el('h2', 'group-title', 'Color'));

  // Original image colors vs brand palette.
  const modeRow = el('div', 'brand-row');
  [['Original', true], ['Palette', false]].forEach(([lbl, val]) => {
    const chip = el('button', 'brand-chip' + (!!state.original === val ? ' active' : ''), lbl);
    chip.onclick = () => { actions.setOriginal(val); buildPanel(root, state, actions); };
    modeRow.append(chip);
  });
  brand.append(modeRow);

  const brandRow = el('div', 'brand-row' + (state.original ? ' muted' : ''));
  for (const [key, b] of Object.entries(state.brands)) {
    const chip = el('button', 'brand-chip' + (state.brandKey === key ? ' active' : ''), b.name);
    chip.onclick = () => actions.setBrand(key);
    brandRow.append(chip);
  }
  brand.append(brandRow);

  const swatchRow = el('div', 'swatch-row' + (state.original ? ' muted' : ''));
  const swatches = el('div', 'swatches');
  state.paletteEntries.forEach((entry, i) => {
    const wrap = el('label', 'swatch');
    const input = el('input');
    input.type = 'color';
    input.value = entry.hex;
    input.oninput = () => actions.setPaletteColor(i, input.value);
    wrap.append(input);
    swatches.append(wrap);
  });
  swatchRow.append(swatches);
  // Swap the two (or reverse all) palette colors — handy for duotone flips.
  const swap = el('button', 'swap-btn', '');
  swap.title = 'Swap colors';
  swap.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 3l3 3H5v4H3V6H1l3-3zm8 10l-3-3h2V6h2v4h2l-3 3z" fill="currentColor"/></svg>';
  swap.onclick = () => actions.swapPalette();
  swatchRow.append(swap);
  brand.append(swatchRow);
  root.append(brand);

  // ---- Background: paper vs transparent (for cutout exports) ----
  const bg = el('section', 'group');
  bg.append(el('h2', 'group-title', 'Background'));
  const bgRow = el('div', 'brand-row');
  [['Paper', false], ['Transparent', true]].forEach(([lbl, val]) => {
    const chip = el('button', 'brand-chip' + (!!state.transparent === val ? ' active' : ''), lbl);
    chip.onclick = () => { actions.setTransparent(val); buildPanel(root, state, actions); };
    bgRow.append(chip);
  });
  bg.append(bgRow);
  bg.append(el('p', 'hint', 'Transparent needs a cutout source; PNG export keeps it.'));
  root.append(bg);

  // ---- Effect (one at a time) ----
  const effGroup = el('section', 'group');
  effGroup.append(el('h2', 'group-title', 'Effect'));
  const inst = state.effect;

  const chips = el('div', 'effect-chips');
  for (const [id, def] of Object.entries(EFFECTS)) {
    const chip = el('button', 'effect-chip' + (inst.id === id ? ' active' : ''), def.label);
    chip.onclick = () => actions.setEffect(id);
    chips.append(chip);
  }
  effGroup.append(chips);

  const controls = el('div', 'effect-controls');
  for (const [key, u] of Object.entries(EFFECTS[inst.id].uniforms)) {
    controls.append(buildControl(inst, key, u, actions));
  }
  effGroup.append(controls);
  root.append(effGroup);

  // ---- Export ----
  const exp = el('section', 'group');
  exp.append(el('h2', 'group-title', 'Export'));

  const mkRow = (formats) => {
    const row = el('div', 'export-row');
    formats.forEach(([fmt, sub]) => {
      const b = el('button', 'btn', '');
      b.append(el('span', 'exp-fmt', fmt));
      if (sub) b.append(el('span', 'exp-sub', sub));
      b.disabled = !actions.export;
      b.onclick = () => actions.export && actions.export(fmt.toLowerCase());
      row.append(b);
    });
    return row;
  };
  exp.append(el('p', 'exp-cat', 'Still'));
  exp.append(mkRow([['SVG', 'vector'], ['PNG', '4K · alpha']]));
  exp.append(el('p', 'exp-cat', 'Motion'));
  exp.append(mkRow([['GIF', ''], ['MP4', '']]));
  exp.append(el('p', 'hint', 'SVG = infinite-res vector (halftone / dither / ascii). PNG keeps transparency.'));
  root.append(exp);
}

function buildControl(inst, key, u, actions) {
  const row = el('div', 'ctrl');
  const label = el('div', 'ctrl-label');
  label.append(el('span', 'ctrl-name', u.label));
  const val = el('span', 'ctrl-val');
  row.append(label);

  if (u.type === 'enum') {
    const sel = el('select', 'ctrl-enum');
    u.options.forEach((opt, i) => {
      const o = el('option', null, opt);
      o.value = i;
      if (i === inst.params[key]) o.selected = true;
      sel.append(o);
    });
    sel.onchange = () => actions.setParam(key, parseInt(sel.value, 10));
    row.append(sel);
    return row;
  }

  val.textContent = fmt(inst.params[key]);
  label.append(val);
  const slider = el('input', 'ctrl-range');
  slider.type = 'range';
  slider.min = u.min;
  slider.max = u.max;
  slider.step = u.step;
  slider.value = inst.params[key];
  slider.oninput = () => {
    const v = parseFloat(slider.value);
    actions.setParam(key, v);
    val.textContent = fmt(v);
  };
  row.append(slider);
  return row;
}

const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(2));
