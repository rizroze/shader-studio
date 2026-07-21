// Turns a brand definition (colors + weights) into the uniform struct the
// shaders consume: normalized colors + cumulative position boundaries.

export function hexToRgb01(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgb01ToHex([r, g, b]) {
  const v = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${v(r)}${v(g)}${v(b)}`;
}

// entries: [{ hex, weight }]. Ordered dark -> light is the usual convention.
// Returns { colors:[[r,g,b]], pos:[0..1 boundaries], count }.
export function buildPalette(entries) {
  const count = Math.min(entries.length, 16);
  const colors = entries.slice(0, count).map((e) => hexToRgb01(e.hex));

  // Perceptual weighting (sqrt) mirrors the old RadShader response curve.
  const weights = entries.slice(0, count).map((e) => Math.sqrt(Math.max(e.weight, 0.001) / 100) * 100);
  const total = weights.reduce((s, w) => s + w, 0) || 1;

  const pos = [0];
  let cum = 0;
  for (let i = 0; i < count; i++) {
    cum += weights[i];
    pos.push(cum / total);
  }
  return { colors, pos, count };
}
