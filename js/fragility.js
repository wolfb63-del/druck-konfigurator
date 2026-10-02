'use strict';
/* Fragilität: wo ist ein Teil dünn oder in Z schwach? Kein DOM – tests/fragility.js prüft das in Node.
   Reine Heuristik als Hinweis, keine Festigkeitsrechnung; die Druckparameter bleiben unverändert.
   1) Wandstärke: von jeder Fläche ein Strahl nach innen bis zur gegenüberliegenden Außenfläche.
   2) Z-Schwäche: das Teil in Höhenscheiben schneiden; je Insel (zusammenhängende Querschnittsfläche)
      der Trägheitsradius des Querschnitts gegen die Höhe des Materials darüber (Schlankheit wie bei
      einer Stütze). FDM-Teile brechen am leichtesten zwischen den Schichten, also in Z.
   Bekannte Grenzen (bewusst nicht behoben, Prüfung 2026-10-02):
   - Inseln benachbarter Scheiben gelten als verbunden, wenn ein innerer Punkt der einen in der
     Außenkontur der anderen liegt – Löcher werden dabei nicht beachtet. Eine Insel, die im Loch einer
     anderen steht (Stift in einem Rohr), kann so fälschlich mit ihr verbunden werden; „Material darüber“
     ist dann zu hoch.
   - Strukturen dünner als der Scheibenabstand (0,2 mm, bei hohen Teilen bis Höhe/200) können in Z
     zwischen zwei Scheiben liegen und fallen dort durch. Die Wandstärke erfasst sie trotzdem. */

const FRAG_LINE_WIDTH = 0.42;      // mm, Standard-Linienbreite 0,4-Düse (wird je Düse übergeben)
const FRAG_THIN_CRIT = 2;          // Wandstärke unter 2 Linien: kritisch
const FRAG_THIN_WARN = 4;          // unter 4 Linien: dünn
const FRAG_RAY_CAP = 1.25;         // Strahl nur bis 1,25 × Warnschwelle verfolgen (dicker = stabil)
const FRAG_SUB_MM2 = 4;            // große Dreiecke an mehreren Punkten (≈ 2 mm) messen
const FRAG_MAX_SUB = 4;
const FRAG_GRID_MAX = 128;         // höchstens so viele Zellen je Achse (Strahlsuche)
const FRAG_SLICE_MIN = 0.2;        // mm, feinster Scheibenabstand
const FRAG_SLICE_MAX_N = 200;      // höchstens so viele Scheiben
const FRAG_SLENDER_WARN = 30;      // Höhe darüber / Trägheitsradius: ab hier schwach in Z
const FRAG_SLENDER_CRIT = 80;      // … ab hier kritisch
const FRAG_MIN_AREA = 20;          // mm²: so viel kritische/dünne Fläche, bevor das Teil so eingestuft wird
const FRAG_MIN_SHARE = 0.01;       // … oder dieser Anteil der Oberfläche
const FRAG_NECK_MIN = 2;          // mm: so weit muss ein schmaler Querschnitt nach oben reichen
const FRAG_NECK_GROW = 2;         // … wobei der Trägheitsradius höchstens auf das Doppelte wächst
// Klassen je Dreieck: 0 stabil, 1 dünn/schwach, 2 kritisch
const FRAG_OK = 0, FRAG_WARN = 1, FRAG_CRIT = 2;

/* Gleichmäßiges 3D-Raster; ein Dreieck kommt in jede Zelle, die seine Ebene berühren kann
   (Abstand Zellmitte–Ebene ≤ halbe Zelldiagonale). Zellgröße ≈ doppelte mittlere Kantenlänge. */
