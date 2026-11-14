/** Muted, low-saturation palette for the diorama. CSS colors live in style.css. */
export const palette = {
  background: ["#ece8f2", "#d6d0e1", "#bdb6cc"], // center, mid, edge of the vignette

  // Each member is cream with its own pastel accent on the ears and bow.
  body: "#fff7f2",
  members: ["#f6b9cc", "#cdb9f0", "#b3dcf2", "#f7dc94", "#b8e4cc", "#f7c4ab", "#e4b8ea", "#a9dbe3", "#f2bdd8"],
  sleepy: "#e2dde8",
  ink: "#2f2a30",
  blush: "#e79aa6",

  base: "#a9c0d6",
  baseTop: "#bcd0e2",
  wood: ["#dcc0a0", "#d3b391", "#e2c8aa"],
  woodEdge: "#bf9c7a",
  rug: "#e7e0ee",
  rugBorder: "#cfc4df",
  grass: ["#a7c79f", "#93b98c", "#b6d1a9"],
  stone: "#e9ebe6",

  crown: "#ecd08c",
  lamp: "#ffe7bf",

  timerFull: "#9cc7a8",
  timerLow: "#e0a08c",
  timerTrack: "#ffffff",
  candidateGlow: "#f3dfa6",
  candidateSigil: "#b9a6ea",
  leaderSigil: "#e2c27e",

  envelope: "#f6efe2",
  seal: "#d98e98",
  voteYes: "#e39aa7",
  voteNo: "#bdb7c6",
  heartbeat: "#9ccfc0",
  heartbeatReply: "#c6e4da",
  sparkle: "#f2d69a",
} as const;
