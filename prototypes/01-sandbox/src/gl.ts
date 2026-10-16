/**
 * WebGL2 renderer: the GPU version of prototypes/00-stills/src/kit/render.ts.
 *
 *   1. light (half res): ambient + sky rays + lamps, shadow-marched through the occlusion texture
 *   2. emission chain (1/4 and 1/8 res, blurred): glow light from emissive cells, bloom, and
 *      a blurred "solidity" so rock interiors fade to dark
 *   3. composite to screen: per-cell albedo × light + emission + bloom, tone map, vignette, dither
 *
 * World textures have row 0 = top of the world; only the final pass flips to screen space.
 */

export interface LampDef { x: number; y: number; color: [number, number, number]; radius: number }

export interface Look {
  ambient: [number, number, number];
  sky: [number, number, number];
  lampK: number;
  glow: number;
  bloom: number;
  depth: number;
  exposure: number;
  tint: [number, number, number];
  /** Multiplies the painted sky backdrop. */
  skyTint: [number, number, number];
}

export const LOOKS: Record<string, Look> = {
  day: { ambient: [0.18, 0.18, 0.22], sky: [0.95, 0.92, 0.85], lampK: 1, glow: 1, bloom: 0.8, depth: 0.88, exposure: 1, tint: [1.03, 1, 0.96], skyTint: [1, 1, 1] },
  dusk: { ambient: [0.1, 0.08, 0.12], sky: [0.75, 0.45, 0.4], lampK: 1.1, glow: 1.1, bloom: 1, depth: 0.9, exposure: 1, tint: [1.06, 0.97, 0.94], skyTint: [1.05, 0.62, 0.55] },
  night: { ambient: [0.04, 0.05, 0.09], sky: [0.12, 0.16, 0.3], lampK: 1.2, glow: 1.3, bloom: 1.2, depth: 0.92, exposure: 1.05, tint: [0.95, 1, 1.08], skyTint: [0.1, 0.12, 0.22] },
  work: { ambient: [0.85, 0.83, 0.8], sky: [0, 0, 0], lampK: 0.5, glow: 0.6, bloom: 0.5, depth: 0.55, exposure: 1, tint: [1, 1, 1], skyTint: [0.9, 0.9, 0.9] },
};

const VERT = `#version 300 es
in vec2 p; out vec2 uv;
void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const MAX_LAMPS = 16;

const LIGHT = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D uEO;
uniform vec2 uWorld;
uniform vec3 uAmb, uSky;
uniform int uN;
uniform vec4 uLamp[${MAX_LAMPS}];
uniform vec3 uLampC[${MAX_LAMPS}];
float occ(vec2 cell) { return texture(uEO, cell / uWorld).a; }
void main() {
  vec2 p = uv * uWorld;
  vec3 L = uAmb;
  if (uSky.r + uSky.g + uSky.b > 0.0) {
    float sum = 0.0;
    for (int r = 0; r < 3; r++) {
      vec2 d = vec2(float(r - 1) * 0.4, -1.0) * 2.0;
      vec2 q = p; float T = 1.0;
      for (int s = 0; s < 140; s++) {
        q += d;
        if (q.y < 0.0) break;
        float a = occ(q);
        T *= (1.0 - a) * (1.0 - a);
        if (T < 0.02) { T = 0.0; break; }
      }
      sum += T;
    }
    L += uSky * sum / 3.0;
  }
  for (int i = 0; i < ${MAX_LAMPS}; i++) {
    if (i >= uN) break;
    vec2 lp = uLamp[i].xy; float rad = uLamp[i].z;
    vec2 dir = lp - p; float dist = length(dir);
    if (dist > rad) continue;
    float T = 1.0;
    int n = int(dist / 1.5);
    for (int s = 2; s < n; s++) {
      float a = occ(p + dir * (float(s) / float(n)));
      T *= 1.0 - a;
      if (T < 0.02) break;
    }
    L += uLampC[i] * uLamp[i].w * pow(1.0 - dist / rad, 1.6) * T;
  }
  o = vec4(L * 0.5, 1.0);
}`;

