---
item: google-fonts-nonblocking
result: done
---
## Summary

`web/index.html` now loads the Noto Sans TC and Noto Serif TC stylesheet with
`<link rel="preload" as="style" ... onload="this.onload=null;this.rel='stylesheet'" />`
followed by a `<noscript>` stylesheet link. The URL is unchanged, so it keeps
`display=swap` and the same families and weights. The two `preconnect` links,
the title, meta tags, favicon and module script are unchanged. Before starting,
the run re-checked that no Content-Security-Policy exists: there is no CSP
`<meta>` in `web/*.html`, no `web/public/` and no `_headers` file.

## Tests run

- Full check of `docs/night-runner.md` section 4.1.
- Playwright against `web/dist-pages` from `npm run build:pages`, served by a
  local static server, with real Google Fonts and with a `page.route` that
  fulfils the css2 request after 2 s:
  - Before (main): the css2 resource reports `renderBlockingStatus`
    `blocking`. First contentful paint was 936 ms (real) and 2520 ms (delayed),
    and DOMContentLoaded was 697 ms and 2299 ms.
  - After: `non-blocking`. First contentful paint was 72 ms and 40 ms, and
    DOMContentLoaded was 462 ms and 295 ms. Once the CSS loads, the link's rel
    is `stylesheet`, `getComputedStyle(document.body).fontFamily` starts with
    `"Noto Sans TC"`, and `document.fonts` holds Noto Sans TC.

## Questions