function fragBuildGrid(pos, n, mn, mx, total) {
  const diag = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) || 1;
  const cs = Math.max(diag / FRAG_GRID_MAX, 2 * Math.sqrt(2 * total / Math.max(1, n)), 1e-3);
  const dims = [0, 1, 2].map(k => Math.max(1, Math.ceil((mx[k] - mn[k]) / cs) + 1));
  const cells = new Map(), half = cs * Math.sqrt(3) / 2;
  const cell = (k, v) => Math.min(dims[k] - 1, Math.max(0, Math.floor((v - mn[k]) / cs)));
  for (let i = 0; i < n; i++) {
    const o = i * 9;
    const ux = pos[o + 3] - pos[o], uy = pos[o + 4] - pos[o + 1], uz = pos[o + 5] - pos[o + 2];
    const wx = pos[o + 6] - pos[o], wy = pos[o + 7] - pos[o + 1], wz = pos[o + 8] - pos[o + 2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz);
    if (!len) continue;
    nx /= len; ny /= len; nz /= len;
    const lo = [0, 1, 2].map(k => cell(k, Math.min(pos[o + k], pos[o + 3 + k], pos[o + 6 + k])));
    const hi = [0, 1, 2].map(k => cell(k, Math.max(pos[o + k], pos[o + 3 + k], pos[o + 6 + k])));
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
      const cx = mn[0] + (x + 0.5) * cs, cy = mn[1] + (y + 0.5) * cs, cz = mn[2] + (z + 0.5) * cs;
      if (Math.abs(nx * (cx - pos[o]) + ny * (cy - pos[o + 1]) + nz * (cz - pos[o + 2])) > half) continue;
      const key = (z * dims[1] + y) * dims[0] + x;
      const list = cells.get(key);
      if (list) list.push(i); else cells.set(key, [i]);
    }
  }
  return { cs, dims, cells, mn, stamp: new Int32Array(n), ray: 0, stamp2: new Int32Array(n), ray2: 0 };
}

/* Strahl durch das Raster (Zellen in Strahlrichtung nacheinander, Amanatides/Woo), je Zelle
   Möller–Trumbore. Nur Austrittsflächen zählen (Normale in Strahlrichtung; Richtung je Körper aus
   grid.triOut, sonst out = +1 Normalen außen / −1 innen). Bei mehreren Körpern zählt eine Austrittsfläche
   im Inneren eines anderen Körpers nicht (eingebettete, unverschmolzene Körper). Ergebnis: Abstand oder
   Infinity (nichts bis maxT). */
function fragCastRay(pos, grid, self, ox, oy, oz, dx, dy, dz, maxT, out) {
  const { cs, dims, cells, mn, stamp } = grid, ray = ++grid.ray, o3 = [ox, oy, oz], d3 = [dx, dy, dz];
  const c = [0, 0, 0], step = [0, 0, 0], tMax = [0, 0, 0], tDelta = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    c[k] = Math.min(dims[k] - 1, Math.max(0, Math.floor((o3[k] - mn[k]) / cs)));
    step[k] = d3[k] > 0 ? 1 : -1;
    tMax[k] = d3[k] ? ((c[k] + (d3[k] > 0 ? 1 : 0)) * cs + mn[k] - o3[k]) / d3[k] : Infinity;
    tDelta[k] = d3[k] ? cs / Math.abs(d3[k]) : Infinity;
  }
  let best = Infinity;
  for (;;) {
    const list = cells.get((c[2] * dims[1] + c[1]) * dims[0] + c[0]);
    if (list) for (const j of list) {
      if (j === self || stamp[j] === ray) continue;
      stamp[j] = ray;
      const o = j * 9;
      const e1x = pos[o + 3] - pos[o], e1y = pos[o + 4] - pos[o + 1], e1z = pos[o + 5] - pos[o + 2];
      const e2x = pos[o + 6] - pos[o], e2y = pos[o + 7] - pos[o + 1], e2z = pos[o + 8] - pos[o + 2];
      const fnx = e1y * e2z - e1z * e2y, fny = e1z * e2x - e1x * e2z, fnz = e1x * e2y - e1y * e2x;
      if ((grid.triOut ? grid.triOut[j] : out) * (fnx * dx + fny * dy + fnz * dz) <= 0) continue;
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-12) continue;
      const inv = 1 / det, sx = ox - pos[o], sy = oy - pos[o + 1], sz = oz - pos[o + 2];
      const u = (sx * px + sy * py + sz * pz) * inv;
      if (u < -1e-6 || u > 1 + 1e-6) continue;
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inv;
      if (v < -1e-6 || u + v > 1 + 1e-6) continue;
      const d = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (d > 1e-5 && d < best && !(grid.multi && fragInsideOther(pos, grid, [ox + dx * d, oy + dy * d, oz + dz * d], grid.body[j]))) best = d;
    }
    const k = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
    if (best <= tMax[k] || tMax[k] > maxT) break;     // nähere Treffer kann es weiter hinten nicht geben
    c[k] += step[k];
    if (c[k] < 0 || c[k] >= dims[k]) break;
    tMax[k] += tDelta[k];
  }
  return best <= maxT ? best : Infinity;
}

