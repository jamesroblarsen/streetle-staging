// 3D city view: MapLibre draws the city as a square model of extruded buildings on a sheet of paper.
// Coordinates are local metres placed at a fake origin on the equator, so nothing in the
// page (requests, map state) reveals where the city really is.
import { clipPolylineRect, clipPolygonRect, decode } from './geom.1ea8297233.js';

const DEG = 111319.49; // metres per degree at the equator (Web Mercator)
const toLL = ([x, y]) => [x / DEG, y / DEG];

export const LOOK = {
  paper: '#0b1828',
  shadow: '#03080f',
  ground: '#ebe6da',
  country: '#dcdac6', // land outside the built-up town, in the wide view
  roadFar: '#b8ad97', // streets seen from far out: darker, or they vanish into the paper
  edge: '#c9c1ae',
  water: '#bccfd0',
  waterEdge: '#9fb6b8',
  park: '#dbe0c6',
  wood: '#cfd8b8',
  sand: '#ede3c6',
  cemetery: '#dfe2cf',
  casing: '#d6ccb8',
  road: '#fdfbf6',
  rail: '#9d9585',
  buildingLow: '#b9b2a4',
  buildingHigh: '#d2ccc0',
};

export const FAITH_COLOURS = {
  christian: '#7a3b5e', muslim: '#3d7a45', hindu: '#d9822b', buddhist: '#c7a23a', jewish: '#2f5d8f',
  sikh: '#2e8b8b', shinto: '#c8442f', taoist: '#5c5a9c', jain: '#a0522d', other: '#6f6a62',
};

// Colours for each kind of place, by category. Only one category is coloured on the model at a time.
export const CATEGORY_COLOURS = {
  drink: { drink: '#d48a2c', cafe: '#3f8f8a' },
  civic: { embassy: '#5b8fd6', government: '#a77bca', police: '#3e5c76' },
  market: { market: '#c9a227', jeweller: '#ece3a6', tailor: '#b5764a', carpet: '#8b2e3c' },
  stay: { hotel: '#c8442f', guest: '#e8957a' },
  culture: { museum: '#8e5aa8', theatre: '#d4608a' },
  eating: { restaurant: '#5c9a6b', fastfood: '#e0a030' },
  foodshop: { bakery: '#d9a35b', grocer: '#a8433a', convenience: '#3f7fbf' },
  learning: { university: '#2f5d8f', school: '#e0b94a', library: '#7a8f5c' },
  health: { hospital: '#c8442f', clinic: '#e8957a', pharmacy: '#3d8f5a' },
  money: { bank: '#2e6b4f', atm: '#9fc77a' },
  beauty: { massage: '#b55d9b', salon: '#e8a0b8', cosmetics: '#8e5aa8' },
  repair: { hardware: '#8f6a3a', motor: '#4f5d6b', electronics: '#3fa0b0' },
  highstreet: { charity: '#4f9a6f', tobacco: '#a0522d', chocolate: '#5a3a28' },
  paperwork: { notary: '#5c5a9c', lawyer: '#a3a0c8' },
  heritage: { castle: '#9c6b3a', ruins: '#c9b38a', gate: '#c8442f', monument: '#6f8fa8' },
  cemetery: { cemetery: '#6b4f8a', graveyard: '#6b4f8a' },
};
export const SPORT_COLOURS = {
  soccer: '#4c8c3a', cricket: '#c9a227', baseball: '#b4452f', basketball: '#d9822b', tennis: '#6d8fb3',
  gaelic_games: '#2e8b57', rugby_union: '#7a3b5e', australian_football: '#8e5a2a', netball: '#a35d9b',
  pelota: '#c8442f', american_football: '#5c5a9c', field_hockey: '#2e8b8b', other: '#8f8a80',
};

const PITCH = 46;
const BEARING = -18;
const ROAD_W = { major: 15, primary: 13, secondary: 11, tertiary: 10, street: 7.5, service: 4.5, path: 3 };
const ROAD_ORDER = { path: 0, service: 1, street: 2, tertiary: 3, secondary: 4, primary: 5, major: 6 };

