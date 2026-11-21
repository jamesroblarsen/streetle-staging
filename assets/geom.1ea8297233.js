// Pure geometry helpers for turning OSM ways into clipped, simplified map shapes.
// Coordinates are local metres, x east, y north, centred on the city's centre point.

export function projector(lat0, lon0) {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110540;
  return (lat, lon) => [(lon - lon0) * kx, (lat - lat0) * ky];
}

const inside = (p, H) => p[0] >= -H && p[0] <= H && p[1] >= -H && p[1] <= H;
const sq = (H) => [-H, -H, H, H];

// Liang–Barsky: clip segment a-b to the rectangle [x0,y0,x1,y1]; returns [t0, t1] or null.
function clipSegment(a, b, [x0, y0, x1, y1]) {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const checks = [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dy, a[1] - y0], [dy, y1 - a[1]]];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const r = q / p;
      if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
      else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
  }
  return [t0, t1];
}

const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// Clip a polyline to the square [-H,H]²; returns the pieces that lie inside.
export function clipPolyline(pts, H) {
  return clipPolylineRect(pts, sq(H));
}

export function clipPolylineRect(pts, rect) {
  const out = [];
  let cur = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const c = clipSegment(a, b, rect);
    if (!c) { if (cur) { out.push(cur); cur = null; } continue; }
    const [t0, t1] = c;
    const p0 = t0 === 0 ? a : lerp(a, b, t0);
    const p1 = t1 === 1 ? b : lerp(a, b, t1);
    if (!cur) cur = [p0];
    else if (t0 > 0) { out.push(cur); cur = [p0]; }
    cur.push(p1);
    if (t1 < 1) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out.filter((l) => l.length >= 2);
}

// Sutherland–Hodgman: clip a polygon ring (no repeated closing point needed) to the square.
export function clipPolygon(ring, H) {
  return clipPolygonRect(ring, sq(H));
}

export function clipPolygonRect(ring, [x0, y0, x1, y1]) {
  let poly = ring;
  const edges = [
    (p) => p[0] >= x0, (p) => p[0] <= x1, (p) => p[1] >= y0, (p) => p[1] <= y1,
  ];
  const cross = [
    (a, b) => lerp(a, b, (x0 - a[0]) / (b[0] - a[0])),
    (a, b) => lerp(a, b, (x1 - a[0]) / (b[0] - a[0])),
    (a, b) => lerp(a, b, (y0 - a[1]) / (b[1] - a[1])),
    (a, b) => lerp(a, b, (y1 - a[1]) / (b[1] - a[1])),
  ];
  for (let e = 0; e < 4; e++) {
    if (!poly.length) break;
    const res = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ain = edges[e](a), bin = edges[e](b);
      if (ain) res.push(a);
      if (ain !== bin) res.push(cross[e](a, b));
    }
    poly = res;
  }
  return poly.length >= 3 ? poly : null;
}

// Douglas–Peucker simplification.
export function simplify(pts, tol) {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [i, j] = stack.pop();
    const [ax, ay] = pts[i], [bx, by] = pts[j];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let best = -1, bestD = t2;
    for (let k = i + 1; k < j; k++) {
      const [px, py] = pts[k];
      let d;
      if (len2 === 0) d = (px - ax) ** 2 + (py - ay) ** 2;
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
      }
      if (d > bestD) { bestD = d; best = k; }
    }
    if (best >= 0) { keep[best] = 1; stack.push([i, best], [best, j]); }
  }
  return pts.filter((_, k) => keep[k]);
}

export function signedArea(ring) {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2; // positive = counter-clockwise (y up)
}

const key = (p) => `${p[0]},${p[1]}`;
const same = (a, b) => a[0] === b[0] && a[1] === b[1];