/* Körper eines Netzes (Dreiecke mit gemeinsamen Ecken) und je Körper die Richtung der Normalen:
   triOut[i] = +1 (Normalen außen, positives Volumen) oder −1 (Körper ist „falsch herum“). */
function fragBodies(pos, n) {
  const parent = new Int32Array(n).map((_, i) => i), byVertex = new Map();
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (let i = 0; i < n; i++) for (let v = 0; v < 3; v++) {
    const o = i * 9 + v * 3, key = pos[o] + ',' + pos[o + 1] + ',' + pos[o + 2], j = byVertex.get(key);
    if (j === undefined) byVertex.set(key, i); else { const a = find(i), b = find(j); if (a !== b) parent[a] = b; }
  }
  const body = new Int32Array(n), ids = new Map(), vol = [];
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!ids.has(r)) { ids.set(r, ids.size); vol.push(0); }
    const b = body[i] = ids.get(r), o = i * 9;
    vol[b] += (pos[o] * (pos[o + 4] * pos[o + 8] - pos[o + 5] * pos[o + 7]) - pos[o + 1] * (pos[o + 3] * pos[o + 8] - pos[o + 5] * pos[o + 6]) + pos[o + 2] * (pos[o + 3] * pos[o + 7] - pos[o + 4] * pos[o + 6])) / 6;
  }
  const triOut = new Int8Array(n);
  for (let i = 0; i < n; i++) triOut[i] = vol[body[i]] < 0 ? -1 : 1;
  return { body, count: ids.size, triOut, inverted: vol.filter(v => v < 0).length };
}

/* Liegt Punkt p im Inneren eines anderen Körpers als skip? Strahl schräg nach oben bis aus dem Raster,
   Schnitte je Körper zählen (ungerade = innen). Nur bei Teilen aus mehreren Körpern nötig. */
const FRAG_PARITY_DIR = (() => { const d = [0.1234, 0.0457, 0.9913], l = Math.hypot(...d); return d.map(v => v / l); })();
function fragInsideOther(pos, grid, p, skip) {
  const { cs, dims, cells, mn, body } = grid, [dx, dy, dz] = FRAG_PARITY_DIR, d3 = FRAG_PARITY_DIR;
  const stamp = grid.stamp2, ray = ++grid.ray2, odd = new Set();
  const c = [0, 0, 0], step = [0, 0, 0], tMax = [0, 0, 0], tDelta = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    c[k] = Math.min(dims[k] - 1, Math.max(0, Math.floor((p[k] - mn[k]) / cs)));
    step[k] = d3[k] > 0 ? 1 : -1;
    tMax[k] = ((c[k] + (d3[k] > 0 ? 1 : 0)) * cs + mn[k] - p[k]) / d3[k];
    tDelta[k] = cs / Math.abs(d3[k]);
  }
  for (;;) {
    const list = cells.get((c[2] * dims[1] + c[1]) * dims[0] + c[0]);
    if (list) for (const j of list) {
      if (body[j] === skip || stamp[j] === ray) continue;
      stamp[j] = ray;
      const o = j * 9;
      const e1x = pos[o + 3] - pos[o], e1y = pos[o + 4] - pos[o + 1], e1z = pos[o + 5] - pos[o + 2];
      const e2x = pos[o + 6] - pos[o], e2y = pos[o + 7] - pos[o + 1], e2z = pos[o + 8] - pos[o + 2];
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-12) continue;
      const inv = 1 / det, sx = p[0] - pos[o], sy = p[1] - pos[o + 1], sz = p[2] - pos[o + 2];
      const u = (sx * px + sy * py + sz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inv;
      if (v < 0 || u + v > 1) continue;
      if ((e2x * qx + e2y * qy + e2z * qz) * inv > 1e-6) { if (odd.has(body[j])) odd.delete(body[j]); else odd.add(body[j]); }
    }
    const k = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
    c[k] += step[k];
    if (c[k] < 0 || c[k] >= dims[k]) break;
    tMax[k] += tDelta[k];
  }
  return odd.size > 0;
}

