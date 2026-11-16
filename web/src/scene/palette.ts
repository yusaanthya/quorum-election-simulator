/** Muted, low-saturation palette for the diorama. CSS colors live in style.css. */
export const palette = {
  // Each member is cream with its own pastel accent on the ears and bow.
  body: "#fff7f2",
  members: ["#f6b9cc", "#cdb9f0", "#b3dcf2", "#f7dc94", "#b8e4cc", "#f7c4ab", "#e4b8ea", "#a9dbe3", "#f2bdd8"],
  sleepy: "#e2dde8",
  ink: "#2f2a30",
  blush: "#e79aa6",

  crown: "#ecd08c",
  lamp: "#ffe7bf",

  timerFull: "#6fe0a0",
  timerLow: "#ff6b4a",
  timerTrack: "#ffffff",
  candidateGlow: "#f3dfa6",

  envelope: "#f6efe2",
  seal: "#d98e98",
  voteYes: "#e39aa7",
  voteNo: "#bdb7c6",
  heartbeat: "#9ccfc0",
  heartbeatReply: "#c6e4da",
  sparkle: "#f2d69a",
} as const;
