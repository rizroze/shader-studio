// ---- halftone : classic AM screen. Dot area grows with darkness. ----

uniform float u_scale;    // cell size in px
uniform float u_angle;    // screen rotation (radians)
uniform float u_soft;     // dot edge softness
uniform float u_exposure; // multiplicative brightness
uniform float u_contrast; // tonal steepness
uniform float u_gamma;    // shadow / highlight shaping
uniform float u_shape;    // 0 = round dot, 1 = square, 2 = line

float dotDist(vec2 local, float shape) {
  if (shape < 0.5) return length(local);                 // round
  if (shape < 1.5) return max(abs(local.x), abs(local.y)); // square
  return abs(local.y);                                   // line screen
}

vec4 effect(vec2 uv) {
  vec2 px = uv * u_res;
  mat2 R = rot2(u_angle);
  vec2 rp = R * px;

  // Tone sampled at the cell center so every pixel in a cell shares one target.
  vec2 cellId = floor(rp / u_scale);
  vec2 cellCenter = (cellId + 0.5) * u_scale;
  vec2 sampleUv = clamp((transpose(R) * cellCenter) / u_res, 0.0, 1.0);
  // Average the tone across the whole cell (mip level ~ cell size) so large
  // cells read the region's brightness instead of one arbitrary pixel.
  float lod = max(0.0, log2(u_scale) - 0.5);
  vec4 s = textureLod(u_tex, sampleUv, lod);

  // Tonal shaping (matches dither): exposure -> gamma -> contrast.
  float tone = luma(s.rgb) * u_exposure;
  tone = pow(clamp(tone, 0.0, 1.0), 1.0 / u_gamma);
  tone = (tone - 0.5) * u_contrast + 0.5;
  float darkness = clamp(1.0 - tone, 0.0, 1.0);

  // Local position within the cell, normalized so edge ~= 1.
  vec2 local = (rp - cellCenter) / (u_scale * 0.5);
  float d = dotDist(local, u_shape);

  float radius = sqrt(darkness);            // area proportional to darkness
  float ink = smoothstep(radius + u_soft, radius - u_soft, d);

  return composeCol(ink, s.a, s.rgb);
}
