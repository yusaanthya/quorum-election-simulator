import * as THREE from "three";
import { mulberry32 } from "../scenery/random";

/**
 * Ornate magic circles drawn on a canvas once and used as flat textures, so they cost one
 * quad each. Each circle has two layers (rings and glyphs, then stars) that turn in
 * opposite directions.
 */
const BIG = 2048;
const SMALL = 1024;
const textures = new Map<string, { rings: THREE.CanvasTexture; stars: THREE.CanvasTexture }>();

export interface SigilOptions {
  /** Number of points of the main star. */
  points?: number;
  seed?: number;
  /** Skip the outer glyph band, for small sigils that would only blur it. */
  simple?: boolean;
}

function sigilTextures(opts: SigilOptions) {
  const key = JSON.stringify(opts);
  let t = textures.get(key);
  if (!t) {
    const size = opts.simple ? SMALL : BIG;
    t = { rings: texture(size, (ctx) => drawRings(ctx, opts)), stars: texture(size, (ctx) => drawStars(ctx, opts)) };
    textures.set(key, t);
  }
  return t;
}

/** A flat magic circle of the given radius lying on the floor. Call spin(t) to animate it. */
export class Sigil extends THREE.Group {
  private readonly rings: THREE.Mesh;
  private readonly stars: THREE.Mesh;
  readonly materials: THREE.MeshBasicMaterial[];

  constructor(radius: number, color: THREE.ColorRepresentation, opts: SigilOptions = {}) {
    super();
    const tex = sigilTextures(opts);
    const geo = new THREE.PlaneGeometry(radius * 2, radius * 2);
    const mat = (map: THREE.Texture) =>
      new THREE.MeshBasicMaterial({ map, color, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.materials = [mat(tex.rings), mat(tex.stars)];
    this.rings = new THREE.Mesh(geo, this.materials[0]);
    this.stars = new THREE.Mesh(geo, this.materials[1]);
    for (const m of [this.rings, this.stars]) {
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 1;
      this.add(m);
    }
    this.stars.position.y = 0.002;
  }

  set opacity(v: number) {
    for (const m of this.materials) m.opacity = v;
    this.visible = v > 0.005;
  }

  spin(t: number, speed = 1) {
    this.rings.rotation.z = t * 0.06 * speed;
    this.stars.rotation.z = -t * 0.1 * speed;
  }
}

function texture(size: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  // Draw the crisp linework once on its own canvas...
  const lines = document.createElement("canvas");
  lines.width = lines.height = size;
  const lctx = lines.getContext("2d")!;
  // Drawing code works in a 2048-unit space centered on the origin.
  lctx.translate(size / 2, size / 2);
  lctx.scale(size / BIG, size / BIG);
  lctx.strokeStyle = lctx.fillStyle = "#ffffff";
  lctx.lineCap = lctx.lineJoin = "round";
  draw(lctx);

  // ...then blur that whole image once for the halo and lay the crisp lines on top.
  // (A canvas filter applies per draw call, so blurring while drawing hundreds of
  // strokes is very slow.)
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.filter = `blur(${(10 * size) / BIG}px)`;
  ctx.globalAlpha = 0.55;
  ctx.drawImage(lines, 0, 0);
  ctx.filter = "none";
  ctx.globalAlpha = 1;
  ctx.drawImage(lines, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const R = (BIG / 2) * 0.96; // Outer radius in drawing units

function ring(ctx: CanvasRenderingContext2D, r: number, w: number) {
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
}

function dottedRing(ctx: CanvasRenderingContext2D, r: number, n: number, size: number) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r, Math.sin(a) * r, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRings(ctx: CanvasRenderingContext2D, opts: SigilOptions) {
  const rand = mulberry32(opts.seed ?? 3);
  ring(ctx, R, 10);
  ring(ctx, R * 0.965, 3);

  // Tick marks, longer every tenth.
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * Math.PI * 2;
    const long = i % 10 === 0;
    const r0 = R * 0.965;
    const r1 = R * (long ? 0.915 : 0.94);
    ctx.lineWidth = long ? 5 : 2.5;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.stroke();
  }
  ring(ctx, R * 0.9, 4);

  if (!opts.simple) {
    // A band of invented runes, each built from a few strokes on a 3x3 grid.
    const band = R * 0.82;
    const glyphs = 44;
    for (let i = 0; i < glyphs; i++) {
      const a = (i / glyphs) * Math.PI * 2;
      ctx.save();
      ctx.rotate(a);
      ctx.translate(0, -band);
      glyph(ctx, rand, 30);
      ctx.restore();
    }
    ring(ctx, R * 0.74, 4);
    ring(ctx, R * 0.725, 2);
  }

  // Petal filigree between the rune band and the star.
  const petals = 16;
  const pr = opts.simple ? R * 0.78 : R * 0.64;
  ctx.lineWidth = 3.5;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    const a2 = ((i + 1) / petals) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc((Math.cos(a) + Math.cos(a2)) * pr * 0.5, (Math.sin(a) + Math.sin(a2)) * pr * 0.5, pr * 0.2, a + Math.PI * 0.95, a + Math.PI * 2.05, true);
    ctx.stroke();
  }
  dottedRing(ctx, opts.simple ? R * 0.68 : R * 0.56, 72, 3.5);
}

function drawStars(ctx: CanvasRenderingContext2D, opts: SigilOptions) {
  const n = opts.points ?? 7;
  const r = opts.simple ? R * 0.62 : R * 0.52;
  ring(ctx, r, 5);

  // Main star polygon {n/3} and a hexagram inside it.
  const star = (count: number, step: number, radius: number, width: number, offset = 0) => {
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let i = 0; i <= count; i++) {
      const a = ((i * step) / count) * Math.PI * 2 - Math.PI / 2 + offset;
      const x = Math.cos(a) * radius;
      const y = Math.sin(a) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };
  star(n, n >= 7 ? 3 : 2, r, 4);
  star(6, 2, r * 0.62, 3, Math.PI / 6);
  star(6, 2, r * 0.62, 3, Math.PI / 6 + Math.PI / 6);

  // Little orbs at the star's points.
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.075, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.03, 0, Math.PI * 2);
    ctx.fill();
  }

