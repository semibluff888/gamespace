import { BackSide, Color, CubeCamera, HalfFloatType, LinearFilter, Mesh, Scene, ShaderMaterial, SphereGeometry, UnsignedByteType, Vector3, WebGLCubeRenderTarget } from 'three';
import { NOISE } from './worlds/common.js';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uC;
uniform vec3 uBandN;
varying vec3 vDir;
${NOISE}
void main() {
  vec3 d = normalize(vDir);
  float lat = dot(d, uBandN);
  float band = exp(-lat * lat * 7.0);
  float n1 = fbm(d * 1.8 + 3.0);
  float n2 = fbm(d * 3.6 + n1 * 1.6);
  float n3 = fbm(d * 7.5 + n2);
  float clouds = smoothstep(0.0, 0.95, n2 * 0.55 + band * 0.75 + n3 * 0.15);
  vec3 col = mix(uA, uB, smoothstep(-0.3, 0.6, n1));
  col = mix(col, uC, smoothstep(0.2, 0.8, n3) * 0.55);
  vec3 outc = col * clouds * 0.34;
  float lanes = smoothstep(0.1, 0.5, fbm(d * 5.0 + 11.0));
  outc *= 1.0 - lanes * band * 0.65;
  outc += vec3(0.85, 0.9, 1.0) * pow(band, 6.0) * 0.012 * (0.5 + n2);
  outc += vec3(0.002, 0.003, 0.008);
  gl_FragColor = vec4(outc, 1.0);
}
`;

/** 程序化星云：启动时烘焙进立方体贴图作为场景背景，之后每帧零开销 */
export async function bakeNebula(renderer, quality, floatOk = true) {
  const size = quality === 'low' ? 512 : 1024;
  const rt = new WebGLCubeRenderTarget(size, { type: floatOk ? HalfFloatType : UnsignedByteType, generateMipmaps: false, minFilter: LinearFilter, magFilter: LinearFilter });
  const cam = new CubeCamera(0.1, 100, rt);
  const scene = new Scene();
  const mesh = new Mesh(
    new SphereGeometry(10, 96, 48),
    new ShaderMaterial({
      uniforms: {
        uA: { value: new Color('#1f2a7a') },
        uB: { value: new Color('#6a1a63') },
        uC: { value: new Color('#0c5a6b') },
        uBandN: { value: new Vector3(0.25, 1, 0.18).normalize() },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: BackSide,
      depthWrite: false,
      defines: { FBM_OCTAVES: quality === 'low' ? 4 : 6 },
    }),
  );
  scene.add(mesh);
  // 先异步编译（KHR_parallel_shader_compile），避免同步编译阻塞主线程
  try {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    const ready = renderer.compileAsync(scene, cam.children[0]);
    renderer.setRenderTarget(prev);
    await ready;
  } catch {
    /* ignore */
  }
  cam.update(renderer, scene);
  mesh.geometry.dispose();
  mesh.material.dispose();
  return rt;
}