/* Wandstärke je Dreieck (Median der Messpunkte) und Flächen je Klasse (je Messpunkt gewichtet).
   Strahlen gehen nach innen; Körper mit nach innen zeigenden Normalen (negatives Volumen) werden
   erkannt und umgekehrt gemessen. Innenflächen unverschmolzener Körper (geom.hidden) werden übersprungen. */
function measureThickness(geom, lw, bodies) {
  const { pos, n } = geom, warnT = FRAG_THIN_WARN * lw, critT = FRAG_THIN_CRIT * lw, maxT = warnT * FRAG_RAY_CAP;
  const grid = fragBuildGrid(pos, n, geom.mn, geom.mx, geom.total);
  Object.assign(grid, { triOut: bodies.triOut, body: bodies.body, multi: bodies.count > 1 });
  const thick = new Float32Array(n).fill(Infinity), cls = new Uint8Array(n);
  let critArea = 0, warnArea = 0, measured = 0;
  const samples = [];                // [dicke, fläche] für das Perzentil
  for (let i = 0; i < n; i++) {
    const area = geom.area[i];
    if (!area || (geom.hidden && geom.hidden[i] > 0.5)) continue;
    const o = i * 9;
    const ux = pos[o + 3] - pos[o], uy = pos[o + 4] - pos[o + 1], uz = pos[o + 5] - pos[o + 2];
    const wx = pos[o + 6] - pos[o], wy = pos[o + 7] - pos[o + 1], wz = pos[o + 8] - pos[o + 2];
    const len = Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
    const sign = -bodies.triOut[i];   // Strahlrichtung = sign · Normale (nach innen)
    const dx = sign * (uy * wz - uz * wy) / len, dy = sign * (uz * wx - ux * wz) / len, dz = sign * (ux * wy - uy * wx) / len;
    const m = Math.max(1, Math.min(FRAG_MAX_SUB, Math.ceil(Math.sqrt(area / FRAG_SUB_MM2)))), w = area / (m * m), vals = [];
    for (let a = 0; a < m; a++) for (let b = 0; a + b < m; b++) for (let flip = 0; flip < (a + b < m - 1 ? 2 : 1); flip++) {
      const fa = (a + (flip ? 2 : 1) / 3) / m, fb = (b + (flip ? 2 : 1) / 3) / m, fc = 1 - fa - fb;
      const ox = fa * pos[o] + fb * pos[o + 3] + fc * pos[o + 6], oy = fa * pos[o + 1] + fb * pos[o + 4] + fc * pos[o + 7], oz = fa * pos[o + 2] + fb * pos[o + 5] + fc * pos[o + 8];
      let t = fragCastRay(pos, grid, i, ox, oy, oz, dx, dy, dz, maxT, 1);
      // Messpunkt im Inneren eines anderen Körpers ist keine Außenfläche (nur prüfen, wenn es dünn wäre)
      if (t < Infinity && grid.multi && fragInsideOther(pos, grid, [ox, oy, oz], bodies.body[i])) t = Infinity;
      vals.push(t);
      measured += w;
      if (t < critT) critArea += w; else if (t < warnT) warnArea += w;
      if (t < Infinity) samples.push([t, w]);
    }
    vals.sort((p, q) => p - q);
    const med = vals[(vals.length - 1) >> 1];
    thick[i] = med;
    cls[i] = med < critT ? FRAG_CRIT : med < warnT ? FRAG_WARN : FRAG_OK;
  }
  // dünnste Stelle robust: 2-%-Perzentil der dünnen Messpunkte nach Fläche (einzelne Ausreißer an Kanten zählen nicht)
  samples.sort((p, q) => p[0] - q[0]);
  let acc = 0, minThick = null;
  const total = samples.reduce((s, x) => s + x[1], 0);
  for (const [t, w] of samples) { acc += w; if (acc >= 0.02 * total) { minThick = t; break; } }
  return { thick, cls, critArea, warnArea, measured, minThick };
}

