// Pure game logic: no DOM. Shared by the page and the unit tests.

export const MAX_GUESSES = 6;

// What the map shows before each guess. view = half-width in metres.
//   heights: buildings at their real heights (otherwise a uniform low block model of the footprints)
//   faith:   places of worship coloured by faith
//   hints:   text hints that appear from this guess on
export const STAGES = [
  { view: 400, label: 'Street plan and footprints' },
  { view: 400, heights: true, label: 'Real building heights' },
  { view: 600, heights: true, faith: true, label: 'Places of worship', hints: ['faiths'] },
  { view: 800, heights: true, faith: true, label: 'Street names', hints: ['streets'] },
  { view: 1000, heights: true, faith: true, label: 'Full sheet', hints: ['pattern', 'continent'] },
  { view: 1000, heights: true, faith: true, label: 'Last guess, in the country', hints: ['country'] },
];
export const ALL_HINTS = ['faiths', 'streets', 'pattern', 'continent', 'country'];

export function stageFor(guessCount, finished) {
  return finished ? STAGES[STAGES.length - 1] : STAGES[Math.min(guessCount, STAGES.length - 1)];
}

export function hintsFor(guessCount, finished) {
  if (finished) return ALL_HINTS.slice();
  const out = [];
  for (let i = 0; i <= Math.min(guessCount, STAGES.length - 1); i++) out.push(...(STAGES[i].hints || []));
  return out;
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

export function scoreGuess(answer, place) {
  const g = { lat: place[2], lon: place[3] };
  const correct = norm(place[0]) === norm(answer.name) && place[1] === answer.country;
  const km = correct ? 0 : distanceKm(g, answer);
  return { name: place[0], country: place[1], km, correct, deg: correct ? 0 : bearing(g, answer) };
}

export function shareText({ n, guesses, won, practice }) {
  const score = won ? `${guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
  const title = practice ? 'Streetle (practice)' : `Streetle #${n}`;
  const line = guesses.map((g) => (g.correct ? '📍' : `${arrowFor(g.deg)}${proximity(g.km)}%`)).join(' ');
  return `${title} ${score}\n${line}`;
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
