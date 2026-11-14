import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";

export interface StageOptions {
  ambientOcclusion: boolean;
  /** Builds the scenery and returns its outer radius, used to fit portrait screens. */
  scenery: (scene: THREE.Scene) => number;
  /** Center, middle and edge colors of the background vignette. */
  background: readonly [string, string, string];
  /** Shift the scene right on wide screens to leave room for the HUD (default true). */
  reserveHud?: boolean;
}

/** Renderer, camera, lights and the miniature island the members stand on. */
export class Stage {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly labels: CSS2DRenderer;
  readonly controls: OrbitControls;
  private readonly composer: EffectComposer | null;
  private readonly ao: GTAOPass | null;

  private readonly sceneryRadius: number;
  private readonly reserveHud: boolean;

  constructor(private readonly container: HTMLElement, opts: StageOptions) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.VSMShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = "labels";
    container.appendChild(this.labels.domElement);

    this.scene.background = vignetteTexture(opts.background);
    this.reserveHud = opts.reserveHud ?? true;

    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200);
    this.camera.position.set(11, 11.5, 15.5);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.2, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = false;
    this.controls.minDistance = 12;
    this.controls.maxDistance = 34;
    this.controls.minPolarAngle = 0.45;
    this.controls.maxPolarAngle = 1.2;
    this.controls.update();

    if (opts.ambientOcclusion) {
      const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(this.renderer, target);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.ao = new GTAOPass(this.scene, this.camera, 1, 1);
      this.ao.blendIntensity = 0.85;
      skipOverlaysInAo(this.ao);
      this.ao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.5, scale: 1.1, samples: 16 });
      this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      this.composer.addPass(this.ao);
      this.composer.addPass(new OutputPass());
    } else {
      this.composer = null;
      this.ao = null;
    }

    this.addLights();
    this.sceneryRadius = opts.scenery(this.scene);

    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    const aspect = w / h;
    this.camera.aspect = aspect;

    if (aspect < 0.9) {
      // Portrait: back off until the island fits the width, then sit it below the title card.
      const halfW = Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * aspect);
      const distance = (this.sceneryRadius + 0.6) / Math.tan(halfW);
      const dir = this.camera.position.clone().sub(this.controls.target).normalize();
      this.camera.position.copy(this.controls.target).addScaledVector(dir, distance);
      this.controls.maxDistance = Math.max(34, distance * 1.3);
      this.camera.setViewOffset(w, h + h * 0.12, 0, 0, w, h);
    } else if (w > 900 && this.reserveHud) {
      // Wide: nudge the island right of the title card without moving the orbit center.
      this.camera.setViewOffset(w + Math.min(320, w * 0.2), h, 0, 0, w, h);
    } else {
      this.camera.clearViewOffset();
    }
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.labels.setSize(w, h);
  }

  update() {
    this.controls.update();
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }

  private addLights() {
    this.scene.add(new THREE.HemisphereLight(0xf7f3ff, 0xb9b1c9, 1.5));

    const key = new THREE.DirectionalLight(0xfff2e4, 2.1);
    key.position.set(-7, 13, 9);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.radius = 10;
    key.shadow.blurSamples = 16;
    key.shadow.bias = -0.0004;
    const s = key.shadow.camera;
    s.left = s.bottom = -8;
    s.right = s.top = 8;
    s.near = 1;
    s.far = 40;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xdfe6ff, 0.45);
    fill.position.set(9, 5, -4);
    this.scene.add(fill);
  }
}

function vignetteTexture(colors: readonly [string, string, string]) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  const [center, mid, edge] = colors;
  const g = ctx.createRadialGradient(256, 230, 20, 256, 256, 380);
  g.addColorStop(0, center);
  g.addColorStop(0.55, mid);
  g.addColorStop(1, edge);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * GTAO renders every mesh into its depth and normal buffers, so flat transparent
 * overlays (magic circles, timer rings) would cast occlusion like solid slabs. Hide
 * them during that pass, the way GTAOPass already hides points and lines.
 */
function skipOverlaysInAo(pass: GTAOPass) {
  const p = pass as unknown as { _overrideVisibility(): void; _visibilityCache: THREE.Object3D[] };
  const base = p._overrideVisibility.bind(p);
  p._overrideVisibility = () => {
    base();
    pass.scene.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
      const overlay = o.userData.skipAO || (mat && !Array.isArray(mat) && (mat.transparent || (mat as THREE.MeshBasicMaterial).isMeshBasicMaterial));
      if (overlay && o.visible) {
        o.visible = false;
        p._visibilityCache.push(o);
      }
    });
  };
}