// Schnittstrecke eines Dreiecks mit der Ebene z = h, so orientiert, dass das Material links liegt
// (Außenkontur gegen den Uhrzeigersinn, Löcher im Uhrzeigersinn). Kantenpunkte werden immer in
// derselben Eckenreihenfolge berechnet, damit Nachbardreiecke bitgleiche Punkte liefern.
function fragSliceTri(pos, o, h) {
  const pts = [];
  for (const [a, b] of [[0, 3], [3, 6], [6, 0]]) {
    const za = pos[o + a + 2], zb = pos[o + b + 2];
    if ((za > h) === (zb > h)) continue;
    let p = o + a, q = o + b;
    if (pos[p] > pos[q] || (pos[p] === pos[q] && (pos[p + 1] > pos[q + 1] || (pos[p + 1] === pos[q + 1] && pos[p + 2] > pos[q + 2])))) { const t = p; p = q; q = t; }
    const t = (h - pos[p + 2]) / (pos[q + 2] - pos[p + 2]);
    pts.push(pos[p] + t * (pos[q] - pos[p]), pos[p + 1] + t * (pos[q + 1] - pos[p + 1]));
  }
  if (pts.length !== 4) return null;
  const ux = pos[o + 3] - pos[o], uy = pos[o + 4] - pos[o + 1], uz = pos[o + 5] - pos[o + 2];
  const wx = pos[o + 6] - pos[o], wy = pos[o + 7] - pos[o + 1], wz = pos[o + 8] - pos[o + 2];
  const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz;
  const dx = pts[2] - pts[0], dy = pts[3] - pts[1];
  // rechts von der Laufrichtung (dy, −dx) muss nach außen (Normale) zeigen
  return dy * nx - dx * ny >= 0 ? pts : [pts[2], pts[3], pts[0], pts[1]];
}

/* Strecken einer Scheibe zu geschlossenen Konturen verketten. Liefert je Kontur Fläche (mit
   Vorzeichen), Flächenmomente, Begrenzungsrechteck und die beteiligten Dreiecke. */
function fragLoops(segs) {
  const key = (x, y) => Math.round(x * 1e4) + ',' + Math.round(y * 1e4);
  const byStart = new Map();
  segs.forEach((s, i) => { const k = key(s[0], s[1]); const l = byStart.get(k); if (l) l.push(i); else byStart.set(k, [i]); });
  const used = new Uint8Array(segs.length), loops = [];
  let open = 0;
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue;
    const chain = [];
    let cur = s0, closed = false;
    while (cur !== undefined && !used[cur]) {
      used[cur] = 1; chain.push(cur);
      const s = segs[cur], next = byStart.get(key(s[2], s[3]));
      if (key(s[2], s[3]) === key(segs[s0][0], segs[s0][1])) { closed = true; break; }
      cur = next && next.find(j => !used[j]);
    }
    if (!closed) { open += chain.length; continue; }
    let A = 0, Sx = 0, Sy = 0, Ixx = 0, Iyy = 0, Ixy = 0, bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    const tris = [];
    for (const c of chain) {
      const [x0, y0, x1, y1, tri] = segs[c], cr = x0 * y1 - x1 * y0;
      A += cr / 2; Sx += (x0 + x1) * cr / 6; Sy += (y0 + y1) * cr / 6;
      Iyy += (x0 * x0 + x0 * x1 + x1 * x1) * cr / 12; Ixx += (y0 * y0 + y0 * y1 + y1 * y1) * cr / 12;
      Ixy += (x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) * cr / 24;
      bx0 = Math.min(bx0, x0); bx1 = Math.max(bx1, x0); by0 = Math.min(by0, y0); by1 = Math.max(by1, y0);
      tris.push(tri);
    }
    loops.push({ A, Sx, Sy, Ixx, Iyy, Ixy, box: [bx0, by0, bx1, by1], pt: [segs[chain[0]][0], segs[chain[0]][1]], pts: chain.map(c => [segs[c][0], segs[c][1]]), tris });
  }
  return { loops, open };
}

