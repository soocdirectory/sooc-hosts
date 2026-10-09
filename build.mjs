// SOOC host pages for Google: one real page per host at hosts.soocdirectory.com/<host-name>/.
// Rebuilt every night by GitHub Actions from SOOC's public read copy of approved reviews.
// Proof of attendance never exists in this data. Reviews are shown exactly as written, never edited or hidden.
// Usage: node build.mjs            (reads Supabase)
//        node build.mjs data.json  (reads a saved copy, for testing)
import fs from 'node:fs';
import path from 'node:path';

const SITE = 'https://www.soocdirectory.com';
const BASE = 'https://hosts.soocdirectory.com';
const SB = 'https://zetooinkgosrfphysnqn.supabase.co';
const KEY = 'sb_publishable_sDSTOTMFyrh5C-zVqdjwbQ_oo7zac4d'; // public, read-only
const PHOTOS = SB + '/storage/v1/object/public/review-photos/';
const OUT = path.resolve('dist');


const FIELDS = 'id,host_id,event_name,role,felt_safe,recommend_queer_bipoc,safety_rating,matched_marketing,worth_price,recommend_friend,overall_rating,location,price_usd,international,submitted_at,in_their_words,what_happened,host_advice,host_response,reviewer_name,hosts(name,instagram),review_photos(idx,path)';

async function load() {
  if (process.argv[2]) return JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const res = await fetch(`${SB}/rest/v1/reviews?select=${FIELDS}&order=submitted_at.desc&limit=5000`, { headers: { apikey: KEY } });
  if (!res.ok) throw new Error('Supabase said ' + res.status + ': ' + (await res.text()));
  return res.json();
}

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const avg = (a) => { a = a.filter((x) => typeof x === 'number'); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; };
const pct = (rs, k) => { const n = rs.filter((r) => r[k]); return n.length ? Math.round((100 * n.filter((r) => r[k] === 'Yes').length) / n.length) : null; };
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthYear = (iso) => { const d = new Date(iso); return MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); };
const para = (s) => esc(String(s).trim()).split(/\n{2,}/).map((p) => '<p>' + p.replace(/\n/g, '<br>') + '</p>').join('');
const meaningful = (s) => !!s && s.trim().length > 3 && !/^(no|none|nope|n\/?a|nothing|no incidents?|not applicable)[.!]*$/i.test(s.trim());
const TYPES = [['shoots', /content|creative day|creator day|styled|shoot|editorial|session/i], ['retreats', /retreat|getaway|escape|trip|workshop|class|course|mentor|education|summit|conference|intensive/i]];
const VERDICT = { recommend: 'Would recommend', caution: 'Use caution', not: 'Would not recommend' };

function slugify(name) {
  return String(name).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/^@+/, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'host';
}

function tone(r) {
  const o = r.overall_rating ?? 3;
  if (o <= 2 || r.felt_safe === 'No' || r.recommend_queer_bipoc === 'No') return 'critical';
  if (o >= 4 && r.felt_safe !== 'Somewhat' && r.recommend_queer_bipoc !== 'With caveats') return 'positive';
  return 'mixed';
}

function buildHosts(reviews) {
  const by = new Map();
  for (const r of reviews) by.set(r.host_id, [...(by.get(r.host_id) ?? []), r]);
  const hosts = [...by.entries()].map(([id, rs]) => {
    rs.sort((a, b) => (a.submitted_at < b.submitted_at ? 1 : -1));
    const overall = avg(rs.map((r) => r.overall_rating)) ?? 0;
    const flags = rs.filter((r) => (r.overall_rating ?? 5) <= 2 || r.recommend_queer_bipoc === 'No' || r.felt_safe === 'No').length;
    const lc = {}; rs.forEach((r) => { const l = (r.location || '').trim(); if (l.length > 3) lc[l] = (lc[l] || 0) + 1; });
    const ps = rs.map((r) => r.price_usd).filter((x) => x != null && x > 0).sort((a, b) => a - b);
    const withPh = rs.filter((r) => r.review_photos?.length).sort((a, b) => (b.overall_rating ?? 0) - (a.overall_rating ?? 0) || (a.submitted_at < b.submitted_at ? 1 : -1));
    const ph = withPh[0]?.review_photos.slice().sort((a, b) => a.idx - b.idx)[0];
    const host = rs[0].hosts || {};
    return {
      id, name: host.name || 'Host', ig: (host.instagram || '').replace(/^@/, '').trim(), reviews: rs, n: rs.length, overall,
      safety: avg(rs.map((r) => r.safety_rating)), safe: pct(rs, 'felt_safe'), rec: pct(rs, 'recommend_queer_bipoc'),
      worth: pct(rs, 'worth_price'), matched: pct(rs, 'matched_marketing'), friend: pct(rs, 'recommend_friend'),
      flags, loc: Object.keys(lc).sort((a, b) => lc[b] - lc[a])[0] || '', pmin: ps[0], pmax: ps[ps.length - 1],
      types: TYPES.filter((t) => rs.some((r) => t[1].test(r.event_name || ''))).map((t) => t[0]),
      photo: ph ? PHOTOS + ph.path : null, latest: rs[0].submitted_at,
      verdict: overall >= 4 && !(flags > 0 && overall < 4.3) ? 'recommend' : overall >= 3 ? 'caution' : 'not',
    };
  });
  // Stable, unique addresses: same name always gets the same slug; ties broken by host id order.
  const used = new Map();
  hosts.sort((a, b) => (a.id < b.id ? -1 : 1)).forEach((h) => {
    let s = slugify(h.name); const k = used.get(s) ?? 0; used.set(s, k + 1); if (k) s += '-' + (k + 1); h.slug = s;
  });
  return hosts;
}

