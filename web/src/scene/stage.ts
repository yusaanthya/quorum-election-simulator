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

/** Room kept between the scenery and the edge of the screen, in world units. */
const FIT_MARGIN = 0.25;

/** Renderer, camera, lights and the miniature scenery the members stand on. */
export class Stage {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly labels: CSS2DRenderer;
  readonly controls: OrbitControls;
  private readonly composer: EffectComposer;

  private readonly sceneryRadius: number;
  private readonly reserveHud: boolean;
  /** Camera distance of the default view, and the one the current screen shape needs. */
  private readonly homeDistance: number;
  private fitDistance: number;

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
    this.homeDistance = this.fitDistance = this.camera.position.distanceTo(this.controls.target);

    // Always render through the composer, so tone mapping happens in one place (the output
    // pass) and the additive magic circles look the same with or without ambient occlusion.
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (opts.ambientOcclusion) {
      const ao = new GTAOPass(this.scene, this.camera, 1, 1);
      ao.blendIntensity = 0.85;
      skipOverlaysInAo(ao);
      ao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.5, scale: 1.1, samples: 16 });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      this.composer.addPass(ao);
    }
    this.composer.addPass(new OutputPass());

    this.addLights();
    this.sceneryRadius = opts.scenery(this.scene);

    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    this.camera.aspect = w / h;

    // The camera renders a window onto a larger view to move the scenery without moving the
    // orbit center: portrait sits it below the title card, wide screens nudge it right of the card.
    const portrait = w / h < 0.9;
    const fullW = !portrait && w > 900 && this.reserveHud ? w + Math.min(320, w * 0.2) : w;
    const fullH = portrait ? h * 1.12 : h;
    if (fullW !== w || fullH !== h) this.camera.setViewOffset(fullW, fullH, 0, 0, w, h);
    else this.camera.clearViewOffset();

    // On phones the outer base may run off the sides, so the members stay a readable size.
    // Back off until the scenery fits between the orbit center and the nearer side of the
    // screen. Scaling the current distance keeps whatever zoom the viewer has chosen.
    const halfW = (Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * (w - fullW / 2)) / (fullH / 2);
    const fit = Math.max(this.homeDistance, (portrait ? this.sceneryRadius * 0.84 : this.sceneryRadius + FIT_MARGIN) / halfW);
    const offset = this.camera.position.clone().sub(this.controls.target).multiplyScalar(fit / this.fitDistance);
    this.fitDistance = fit;
    this.controls.maxDistance = Math.max(34, fit * 1.3);
    this.camera.position.copy(this.controls.target).add(offset);

    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.labels.setSize(w, h);
  }

  update() {
    this.controls.update();
  }

  render() {
    this.composer.render();
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
