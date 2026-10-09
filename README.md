# SOOC host pages

One real, Google-readable page per host at https://hosts.soocdirectory.com/<host-name>/.

- `build.mjs` reads SOOC's public, read-only copy of approved reviews (the same data soocdirectory.com shows) and writes plain HTML pages into `dist/`, plus `sitemap.xml` and `robots.txt`.
- GitHub Actions rebuilds and publishes the pages every night, and whenever this repo changes (Actions > Build host pages > Run workflow to do it by hand).
- Proof of attendance is never in this data. Reviews show exactly as written. Hosts can reply but can't edit, hide or reorder reviews.
