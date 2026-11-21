// Pure game logic: no DOM. Shared by the page and the unit tests.

export const MAX_GUESSES = 6;

// What the map shows before each guess. view = half-width in metres.
//   heights: buildings at their real heights (otherwise a uniform low block model of the footprints; every stage
//            now has them, the flat view is kept for the lab and QA pages)
//   reveal:  how many of the city's own place categories are shown (each city has three, chosen for it,
//            in a fixed order with places of worship last: see tools/build_clues.mjs)
//   hints:   text hints that appear from this guess on
export const STAGES = [
  { view: 400, reveal: 0, heights: true, label: 'Street plan and buildings' },
  { view: 500, reveal: 0, heights: true, label: 'A wider view' },
  { view: 600, reveal: 1, heights: true },
  { view: 700, reveal: 2, heights: true },
  { view: 800, reveal: 3, heights: true, hints: ['streets'] },
  { view: 1000, reveal: 3, heights: true, label: 'Last guess, in the country', hints: ['country', 'founded', 'size'] },
];
export const CLUE_HINTS = ['clue0', 'clue1', 'clue2'];
export const ALL_HINTS = [...CLUE_HINTS, 'streets', 'country', 'founded', 'size'];

// Distance and direction stay hidden for the first guesses; until then each guess gets yes/no checks.
export const DISTANCE_FROM = 4; // 0-based: the 5th guess and later show distance and direction
export const distanceShown = (index, finished) => finished || index >= DISTANCE_FROM;
// Bonus (James, 2026-11-15): an early guess that matches all five checks has used up what they can say, so it
// earns the direction arrow (not the distance).
export const allChecksMatch = (g) => !!g?.checks && !g.correct && Object.values(g.checks).every((c) => c.ok);
// Bonus 2 (James, 2026-11-18): two all-five guesses in a row, and the second one's arrow comes with the distance in km.
export const bonusDistance = (guesses, i) => i > 0 && allChecksMatch(guesses[i]) && allChecksMatch(guesses[i - 1]);

// Yes/no checks of a guess against the answer. facts: { countries: {name: [continent, 'l'|'r', faith, script]}, places: overrides }.
export const CHECKS = [
  { key: 'hemi', label: 'Hemisphere' },
  { key: 'continent', label: 'Continent' },
  { key: 'drive', label: 'Road side' },
  { key: 'faith', label: 'Main faith' },
  { key: 'script', label: 'Script' },
];
export function factsFor(facts, name, country, lat) {
  const c = facts.countries[country] || [null, 'r', 'christian', 'latin'];
  const f = { hemi: lat >= 0 ? 'north' : 'south', continent: c[0], drive: c[1] === 'l' ? 'left' : 'right', faith: c[2], script: c[3] };
  return { ...f, ...(facts.places[name] || {}) };
}
export function compareFacts(facts, answer, place) {
  const a = factsFor(facts, answer.name, answer.country, answer.lat);
  const g = factsFor(facts, place[0], place[1], place[2]);
  const out = {};
  for (const { key } of CHECKS) out[key] = { ok: a[key] === g[key], guess: g[key] };
  return out;
}

// The sun's position (degrees) at a local solar hour on a date, for a latitude.
export function sunAt(lat, date = new Date(), hour = 15) {
  const R = Math.PI / 180;
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const doy = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 86400000);
  const decl = -23.44 * Math.cos(((2 * Math.PI) / 365) * (doy + 10));
  const H = (hour - 12) * 15 * R;
  const sinEl = Math.sin(lat * R) * Math.sin(decl * R) + Math.cos(lat * R) * Math.cos(decl * R) * Math.cos(H);
  const el = Math.asin(sinEl);
  const cosAz = (Math.sin(decl * R) - sinEl * Math.sin(lat * R)) / (Math.cos(el) * Math.cos(lat * R));
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz))) / R;
  if (H > 0) az = 360 - az;
  return { az, el: el / R };
}

export function stageFor(guessCount, finished) {
  return finished ? STAGES[STAGES.length - 1] : STAGES[Math.min(guessCount, STAGES.length - 1)];
}

export function hintsFor(guessCount, finished) {
  if (finished) return ALL_HINTS.slice();
  const stage = STAGES[Math.min(guessCount, STAGES.length - 1)];
  const out = CLUE_HINTS.slice(0, stage.reveal);
  for (let i = 0; i <= Math.min(guessCount, STAGES.length - 1); i++) out.push(...(STAGES[i].hints || []));
  return out;
}