const kindLabel = (h) => (h.types.includes('retreats') && !h.types.includes('shoots') ? 'Retreats' : h.types.includes('shoots') && !h.types.includes('retreats') ? 'Styled shoots' : h.types.length ? 'Retreats + styled shoots' : 'Photography events');
const stars = (v) => { let s = ''; for (let i = 1; i <= 5; i++) s += `<svg viewBox="0 0 24 24" aria-hidden="true" fill="${i <= Math.round(v) ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>`; return `<span class="stars">${s}</span>`; };
const film = (name) => { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0; h = Math.abs(h); const P = [['#F6C2D0', '#7A9A7E', '#1F2F23'], ['#F4F0E4', '#F6C2D0', '#334A38'], ['#FFD9E3', '#C98A9E', '#3A1F28'], ['#F6C2D0', '#334A38', '#141414'], ['#E9F0D8', '#5E7F63', '#22332A'], ['#FBE3EA', '#E79AB0', '#2B2324']][h % 6]; return `radial-gradient(70% 60% at ${20 + (h >> 3) % 60}% ${10 + (h >> 5) % 40}%, ${P[0]} 0%, transparent 70%),radial-gradient(80% 70% at ${30 + (h >> 7) % 60}% ${50 + (h >> 9) % 40}%, ${P[1]} 0%, transparent 75%),linear-gradient(${(h >> 11) % 360}deg, ${P[2]}, #141414)`; };

