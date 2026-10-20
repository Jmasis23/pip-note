# Account steps before activation

No verification token or Analytics measurement ID is active. The commented tokens in index.html are placeholders, not real credentials. Do not activate Analytics by uncommenting placeholder text.

## Google Search Console
Sign in to the chosen business Google account. Add a URL-prefix property for https://pip-note.pages.dev/ (a domain property needs DNS control over pages.dev, which this project does not own). Choose HTML tag verification. Copy only its real google-site-verification value into index.html and activate the tag. Deploy with the owner's approval, then click Verify. Submit https://pip-note.pages.dev/sitemap.xml and inspect the home URL. Verification and indexing are not complete merely because tags exist.

## Bing Webmaster Tools
Sign in to the chosen business identity. Add https://pip-note.pages.dev/ or import the verified Search Console property. If using HTML tag verification, replace the msvalidate.01 placeholder with Bing's real value and activate it before the approved deployment. Verify after deployment and submit the sitemap.

## Google Analytics
Tracking is NOT enabled. The prior landing page claimed "No analytics". This update removes that broad claim but does not grant permission to introduce tracking. Decide whether to activate GA4 and agree on the visitor privacy/consent approach first. With approval, create a GA4 property and Web data stream for https://pip-note.pages.dev/. Obtain its real G-... measurement ID. Use Google's current generated tag, or fill the inactive example below with that ID. Add an accurate website analytics disclosure and any required consent controls BEFORE activation. Verify Realtime/DebugView after the approved deploy. Never label an unverified installation as complete.

Inactive GA4 template (not loaded by the page):
```html
<script async src="https://www.googletagmanager.com/gtag/js?id=REPLACE_WITH_GA4_MEASUREMENT_ID"></script>
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'REPLACE_WITH_GA4_MEASUREMENT_ID');
</script>
```

## Hosting and checks
- Static output: index.html, 404.html, style.css, main.js, robots.txt, sitemap.xml, _headers, img/, fonts/.
- Cloudflare Pages uses top-level 404.html for missing routes. Confirm an invented path returns this page with HTTP 404 after deploy; local Python preview serves 404.html directly but doesn't emulate Pages routing.
- Sitemap lists only the indexable home page. Error pages are noindex and excluded.
- Existing OG 1200x630 image is retained, with the app screenshot replaced to remove obsolete Ask UI.
- Existing app-demo recording is retained; it shows the shake/capture workflow, not current AI suggestions.
- Updated app screenshots were rendered from released v0.2.17 source with local synthetic seed data and no account/network calls. The capture image shows first-line fallback, not a live inference result.