// Last-guess facts: things the model can't show that tell a country's cities apart.
// founded = [year (negative = BC), Wikidata precision: 9 year, 8 about, 7 century, 6 or less rough].
export function foundedText(founded) {
  if (!founded) return null;
  const [y, p] = founded;
  const era = (n) => (n < 0 ? `${-n} BC` : n < 500 ? `AD ${n}` : String(n));
  if (p >= 9) return era(y);
  if (p === 8) return `c. ${era(y)}`;
  if (p === 7) {
    const c = Math.ceil(Math.abs(y) / 100);
    return `${ordinal(c)} century${y < 0 ? ' BC' : ''}`;
  }
  return `c. ${era(y)}`;
}
export function ordinal(n) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
  return n + s;
}
// rank = place by population among the country's cities in the guess list (which lists them biggest first).
export const SIZE_TOP = 20;
export function sizeText(rank) {
  if (!rank) return null;
  if (rank === 1) return 'Largest city in the country';
  if (rank <= SIZE_TOP) return `${ordinal(rank)}-largest city in the country`;
  return `Not among the country's ${SIZE_TOP} largest`;
}

// On the last guess the country is known, so the guess list narrows to that country.
export function countryLock(guessCount, finished, answer) {
  return !finished && guessCount >= MAX_GUESSES - 1 ? answer.country : null;
}

const DAY_MS = 86400000;
function localDayStart(date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

// Puzzle number for a date (1 on the epoch day), using the player's local calendar date.
export function dayNumber(epoch, date = new Date()) {
  const [y, m, d] = epoch.split('-').map(Number);
  return Math.floor((localDayStart(date) - Date.UTC(y, m - 1, d)) / DAY_MS) + 1;
}

export function puzzleId(order, n) {
  const i = (((n - 1) % order.length) + order.length) % order.length;
  return order[i];
}

// The calendar date of puzzle n, for the header.
export function dateOfDay(epoch, n) {
  const [y, m, d] = epoch.split('-').map(Number);
  return new Date(y, m - 1, d + n - 1);
}

// The day to play: today, or an earlier day asked for with ?day=. Future days can't be opened.
// Today is never below 1, so a player whose clock is still on the day before launch gets puzzle 1.
export function chooseDay(requested, today) {
  const t = Math.max(1, today);
  const n = Math.floor(Number(requested));
  return Number.isFinite(n) && n >= 1 && n < t ? n : t;
}

// Cities already shown as earlier dailies, newest first: the only ones practice may use, so practice
// never spoils a future day's city. Empty on day 1.
export function pastPuzzles(order, today) {
  const ids = [];
  for (let n = today - 1; n >= 1 && ids.length < order.length; n--) ids.push(puzzleId(order, n));
  return [...new Set(ids)];
}

export function msUntilTomorrow(date = new Date()) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return next - date;
}

