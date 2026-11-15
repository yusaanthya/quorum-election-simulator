import * as THREE from "three";
import { mulberry32 } from "../scenery/random";

/**
 * Ornate magic circles drawn on a canvas once and used as flat textures, so they cost one
 * quad per layer. Lines are drawn in gold and silver and added onto whatever is below them
 * (additive blending), so they read as light rather than paint. Each circle has two layers
 * (outer rune bands, then star and medallions) that turn in opposite directions.
 */
const BIG = 2048;
const SMALL = 1024;

/** Line colors: the main gold or silver, and the finer accent lines. */
export const sigilSchemes = {
  /** Gold star with silver rune bands. */
  dawn: { main: "#ffcf73", accent: "#c8d2ff", ink: "#867a74" },
  /** All gold, for the leader. */
  sun: { main: "#ffcf73", accent: "#ffe7ad", ink: "#a28c74" },
  /** Silver with a lavender tint, for candidates. */
  moon: { main: "#dfe5ff", accent: "#c4b2ff", ink: "#8a84a6" },
} as const;
export type SigilScheme = keyof typeof sigilSchemes;

export interface SigilOptions {
  scheme?: SigilScheme;
  /** Number of points of the main star. */
  points?: number;
  seed?: number;
  /** Skip the rune bands and fine detail, for small circles that would only blur them. */
  simple?: boolean;
  /** Brightness multiplier of the light (default 1.4). */
  glow?: number;
  /**
   * Opacity of a darker copy drawn under the light. Additive light vanishes on pale floors,
   * so circles that sit on them need this to keep their shape (default 0).
   */
  ink?: number;
}

const textures = new Map<string, { rings: THREE.CanvasTexture; stars: THREE.CanvasTexture }>();

function sigilTextures(opts: SigilOptions) {
  const key = JSON.stringify([opts.scheme, opts.points, opts.seed, opts.simple]);
  let t = textures.get(key);
  if (!t) {
    const size = opts.simple ? SMALL : BIG;
    const colors = sigilSchemes[opts.scheme ?? "dawn"];
    t = {
      rings: texture(size, (ctx) => drawRings(ctx, colors, opts)),
      stars: texture(size, (ctx) => drawStars(ctx, colors, opts)),
    };
    textures.set(key, t);
  }
  return t;
}

/** A flat magic circle of the given radius lying on the floor. Call spin(t) to animate it. */
export class Sigil extends THREE.Group {
  private readonly discs: THREE.Object3D[] = [];
  readonly materials: THREE.MeshBasicMaterial[] = [];
  private readonly inkMaterials: THREE.MeshBasicMaterial[] = [];
  private readonly ink: number;
  private readonly geometry: THREE.PlaneGeometry;