  ring(ctx, r * 0.36, 4);
  ring(ctx, r * 0.33, 1.5);
  dottedRing(ctx, r * 0.27, 24, 3);

  // Eight-point star in the center.
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r * 0.2 : r * 0.07;
    if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.globalAlpha = 0.85;
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** One made-up rune of 2–4 strokes and an optional dot, roughly size px tall. */
function glyph(ctx: CanvasRenderingContext2D, rand: () => number, size: number) {
  const pt = () => [Math.floor(rand() * 3) - 1, Math.floor(rand() * 3) - 1] as const;
  ctx.lineWidth = 4;
  ctx.beginPath();
  // A spine keeps every rune readable as a letter.
  ctx.moveTo(0, -size);
  ctx.lineTo(0, size);
  const strokes = 1 + Math.floor(rand() * 3);
  for (let s = 0; s < strokes; s++) {
    const [x1, y1] = pt();
    let [x2, y2] = pt();
    if (x1 === x2 && y1 === y2) x2 = -x1 || 1;
    if (rand() < 0.35) {
      ctx.moveTo(x1 * size * 0.6, y1 * size);
      ctx.quadraticCurveTo(x2 * size * 0.9, 0, x2 * size * 0.6, y2 * size);
    } else {
      ctx.moveTo(x1 * size * 0.6, y1 * size);
      ctx.lineTo(x2 * size * 0.6, (y2 || 1) * size);
    }
  }
  ctx.stroke();
  if (rand() < 0.4) {
    ctx.beginPath();
    ctx.arc((rand() < 0.5 ? -1 : 1) * size * 0.55, -size * 0.2, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
