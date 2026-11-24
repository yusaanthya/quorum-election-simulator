---
id: google-fonts-nonblocking
status: ready
created: 2026-11-25T00:15:00+08:00
dependsOn: []
merge: owner
---
## Goal

`web/index.html` line 11 loads the Noto Sans TC and Noto Serif TC CSS from
`fonts.googleapis.com` with a plain `<link rel="stylesheet">`. A stylesheet in
`<head>` blocks first render until it arrives, measured at about 0.4 to 0.5 s,
even though the URL already has `display=swap` and the page would render in
the fallback fonts of `--sans` and `--serif` (`web/src/style.css`) meanwhile.
Load it without blocking render and keep `display=swap`.

`web/index.html` is in `hold_paths` of `.agent-line/manifest.json`. That key
is defined only there: a pull request that changes a held path is not
auto-merged, so the owner merges it. This item is `merge: owner` for that
reason: the run may change `web/index.html` and opens the pull request, but
never merges it.

No Content-Security-Policy exists in the repository: there is no CSP `<meta>`
in `web/*.html` and no headers file (`web/public/` does not exist). Re-check
this before starting. If a policy has been added since, use an approach it
allows instead of an inline `onload`.

## Acceptance criteria

- The two `preconnect` links stay. The font CSS link no longer blocks first
  render, with the same URL. Use the standard pattern:
  `<link rel="preload" as="style" href="..." onload="this.onload=null;this.rel='stylesheet'" />`
  followed by `<noscript><link rel="stylesheet" href="..." /></noscript>`.
- The URL still contains `display=swap` and the same families and weights
  (`Noto+Sans+TC:wght@400;500;700` and `Noto+Serif+TC:wght@600`).
- Verified with Playwright against a built page (`npm run build:pages`, then a
  static server of `web/dist`; or `npx vite --mode wasm`; allow 90 s
  timeouts): the font stylesheet is not render-blocking (for example the
  `fonts.googleapis.com/css2` entry of
  `performance.getEntriesByType('resource')` reports `renderBlockingStatus` of
  `non-blocking`, or `DOMContentLoaded` no longer waits for it), and once it
  has loaded `getComputedStyle(document.body).fontFamily` still starts with
  `"Noto Sans TC"` and `document.fonts` holds Noto Sans TC. If the sandbox
  cannot reach Google Fonts, test with a `page.route` that fulfils the request
  after a 2 s delay and say so in the pull request body.
- The rest of the page is unchanged: title, meta tags, favicon and the module
  script.
- The full check of `docs/night-runner.md` section 4.1 passes.

## Out of scope

- Self-hosting or subsetting the fonts, or changing families and weights.
- `web/concepts.html`.
- Any file other than `web/index.html`, unless a CSP found above needs it.
- Judging the swap from fallback text to Noto. List under `## Unresolved` that
  the owner should load the page on a throttled connection and confirm the swap
  looks acceptable.