function fragInside(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/* Inseln je Scheibe: Außenkontur + darin liegende Löcher. Inseln benachbarter Scheiben, die sich
   überdecken, sind verbunden; „Material darüber“ = oberstes z, das über diese Verbindungen erreichbar
   ist (nicht einfach das höchste Material im selben XY-Bereich). Schlankheit = Material darüber /
   kleinster Trägheitsradius des Querschnitts (Biegung in der schwächsten Richtung). Gewertet wird nur
   ein Hals: der Querschnitt bleibt über ≥ FRAG_NECK_MIN schmal (Trägheitsradius ≤ 2×). Eine Kugel oder
   Spitze auf dem Bett wird sofort breiter und zählt nicht. Inseln unter (2 Linienbreiten)² werden nicht
   gewertet (zu klein zum Drucken, zählt über die Wandstärke). */
function fragIslands(segs, triOut) {
  const r = fragLoops(segs);
  // Konturen von Körpern mit nach innen zeigenden Normalen laufen falsch herum → umdrehen
  for (const l of r.loops) if (triOut[l.tris[0]] < 0) for (const f of ['A', 'Sx', 'Sy', 'Ixx', 'Iyy', 'Ixy']) l[f] = -l[f];
  const outer = r.loops.filter(l => l.A > 0), holes = r.loops.filter(l => l.A < 0);
  const islands = outer.map(l => ({ ...l, tris: [...l.tris] }));
  for (const h of holes) {
    let best = -1;
    for (let j = 0; j < outer.length; j++) if ((best < 0 || outer[j].A < outer[best].A) && fragInside(h.pt, outer[j].pts)) best = j;
    if (best < 0) continue;
    const I = islands[best];
    for (const f of ['A', 'Sx', 'Sy', 'Ixx', 'Iyy', 'Ixy']) I[f] += h[f];
    I.tris.push(...h.tris);
  }
  for (const I of islands) {
    I.ipt = fragInnerPoint(I.pts);
    const cx = I.Sx / I.A, cy = I.Sy / I.A;
    const ixx = I.Ixx - I.A * cy * cy, iyy = I.Iyy - I.A * cx * cx, ixy = I.Ixy - I.A * cx * cy;
    const imin = (ixx + iyy) / 2 - Math.sqrt(((ixx - iyy) / 2) ** 2 + ixy * ixy);
    I.rg = I.A > 0 ? Math.sqrt(Math.max(imin, 0) / I.A) : 0;
  }
  return { islands, open: r.open };
}

// Punkt sicher im Material einer Kontur (nicht auf dem Rand): Mitte der längsten Strecke, ein Stück nach innen
function fragInnerPoint(pts) {
  let bi = 0, bl = -1;
  for (let i = 0; i < pts.length; i++) { const j = (i + 1) % pts.length, l = Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]); if (l > bl) { bl = l; bi = i; } }
  const a = pts[bi], b = pts[(bi + 1) % pts.length], e = Math.min(0.01, bl / 4) / (bl || 1);
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], left = [m[0] - (b[1] - a[1]) * e, m[1] + (b[0] - a[0]) * e];
  return fragInside(left, pts) ? left : [m[0] + (b[1] - a[1]) * e, m[1] - (b[0] - a[0]) * e];
}

// Überdecken sich zwei Inseln benachbarter Scheiben? (Rechtecke schneiden sich und ein innerer Punkt
// der einen liegt in der Außenkontur der anderen)
function fragLinked(a, b) {
  if (a.box[0] > b.box[2] || b.box[0] > a.box[2] || a.box[1] > b.box[3] || b.box[1] > a.box[3]) return false;
  return fragInside(b.ipt, a.pts) || fragInside(a.ipt, b.pts);
}

