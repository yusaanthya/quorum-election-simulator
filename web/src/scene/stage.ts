import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { palette } from "./palette";

export const PLATFORM_RADIUS = 7;

/** Renderer, camera, lights and the candy platform the beans stand on. */
export class Stage {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly labels: CSS2DRenderer;
  readonly controls: OrbitControls;
  private readonly clouds: THREE.Group[] = [];

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    container.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = "labels";
    container.appendChild(this.labels.domElement);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    this.camera.position.set(0, 8.5, 15);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.9, 0);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 28;
    this.controls.minPolarAngle = 0.35;
    this.controls.maxPolarAngle = 1.35;
    this.controls.update();

    this.addLights();
    this.addPlatform();
    this.addClouds();

    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.camera.fov = 40;

    if (aspect < 0.9) {
      // Portrait: back the camera off until the platform fits the width, and push the
      // scene below the title card.
      const halfH = Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * aspect);
      const distance = (PLATFORM_RADIUS + 0.5) / Math.tan(halfH);
      const dir = this.camera.position.clone().sub(this.controls.target).normalize();
      this.camera.position.copy(this.controls.target).addScaledVector(dir, distance);
      this.controls.maxDistance = Math.max(28, distance * 1.3);
      this.camera.setViewOffset(w, h + h * 0.14, 0, 0, w, h);
    } else if (w > 900) {
      // Wide: nudge the platform right of the title card without moving the orbit center.
      this.camera.setViewOffset(w + Math.min(360, w * 0.22), h, 0, 0, w, h);
    } else {
      this.camera.clearViewOffset();
    }
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
  }

  update(dt: number, t: number) {
    this.controls.update();
    this.clouds.forEach((c, i) => {
      c.position.y = c.userData.baseY + Math.sin(t * 0.5 + i) * 0.25;
      c.rotation.y += dt * 0.03 * (i % 2 ? 1 : -1);
    });
  }

  render() {
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }

  private addLights() {
    this.scene.add(new THREE.HemisphereLight(0xfff0f7, 0xcdb8ff, 1.6));

    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.position.set(5, 12, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 6;
    sun.shadow.bias = -0.0005;
    const s = sun.shadow.camera;
    s.left = s.bottom = -10;
    s.right = s.top = 10;
    this.scene.add(sun);

    const rim = new THREE.DirectionalLight(0xffc6e5, 0.8);
    rim.position.set(-6, 4, -8);
    this.scene.add(rim);
  }

  private addPlatform() {
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(PLATFORM_RADIUS, PLATFORM_RADIUS * 1.03, 0.7, 96),
      new THREE.MeshPhysicalMaterial({ color: palette.platformSide, roughness: 0.55, clearcoat: 0.4 }),
    );
    top.position.y = -0.35;
    top.receiveShadow = true;
    this.scene.add(top);

    // A lollipop swirl painted on the top face.
    const swirl = new THREE.Mesh(
      new THREE.CircleGeometry(PLATFORM_RADIUS - 0.25, 96),
      new THREE.MeshStandardMaterial({ map: swirlTexture(), roughness: 0.7 }),
    );
    swirl.rotation.x = -Math.PI / 2;
    swirl.position.y = 0.005;
    swirl.receiveShadow = true;
    this.scene.add(swirl);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(PLATFORM_RADIUS - 0.05, 0.22, 16, 120),
      new THREE.MeshPhysicalMaterial({ color: palette.platformRim, roughness: 0.35, clearcoat: 1 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.castShadow = true;
    this.scene.add(rim);

    // A softer, wider tier underneath so the platform looks like a layered cake.
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(PLATFORM_RADIUS * 0.9, PLATFORM_RADIUS * 0.7, 1.2, 64),
      new THREE.MeshPhysicalMaterial({ color: palette.platformBase, roughness: 0.6 }),
    );
    base.position.y = -1.3;
    this.scene.add(base);
  }

  private addClouds() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.92 });
    const puff = new THREE.SphereGeometry(1, 20, 14);
    const spots: [number, number, number, number][] = [
      [-11, 3.5, -8, 1.1],
      [10, 5, -10, 1.4],
      [-14, 1, 3, 0.9],
      [13, 2, 2, 1],
      [2, 7, -15, 1.6],
      [-5, -2.5, 9, 0.8],
    ];
    for (const [x, y, z, size] of spots) {
      const cloud = new THREE.Group();
      [
        [0, 0, 0, 1],
        [1.1, -0.2, 0.1, 0.75],
        [-1.1, -0.25, 0, 0.7],
        [0.4, 0.5, -0.2, 0.7],
      ].forEach(([px, py, pz, r]) => {
        const p = new THREE.Mesh(puff, mat);
        p.position.set(px, py, pz);
        p.scale.set(r, r * 0.8, r);
        cloud.add(p);
      });
      cloud.position.set(x, y, z);
      cloud.scale.setScalar(size);
      cloud.userData.baseY = y;
      this.clouds.push(cloud);
      this.scene.add(cloud);
    }
  }
}

function swirlTexture() {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = size / 2;
  const wedges = 24;
  for (let i = 0; i < wedges; i++) {
    ctx.beginPath();
    ctx.moveTo(c, c);
    // Curved wedges give the pinwheel twist.
    for (let r = 0; r <= c; r += 8) {
      const a = ((i + r / c * 1.6) / wedges) * Math.PI * 2;
      ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    }
    for (let r = c; r >= 0; r -= 8) {
      const a = ((i + 1 + r / c * 1.6) / wedges) * Math.PI * 2;
      ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = i % 2 ? palette.swirlA : palette.swirlB;
    ctx.fill();
  }
  // Soft center so the beans read clearly against it.
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, "rgba(255,255,255,0.85)");
  g.addColorStop(0.35, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