const RAD = Math.PI / 180;
export function distanceKm(a, b) {
  const dLat = (b.lat - a.lat) * RAD, dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Initial bearing from a to b, degrees clockwise from north.
export function bearing(a, b) {
  const y = Math.sin((b.lon - a.lon) * RAD) * Math.cos(b.lat * RAD);
  const x = Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) - Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((b.lon - a.lon) * RAD);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

const ARROWS = ['⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️'];
export function arrowFor(deg) {
  return ARROWS[Math.round(deg / 45) % 8];
}

export function proximity(km) {
  return Math.max(0, Math.round(100 - (km / 20000) * 100));
}

// Kilometres with miles in brackets, e.g. "505 km (314 mi)".
export function formatKm(km) {
  const fmt = (v) => (v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString('en-US'));
  return `${fmt(km)} km (${fmt(km / 1.609344)} mi)`;
}

export const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// places: [name, country, lat, lon, alias?] sorted by importance. Returns up to `limit` matches.
// With `country`, only that country's places match, and an empty query lists them all.
export function searchPlaces(places, query, limit = 8, country = null) {
  const q = norm(query);
  if (country) places = places.filter((p) => p[1] === country);
  if (!q) return country ? places.slice(0, limit) : [];
  const starts = [], words = [], within = [];
  for (const p of places) {
    const name = norm(p[0]);
    const alias = p[4] ? norm(p[4]) : '';
    const full = name + ' ' + norm(p[1]);
    if (name.startsWith(q) || alias.startsWith(q)) starts.push(p);
    else if (name.includes(' ' + q) || (' ' + alias).includes(' ' + q)) words.push(p);
    else if (q.length >= 3 && full.startsWith(q)) within.push(p);
    if (starts.length >= limit) break;
  }
  return starts.concat(words, within).slice(0, limit);
}

export function scoreGuess(answer, place, facts = null) {
  const g = { lat: place[2], lon: place[3] };
  const correct = norm(place[0]) === norm(answer.name) && place[1] === answer.country;
  const km = correct ? 0 : distanceKm(g, answer);
  const out = { name: place[0], country: place[1], km, correct, deg: correct ? 0 : bearing(g, answer) };
  if (facts) out.checks = compareFacts(facts, answer, place);
  return out;
}

// Share line: checks matched (e.g. 3/5) while distance is hidden, then arrow and closeness.
export function shareText({ n, guesses, won, practice }) {
  const score = won ? `${guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
  const title = practice ? 'Streetle (earlier map)' : `Streetle #${n}`;
  const line = guesses.map((g, i) => {
    if (g.correct) return '📍';
    if (i < DISTANCE_FROM && g.checks) return `${Object.values(g.checks).filter((c) => c.ok).length}/${CHECKS.length}${allChecksMatch(g) ? arrowFor(g.deg) : ''}`;
    return `${arrowFor(g.deg)}${proximity(g.km)}%`;
  }).join(' ');
  return `${title} ${score}\n${line}`;
}

// Other names people type for a country (keys normalised, values as in the guess list).
const COUNTRY_ALIASES = {
  usa: 'United States', us: 'United States', america: 'United States', 'united states of america': 'United States',
  uk: 'United Kingdom', britain: 'United Kingdom', 'great britain': 'United Kingdom', england: 'United Kingdom',
  scotland: 'United Kingdom', wales: 'United Kingdom', uae: 'United Arab Emirates', emirates: 'United Arab Emirates',
  turkey: 'Türkiye', holland: 'Netherlands', 'czech republic': 'Czechia', drc: 'DR Congo',
  'democratic republic of the congo': 'DR Congo', 'cote d ivoire': 'Ivory Coast', burma: 'Myanmar', korea: 'South Korea',
  bosnia: 'Bosnia and Herzegovina', 'timor leste': 'East Timor',
};
const countryIndex = new WeakMap();
// The country a query names: an exact name or alias, or the only country whose name starts with it (3+ letters).
export function countryFor(places, query) {
  const q = norm(query);
  if (q.length < 2) return null;
  let names = countryIndex.get(places);
  if (!names) countryIndex.set(places, (names = new Map(places.map((p) => [norm(p[1]), p[1]]))));
  if (names.has(q)) return names.get(q);
  const alias = COUNTRY_ALIASES[q];
  if (alias && names.has(norm(alias))) return alias;
  if (q.length < 3) return null;
  const hits = [...names.keys()].filter((n) => n.startsWith(q));
  return hits.length === 1 ? names.get(hits[0]) : null;
}

// What the guess box suggests: { list, country, from }. Typing a country lists all of its cities,
// biggest first, starting at index `from`, after up to 3 cities whose own name starts with the query
// (so "Mexico" still offers Mexico City first). On the locked last guess, only that country's cities.
export function suggestPlaces(places, query, lock = null, limit = 8) {
  if (lock) return { list: searchPlaces(places, query, 1000, lock), country: null, from: -1 };
  const named = searchPlaces(places, query, limit);
  const country = countryFor(places, query);
  if (!country) return { list: named, country: null, from: -1 };
  const q = norm(query);
  const first = named.filter((p) => norm(p[0]).startsWith(q)).slice(0, 3);
  const rest = places.filter((p) => p[1] === country && !first.includes(p));
  return { list: first.concat(rest), country, from: first.length };
}

export function emptyStats() {
  return { played: 0, won: 0, streak: 0, best: 0, last: 0, dist: [0, 0, 0, 0, 0, 0] };
}

// Record a finished daily puzzle n. Idempotent per n.
export function recordResult(stats, n, won, guessCount) {
  const s = { ...emptyStats(), ...stats, dist: [...(stats?.dist || emptyStats().dist)] };
  if (s.last >= n) return s;
  s.played += 1;
  if (won) {
    s.won += 1;
    s.dist[guessCount - 1] += 1;
    s.streak = s.last === n - 1 ? s.streak + 1 : 1;
    s.best = Math.max(s.best, s.streak);
  } else s.streak = 0;
  s.last = n;
  return s;
}

// The sun at local solar noon on a date: elevation from the latitude and the sun's declination,
// azimuth due south (180) when the sun is south of the city, due north (0) otherwise.
export function noonSun(lat, date = new Date()) {
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const doy = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 86400000);
  const decl = -23.44 * Math.cos(((2 * Math.PI) / 365) * (doy + 10));
  return { el: 90 - Math.abs(lat - decl), az: lat >= decl ? 180 : 0, decl };
}
