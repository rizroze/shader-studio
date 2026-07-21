// The effect catalog. Each entry = a fragment shader + the uniforms the UI exposes.
// `uniforms` drives both the auto-generated panel AND what gets sent to the GPU.

import ditherSrc from './dither.glsl?raw';
import halftoneSrc from './halftone.glsl?raw';
import hatchSrc from './hatch.glsl?raw';
import asciiSrc from './ascii.glsl?raw';

export const EFFECTS = {
  dither: {
    label: 'Dither',
    frag: ditherSrc,
    uniforms: {
      // u_algo 0 = Ordered (GPU Bayer); 1 = Floyd–Steinberg, 2 = Atkinson (CPU error-diffusion)
      u_algo:     { label: 'Algorithm', type: 'enum', options: ['Ordered', 'Floyd–Steinberg', 'Atkinson'], value: 2 },
      u_cell:     { label: 'Pixels',   type: 'float', min: 1,   max: 24,  step: 1,    value: 2 },
      u_exposure: { label: 'Exposure', type: 'float', min: 0.2, max: 2.5, step: 0.01, value: 1.0 },
      u_contrast: { label: 'Contrast', type: 'float', min: 0.2, max: 3,   step: 0.01, value: 1.3 },
      u_gamma:    { label: 'Gamma',    type: 'float', min: 0.3, max: 3,   step: 0.01, value: 1.0 },
      u_sharpen:  { label: 'Detail',   type: 'float', min: 0,   max: 1.5, step: 0.01, value: 0.4 },
    },
  },
  halftone: {
    label: 'Halftone',
    frag: halftoneSrc,
    uniforms: {
      u_scale:    { label: 'Cell',     type: 'float', min: 3,    max: 48,   step: 0.5,  value: 10 },
      u_angle:    { label: 'Angle',    type: 'float', min: 0,    max: 1.57, step: 0.01, value: 0.4 },
      u_exposure: { label: 'Exposure', type: 'float', min: 0.2,  max: 2.5,  step: 0.01, value: 1.0 },
      u_contrast: { label: 'Contrast', type: 'float', min: 0.2,  max: 3,    step: 0.01, value: 1.1 },
      u_gamma:    { label: 'Gamma',    type: 'float', min: 0.3,  max: 3,    step: 0.01, value: 1.0 },
      u_soft:     { label: 'Soft',     type: 'float', min: 0.01, max: 0.6,  step: 0.01, value: 0.08 },
      u_shape:    { label: 'Shape',    type: 'enum',  options: ['Dot', 'Square', 'Line'], value: 0 },
    },
  },
  hatch: {
    label: 'Cross-hatch',
    frag: hatchSrc,
    uniforms: {
      u_spacing: { label: 'Spacing', type: 'float', min: 3,    max: 24,   step: 0.5,  value: 7 },
      u_angle:   { label: 'Angle',   type: 'float', min: 0,    max: 3.14, step: 0.01, value: 0.5 },
      u_width:   { label: 'Weight',  type: 'float', min: 0.05, max: 0.6,  step: 0.01, value: 0.22 },
      u_layers:  { label: 'Layers',  type: 'float', min: 1,    max: 6,    step: 1,    value: 4 },
    },
  },
  ascii: {
    label: 'ASCII / Symbols',
    frag: asciiSrc,
    uniforms: {
      u_cell:   { label: 'Cell',    type: 'float', min: 2,   max: 20,  step: 0.5,  value: 6 },
      u_gain:   { label: 'Gain',    type: 'float', min: 0.5, max: 3,   step: 0.05, value: 1.4 },
      u_floor:  { label: 'Floor',   type: 'float', min: 0,   max: 0.9, step: 0.01, value: 0.35 },
      u_jitter: { label: 'Scatter', type: 'float', min: 0,   max: 1,   step: 0.01, value: 0.25 },
      u_style:  { label: 'Marks',   type: 'enum',  options: ['Symbols', 'Dots', 'Squares'], value: 0 },
    },
  },
};

// A fresh instance of an effect's params (so instances are independent).
export function instantiate(id) {
  const def = EFFECTS[id];
  const params = {};
  for (const [key, u] of Object.entries(def.uniforms)) params[key] = u.value;
  return { id, params, enabled: true };
}
