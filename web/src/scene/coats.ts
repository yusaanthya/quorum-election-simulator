// The cats' coat table, the coat chosen for a member, and the fur shell-count rule.
// Kept pure (no imports, no window or document, erasable TypeScript only) because
// `node --test scripts/*.test.mjs` loads it through Node's type stripping before `npm ci`.

export const PATTERNS = ["solid", "patches", "points", "bicolour"] as const;
export type Pattern = (typeof PATTERNS)[number];

/**
 * A coat. Colours are sRGB hex; whisker colour is per coat so white whiskers never sit on white
 * fur. rootDarkness is the colour multiplier at the fur roots (1 = no darkening), baldTint the
 * multiplier on the bare skin around the eyes and whiskers, tipRim the rim glow on the tips,
 * scatter a soft fill that keeps light fur from going grey in its shadows. roomRim is the
 * strength of the fresnel edge light that keeps the cat readable in a dim room: dark coats need
 * more, and white fur would blow out.
 */
export interface Coat {
  name: string;
  pattern: Pattern;
  col0: string;
  col1: string;
  col2: string;
  eyeL: string;
  eyeR: string;
  whisker: string;
  furLength: number;
  density: number;
  rootDarkness: number;
  baldTint: number;
  tipRim: number;
  scatter: number;
  roomRim: number;
}

// The owner's cast, member 0 first.
export const COATS: readonly Coat[] = [
  { name: "Bombay · coal ball", pattern: "solid", col0: "#3f3d5c", col1: "#4c4b6d", col2: "#3f3d5c", eyeL: "#f3b831", eyeR: "#f3b831", whisker: "#ebebef", furLength: 0.071, density: 135, rootDarkness: 0.42, baldTint: 0.8, tipRim: 0.8, scatter: 0, roomRim: 1.4 },
  { name: "Odd-eyed white (Turkish Angora)", pattern: "solid", col0: "#f7f5f2", col1: "#f6e9e9", col2: "#f7f5f2", eyeL: "#f0a42c", eyeR: "#5fb6f0", whisker: "#aaa6ae", furLength: 0.082, density: 140, rootDarkness: 0.9, baldTint: 0.97, tipRim: 0.25, scatter: 0.3, roomRim: 0.3 },
  { name: "Calico", pattern: "patches", col0: "#f4efe8", col1: "#e0873a", col2: "#2e2a30", eyeL: "#6fbf5a", eyeR: "#6fbf5a", whisker: "#7d7880", furLength: 0.065, density: 140, rootDarkness: 0.75, baldTint: 0.95, tipRim: 0.4, scatter: 0.12, roomRim: 0.55 },
  { name: "Ragdoll colour-point", pattern: "points", col0: "#f1e6d2", col1: "#5a4036", col2: "#f1e6d2", eyeL: "#4d9be3", eyeR: "#4d9be3", whisker: "#ffffff", furLength: 0.095, density: 120, rootDarkness: 0.65, baldTint: 0.9, tipRim: 0.5, scatter: 0.08, roomRim: 0.5 },
  { name: "British Shorthair blue bicolour", pattern: "bicolour", col0: "#7d8696", col1: "#f2efea", col2: "#7d8696", eyeL: "#e58a24", eyeR: "#e58a24", whisker: "#86828c", furLength: 0.04, density: 200, rootDarkness: 0.7, baldTint: 0.95, tipRim: 0.5, scatter: 0.1, roomRim: 0.8 },
];

/** Member `id` wears coat `id % 5`; repeats past the cast raise the pattern seed by 100. */
export function coatFor(id: number): { coat: Coat; seed: number } {
  const i = id % COATS.length;
  return { coat: COATS[i], seed: i + 1 + 100 * Math.floor(id / COATS.length) };
}

/** Viewports narrower than this (CSS px) count as small screens. */
export const SMALL_SCREEN_WIDTH = 640;

/**
 * Fur shells for each cat. A numeric `?shells` value (non-empty after trimming, finite) wins,
 * clamped to 1-64 and rounded. Otherwise the shell budget S (22 on a desktop, 10 on a small
 * screen) is shared across the members: clamp(floor(5 * S / members), 6, 22).
 */
export function shellCount(members: number, viewportWidth: number, rawShells: string | null): number {
  if (rawShells !== null && rawShells.trim() !== "") {
    const n = Number(rawShells);
    if (Number.isFinite(n)) return Math.round(clamp(n, 1, 64));
  }
  const budget = viewportWidth >= SMALL_SCREEN_WIDTH ? 22 : 10;
  return clamp(Math.floor((5 * budget) / members), 6, 22);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
