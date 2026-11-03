import { BlendFunction, Effect, EffectAttribute } from 'postprocessing';
import { Color, Uniform, Vector2 } from 'three';

/**
 * 跃迁 / 故障 后期效果（卷积效果，需要采样 inputBuffer，因此单独占一个 EffectPass；只在使用时启用）。
 *  warp   0..1  径向拖影 + 主题色边缘辉光
 *  glitch 0..1  横向切片错位 + RGB 分离
 */
const FRAG = /* glsl */ `
uniform float warp;
uniform float glitch;
uniform float fxTime;
uniform vec3 tint;
uniform vec2 center;

float fxHash(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 suv = uv;
  if (glitch > 0.001) {
    float band = floor(uv.y * 42.0) + floor(fxTime * 26.0) * 7.0;
    float on = step(1.0 - glitch * 0.7, fxHash(band + 13.0));
    suv.x += (fxHash(band) - 0.5) * 0.08 * glitch * on;
  }
  vec3 col = texture2D(inputBuffer, suv).rgb;

  if (warp > 0.001) {
    vec2 dir = suv - center;
    vec3 acc = vec3(0.0);
    float wsum = 0.0;
    for (int i = 0; i < 24; i++) {
      float t = float(i) / 23.0;
      float s = 1.0 - warp * 0.5 * t;
      float w = 1.0 - 0.75 * t;
      acc += texture2D(inputBuffer, center + dir * s).rgb * w;
      wsum += w;
    }
    col = mix(col, acc / wsum * (1.0 + warp * 0.6), clamp(warp * 1.6, 0.0, 1.0));
    float edge = smoothstep(0.15, 0.85, length(dir) * 1.5);
    col += tint * warp * warp * 0.55 * edge;
  }

  if (glitch > 0.001) {
    vec2 off = vec2(0.007 * glitch, 0.0);
    col.r = mix(col.r, texture2D(inputBuffer, suv + off).r, glitch);
    col.b = mix(col.b, texture2D(inputBuffer, suv - off).b, glitch);
    float line = step(0.955, fxHash(floor(uv.y * 90.0) + floor(fxTime * 24.0)));
    col += vec3(0.2, 0.02, 0.04) * glitch * line;
  }
  outputColor = vec4(col, inputColor.a);
}
`;

export class TransitionFx extends Effect {
  constructor() {
    super('TransitionFx', FRAG, {
      attributes: EffectAttribute.CONVOLUTION,
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map([
        ['warp', new Uniform(0)],
        ['glitch', new Uniform(0)],
        ['fxTime', new Uniform(0)],
        ['tint', new Uniform(new Color('#6ef2ff'))],
        ['center', new Uniform(new Vector2(0.5, 0.5))],
      ]),
    });
  }

  get warp() {
    return this.uniforms.get('warp').value;
  }
  set warp(v) {
    this.uniforms.get('warp').value = v;
  }
  get glitch() {
    return this.uniforms.get('glitch').value;
  }
  set glitch(v) {
    this.uniforms.get('glitch').value = v;
  }
  get active() {
    return this.warp > 0.001 || this.glitch > 0.001;
  }

  update(renderer, inputBuffer, deltaTime) {
    this.uniforms.get('fxTime').value += deltaTime;
  }
}
