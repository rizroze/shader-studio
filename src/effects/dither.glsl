// ---- dither : ordered (Bayer 8x8) dithering to the palette ----
// The RadShader signature look, ported to the GPU.

uniform float u_cell;      // block size in px (chunkiness)
uniform float u_exposure;  // multiplicative brightness
uniform float u_contrast;  // tonal steepness
uniform float u_gamma;     // shadow / highlight shaping

const float BAYER8[64] = float[64](
   0.0,32.0, 8.0,40.0, 2.0,34.0,10.0,42.0,
  48.0,16.0,56.0,24.0,50.0,18.0,58.0,26.0,
  12.0,44.0, 4.0,36.0,14.0,46.0, 6.0,38.0,
  60.0,28.0,52.0,20.0,62.0,30.0,54.0,22.0,
   3.0,35.0,11.0,43.0, 1.0,33.0, 9.0,41.0,
  51.0,19.0,59.0,27.0,49.0,17.0,57.0,25.0,
  15.0,47.0, 7.0,39.0,13.0,45.0, 5.0,37.0,
  63.0,31.0,55.0,23.0,61.0,29.0,53.0,21.0
);

vec4 effect(vec2 uv) {
  vec2 px = uv * u_res;
  // Pixelate: snap to a block and sample its center.
  vec2 block = (floor(px / u_cell) + 0.5) * u_cell;
  vec4 src = texture(u_tex, clamp(block / u_res, 0.0, 1.0));

  float t = luma(src.rgb) * u_exposure;
  t = pow(clamp(t, 0.0, 1.0), 1.0 / u_gamma);
  t = (t - 0.5) * u_contrast + 0.5;

  ivec2 cell = ivec2(floor(px / u_cell));
  float thr = BAYER8[(cell.y & 7) * 8 + (cell.x & 7)] / 64.0;
  vec3 col = paletteQuant(clamp(t + (thr - 0.5), 0.0, 1.0));

  bool paperCell = col == paperColor();
  vec3 outCol = (u_original > 0.5 && !paperCell) ? src.rgb : col; // original: ink cells keep source color

  if (u_transparent > 0.5) return vec4(outCol, paperCell ? 0.0 : src.a);
  if (src.a < 0.5) return vec4(paperColor(), 1.0);
  return vec4(outCol, 1.0);
}