// ---------- page shell ----------
const CSS = fs.readFileSync(new URL('./style.css', import.meta.url), 'utf8');
function shell({ title, desc, canonical, image, jsonld, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="SOOC">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
${image ? `<meta property="og:image" content="${esc(image)}">\n<meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Ballet:opsz@16..72&family=Caveat:wght@700&family=Instrument+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body>
<header class="top"><div class="wrap topin">
  <a class="logo" href="${SITE}/">SOOC</a>
  <nav aria-label="SOOC"><a href="${BASE}/">Every host</a><a href="${SITE}/explore-reviews">Reviews</a><a href="${SITE}/events">Upcoming events</a><a class="btn pink" href="${SITE}/review">Submit a review</a></nav>
</div></header>
<main>${body}</main>
<footer class="foot"><div class="wrap">
  <p class="script">know before you go</p>
  <p class="big">SOOC</p>
  <p class="fine">Reviews on SOOC are the personal experiences and opinions of verified attendees. Every review requires proof of attendance before it goes live. Hosts can reply, but they can't edit, hide, remove or reorder reviews, and nobody can pay to change them. Safety and inclusion ratings reflect the subjective personal experience of the individual reviewer only. They are not a factual determination, investigation finding, or official assessment of any host, business or venue.</p>
  <p class="links"><a href="${SITE}/">soocdirectory.com</a><a href="${SITE}/privacy-policy-1">Privacy policy</a><a href="${SITE}/termsofservice">Terms of service</a></p>
</div></footer>
</body>
</html>
`;
}

// ---------- one host ----------
function hostPage(h) {
  const url = `${BASE}/${h.slug}/`;
  const live = `${SITE}/host?id=${encodeURIComponent(h.id)}`;
  const price = h.pmin == null ? 'Not shared' : money(h.pmin) + (h.pmax > h.pmin ? ' to ' + money(h.pmax) : '');
  const title = `${h.name} reviews: ${kindLabel(h).toLowerCase()} | SOOC`;
  const desc = `${h.n} verified review${h.n === 1 ? '' : 's'} of ${h.name}${h.loc ? ' (' + h.loc + ')' : ''}. ${h.overall.toFixed(1)}/5 overall` +
    (h.safety != null ? `, safety ${h.safety.toFixed(1)}/5` : '') + (h.rec != null ? `, ${h.rec}% recommend for queer + BIPOC photographers` : '') +
    '. Read what attendees, models and vendors said before you book.';
  const bars = [['Felt safe + welcome', h.safe], ['Recommend for queer + BIPOC photographers', h.rec], ['Worth the price', h.worth], ['Matched the marketing', h.matched], ['Would tell a friend to go', h.friend]];
  const reviews = h.reviews.map((r) => {
    const who = (r.reviewer_name || '').trim() || 'Anonymous';
    const tags = [['Felt safe', r.felt_safe], ['Recommends for queer + BIPOC', r.recommend_queer_bipoc], ['Worth the price', r.worth_price]]
      .filter((x) => x[1]).map(([k, v]) => `<span class="tag ${v === 'Yes' ? 'good' : v === 'No' ? 'bad' : 'warn'}">${esc(k)}: ${esc(v)}</span>`).join('');
    const photos = (r.review_photos || []).slice().sort((a, b) => a.idx - b.idx)
      .map((p) => `<img src="${PHOTOS + esc(p.path)}" alt="Photo from ${esc(who)}'s review of ${esc(h.name)}" loading="lazy" width="300" height="375">`).join('');
    return `<article class="rev ${tone(r)}">
  <div class="revtop">${r.overall_rating != null ? stars(r.overall_rating) + `<b>${r.overall_rating.toFixed(1)}</b>` : ''}<span class="muted">${monthYear(r.submitted_at)}</span></div>
  ${r.event_name ? `<h3>${esc(r.event_name)}</h3>` : ''}
  <p class="label">${esc(who)}${r.role ? ' | ' + esc(r.role) : ''}${r.price_usd ? ' | paid ' + money(r.price_usd) : ''}</p>
  <div class="tags">${tags}</div>
  ${r.in_their_words ? `<div class="words">${para(r.in_their_words)}</div>` : ''}
  ${meaningful(r.what_happened) ? `<p class="label sub">What happened</p><div class="words">${para(r.what_happened)}</div>` : ''}
  ${meaningful(r.host_advice) ? `<p class="label sub">Advice for the host</p><div class="words">${para(r.host_advice)}</div>` : ''}
  ${photos ? `<div class="photos">${photos}</div>` : ''}
  ${r.host_response ? `<div class="reply"><p class="label">${esc(h.name)} replied</p>${para(r.host_response)}</div>` : ''}
</article>`;
  }).join('\n');

  const jsonld = {
    '@context': 'https://schema.org', '@type': 'Organization', name: h.name, url,
    ...(h.ig ? { sameAs: [`https://www.instagram.com/${h.ig}/`] } : {}),
    ...(h.photo ? { image: h.photo } : {}),
    aggregateRating: { '@type': 'AggregateRating', ratingValue: h.overall.toFixed(1), bestRating: '5', worstRating: '1', reviewCount: h.n },
    review: h.reviews.filter((r) => r.overall_rating != null && r.in_their_words).slice(0, 10).map((r) => ({
      '@type': 'Review', reviewRating: { '@type': 'Rating', ratingValue: String(r.overall_rating), bestRating: '5', worstRating: '1' },
      author: { '@type': 'Person', name: (r.reviewer_name || '').trim() || 'Anonymous' }, datePublished: r.submitted_at.slice(0, 10),
      ...(r.event_name ? { name: r.event_name } : {}), reviewBody: r.in_their_words.trim().slice(0, 4000),
    })),
  };

  const body = `
<section class="mast" style="background-image:${h.photo ? `linear-gradient(rgba(20,20,20,.15),rgba(20,20,20,.75)),url('${esc(h.photo)}')` : film(h.name)}">
  <div class="wrap mastin">
    <p class="script pinkt">hosted by</p>
    <h1 class="display">${esc(h.name)}</h1>
    <p class="meta"><span class="pill ${h.verdict}">${VERDICT[h.verdict]}</span><span>${esc(kindLabel(h))}${h.loc ? ' | ' + esc(h.loc) : ''}</span>${h.ig ? `<a href="https://www.instagram.com/${encodeURIComponent(h.ig)}/" rel="nofollow noopener">@${esc(h.ig)}</a>` : ''}</p>
  </div>
</section>
<section class="glance"><div class="wrap">
  <div class="stats">
    <div><b>${h.n}</b><span>Verified review${h.n === 1 ? '' : 's'}</span></div>
    <div><b>${h.overall.toFixed(1)}</b><span>Average overall</span></div>
    <div><b>${h.safety != null ? h.safety.toFixed(1) : 'N/A'}</b><span>Average safety</span></div>
    <div><b>${h.rec != null ? h.rec + '%' : 'N/A'}</b><span>Recommend for queer + BIPOC</span></div>
    <div><b class="sm">${price}</b><span>Price paid</span></div>
  </div>
  <p class="btns"><a class="btn pink" href="${live}">Follow + see upcoming events</a><a class="btn line" href="${SITE}/review">Been there? Write a review</a></p>
</div></section>
<section class="sec"><div class="wrap">
  <p class="script">from the people who went</p>
  <h2 class="display">Safety + inclusion</h2>
  <div class="bars">${bars.map(([k, v]) => `<div class="bar"><p><span>${esc(k)}</span><b>${v == null ? 'N/A' : v + '%'}</b></p><div class="track"><div class="fill ${v == null ? '' : v >= 80 ? 'good' : v >= 50 ? 'warn' : 'bad'}" style="width:${v ?? 0}%"></div></div></div>`).join('')}</div>
  <p class="fine">Out of everyone who answered each question. Safety and inclusion answers are never removed.</p>
</div></section>
<section class="sec"><div class="wrap">
  <p class="script">in their words</p>
  <h2 class="display">What people said about ${esc(h.name)}</h2>
  <div class="revs">${reviews}</div>
  <p class="lock"><b>Reviews show exactly as written.</b> Hosts can reply, but they can't edit, hide, remove or reorder reviews, and nobody can pay to change them.</p>
  <p class="btns"><a class="btn ink" href="${live}">Open ${esc(h.name)} on SOOC</a><a class="btn line" href="${BASE}/">Every host on SOOC</a></p>
</div></section>`;
  return shell({ title, desc, canonical: url, image: h.photo, jsonld, body });
}

// ---------- every host, A to Z ----------
function indexPage(hosts, total) {
  const az = hosts.slice().sort((a, b) => a.name.replace(/^@/, '').localeCompare(b.name.replace(/^@/, ''), 'en', { sensitivity: 'base' }));
  const rows = az.map((h) => `<li><a href="${BASE}/${h.slug}/"><span class="nm">${esc(h.name)}</span><span class="sub">${stars(h.overall)} ${h.overall.toFixed(1)} | ${h.n} review${h.n === 1 ? '' : 's'} | ${VERDICT[h.verdict]}${h.loc ? ' | ' + esc(h.loc) : ''}</span></a></li>`).join('\n');
  const body = `
<section class="mast green"><div class="wrap mastin">
  <p class="script pinkt">hosted by</p>
  <h1 class="display">Every host on SOOC</h1>
  <p class="intro">Photography retreats, styled shoots, workshops and content days, reviewed by the photographers, models and vendors who were there. ${hosts.length} hosts, ${total} verified reviews, zero sponsored listings.</p>
</div></section>
<section class="sec"><div class="wrap">
  <ul class="az">${rows}</ul>
  <p class="btns"><a class="btn ink" href="${SITE}/hostdirect">Search + filter hosts</a><a class="btn line" href="${SITE}/review">Submit a review</a></p>
</div></section>`;
  return shell({
    title: 'Photography retreat + styled shoot host reviews, A to Z | SOOC',
    desc: `Honest, verified reviews of ${hosts.length} photography retreat and styled shoot hosts: safety ratings, queer + BIPOC inclusion, price paid and whether it matched the marketing.`,
    canonical: BASE + '/', jsonld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Every host on SOOC', url: BASE + '/' }, body,
  });
}

// ---------- go ----------
const reviews = await load();
const hosts = buildHosts(reviews);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const h of hosts) {
  fs.mkdirSync(path.join(OUT, h.slug), { recursive: true });
  fs.writeFileSync(path.join(OUT, h.slug, 'index.html'), hostPage(h));
}
fs.writeFileSync(path.join(OUT, 'index.html'), indexPage(hosts, reviews.length));
fs.writeFileSync(path.join(OUT, '404.html'), shell({ title: 'Page not found | SOOC', desc: 'That host page moved or never existed.', canonical: BASE + '/', body: `<section class="sec"><div class="wrap"><p class="script">hmm...</p><h1 class="display">Not found</h1><p class="btns"><a class="btn ink" href="${BASE}/">Every host on SOOC</a></p></div></section>` }));
const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${BASE}/</loc><lastmod>${today}</lastmod></url>\n` +
  hosts.map((h) => `<url><loc>${BASE}/${h.slug}/</loc><lastmod>${h.latest.slice(0, 10)}</lastmod></url>`).join('\n') + '\n</urlset>\n');
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${BASE}/sitemap.xml\n`);
fs.writeFileSync(path.join(OUT, 'CNAME'), 'hosts.soocdirectory.com\n');
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
// A small map of host id -> page address, so soocdirectory.com can link to these pages later.
fs.writeFileSync(path.join(OUT, 'hosts.json'), JSON.stringify(Object.fromEntries(hosts.map((h) => [h.id, h.slug]))));
console.log(`built ${hosts.length} host pages from ${reviews.length} reviews`);