/** First downsample (full -> 1/4): emission, plus solidity from the colour texture's alpha. */
const DOWN4 = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D uEO, uCol; uniform vec2 uTexel;
void main() {
  vec4 s = vec4(0.0);
  for (int y = -1; y <= 2; y++) for (int x = -1; x <= 2; x++) {
    vec2 q = uv + (vec2(x, y) - 0.5) * uTexel;
    s += vec4(texture(uEO, q).rgb, texture(uCol, q).a > 0.99 ? 1.0 : 0.0);
  }
  o = s / 16.0;
}`;

const DOWN2 = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D uSrc; uniform vec2 uTexel;
void main() {
  o = 0.25 * (texture(uSrc, uv + uTexel * vec2(-0.5, -0.5)) + texture(uSrc, uv + uTexel * vec2(0.5, -0.5))
            + texture(uSrc, uv + uTexel * vec2(-0.5, 0.5)) + texture(uSrc, uv + uTexel * vec2(0.5, 0.5)));
}`;

const BLUR = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D uSrc; uniform vec2 uDir;
void main() {
  float w[5] = float[5](0.227, 0.194, 0.121, 0.054, 0.016);
  vec4 s = texture(uSrc, uv) * w[0];
  for (int i = 1; i < 5; i++) s += (texture(uSrc, uv + uDir * float(i)) + texture(uSrc, uv - uDir * float(i))) * w[i];
  o = s;
}`;

const COMPOSITE = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D uCol, uEO, uL, uB1, uB2;
uniform vec2 uWorld;
uniform float uGlow, uBloom, uDepth, uExp;
uniform vec3 uTint, uSkyTint;
float soft(float c) { return c < 0.8 ? c : 0.8 + 0.2 * (1.0 - exp(-(c - 0.8) * 4.0)); }
void main() {
  vec2 wv = vec2(uv.x, 1.0 - uv.y);
  ivec2 c = clamp(ivec2(floor(wv * uWorld)), ivec2(0), ivec2(uWorld) - 1);
  vec4 col = texelFetch(uCol, c, 0);
  vec3 e = texelFetch(uEO, c, 0).rgb * 2.0;
  vec2 cuv = (vec2(c) + 0.5) / uWorld;
  vec3 L = texture(uL, cuv).rgb * 2.0;
  vec4 b1 = texture(uB1, cuv), b2 = texture(uB2, cuv);
  vec3 glow = (b1.rgb * 1.2 + b2.rgb * 2.2) * uGlow;
  vec3 lit;
  if (col.a < 0.01) lit = col.rgb * uSkyTint;
  else {
    vec3 light = L + glow;
    if (col.a < 0.6) light *= 0.6;
    if (col.a > 0.99) light *= mix(1.0, 1.0 - uDepth, smoothstep(0.45, 0.92, b1.a));
    lit = col.rgb * light;
  }
  vec3 rgb = (lit + e + (b1.rgb * 0.8 + b2.rgb * 1.4) * uBloom) * uExp * uTint;
  vec2 v = wv - 0.5;
  rgb *= 1.0 - dot(v, v) * 0.55;
  int bx = c.x & 3, by = c.y & 3;
  float bayer = float((bx ^ by) * 4 + (by & 1) * 2 + (bx & 1)) / 16.0 - 0.5;
  o = vec4(vec3(soft(rgb.r), soft(rgb.g), soft(rgb.b)) + bayer / 255.0, 1.0);
}`;

interface Target { tex: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number }