function measureZSections(geom, lw, triOut) {
  const { pos, n, mn, mx } = geom, height = mx[2] - mn[2], minArea = (FRAG_THIN_CRIT * lw) ** 2;
  if (!triOut) triOut = new Int8Array(n).fill(1);
  const empty = { cls: new Uint8Array(n), worst: null, open: 0, slices: 0 };
  if (height <= FRAG_SLICE_MIN) return empty;
  const step = Math.max(FRAG_SLICE_MIN, height / FRAG_SLICE_MAX_N), ns = Math.floor(height / step);
  const zOf = k => mn[2] + (k + 0.5) * step + step * 1e-3, segs = Array.from({ length: ns }, () => []);
  for (let i = 0; i < n; i++) {
    const o = i * 9, z0 = Math.min(pos[o + 2], pos[o + 5], pos[o + 8]), z1 = Math.max(pos[o + 2], pos[o + 5], pos[o + 8]);
    for (let k = Math.max(0, Math.floor((z0 - mn[2]) / step - 0.5)); k < ns && zOf(k) < z1; k++) {
      if (zOf(k) <= z0) continue;
      const s = fragSliceTri(pos, o, zOf(k));
      if (s) segs[k].push([s[0], s[1], s[2], s[3], i]);
    }
  }
  let open = 0;
  const layers = segs.map(s => { const r = fragIslands(s, triOut); open += r.open; return r.islands; });
  // Verbindungen nach oben und oberstes erreichbares z (von oben nach unten aufgebaut)
  for (let k = ns - 1; k >= 0; k--) for (const I of layers[k]) {
    I.up = k + 1 < ns ? layers[k + 1].filter(J => fragLinked(I, J)) : [];
    I.top = Math.max(zOf(k) + step / 2, ...I.up.map(J => J.top));
  }
  // Wie weit bleibt der Querschnitt oberhalb von I schmal (Trägheitsradius ≤ limit)? Suche endet bei FRAG_NECK_MIN.
  const neckReaches = (I, k, limit) => {
    const goal = zOf(k) + FRAG_NECK_MIN, seen = new Set();
    const walk = (J, kk) => {
      if (zOf(kk) + step / 2 >= goal) return true;
      for (const U of J.up) if (!seen.has(U) && U.rg <= limit) { seen.add(U); if (walk(U, kk + 1)) return true; }
      return false;
    };
    return walk(I, k);
  };
  const cls = new Uint8Array(n);
  let worst = null;
  for (let k = 0; k < ns; k++) for (const I of layers[k]) {
    if (I.A < minArea || !(I.rg > 0)) continue;
    const above = I.top - zOf(k), slender = above / I.rg;
    // Halsprüfung nur, wo es darauf ankommt (schlank genug für eine Warnung)
    if (slender >= FRAG_SLENDER_WARN && !neckReaches(I, k, FRAG_NECK_GROW * I.rg)) continue;
    const c = slender >= FRAG_SLENDER_CRIT ? FRAG_CRIT : slender >= FRAG_SLENDER_WARN ? FRAG_WARN : FRAG_OK;
    if (c) for (const t of I.tris) if (cls[t] < c) cls[t] = c;
    if (!worst || slender > worst.slender) worst = { z: zOf(k) - mn[2], area: I.A, rg: I.rg, above, slender, cls: c };
  }
  return { cls, worst, open, slices: ns };
}

/* Gesamtergebnis je Teil. opts.lineWidth: Linienbreite der Düse in mm.
   cls je Dreieck = schlechtere Klasse aus Wandstärke und Z-Schwäche; level 'ok' | 'warn' | 'critical'. */
function analyzeFragility(geom, opts) {
  const lw = (opts && opts.lineWidth) || FRAG_LINE_WIDTH;
  const bodies = fragBodies(geom.pos, geom.n);
  const th = measureThickness(geom, lw, bodies), zs = measureZSections(geom, lw, bodies.triOut);
  const cls = new Uint8Array(geom.n);
  let critArea = 0, warnArea = 0;
  for (let i = 0; i < geom.n; i++) {
    cls[i] = Math.max(th.cls[i], zs.cls[i]);
    if (cls[i] === FRAG_CRIT) critArea += geom.area[i]; else if (cls[i] === FRAG_WARN) warnArea += geom.area[i];
  }
  const limit = Math.max(FRAG_MIN_AREA, FRAG_MIN_SHARE * geom.total);
  const zc = zs.worst ? zs.worst.cls : FRAG_OK;
  const thinCrit = th.critArea >= limit, thinWarn = th.critArea + th.warnArea >= limit;
  const level = thinCrit || zc === FRAG_CRIT ? 'critical' : thinWarn || zc === FRAG_WARN ? 'warn' : 'ok';
  const reasons = [];
  if (thinCrit || thinWarn) reasons.push('thin');
  if (zc !== FRAG_OK) reasons.push('z');
  return {
    lineWidth: lw, level, reasons, cls, thinCls: th.cls, zCls: zs.cls, thick: th.thick,
    critArea, warnArea, thinCritArea: th.critArea, thinWarnArea: th.warnArea,
    minThick: th.minThick, zWorst: zs.worst, openSegments: zs.open, inverted: bodies.inverted > 0, bodies: bodies.count,
    thresholds: { crit: FRAG_THIN_CRIT * lw, warn: FRAG_THIN_WARN * lw, slenderWarn: FRAG_SLENDER_WARN, slenderCrit: FRAG_SLENDER_CRIT }
  };
}

