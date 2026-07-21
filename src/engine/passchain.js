// The heart of the engine: compiles effects into programs and renders a stack
// of them via ping-pong framebuffers. source -> effect0 -> effect1 -> ... -> screen.

import { createProgram, createRenderTarget, resizeRenderTarget, VERT_SRC } from './gl.js';
import { EFFECTS } from '../effects/registry.js';
import commonSrc from '../effects/common.glsl?raw';

const MAX_PALETTE = 16;

// Shared fragment header: common uniforms + palette, then common helpers, then
// the effect body (which defines `vec4 effect(vec2)`), then a main() that calls it.
function buildFrag(effectSrc) {
  return `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_pal[${MAX_PALETTE}];
uniform float u_palPos[${MAX_PALETTE + 1}];
uniform int u_palCount;
uniform float u_transparent;
uniform float u_original;

${commonSrc}
${effectSrc}

void main() { fragColor = effect(v_uv); }`;
}

const COPY_FRAG = `vec4 effect(vec2 uv) { return texture(u_tex, uv); }`;

export class PassChain {
  constructor(gl, vao) {
    this.gl = gl;
    this.vao = vao;
    this.programs = new Map(); // id -> { prog, locs }
    this.targets = [null, null];
    this.width = 0;
    this.height = 0;
  }

  // Compile-and-cache. `id` is an effect key, or 'copy' for the passthrough.
  _program(id) {
    if (this.programs.has(id)) return this.programs.get(id);
    const gl = this.gl;
    const src = id === 'copy' ? COPY_FRAG : EFFECTS[id].frag;
    const prog = createProgram(gl, VERT_SRC, buildFrag(src));
    const locs = {
      u_tex: gl.getUniformLocation(prog, 'u_tex'),
      u_res: gl.getUniformLocation(prog, 'u_res'),
      u_time: gl.getUniformLocation(prog, 'u_time'),
      u_pal: gl.getUniformLocation(prog, 'u_pal'),
      u_palPos: gl.getUniformLocation(prog, 'u_palPos'),
      u_palCount: gl.getUniformLocation(prog, 'u_palCount'),
      u_transparent: gl.getUniformLocation(prog, 'u_transparent'),
      u_original: gl.getUniformLocation(prog, 'u_original'),
      params: {},
    };
    if (id !== 'copy') {
      for (const key of Object.keys(EFFECTS[id].uniforms)) {
        locs.params[key] = gl.getUniformLocation(prog, key);
      }
    }
    const entry = { prog, locs };
    this.programs.set(id, entry);
    return entry;
  }

  _ensureTargets(w, h) {
    const gl = this.gl;
    if (this.width === w && this.height === h && this.targets[0]) return;
    this.width = w;
    this.height = h;
    for (let i = 0; i < 2; i++) {
      this.targets[i] = this.targets[i]
        ? resizeRenderTarget(gl, this.targets[i], w, h)
        : createRenderTarget(gl, w, h);
    }
  }

  _flatPalette(palette) {
    const pal = new Float32Array(MAX_PALETTE * 3);
    for (let i = 0; i < palette.count; i++) {
      pal[i * 3] = palette.colors[i][0];
      pal[i * 3 + 1] = palette.colors[i][1];
      pal[i * 3 + 2] = palette.colors[i][2];
    }
    const pos = new Float32Array(MAX_PALETTE + 1);
    for (let i = 0; i < palette.pos.length; i++) pos[i] = palette.pos[i];
    return { pal, pos };
  }

  // sourceTex: WebGL texture of the input media.
  // stack: [{ id, params, enabled }]. palette: { colors, pos, count }.
  // finalTarget: optional FBO for the last pass (used by export); null = screen.
  render({ sourceTex, stack, palette, time, width, height, transparent = false, original = false, finalTarget = null }) {
    const gl = this.gl;
    this._ensureTargets(width, height);
    gl.bindVertexArray(this.vao);

    const { pal, pos } = this._flatPalette(palette);

    // No active effects -> single copy pass so the source still shows.
    const active = stack.filter((s) => s.enabled);
    const passes = active.length ? active : [{ id: 'copy', params: {} }];

    let inputTex = sourceTex;
    passes.forEach((pass, i) => {
      const last = i === passes.length - 1;
      const entry = this._program(pass.id);
      const target = last ? finalTarget : this.targets[i % 2];

      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
      gl.viewport(0, 0, width, height);
      gl.useProgram(entry.prog);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, inputTex);
      gl.uniform1i(entry.locs.u_tex, 0);
      gl.uniform2f(entry.locs.u_res, width, height);
      gl.uniform1f(entry.locs.u_time, time);
      gl.uniform3fv(entry.locs.u_pal, pal);
      gl.uniform1fv(entry.locs.u_palPos, pos);
      gl.uniform1i(entry.locs.u_palCount, palette.count);
      if (entry.locs.u_transparent != null) gl.uniform1f(entry.locs.u_transparent, transparent ? 1 : 0);
      if (entry.locs.u_original != null) gl.uniform1f(entry.locs.u_original, original ? 1 : 0);

      for (const [key, loc] of Object.entries(entry.locs.params)) {
        if (loc != null) gl.uniform1f(loc, pass.params[key] ?? 0);
      }

      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (target) inputTex = target.tex;
    });

    gl.bindVertexArray(null);
  }
}
