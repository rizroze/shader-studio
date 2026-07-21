// ---- common.glsl : shared helpers, prepended to every effect ----
// Shared uniforms (u_tex, u_res, u_time, palette) are declared by the wrapper.

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

// Perceptual luminance (Rec. 709).
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

mat2 rot2(float a) { float s = sin(a), c = cos(a); return mat2(c, -s, s, c); }

// Cheap hash noise.
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

// Value noise + fbm for warps and organic texture.
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1, 0));
  float c = hash21(i + vec2(0, 1)), d = hash21(i + vec2(1, 1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, amp = 0.5;
  for (int i = 0; i < 5; i++) { v += amp * vnoise(p); p *= 2.02; amp *= 0.5; }
  return v;
}

// ---- Palette ----
// u_pal[i] is band color i; u_palPos holds cumulative boundaries in 0..1.
// paletteQuant maps a tone t (0=first color .. 1=last) to the nearest band color.
vec3 paletteQuant(float t) {
  t = clamp(t, 0.0, 1.0);
  int n = max(u_palCount, 1);
  for (int i = 0; i < 16; i++) {
    if (i >= n) break;
    if (t < u_palPos[i + 1]) return u_pal[i];
  }
  return u_pal[n - 1];
}

// Smooth palette ramp — interpolates between band centers for gradient looks.
vec3 paletteRamp(float t) {
  t = clamp(t, 0.0, 1.0);
  int n = max(u_palCount, 1);
  if (n == 1) return u_pal[0];
  float scaled = t * float(n - 1);
  int idx = int(floor(scaled));
  idx = min(idx, n - 2);
  float f = scaled - float(idx);
  return mix(u_pal[idx], u_pal[idx + 1], f);
}

// Two-tone ink/paper picks (first + last palette entries).
vec3 inkColor() { return u_pal[0]; }
vec3 paperColor() { return u_pal[max(u_palCount, 1) - 1]; }

// Compose a mark over the ground, honoring cutout alpha + transparent mode.
//   ink  = mark coverage 0..1 (how much of this pixel is inked)
//   srcA = source alpha at this pixel (a cutout's transparency)
// Transparent mode: marks keep the ink color with straight alpha, ground is
// fully transparent -> exports a clean PNG of just the marks.
// Colored variant: the mark takes the source pixel color when u_original is on
// (e.g. colored halftone dots), otherwise the palette ink.
vec4 composeCol(float ink, float srcA, vec3 srcRgb) {
  vec3 mark = (u_original > 0.5) ? srcRgb : inkColor();
  if (srcA < 0.5) {
    return (u_transparent > 0.5) ? vec4(0.0) : vec4(paperColor(), 1.0);
  }
  if (u_transparent > 0.5) return vec4(mark, clamp(ink, 0.0, 1.0));
  return vec4(mix(paperColor(), mark, ink), 1.0);
}

vec4 compose(float ink, float srcA) { return composeCol(ink, srcA, inkColor()); }