  constructor(radius: number, opts: SigilOptions = {}) {
    super();
    const tex = sigilTextures(opts);
    const scheme = sigilSchemes[opts.scheme ?? "dawn"];
    const glow = new THREE.Color(1, 1, 1).multiplyScalar(opts.glow ?? 1.4);
    this.ink = opts.ink ?? 0;
    const geo = (this.geometry = new THREE.PlaneGeometry(radius * 2, radius * 2));

    [tex.rings, tex.stars].forEach((map, i) => {
      const layer = new THREE.Group();
      layer.rotation.x = -Math.PI / 2;
      layer.position.y = i * 0.002;
      if (this.ink > 0) {
        const inkMat = new THREE.MeshBasicMaterial({ map, color: scheme.ink, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
        this.inkMaterials.push(inkMat);
        const m = new THREE.Mesh(geo, inkMat);
        m.renderOrder = 1;
        layer.add(m);
      }
      const mat = new THREE.MeshBasicMaterial({
        map,
        color: glow,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
      });
      this.materials.push(mat);
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = 2;
      layer.add(m);
      this.discs.push(layer);
      this.add(layer);
    });
  }

  set opacity(v: number) {
    for (const m of this.materials) m.opacity = v;
    for (const m of this.inkMaterials) m.opacity = v * this.ink;
    this.visible = v > 0.005;
  }

  spin(t: number, speed = 1) {
    this.discs[0].rotation.z = t * 0.05 * speed;
    this.discs[1].rotation.z = -t * 0.08 * speed;
  }

  /** Frees this circle's own geometry and materials; the cached textures are shared. */
  dispose() {
    for (const m of [...this.materials, ...this.inkMaterials]) m.dispose();
    this.geometry.dispose();
  }
}

/**
 * Gold dust rising off a magic circle. Points with a soft round sprite, added like the
 * circle's own light.
 */
export class Motes extends THREE.Points {
  private readonly seeds: Float32Array;

  constructor(private readonly radius: number, private readonly height: number, count = 40, color = "#ffd889") {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    super(
      geo,
      new THREE.PointsMaterial({
        map: dotTexture(),
        color: new THREE.Color(color).multiplyScalar(1.6),
        size: 0.09,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    const rand = mulberry32(77);
    this.seeds = Float32Array.from({ length: count * 3 }, () => rand());
    this.update(0);
  }

  update(t: number) {
    const pos = this.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const [a, r, phase] = [this.seeds[i * 3] * Math.PI * 2, Math.sqrt(this.seeds[i * 3 + 1]) * this.radius, this.seeds[i * 3 + 2]];
      const life = (t * 0.12 + phase) % 1; // 0 → 1 as each mote rises
      const sway = Math.sin(t * 0.8 + phase * 20) * 0.08;
      pos.setXYZ(i, Math.cos(a) * r + sway, life * this.height, Math.sin(a) * r);
    }
    pos.needsUpdate = true;
  }
}

let dot: THREE.Texture | null = null;
function dotTexture() {
  if (dot) return dot;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.7)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  dot = new THREE.CanvasTexture(c);
  dot.colorSpace = THREE.SRGBColorSpace;
  return dot;
}

function texture(size: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  // Draw the crisp linework once on its own canvas...
  const lines = document.createElement("canvas");
  lines.width = lines.height = size;
  const lctx = lines.getContext("2d")!;
  // Drawing code works in a 2048-unit space centered on the origin.
  lctx.translate(size / 2, size / 2);
  lctx.scale(size / BIG, size / BIG);
  lctx.lineCap = lctx.lineJoin = "round";
  draw(lctx);

  // ...then lay down a wide and a tight blur of it for the glow, and the crisp lines on top.
  // (A canvas filter applies per draw call, so blurring while drawing hundreds of strokes
  // is very slow.)
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const px = size / BIG;
  for (const [blur, alpha] of [[28, 0.9], [9, 0.8]]) {
    ctx.filter = `blur(${blur * px}px)`;
    ctx.globalAlpha = alpha;
    ctx.drawImage(lines, 0, 0);
  }
  ctx.filter = "none";
  ctx.globalAlpha = 1;
  ctx.drawImage(lines, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

type Colors = (typeof sigilSchemes)[SigilScheme];
type Ctx = CanvasRenderingContext2D;
const R = (BIG / 2) * 0.95; // Outer radius in drawing units
const TAU = Math.PI * 2;

function pen(ctx: Ctx, color: string, width: number) {
  ctx.strokeStyle = ctx.fillStyle = color;
  ctx.lineWidth = width;
}

function ring(ctx: Ctx, r: number, w: number) {
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.stroke();
}

function dottedRing(ctx: Ctx, r: number, n: number, size: number, offset = 0) {
  for (let i = 0; i < n; i++) {
    const a = ((i + offset) / n) * TAU;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r, Math.sin(a) * r, size, 0, TAU);
    ctx.fill();
  }
}

/** A four-point twinkle: long thin rays with a bright middle. */
function sparkle(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const rr = i % 2 === 0 ? r : r * 0.14;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

/** Clear a disc so a medallion can sit on top of the lines that run under it. */
function clearDisc(ctx: Ctx, x: number, y: number, r: number) {
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Star polygon {count/step} through points on a circle. */
function starPolygon(ctx: Ctx, count: number, step: number, radius: number, offset = 0) {
  // A star like {6/2} is two separate triangles, so trace each loop on its own.
  const loops = gcd(count, step);
  for (let l = 0; l < loops; l++) {
    ctx.beginPath();
    for (let i = 0; i <= count / loops; i++) {
      const a = ((l + i * step) / count) * TAU - Math.PI / 2 + offset;
      ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
    }
    ctx.stroke();
  }
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function runeBand(ctx: Ctx, rand: () => number, r: number, count: number, size: number) {
  for (let i = 0; i < count; i++) {
    ctx.save();
    ctx.rotate((i / count) * TAU);
    ctx.translate(0, -r);
    glyph(ctx, rand, size);
    ctx.restore();
  }
}

function drawRings(ctx: Ctx, c: Colors, opts: SigilOptions) {
  const rand = mulberry32(opts.seed ?? 3);
  const s = opts.simple ? 1.6 : 1; // Thicker lines when the circle will be small on screen

  pen(ctx, c.main, 10 * s);
  ring(ctx, R, 10 * s);
  pen(ctx, c.accent, 3 * s);
  ring(ctx, R * 0.972, 3 * s);

  if (opts.simple) {
    // Ticks instead of runes.
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * TAU;
      const long = i % 6 === 0;
      ctx.lineWidth = long ? 6 : 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * R * 0.972, Math.sin(a) * R * 0.972);
      ctx.lineTo(Math.cos(a) * R * (long ? 0.87 : 0.92), Math.sin(a) * R * (long ? 0.87 : 0.92));
      ctx.stroke();
    }
    pen(ctx, c.main, 5);
    ring(ctx, R * 0.86, 5);
  } else {
    pen(ctx, c.accent, 4);
    runeBand(ctx, rand, R * 0.925, 60, 24);
    ring(ctx, R * 0.88, 3.5);
    pen(ctx, c.main, 2);
    ring(ctx, R * 0.866, 2);

    // An inner band of smaller runes close to the center.
    pen(ctx, c.accent, 2.5);
    ring(ctx, R * 0.4, 3);
    pen(ctx, c.accent, 3);
    runeBand(ctx, rand, R * 0.365, 30, 15);
    ring(ctx, R * 0.33, 2);
  }

  // Twinkles riding on the outer ring.
  pen(ctx, "#ffffff", 1);
  const twinkles = opts.simple ? 4 : 8;
  for (let i = 0; i < twinkles; i++) {
    const a = ((i + 0.5) / twinkles) * TAU;
    sparkle(ctx, Math.cos(a) * R, Math.sin(a) * R, (i % 2 === 0 ? 46 : 30) * s);
  }
}

function drawStars(ctx: Ctx, c: Colors, opts: SigilOptions) {
  const n = opts.points ?? 6;
  const s = opts.simple ? 1.6 : 1;
  const outer = opts.simple ? R * 0.86 : R * 0.866;

  // The main star touching the outer band, and a smaller one turned half a step.
  pen(ctx, c.main, 5 * s);
  starPolygon(ctx, n, n >= 7 ? 3 : 2, outer);
  pen(ctx, c.accent, 2.5 * s);
  ring(ctx, outer * 0.58, 3 * s);
  starPolygon(ctx, n, n >= 7 ? 3 : 2, outer * 0.58, Math.PI / n);

  // Medallions where the star's points meet the band, each holding a symbol.
  const mr = opts.simple ? R * 0.12 : R * 0.085;
  const mAt = opts.simple ? outer - mr * 0.6 : outer * 0.86;
  const symbols = [sun, crescent, triangle, hourglass, crossCircle, eightStar, diamondEye];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU - Math.PI / 2;
    const x = Math.cos(a) * mAt;
    const y = Math.sin(a) * mAt;
    clearDisc(ctx, x, y, mr * 1.12);
    pen(ctx, c.main, 4.5 * s);
    ctx.beginPath();
    ctx.arc(x, y, mr, 0, TAU);
    ctx.stroke();
    if (!opts.simple) {
      pen(ctx, c.accent, 2);
      ctx.beginPath();
      ctx.arc(x, y, mr * 0.84, 0, TAU);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.PI / 2);
    pen(ctx, c.main, 3.5 * s);
    symbols[(i + (opts.seed ?? 0)) % symbols.length](ctx, mr * 0.58);
    ctx.restore();
  }

  // Compass rose in the center: four long rays, four short, half of each facet filled.
  const long = opts.simple ? R * 0.34 : R * 0.27;
  const short = long * 0.55;
  const waist = long * 0.13;
  clearDisc(ctx, 0, 0, opts.simple ? long * 0.35 : 0);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU - Math.PI / 2;
    const len = i % 2 === 0 ? long : short;
    const tip = [Math.cos(a) * len, Math.sin(a) * len];
    const l = [Math.cos(a - Math.PI / 4) * waist, Math.sin(a - Math.PI / 4) * waist];
    const r = [Math.cos(a + Math.PI / 4) * waist, Math.sin(a + Math.PI / 4) * waist];
    pen(ctx, i % 2 === 0 ? c.main : c.accent, 3 * s);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(l[0], l[1]);
    ctx.lineTo(tip[0], tip[1]);
    ctx.lineTo(r[0], r[1]);
    ctx.closePath();
    ctx.stroke();
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(l[0], l[1]);
    ctx.lineTo(tip[0], tip[1]);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  pen(ctx, c.main, 3 * s);
  ring(ctx, long * 0.2, 3 * s);
  pen(ctx, "#ffffff", 1);
  sparkle(ctx, 0, 0, long * 0.14);

  if (!opts.simple) {
    pen(ctx, c.accent, 1);
    dottedRing(ctx, R * 0.46, 48, 3.5);
    dottedRing(ctx, R * 0.3, 24, 3, 0.5);
  }
}

// Medallion symbols, drawn centered at the origin within radius r.

function sun(ctx: Ctx, r: number) {
  ring(ctx, r * 0.42, ctx.lineWidth);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6);
    ctx.lineTo(Math.cos(a) * r * (i % 2 ? 0.85 : 1), Math.sin(a) * r * (i % 2 ? 0.85 : 1));
    ctx.stroke();
  }
}

function crescent(ctx: Ctx, r: number) {
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.85, Math.PI * 0.3, Math.PI * 1.7);
  ctx.arc(r * 0.38, 0, r * 0.7, Math.PI * 1.62, Math.PI * 0.38, true);
  ctx.closePath();
  ctx.globalAlpha = 0.8;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.stroke();
}

function triangle(ctx: Ctx, r: number) {
  ctx.beginPath();
  for (let i = 0; i <= 3; i++) {
    const a = (i / 3) * TAU - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, r * 0.12, r * 0.18, 0, TAU);
  ctx.fill();
}

function hourglass(ctx: Ctx, r: number) {
  ctx.beginPath();
  ctx.moveTo(-r * 0.6, -r * 0.85);
  ctx.lineTo(r * 0.6, -r * 0.85);
  ctx.lineTo(-r * 0.6, r * 0.85);
  ctx.lineTo(r * 0.6, r * 0.85);
  ctx.closePath();
  ctx.stroke();
}

function crossCircle(ctx: Ctx, r: number) {
  ring(ctx, r * 0.7, ctx.lineWidth);
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(0, r);
  ctx.moveTo(-r, 0);
  ctx.lineTo(r, 0);
  ctx.stroke();
}

function eightStar(ctx: Ctx, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU - Math.PI / 2;
    const rr = i % 2 === 0 ? (i % 4 === 0 ? r : r * 0.62) : r * 0.24;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.stroke();
}

function diamondEye(ctx: Ctx, r: number) {
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.quadraticCurveTo(0, -r * 0.9, r, 0);
  ctx.quadraticCurveTo(0, r * 0.9, -r, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.26, 0, TAU);
  ctx.fill();
}

/** One made-up rune of 2–4 strokes and an optional dot, roughly size units tall. */
function glyph(ctx: Ctx, rand: () => number, size: number) {
  const pt = () => [Math.floor(rand() * 3) - 1, Math.floor(rand() * 3) - 1] as const;
  ctx.beginPath();
  // A spine keeps every rune readable as a letter.
  ctx.moveTo(0, -size);
  ctx.lineTo(0, size);
  const strokes = 1 + Math.floor(rand() * 3);
  for (let s = 0; s < strokes; s++) {
    const [x1, y1] = pt();
    let [x2, y2] = pt();
    if (x1 === x2 && y1 === y2) x2 = -x1 || 1;
    ctx.moveTo(x1 * size * 0.6, y1 * size);
    if (rand() < 0.35) ctx.quadraticCurveTo(x2 * size * 0.9, 0, x2 * size * 0.6, y2 * size);
    else ctx.lineTo(x2 * size * 0.6, (y2 || 1) * size);
  }
  ctx.stroke();
  if (rand() < 0.4) {
    ctx.beginPath();
    ctx.arc((rand() < 0.5 ? -1 : 1) * size * 0.55, -size * 0.2, size * 0.15, 0, TAU);
    ctx.fill();
  }
}