function style() {
  const empty = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } };
  // Line widths in metres at any zoom; each line feature carries its real width as `w`.
  // floor: the thinnest a line gets, in pixels, so streets still show when the whole town is in view.
  const metres = (extra = 0, floor = 0) => ['interpolate', ['exponential', 2], ['zoom'],
    ...[10, 11, 12, 13, 14, 16, 20].flatMap((z) => [z, ['max', floor, ['*', ['+', ['get', 'w'], extra], 2 ** z / 78271.5]]])];
  const roadFloor = ['match', ['get', 'k'], 'major', 1.3, 'primary', 1, 'secondary', 0.85, 'tertiary', 0.7, 'path', 0, 'service', 0.3, 0.5];
  const floored = (extra = 0) => ['interpolate', ['exponential', 2], ['zoom'],
    ...[10, 11, 12, 13, 14, 16, 20].flatMap((z) => [z, ['max', roadFloor, ['*', ['+', ['get', 'w'], extra], 2 ** z / 78271.5]]])];
  const roadColour = ['interpolate', ['linear'], ['zoom'], 11.8, LOOK.roadFar, 13.2, LOOK.road];
  return {
    version: 8,
    sources: { shadow: empty, ground: empty, wideArea: empty, wideWater: empty, wideLines: empty, wideRail: empty, base: empty, area: empty, pitch: empty, water: empty, lines: empty, rail: empty, sun: empty, buildings: empty },
    layers: [
      { id: 'paper', type: 'background', paint: { 'background-color': LOOK.paper } },
      { id: 'shadow', type: 'fill', source: 'shadow', paint: { 'fill-color': LOOK.shadow, 'fill-opacity': 0.55 } },
      // The wide view: the town around the model, flat, under the model's own square of ground.
      { id: 'ground', type: 'fill', source: 'ground', paint: { 'fill-color': LOOK.country } },
      { id: 'wide-area', type: 'fill', source: 'wideArea', paint: { 'fill-color': ['match', ['get', 'k'], 'urban', LOOK.ground, 'wood', LOOK.wood, 'sand', LOOK.sand, 'cemetery', LOOK.cemetery, LOOK.park] } },
      { id: 'wide-water', type: 'fill', source: 'wideWater', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': LOOK.water } },
      { id: 'wide-river', type: 'line', source: 'wideWater', filter: ['==', ['geometry-type'], 'LineString'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': LOOK.water, 'line-width': metres(0, 1) } },
      { id: 'wide-roads', type: 'line', source: 'wideLines', layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'o'] }, paint: { 'line-color': roadColour, 'line-width': floored() } },
      { id: 'wide-rail', type: 'line', source: 'wideRail', paint: { 'line-color': LOOK.rail, 'line-width': metres(0, 0.8), 'line-dasharray': [3, 1.5] } },
      { id: 'base', type: 'fill', source: 'base', paint: { 'fill-color': LOOK.ground } },
      { id: 'green', type: 'fill', source: 'area', paint: { 'fill-color': ['match', ['get', 'k'], 'wood', LOOK.wood, 'sand', LOOK.sand, 'cemetery', LOOK.cemetery, 'cemetery_lit', CATEGORY_COLOURS.cemetery.cemetery, LOOK.park] } },
      { id: 'pitch', type: 'fill', source: 'pitch', paint: { 'fill-color': ['case', ['==', ['get', 'show'], 1], ['match', ['get', 's'], ...Object.entries(SPORT_COLOURS).flat(), SPORT_COLOURS.other], LOOK.park] } },
      { id: 'water', type: 'fill', source: 'water', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': LOOK.water } },
      { id: 'water-edge', type: 'line', source: 'water', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'line-color': LOOK.waterEdge, 'line-width': 0.8 } },
      { id: 'river', type: 'line', source: 'water', filter: ['==', ['geometry-type'], 'LineString'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': LOOK.water, 'line-width': metres(0, 1) } },
      { id: 'road-casing', type: 'line', source: 'lines', filter: ['!=', ['get', 'k'], 'path'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': LOOK.casing, 'line-width': metres(2.5) } },
      { id: 'roads', type: 'line', source: 'lines', layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'o'] }, paint: { 'line-color': roadColour, 'line-width': floored() } },
      { id: 'rail', type: 'line', source: 'rail', paint: { 'line-color': LOOK.rail, 'line-width': metres(0, 0.6), 'line-dasharray': [3, 1.5] } },
      { id: 'sun-shadow', type: 'fill', source: 'sun', paint: { 'fill-color': '#2a3242', 'fill-opacity': 0.45 } },
      { id: 'base-edge', type: 'line', source: 'base', paint: { 'line-color': LOOK.edge, 'line-width': 1 } },
      {
        id: 'buildings', type: 'fill-extrusion', source: 'buildings',
        paint: {
          'fill-extrusion-color': ['case',
            ['has', 'col'], ['get', 'col'],
            ['interpolate', ['linear'], ['get', 't'], 0, LOOK.buildingLow, 1, LOOK.buildingHigh]],
          'fill-extrusion-height': ['get', 'h'],
          'fill-extrusion-base': ['get', 'm'],
          'fill-extrusion-vertical-gradient': true,
          'fill-extrusion-opacity': 1,
        },
      },
    ],
    light: { anchor: 'map', color: '#fffaf0', intensity: 0.5, position: [1.5, 225, 40] },
  };
}

// Decode once and keep everything in local metres.
function prepare(data) {
  if (data._prep) return data._prep;
  const L = data.layers;
  const lines = (k) => (L[k] || []).map((f) => ({ k, b: !!f.b, pts: decode(f.p || f) }));
  const areas = (k) => (L[k] || []).map((rings) => ({ k, rings: rings.map(decode) }));
  data._prep = {
    buildings: (L.building || []).map((b, i) => ({
      h: b.h, m: b.m, f: b.f, v: b.v, rings: b.r.map(decode),
      // a stable small variation in tone, slightly lighter for taller buildings
      t: Math.min(1, (((i * 2654435761) >>> 0) % 1000) / 2500 + Math.min(b.h, 60) / 100),
    })),
    roads: Object.keys(ROAD_ORDER).flatMap(lines),
    rail: ['rail', 'railminor', 'tram'].flatMap(lines),
    green: ['park', 'wood', 'sand', 'cemetery'].flatMap(areas),
    water: areas('water'),
    pitches: (L.pitch || []).map((e) => ({ s: e.s, rings: (e.r || e).map(decode) })),
    rivers: ['river', 'stream'].flatMap(lines),
    wide: data.wide ? prepareWide(data.wide) : null,
  };
  return data._prep;
}

// The wide map (tools/build_wide.mjs): plain point lists, same local metres.
function prepareWide(w) {
  const L = w.layers;
  const lines = (k) => (L[k] || []).map((p) => ({ k, pts: decode(p) }));
  const areas = (k) => (L[k] || []).map((rings) => ({ k, rings: rings.map(decode) }));
  return {
    half: w.half,
    areas: ['urban', 'park', 'wood', 'sand', 'cemetery'].flatMap(areas),
    water: areas('water'),
    rivers: lines('river'),
    roads: ['street', 'tertiary', 'secondary', 'primary', 'major'].flatMap(lines),
    rail: lines('rail'),
  };
}

function polyFeature(rings, rect, props) {
  const out = [];
  for (const r of rings) {
    const c = clipPolygonRect(r, rect);
    if (c) out.push(c.concat([c[0]]).map(toLL));
    else if (!out.length) return null;
  }
  return out.length ? { type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: out } } : null;
}

function lineFeatures(pts, rect, props, sink) {
  for (const piece of clipPolylineRect(pts, rect)) sink.push({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: piece.map(toLL) } });
}