/* Hinweise mit Vorschlag zu einem Ergebnis von analyzeFragility – nur Text, als Näherung formuliert.
   Die Druckwerte im Tool und im Export bleiben unverändert. Liefert [{ kind: 'thin' | 'z', text }]. */
// Höhe einer schwachen Stelle als Text (ganz unten: „direkt über dem Bett“)
function fragHeightText(z) { return z < 0.5 ? 'direkt über dem Bett' : 'bei ' + z.toFixed(1).replace('.', ',') + ' mm Höhe'; }

const FRAG_DISCLAIMER = 'Näherung aus der Geometrie, keine Festigkeitsberechnung. Die Druckeinstellungen im Tool und im 3MF bleiben unverändert – bei Bedarf selbst in OrcaSlicer anpassen.';
function fragilityAdvice(r) {
  if (!r || r.level === 'ok') return [];
  const fmt = (v, d) => v.toFixed(d).replace('.', ','), out = [], t = r.thresholds;
  if (r.reasons.includes('thin')) {
    const crit = r.thinCritArea >= FRAG_MIN_AREA || (r.minThick !== null && r.minThick < t.crit);
    out.push({ kind: 'thin', text: 'Dünne Wände' + (r.minThick !== null ? ' (dünnste ≈ ' + fmt(r.minThick, 1) + ' mm)' : '') +
      ': unter ' + fmt(t.warn, 1) + ' mm (4 Linienbreiten) passen nur wenige Linien nebeneinander, mehr Wände bringen dort kaum etwas. ' +
      'Falls möglich die Wand im Modell auf mindestens ' + fmt(t.warn, 1) + ' mm verstärken.' +
      (crit ? ' Stellen unter ' + fmt(t.crit, 1) + ' mm in der Slicer-Vorschau prüfen – sie können dünner oder lückenhaft gedruckt werden.' : '') });
  }
  if (r.reasons.includes('z') && r.zWorst) {
    out.push({ kind: 'z', text: 'Schwach in Z ' + fragHeightText(r.zWorst.z) + ' (schmaler Querschnitt, ' + fmt(r.zWorst.above, 0) +
      ' mm Material darüber): Bruchgefahr zwischen den Schichten. Am wirksamsten ist meist eine Lage, in der diese Stelle liegt statt steht. ' +
      'Sonst als Näherung: mehr Wände (z. B. 4) und mehr Füllung (z. B. 30–40 %) vergrößern den tragenden Querschnitt.' });
  }
  return out;
}

/* Schwächt eine Drehung (z. B. der Ausrichtungsvorschlag aus orient.js) das Teil in Z?
   before/after: analyzeFragility für aktuelle und neue Lage. Gemeldet wird nur, wenn das Teil in einer
   der beiden Lagen als kritisch eingestuft ist und die Z-Klasse in der neuen Lage schlechter wird. */
function orientationZCheck(before, after) {
  const zRank = r => (r && r.zWorst ? r.zWorst.cls : 0);
  const critical = before.level === 'critical' || after.level === 'critical';
  const weakens = critical && zRank(after) > zRank(before);
  return {
    weakens,
    before: { level: before.level, slender: before.zWorst ? before.zWorst.slender : 0 },
    after: { level: after.level, slender: after.zWorst ? after.zWorst.slender : 0, z: after.zWorst ? after.zWorst.z : null }
  };
}
function orientationZText(chk) {
  if (!chk || !chk.weakens) return '';
  return 'Achtung Stabilität: In dieser Lage stünde eine schmale Stelle aufrecht' + (chk.after.z !== null ? ' (' + fragHeightText(chk.after.z) + ')' : '') +
    ' – das Teil wird in Z schwächer und kann eher zwischen den Schichten brechen. Weniger Stützen gegen Festigkeit abwägen; bei Funktionsteilen ggf. die aktuelle Lage behalten. (Näherung)';
}
