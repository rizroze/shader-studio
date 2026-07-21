// CPU error-diffusion dithering (Floyd-Steinberg, Atkinson). Sequential by nature
// — each pixel pushes its quantization error to neighbors — so it can't run in a
// parallel fragment shader. We compute a small quantized level grid here; the GPU
// then nearest-upscales it and maps the live palette + transparency over it.

const KERNELS = {
  // [dx, dy, weight]
  fs: [[1, 0, 7 / 16], [-1, 1, 3 / 16], [0, 1, 5 / 16], [1, 1, 1 / 16]],
  // Atkinson spreads 6/8 of the error (loses 2/8) -> crisper, higher contrast.
  atkinson: [[1, 0, 1 / 8], [2, 0, 1 / 8], [-1, 1, 1 / 8], [0, 1, 1 / 8], [1, 1, 1 / 8], [0, 2, 1 / 8]],
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// imgData: downsampled source (gw x gh). Returns level indices 0..L-1, tone, alpha.
// Tonal pipeline: sharpen -> exposure -> gamma -> contrast, then error-diffuse.
export function computeLevelGrid(imgData, gw, gh, { algo, levels, exposure = 1, gamma = 1, contrast = 1, sharpen = 0 }) {
  const n = gw * gh;
  const d = imgData.data;
  const raw = new Float32Array(n);
  const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    raw[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
    alpha[i] = d[i * 4 + 3];
  }

  // Unsharp mask (3x3 box blur) — crisps edges so the dither reads structure.
  if (sharpen > 0) {
    const blur = new Float32Array(n);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        let sum = 0, cnt = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || xx >= gw || yy < 0 || yy >= gh) continue;
            sum += raw[yy * gw + xx];
            cnt++;
          }
        }
        blur[y * gw + x] = sum / cnt;
      }
    }
    for (let i = 0; i < n; i++) raw[i] += sharpen * (raw[i] - blur[i]);
  }

  const gray = new Float32Array(n);
  const invGamma = 1 / gamma;
  for (let i = 0; i < n; i++) {
    let v = raw[i] * exposure;
    v = Math.pow(clamp01(v), invGamma);
    v = (v - 0.5) * contrast + 0.5;
    gray[i] = v;
  }

  const L = Math.max(2, levels);
  const level = new Uint8Array(n);
  const tone = new Float32Array(n);
  const quant = (v) => Math.round(Math.min(1, Math.max(0, v)) * (L - 1));
  const kernel = KERNELS[algo];

  if (kernel) {
    for (let y = 0; y < gh; y++) {
      // serpentine scan reduces directional artifacts
      const ltr = (y & 1) === 0;
      for (let k = 0; k < gw; k++) {
        const x = ltr ? k : gw - 1 - k;
        const i = y * gw + x;
        const lv = quant(gray[i]);
        level[i] = lv;
        tone[i] = lv / (L - 1);
        const err = gray[i] - tone[i];
        for (const [dx0, dy, w] of kernel) {
          const dx = ltr ? dx0 : -dx0;
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || xx >= gw || yy >= gh) continue;
          gray[yy * gw + xx] += err * w;
        }
      }
    }
  } else {
    for (let i = 0; i < n; i++) { level[i] = quant(gray[i]); tone[i] = level[i] / (L - 1); }
  }

  return { level, tone, alpha, gw, gh, levels: L };
}