export class GLRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly progs: Record<string, { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> }> = {};
  private readonly colTex: WebGLTexture;
  private readonly eoTex: WebGLTexture;
  private readonly light: Target;
  private readonly q: Target[];
  private readonly e: Target[];
  private readonly canvas: HTMLCanvasElement;
  private readonly W: number;
  private readonly H: number;

  constructor(canvas: HTMLCanvasElement, W: number, H: number) {
    this.canvas = canvas; this.W = W; this.H = H;
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 is not available in this browser.");
    this.gl = gl;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    for (const [name, src] of Object.entries({ LIGHT, DOWN4, DOWN2, BLUR, COMPOSITE })) this.progs[name] = this.program(src);
    this.colTex = this.texture(W, H, gl.NEAREST);
    this.eoTex = this.texture(W, H, gl.LINEAR);
    this.light = this.target(Math.ceil(W / 2), Math.ceil(H / 2));
    const qw = Math.ceil(W / 4), qh = Math.ceil(H / 4), ew = Math.ceil(W / 8), eh = Math.ceil(H / 8);
    this.q = [this.target(qw, qh), this.target(qw, qh)];
    this.e = [this.target(ew, eh), this.target(ew, eh)];
  }

  private program(fs: string) {
    const gl = this.gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader error");
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, "p");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link error");
    const u: Record<string, WebGLUniformLocation | null> = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i)!;
      const name = info.name.replace(/\[0\]$/, "");
      u[name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }

  private texture(w: number, h: number, filter: number): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private target(w: number, h: number): Target {
    const gl = this.gl;
    const tex = this.texture(w, h, gl.LINEAR);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fb, w, h };
  }

  private pass(name: string, out: Target | null, tex: Record<string, WebGLTexture>, set?: (u: Record<string, WebGLUniformLocation | null>) => void): void {
    const gl = this.gl, { p, u } = this.progs[name];
    gl.useProgram(p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.fb : null);
    gl.viewport(0, 0, out ? out.w : this.canvas.width, out ? out.h : this.canvas.height);
    let unit = 0;
    for (const [k, t] of Object.entries(tex)) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.uniform1i(u[k], unit++);
    }
    set?.(u);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  render(color: Uint8Array, emit: Uint8Array, lamps: LampDef[], look: Look): void {
    const gl = this.gl, { W, H } = this;
    gl.bindTexture(gl.TEXTURE_2D, this.colTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, color);
    gl.bindTexture(gl.TEXTURE_2D, this.eoTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, emit);

    const lampPos = new Float32Array(MAX_LAMPS * 4), lampCol = new Float32Array(MAX_LAMPS * 3);
    lamps.slice(0, MAX_LAMPS).forEach((l, i) => {
      lampPos.set([l.x + 0.5, l.y + 0.5, l.radius, 1.6 * look.lampK], i * 4);
      lampCol.set(l.color, i * 3);
    });
    this.pass("LIGHT", this.light, { uEO: this.eoTex }, (u) => {
      gl.uniform2f(u.uWorld, W, H);
      gl.uniform3fv(u.uAmb, look.ambient);
      gl.uniform3fv(u.uSky, look.sky);
      gl.uniform1i(u.uN, Math.min(lamps.length, MAX_LAMPS));
      gl.uniform4fv(u.uLamp, lampPos);
      gl.uniform3fv(u.uLampC, lampCol);
    });
    const [q0, q1] = this.q, [e0, e1] = this.e;
    this.pass("DOWN4", q0, { uEO: this.eoTex, uCol: this.colTex }, (u) => gl.uniform2f(u.uTexel, 1 / W, 1 / H));
    this.pass("BLUR", q1, { uSrc: q0.tex }, (u) => gl.uniform2f(u.uDir, 1 / q0.w, 0));
    this.pass("BLUR", q0, { uSrc: q1.tex }, (u) => gl.uniform2f(u.uDir, 0, 1 / q0.h));
    this.pass("DOWN2", e0, { uSrc: q0.tex }, (u) => gl.uniform2f(u.uTexel, 1 / q0.w, 1 / q0.h));
    this.pass("BLUR", e1, { uSrc: e0.tex }, (u) => gl.uniform2f(u.uDir, 1 / e0.w, 0));
    this.pass("BLUR", e0, { uSrc: e1.tex }, (u) => gl.uniform2f(u.uDir, 0, 1 / e0.h));
    this.pass("COMPOSITE", null, { uCol: this.colTex, uEO: this.eoTex, uL: this.light.tex, uB1: q0.tex, uB2: e0.tex }, (u) => {
      gl.uniform2f(u.uWorld, W, H);
      gl.uniform1f(u.uGlow, look.glow);
      gl.uniform1f(u.uBloom, look.bloom);
      gl.uniform1f(u.uDepth, look.depth);
      gl.uniform1f(u.uExp, look.exposure);
      gl.uniform3fv(u.uTint, look.tint);
      gl.uniform3fv(u.uSkyTint, look.skyTint);
    });
  }
}
