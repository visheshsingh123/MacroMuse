# MacroMuse search metadata

The canonical website is `https://macromuse.vercel.app`. Public pages contain
static titles, descriptions, canonical links, Open Graph and Twitter card tags,
and JSON-LD. Search engines can read these without signing in or executing app
JavaScript. The existing Google verification meta tag is preserved.

`public/sitemap.xml` lists the home, about, pricing, download, journal, privacy,
and four article pages. It excludes account, login, feedback, QR, and offline
pages. Those excluded pages use `noindex` in their HTML and response headers.
`public/robots.txt` allows crawling so search engines can read those directives.
These directives do not replace authentication or protect private account data.

Homepage structured data identifies MacroMuse, its official project links and
contact address, the website, and the nutrition app. Free and lifetime Pro
prices match the visible pricing page. Articles retain their actual publication
dates and MacroMuse bylines. No ratings, reviews, medical credentials, or search
result features are invented or guaranteed. Social previews use the existing
nutrition illustration; screenshots and logo assets are unchanged.

When adding a public article, update its static metadata, JSON-LD, visible
byline and dates, the journal index, and sitemap. Keep private pages out of the
sitemap and retain their noindex directives. After editing inline scripts or
JSON-LD, run `npm run security:headers`, `npm run build`, and `npm test`.

After deployment, add or verify the MacroMuse URL-prefix property in Google
Search Console and submit `https://macromuse.vercel.app/sitemap.xml`. Inspect
the home, pricing, download, and article URLs and request indexing where
appropriate. Use Google's Rich Results Test and URL Inspection to check the
deployed pages. Search engines control indexing, snippets, and ranking; these
changes do not automatically update an existing Google listing.