// Join ways that share end points into longer chains.
// directed=true only joins end→start (keeps coastline direction); otherwise reverses as needed.
export function joinWays(ways, directed = false) {
  const pool = ways.filter((w) => w.length >= 2).map((w) => w.slice());
  const closed = [], open = [];
  while (pool.length) {
    let chain = pool.pop();
    let grew = true;
    while (grew && !same(chain[0], chain[chain.length - 1])) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const w = pool[i];
        const head = chain[0], tail = chain[chain.length - 1];
        if (same(tail, w[0])) chain = chain.concat(w.slice(1));
        else if (same(w[w.length - 1], head)) chain = w.concat(chain.slice(1));
        else if (!directed && same(tail, w[w.length - 1])) chain = chain.concat(w.slice(0, -1).reverse());
        else if (!directed && same(w[0], head)) chain = w.slice(1).reverse().concat(chain);
        else continue;
        pool.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (chain.length >= 4 && same(chain[0], chain[chain.length - 1])) closed.push(chain.slice(0, -1));
    else open.push(chain);
  }
  return { closed, open };
}

// Position along the square's boundary, clockwise (y up) from the top-left corner.
export function boundaryT(p, H) {
  const [x, y] = p, e = 1e-6 * H;
  if (Math.abs(y - H) < e) return x + H;
  if (Math.abs(x - H) < e) return 2 * H + (H - y);
  if (Math.abs(y + H) < e) return 4 * H + (H - x);
  if (Math.abs(x + H) < e) return 6 * H + (y + H);
  return null;
}

// Build sea polygons from OSM coastline ways (land on the left, water on the right).
// Returns { sea: rings, islands: rings }.
export function buildSea(coastWays, H) {
  const { closed, open } = joinWays(coastWays, true);
  const P = 8 * H;
  const corners = [[0, [-H, H]], [2 * H, [H, H]], [4 * H, [H, -H]], [6 * H, [-H, -H]]];
  const islands = [], sea = [];
  const pieces = [];
  const chains = open.concat(closed.map((r) => r.concat([r[0]])));
  for (const chain of chains) {
    if (chain.every((p) => inside(p, H))) {
      if (same(chain[0], chain[chain.length - 1])) {
        const ring = chain.slice(0, -1);
        (signedArea(ring) > 0 ? islands : sea).push(ring);
      }
      continue; // an open chain ending inside the square is broken data
    }
    for (const piece of clipPolyline(chain, H)) {
      const ts = boundaryT(piece[0], H), te = boundaryT(piece[piece.length - 1], H);
      if (ts === null || te === null) continue;
      pieces.push({ pts: piece, ts, te, used: false });
    }
  }
  if (!pieces.length) {
    if (islands.length) sea.push([[-H, H], [H, H], [H, -H], [-H, -H]]);
    return { sea, islands };
  }
  for (const start of pieces) {
    if (start.used) continue;
    const ring = [];
    let cur = start;
    for (let guard = 0; guard <= pieces.length; guard++) {
      cur.used = true;
      ring.push(...cur.pts);
      const te = cur.te;
      let next = null, bestD = Infinity;
      for (const p of pieces) {
        if (p.used && p !== start) continue;
        let d = (p.ts - te + P) % P;
        if (d === 0 && p === cur && cur !== start) d = P;
        if (d < bestD) { bestD = d; next = p; }
      }
      for (const [ct, cp] of corners.map(([t, p]) => [(t - te + P) % P, p]).sort((a, b) => a[0] - b[0])) {
        if (ct > 0 && ct < bestD) ring.push(cp);
      }
      if (!next || next === start) break;
      cur = next;
    }
    if (ring.length >= 3) sea.push(ring);
  }
  return { sea, islands };
}

// Quantise to half-metres and delta-encode a list of points into a flat int array.
export function encode(pts) {
  const out = [];
  let px = 0, py = 0;
  for (const [x, y] of pts) {
    const qx = Math.round(x * 2), qy = Math.round(y * 2);
    if (out.length && qx === px && qy === py) continue;
    out.push(qx - px, qy - py);
    px = qx; py = qy;
  }
  return out;
}

export function decode(arr) {
  const pts = [];
  let x = 0, y = 0;
  for (let i = 0; i < arr.length; i += 2) {
    x += arr[i]; y += arr[i + 1];
    pts.push([x / 2, y / 2]);
  }
  return pts;
}
