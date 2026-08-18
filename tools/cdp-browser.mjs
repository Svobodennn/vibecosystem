// General CDP browser driver — attach to an already-running Chrome and drive it,
// so pages inherit that Chrome's real network path (system/WPAD proxy, VPN) and
// logged-in/cleared sessions. Use this when fresh Playwright or curl can't reach
// a site (proxy-gated or Cloudflare-cleared-session-only) but the user's own
// Chrome can. NOT site-specific.
//
// One-time: launch Chrome with a dedicated profile + debug port (Chrome 136+
// blocks the flag on the default profile):
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//     --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-cdp" &
// then open the target site once (log in / clear any challenge). Profile persists.
//
// Actions:
//   node cdp-browser.mjs pages
//   node cdp-browser.mjs goto <url> [--match <substr>] [--new]
//   node cdp-browser.mjs eval '<js body; use return>' [--match <substr>] [--url <goto-first>]
//   node cdp-browser.mjs text [--match <substr>] [--url <goto-first>]
//   node cdp-browser.mjs screenshot <outPath> [--match <substr>] [--url <goto-first>] [--full]
// Options: --cdp <endpoint=http://127.0.0.1:9222>  --match <url substring>  --url <navigate first>
// eval example (runs in page context, inherits proxy + session):
//   node cdp-browser.mjs eval 'const r=await fetch("/api/x",{headers:{"X-Tenant":"pornify"}});return {s:r.status}'

const PW = [
  "$HOME/development/rus-ruleti/node_modules/playwright/index.js",
  "/opt/homebrew/lib/node_modules/playwright/index.js",
  "playwright",
];
let chromium = null;
for (const p of PW) { try { const m = await import(p); chromium = m.chromium ?? m.default?.chromium; if (chromium) break; } catch {} }
if (!chromium) { console.error("❌ Playwright module not found"); process.exit(1); }

const a = process.argv.slice(2);
const action = a[0];
const flag = (k, d) => { const i = a.indexOf("--" + k); return i >= 0 ? a[i + 1] : d; };
const has = (k) => a.includes("--" + k);
const CDP = flag("cdp", "http://127.0.0.1:9222");
const MATCH = flag("match", null);
const NAV = flag("url", null);

let browser;
try {
  browser = await chromium.connectOverCDP(CDP);
} catch {
  console.error(
    "❌ No Chrome on CDP " + CDP + ". Launch it first (dedicated profile, Chrome 136+):\n" +
    '  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \\\n' +
    '    --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-cdp" &\n' +
    "then open the target site once (log in / clear challenge).",
  );
  process.exit(1);
}

const allPages = browser.contexts().flatMap((c) => c.pages());

if (action === "pages") {
  console.log(JSON.stringify(allPages.map((p) => p.url()), null, 2));
  process.exit(0);
}

const ctx = browser.contexts()[0];
let page;
if (has("new")) {
  page = await (ctx ?? browser).newPage();
} else if (MATCH) {
  page = allPages.find((p) => (p.url() || "").includes(MATCH));
} else {
  page = allPages.find((p) => /^https?:/.test(p.url() || ""));
}
if (!page) {
  console.error("❌ No matching page. Open the site in the debugged Chrome" + (MATCH ? " (looking for URL containing '" + MATCH + "')" : "") + ", or pass --new.");
  process.exit(1);
}

try {
  if (NAV) await page.goto(NAV, { waitUntil: "domcontentloaded", timeout: 45000 });

  if (action === "goto") {
    console.log("at:", page.url());
  } else if (action === "eval") {
    const js = a[1];
    if (!js) { console.error("usage: eval '<js body; use return>'"); process.exit(1); }
    const out = await page.evaluate(`(async () => { ${js} })()`);
    console.log(typeof out === "string" ? out : JSON.stringify(out));
  } else if (action === "text") {
    const t = await page.evaluate("document.body ? document.body.innerText : ''");
    console.log(t.slice(0, 20000));
  } else if (action === "screenshot") {
    const outPath = a[1];
    if (!outPath) { console.error("usage: screenshot <outPath>"); process.exit(1); }
    await page.screenshot({ path: outPath, fullPage: has("full") });
    console.log("saved:", outPath, "(" + page.url() + ")");
  } else {
    console.log("actions: pages | goto <url> | eval '<js>' | text | screenshot <path>");
  }
} finally {
  process.exit(0); // disconnect CDP only — never close the user's Chrome
}