// Ground shadows for a sun at azimuth az (degrees clockwise from north) and elevation el (degrees):
// each building's footprint swept away from the sun by height / tan(elevation), as a convex hull.
export function sunShadows(buildings, rect, { az, el }) {
  const len = 1 / Math.tan((Math.max(el, 4) * Math.PI) / 180);
  const dx = -Math.sin((az * Math.PI) / 180) * len, dy = -Math.cos((az * Math.PI) / 180) * len;
  const out = [];
  for (const b of buildings) {
    const ring = clipPolygonRect(b.rings[0], rect);
    if (!ring) continue;
    const h = b.h;
    const pts = ring.concat(ring.map(([x, y]) => [x + dx * h, y + dy * h]));
    const hull = convexHull(pts);
    const c = clipPolygonRect(hull, rect);
    if (c) out.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [c.concat([c[0]]).map(toLL)] } });
  }
  return out;
}

function convexHull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

const fc = (features) => ({ type: 'FeatureCollection', features });
const square = (v, dx = 0, dy = 0) => fc([{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[-v + dx, -v + dy], [v + dx, -v + dy], [v + dx, v + dy], [-v + dx, v + dy], [-v + dx, -v + dy]].map(toLL)] } }]);

export function createView(container, maplibregl) {
  const map = new maplibregl.Map({
    container,
    style: style(),
    center: [0, 0],
    zoom: 14,
    pitch: PITCH,
    bearing: BEARING,
    maxPitch: 70,
    attributionControl: false,
    keyboard: false,
    fadeDuration: 0,
    antialias: true,
    preserveDrawingBuffer: true,
    maxBounds: [toLL([-9000, -9000]), toLL([9000, 9000])],
  });
  map.touchZoomRotate.enableRotation();
  map.addControl(new maplibregl.NavigationControl({ showZoom: false, visualizePitch: true }), 'top-right');
  const ready = new Promise((r) => map.on('load', r));
  let current = null;
  let heightAnim = null;

  // The camera that fits the whole square of half-width v in view, for the given pitch and bearing.
  function fitCamera(v, pitch = map.getPitch(), bearing = map.getBearing()) {
    const saved = { center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() };
    const minZ = map.getMinZoom(), maxZ = map.getMaxZoom();
    map.setMinZoom(0);
    map.setMaxZoom(22);
    const W = container.clientWidth, H = container.clientHeight;
    const corners = [[-v, -v], [v, -v], [v, v], [-v, v]].map(toLL);
    let z = Math.log2((78271.517 * W * 0.8) / (2 * v));
    let center = [0, 0];
    for (let i = 0; i < 3; i++) {
      map.jumpTo({ center, zoom: z, pitch, bearing });
      const pts = corners.map((c) => map.project(c));
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
      z += Math.log2(Math.min((W * 0.9) / bw, (H * 0.86) / bh));
      map.jumpTo({ center, zoom: z, pitch, bearing });
      const p2 = corners.map((c) => map.project(c));
      const cx = (Math.min(...p2.map((p) => p.x)) + Math.max(...p2.map((p) => p.x))) / 2;
      const cy = (Math.min(...p2.map((p) => p.y)) + Math.max(...p2.map((p) => p.y))) / 2;
      const c = map.unproject([cx, cy]);
      center = [c.lng, c.lat];
    }
    const cam = { center, zoom: z, pitch, bearing };
    map.jumpTo(saved);
    map.setMinZoom(minZ);
    map.setMaxZoom(maxZ);
    return cam;
  }

  // Buildings rise from a uniform low block model (k=0) to their real heights (k=1).
  function setHeightScale(k) {
    map.setPaintProperty('buildings', 'fill-extrusion-height', ['+', ['min', ['get', 'h'], 5], ['*', ['max', 0, ['-', ['get', 'h'], 5]], k]]);
    map.setPaintProperty('buildings', 'fill-extrusion-base', ['*', ['get', 'm'], k]);
  }
  // Stepped rather than per-frame: each step re-processes every building, which is heavy on phones.
  function animateHeights(from, to, ms = 1300, steps = 10) {
    clearInterval(heightAnim);
    let i = 0;
    heightAnim = setInterval(() => {
      i++;
      const e = 1 - (1 - i / steps) ** 3;
      setHeightScale(from + (to - from) * e);
      if (i >= steps) clearInterval(heightAnim);
    }, ms / steps);
  }

  async function show(data, stage, { animate = true } = {}) {
    await ready;
    const p = prepare(data);
    const v = stage.view;
    const rect = [-v, -v, v, v];
    const same = current && current.data === data;
    const prevStage = same ? current.stage : null;
    current = { data, stage };

    // The detailed model covers data.half; a wider view shows the wide map around it.
    const plate = Math.min(v, data.half || 1000);
    const far = p.wide && v > plate ? p.wide : null;
    map.getSource('base').setData(square(plate));
    map.getSource('ground').setData(square(far ? v : plate));
    map.getSource('shadow').setData(square(far ? v : plate, v * 0.035, -v * 0.06));
    const wideArea = [], wideWater = [], wideLines = [], wideRail = [];
    if (far) {
      for (const a of far.areas) { const f = polyFeature(a.rings, rect, { k: a.k }); if (f) wideArea.push(f); }
      for (const a of far.water) { const f = polyFeature(a.rings, rect, {}); if (f) wideWater.push(f); }
      for (const r of far.rivers) lineFeatures(r.pts, rect, { w: 8 }, wideWater);
      for (const r of far.roads) lineFeatures(r.pts, rect, { k: r.k, w: ROAD_W[r.k], o: ROAD_ORDER[r.k] }, wideLines);
      for (const r of far.rail) lineFeatures(r.pts, rect, { w: 2.4 }, wideRail);
    }
    map.getSource('wideArea').setData(fc(wideArea));
    map.getSource('wideWater').setData(fc(wideWater));
    map.getSource('wideLines').setData(fc(wideLines));
    map.getSource('wideRail').setData(fc(wideRail));
    // stage.lit: the one category coloured on the buildings ('faith', 'drink', 'civic', ...), or none.
    const colourOf = (b) => {
      if (stage.lit === 'faith') return b.f ? FAITH_COLOURS[b.f] || FAITH_COLOURS.other : null;
      const sub = stage.lit && b.v?.[stage.lit];
      return sub ? CATEGORY_COLOURS[stage.lit]?.[sub] || null : null;
    };
    const props = (b) => {
      const o = { h: b.h, m: b.m, t: b.t };
      const col = colourOf(b);
      if (col) o.col = col;
      return o;
    };
    map.getSource('buildings').setData(fc(p.buildings.map((b) => polyFeature(b.rings, rect, props(b))).filter(Boolean)));
    map.getSource('pitch').setData(fc(p.pitches.map((e) => polyFeature(e.rings, rect, { s: e.s || 'other', show: stage.sports && e.s ? 1 : 0 })).filter(Boolean)));
    map.getSource('sun').setData(fc(stage.sun ? sunShadows(p.buildings, rect, stage.sun) : []));
    const roads = [];
    for (const r of p.roads) lineFeatures(r.pts, rect, { k: r.k, w: ROAD_W[r.k], o: ROAD_ORDER[r.k] + (r.b ? 10 : 0) }, roads);
    map.getSource('lines').setData(fc(roads));
    const rail = [];
    for (const r of p.rail) lineFeatures(r.pts, rect, { k: r.k, w: r.k === 'rail' ? 2.4 : 1.2 }, rail);
    map.getSource('rail').setData(fc(rail));
    const water = [];
    for (const w of p.water) { const f = polyFeature(w.rings, rect, {}); if (f) water.push(f); }
    for (const r of p.rivers) lineFeatures(r.pts, rect, { k: r.k, w: r.k === 'river' ? 8 : 2.5 }, water);
    map.getSource('water').setData(fc(water));
    map.getSource('area').setData(fc(p.green.map((g) => polyFeature(g.rings, rect, { k: g.k === 'cemetery' && stage.lit === 'cemetery' ? 'cemetery_lit' : g.k })).filter(Boolean)));

    const target = stage.heights ? 1 : 0;
    const was = prevStage ? (prevStage.heights ? 1 : 0) : target;
    if (animate && same && was !== target) animateHeights(was, target);
    else { clearInterval(heightAnim); setHeightScale(target); }

    const cam = same ? fitCamera(v) : fitCamera(v, PITCH, BEARING);
    map.setMinZoom(Math.max(0, cam.zoom - 1.2));
    map.setMaxZoom(cam.zoom + 3);
    if (animate && same) map.easeTo({ ...cam, duration: 1000 });
    else map.jumpTo(cam);
  }

  function resetCamera() {
    if (!current) return;
    map.easeTo({ ...fitCamera(current.stage.view, PITCH, BEARING), duration: 700 });
  }

  function resize() {
    map.resize();
    if (current) map.jumpTo(fitCamera(current.stage.view));
  }

  const idle = () => new Promise((r) => { map.once('idle', r); map.triggerRepaint(); });
  // Frame the current model from a given pitch and bearing (used by lab and QA pages).
  function fit(pitch, bearing) {
    if (current) map.jumpTo(fitCamera(current.stage.view, pitch, bearing));
  }
  return { map, show, resetCamera, resize, ready, idle, fit };
}
