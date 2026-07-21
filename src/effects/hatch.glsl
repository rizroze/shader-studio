// ---- hatch : cross-hatch / engraving (Tonal Art Map style) ----
// Darker tone => more layers of hatching lines accumulate. The da Vinci look.

uniform float u_spacing; // line spacing in px
uniform float u_angle;   // base hatch angle
uniform float u_width;   // line thickness (fraction of spacing)
uniform float u_layers;  // how many hatch directions build up (1..6)

// Ink coverage (0..1) for one set of parallel lines.
float lineSet(vec2 px, float angle, float spacing, float halfW) {
  vec2 p = rot2(angle) * px;
  float dline = abs(fract(p.y / spacing + 0.5) - 0.5) * spacing; // px distance to nearest line
  return 1.0 - smoothstep(halfW - 0.7, halfW + 0.7, dline);
}

vec4 effect(vec2 uv) {
  vec2 px = uv * u_res;
  float dark = 1.0 - luma(texture(u_tex, uv).rgb);
  float halfW = u_width * u_spacing * 0.5;

  float angles[6] = float[6](0.0, PI * 0.5, PI * 0.25, -PI * 0.25, PI * 0.125, PI * 0.375);
  int L = int(u_layers);
  float ink = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= L) break;
    float thr = (float(i) + 1.0) / (float(L) + 1.0);        // evenly spaced tonal steps
    float gate = smoothstep(thr - 0.08, thr + 0.02, dark);  // soft so tones blend
    float s = lineSet(px, u_angle + angles[i], u_spacing, halfW);
    ink = max(ink, s * gate);
  }
  return vec4(mix(paperColor(), inkColor(), ink), 1.0);
}
