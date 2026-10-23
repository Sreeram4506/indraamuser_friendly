# SEO changelog

Nothing here is committed or deployed. All edits are in the working tree.

## 1. Rendering and crawlability
- **Hero counters** already carry their final values in the HTML (`24/7`, `2 wks`, `100%`). JS only animates them from 0 for visitors with motion enabled. No change needed.
- **The "Initializing systems" curtain** is a decorative `aria-hidden` overlay. The real page content sits behind it in the HTML. No change needed.
- **Services (6), industries (8) and the four journey paths** were JS-only: `js/app.js` wrote them into tab panels, so only the first tab existed in the raw HTML. I added a static copy of every tab inside a `hidden` block (`.static-content`) on `index.html`, `services.html` and `journey.html`. The text was generated from the arrays in `app.js`, so it matches exactly. The tabs and animations are untouched.
  - Why it matters: Google can index tab content, but only if it is in the HTML.
  - Caveat: `hidden` content is indexed but can be weighted lower than visible content. The stronger long-term fix is the new landing pages (step 5), or turning the tabs into visible accordions.
- Offices, process steps and the FAQ teaser were already static.

## 2. Canonical host and canonicals
- **Canonical host: `https://www.indraam.com`.** The live site is on Vercel, and `indraam.com` already forwards to `www`, but with a temporary **307**.
- `vercel.json`: added a permanent redirect from host `indraam.com` to `https://www.indraam.com/$1`. `netlify.toml`: added the equivalent 301 (Netlify is not the live host).
- Added `<link rel="canonical">` with an absolute URL to every page. The digital-marketing page was moved from the apex host to `www`, including its JSON-LD.
- `robots.txt` and `sitemap.xml` use the `www` host. The sitemap now has `<lastmod>` for every URL and includes the three new service pages and `owneros.html`.
- `/digital-marketing/thank-you/` stays out of the sitemap (it is `noindex` and disallowed in robots).
- The `owneros.html` meta description said "Placeholder copy, replace once specifics are confirmed." It now has a real description. The homepage OwnerOS card now links to the page.

## 3. Titles, descriptions, headings
- New titles (all 24-59 characters) and descriptions. The homepage is 53 characters / 146 characters. Dependent tags (`og:*`, `twitter:*`) were rewritten to match.
- **Homepage:** the small hero badge is now the H1 ("AI assistants, automation, and websites for growing businesses"). The big tagline "We build systems that do the work." is now an H2 with the same look.
- **services.html and about.html:** the small label above the title is now the descriptive H1 ("AI, Automation, Web, and Marketing Services", "About Indraam: a US-based AI and software team"). The old title text is an H2 and looks the same as before.
- Fixed skipped heading levels: `dealeros.html` ("What it does" is now an H2) and `journey.html` (the panel title is now an H2).
- Every page has exactly one H1 and no skipped levels (checked by script).
- The existing section labels on the homepage sit next to real H2 titles, so I did not turn them into extra H2s. Doing so would create two headings per section.

## 4. Structured data
- `index.html`: Organization (logo, description, the four social profiles from the footer, `contactPoint` with `hello@indraam.com`, and Boston, Hyderabad and Guntur as `areaServed`). No street addresses are on the site, so none were invented.
- `faq.html`: FAQPage with the five questions and answers, taken from the page markup.
- `dealeros.html`: SoftwareApplication (name, description from the page, `applicationCategory`).
- The three new service pages each have a small Service block. The digital-marketing page keeps its existing JSON-LD (host updated).

## 5. Content and internal linking
- New pages: `ai-assistants.html`, `websites-and-apps.html`, `seo-services.html`. Each has a unique title, description, canonical, one H1, and links back to `services.html` and the homepage. The copy comes from the service text on the site (the SEO page uses the SEO lists from the digital-marketing page).
- `dealeros.html`: new "Dealership paperwork and document automation" section (`#dealerships`), using only facts already on the page.
- Links added: homepage services cards and a "Read more" row; a "Running a car dealership?" link in the industries section; the footer on every page; the digital-marketing page's SEO card and services overview. Every page is within two clicks of the homepage.

## 6. Images and performance
- New `assets/og-image.png` (1200x630, brand colours, no third-party imagery). `og:image` and `twitter:image` use it, with width, height and alt tags.
- Every `<img>` now has `width`, `height` and `alt`. Images below the fold have `loading="lazy"`. The nav logo is not lazy.
- Compressed: `cardinellelogo.PNG` 562 KB to 121 KB (resized to 540 px; shown at about 44 px tall), plus smaller savings on three other logos. WebP versions of the Cardinelle and At Cozy logos are served through `<picture>` with the PNG as fallback. `autosalesbroadway.png`, `atcozy.PNG` and `logo.png` were already optimal and are unchanged.
- Fonts were loaded only through a CSS `@import`, which delays them. Each page now has a direct Google Fonts `<link>` in the head, so the request starts earlier.
- The footer social `div` got `role="group"` (an HTML validity fix).

## 7. Verification (what was actually run)
- Script check across all 14 pages: one H1, no skipped heading levels, one canonical, valid JSON-LD syntax, no duplicate ids, every internal `href`/`src` and `#anchor` resolves, every image has width, height and alt. Result: 0 issues. I also injected defects to confirm the checker catches them.
- Raw-HTML check: services, industries, offices, process, journey and the hero stats are all present in the file HTML without JavaScript.
- Lighthouse 12 (SEO category, local server): home, services, digital-marketing, ai-assistants, dealeros and faq all scored **100**. The first homepage run scored 92 because of my own "Learn more" link, which was then renamed.
- W3C Nu validator: no new errors. The remaining errors were already in the site: `aria-pressed` on `role="tab"` buttons, an `aria-label` on a `div` in the homepage chat, and SVG `pathLength` on the digital-marketing page.

## Not verified / needs you
- **Server redirect:** I could not test the new `vercel.json` rule locally. Check that `https://indraam.com/` returns a 301 or 308 to `https://www.indraam.com/` after deploy. In the Vercel dashboard, set the `indraam.com` domain to redirect permanently to `www.indraam.com`; today it returns 307.
- **Structured data validators:** I only confirmed the JSON parses and uses valid schema.org types. Run Google's Rich Results Test and the Schema Markup Validator on the live URLs. `SoftwareApplication` may warn about missing `offers` and `operatingSystem`; the site states neither, so I left them out.
- **Contact email:** `hello@indraam.com` appears on the privacy and terms pages but not the homepage. I used it in the Organization `contactPoint`; remove it if you would rather not publish it there.
- **OwnerOS:** the page is only "Coming soon". It is in the sitemap as you asked, but a thin page like this may not rank or index well.
- **Search Console:** submit the new sitemap and inspect the new URLs once deployed.
