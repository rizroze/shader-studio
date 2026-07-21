// ---- ascii : brightness-driven symbol/glyph dither on a solid ground ----
// The reference look: marks (□ × + ○ ·) appear only on the bright subject,
// scatter into isolated particles in dim areas, and respect a cutout's alpha.

uniform float u_cell;    // grid cell size in px
uniform float u_gain;    // exposure — pushes marks brighter/denser
uniform float u_floor;   // brightness below this => no mark (keeps ground clean)
uniform float u_jitter;  // random per-cell dropout => scattered-particle edges
uniform float u_style;   // 0 = symbols (glyph ramp), 1 = dots, 2 = squares

float box(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }

// SDF for glyph `g` at local point p (cell space, ~ -0.5..0.5).
float glyphSDF(int g, vec2 p) {
  if (g <= 0) return length(p) - 0.14;                              // tiny dot
  if (g == 1) return min(box(p, vec2(0.30, 0.06)), box(p, vec2(0.06, 0.30))); // plus
  if (g == 2) { vec2 r = rot2(0.7854) * p; return min(box(r, vec2(0.30, 0.06)), box(r, vec2(0.06, 0.30))); } // x
  if (g == 3) return abs(length(p) - 0.22) - 0.05;                 // ring
  if (g == 4) return abs(box(p, vec2(0.28))) - 0.045;              // square outline
  return box(p, vec2(0.32));                                       // filled block
}

vec4 effect(vec2 uv) {
  vec2 px = uv * u_res;
  vec2 cellId = floor(px / u_cell);
  vec2 center = (cellId + 0.5) * u_cell;
  float lod = max(0.0, log2(u_cell) - 0.5);
  vec4 s = textureLod(u_tex, clamp(center / u_res, 0.0, 1.0), lod);

  // Cutout: transparent source => ground (handled by compose), no marks.
  if (s.a < 0.5) return compose(0.0, s.a);

  float b = luma(s.rgb);
  b = clamp((b - u_floor) / max(1.0 - u_floor, 0.001), 0.0, 1.0) * u_gain;
  b -= hash21(cellId) * u_jitter;              // random dropout => scatter
  b = clamp(b, 0.0, 1.0);
  if (b <= 0.02) return compose(0.0, s.a);     // below floor => ground shows

  int g;
  if (u_style < 0.5)      g = int(clamp(b * 6.0, 0.0, 5.0));  // symbols ramp
  else if (u_style < 1.5) g = 0;                              // dots
  else                    g = 5;                              // squares
  // brighter cells => slightly larger mark for dots/squares modes
  vec2 p = (px - center) / u_cell;
  float grow = (u_style < 0.5) ? 0.0 : (b - 0.5) * 0.2;
  float sdf = glyphSDF(g, p) - grow;

  float aa = 1.2 / u_cell;
  float ink = clamp(smoothstep(aa, -aa, sdf), 0.0, 1.0);
  return composeCol(ink, s.a, s.rgb);
}
