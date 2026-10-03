'use strict';
/* Bohrlöcher erkennen und als Orca-Modifikator (100 % Füllung) verstärken. Kein DOM –
   tests/holes.js prüft das in Node, tests/verify-3mf.js mit der Orca-CLI.
   Gesucht werden runde Löcher entlang der drei Achsen des Teils (senkrecht und waagerecht):
   zusammenhängende Wandflächen parallel zur Achse, deren Normalen nach innen auf eine gemeinsame
   Achse zeigen und die einen Kreis fast vollständig umschließen. */

const HOLE_MIN_R = 0.75, HOLE_MAX_R = 15;   // mm: M1,5 … M30-Durchgang
const HOLE_MIN_DEPTH = 1;                   // mm
const HOLE_AXIS_TOL = 0.1;                  // |n·Achse| darunter: Wand parallel zur Achse (Löcher bis ~3° Neigung)
const HOLE_MAX_GAP_DEG = 90;                // größte Lücke im Umfang (offene Schlitze fallen raus)
const HOLE_MIN_INWARD = 0.8;                // Normalen zeigen im Mittel so stark zur Achse
const HOLE_MIN_TRIS = 8;
const HOLE_RING_MM = 3;                     // Verstärkung rund um das Loch
const HOLE_SEGMENTS = 32;                   // Zylinder des Modifikators
// Achse → Indizes der Koordinaten (u, v quer zur Achse, w entlang)
const HOLE_AXES = { z: [0, 1, 2], x: [1, 2, 0], y: [2, 0, 1] };

// Kreis durch Punkte (algebraische Anpassung nach Kåsa): Mittelpunkt, Radius, mittlere Abweichung
function fitCircle(pts) {
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
  for (const [x, y] of pts) { const z = x * x + y * y; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z; }
  const n = pts.length;
  // Normalgleichungen für x² + y² + D·x + E·y + F = 0
  const A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]], b = [-sxz, -syz, -sz];
  const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const d = det(A);
  if (Math.abs(d) < 1e-12) return null;
  const col = (k) => A.map((row, i) => row.map((v, j) => (j === k ? b[i] : v)));
  const D = det(col(0)) / d, E = det(col(1)) / d, F = det(col(2)) / d;
  const cx = -D / 2, cy = -E / 2, r2 = cx * cx + cy * cy - F;
  if (!(r2 > 0)) return null;
  const r = Math.sqrt(r2);
  const err = pts.reduce((s, [x, y]) => s + Math.abs(Math.hypot(x - cx, y - cy) - r), 0) / n;
  return { cx, cy, r, err };
}

/* Findet Löcher in geom (makeGeom). Ergebnis: [{axis, c:[u,v], r, w0, w1, depth, id}], sortiert nach
   Achse und Lage. u/v/w sind die Koordinaten laut HOLE_AXES (bei z: x, y, z). */
function findHoles(geom) {
  const pos = geom.pos, n = geom.n, holes = [], arcs = [];
  /* Normalen und Eckpunkt-Schlüssel einmal für alle drei Achsen (gemeldet 2026-10-03: 1,25 Mio. Dreiecke,
     ~5 s – je Achse neu gerechnet, mit Millionen kleiner Hilfsfelder). Gleiche Rechnung, gleiche Werte. */
  const nrm = new Float64Array(n * 3), nlen = new Float64Array(n);
  for (let t = 0; t < n; t++) {
    const o = t * 9;
    const ax = pos[o + 3] - pos[o], ay = pos[o + 4] - pos[o + 1], az = pos[o + 5] - pos[o + 2];
    const bx = pos[o + 6] - pos[o], by = pos[o + 7] - pos[o + 1], bz = pos[o + 8] - pos[o + 2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    nrm[t * 3] = nx; nrm[t * 3 + 1] = ny; nrm[t * 3 + 2] = nz; nlen[t] = Math.hypot(nx, ny, nz);
  }
  const keys = new Array(n * 3);
  const vkey = o => keys[o / 3] || (keys[o / 3] = Math.round(pos[o] * 1e4) + ',' + Math.round(pos[o + 1] * 1e4) + ',' + Math.round(pos[o + 2] * 1e4));
  for (const [axis, [iu, iv, iw]] of Object.entries(HOLE_AXES)) {
    // 1) Wände parallel zur Achse
    const cand = [];
    for (let t = 0; t < n; t++) {
      const len = nlen[t];
      if (!len || Math.abs(nrm[t * 3 + iw] / len) > HOLE_AXIS_TOL) continue;
      cand.push({ t, nu: nrm[t * 3 + iu] / len, nv: nrm[t * 3 + iv] / len });
    }
    if (cand.length < HOLE_MIN_TRIS) continue;
    // 2) Zusammenhängende Flächen (gemeinsame Eckpunkte)
    const parent = cand.map((_, i) => i), find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const seen = new Map();
    cand.forEach((c, i) => {
      for (let v = 0; v < 3; v++) {
        const o = c.t * 9 + v * 3, key = vkey(o);
        const j = seen.get(key);
        if (j === undefined) seen.set(key, i); else { const a = find(i), b = find(j); if (a !== b) parent[a] = b; }
      }
    });
    const groups = new Map();
    cand.forEach((c, i) => { const r = find(i); (groups.get(r) || groups.set(r, []).get(r)).push(c); });
    // 3) Kreis prüfen: rund, nach innen gerichtet, fast geschlossen
    for (const g of groups.values()) {
      if (g.length < HOLE_MIN_TRIS) continue;
      const pts = [];
      let w0 = Infinity, w1 = -Infinity;
      for (const c of g) for (let v = 0; v < 3; v++) {
        const o = c.t * 9 + v * 3;
        pts.push([pos[o + iu], pos[o + iv]]);
        w0 = Math.min(w0, pos[o + iw]); w1 = Math.max(w1, pos[o + iw]);
      }
      const fit = fitCircle(pts);
      if (!fit || fit.r < HOLE_MIN_R || fit.r > HOLE_MAX_R || fit.err > 0.03 * fit.r + 0.05 || w1 - w0 < HOLE_MIN_DEPTH) continue;
      let inward = 0;
      const angles = [];
      for (const c of g) {
        const o = c.t * 9, pu = (pos[o + iu] + pos[o + 3 + iu] + pos[o + 6 + iu]) / 3, pv = (pos[o + iv] + pos[o + 3 + iv] + pos[o + 6 + iv]) / 3;
        const du = fit.cx - pu, dv = fit.cy - pv, dl = Math.hypot(du, dv) || 1;
        inward += (c.nu * du + c.nv * dv) / dl;
        angles.push(Math.atan2(-du, -dv));
      }
      if (inward / g.length < HOLE_MIN_INWARD) continue;   // Außenseite eines Zapfens, kein Loch
      arcs.push({ axis, c: [fit.cx, fit.cy], r: fit.r, w0, w1, angles });
    }
  }
  /* Teilbögen auf demselben Kreis zusammenfassen: eine von einem Steg unterbrochene Lochwand zerfällt
     sonst in zwei Gruppen, die einzeln am Lückentest scheitern (Befund der Prüfung 2026-09-26). */
  const same = (a, b) => a.axis === b.axis && Math.hypot(a.c[0] - b.c[0], a.c[1] - b.c[1]) < 0.1 * a.r + 0.05 &&
    Math.abs(a.r - b.r) < 0.05 * a.r + 0.05 && a.w0 < b.w1 + 0.05 && b.w0 < a.w1 + 0.05;
  const merged = [];
  for (const a of arcs) {
    const m = merged.find(x => same(x, a));
    if (!m) { merged.push({ ...a, angles: a.angles.slice() }); continue; }
    m.angles.push(...a.angles); m.w0 = Math.min(m.w0, a.w0); m.w1 = Math.max(m.w1, a.w1);
  }
  for (const m of merged) {
    const angles = m.angles.sort((a, b) => a - b);
    let gap = angles[0] + 2 * Math.PI - angles[angles.length - 1];
    for (let k = 1; k < angles.length; k++) gap = Math.max(gap, angles[k] - angles[k - 1]);
    if (gap * 180 / Math.PI > HOLE_MAX_GAP_DEG) continue;
    holes.push({ axis: m.axis, c: m.c, r: m.r, w0: m.w0, w1: m.w1, depth: m.w1 - m.w0 });
  }
  const order = { z: 0, x: 1, y: 2 };
  holes.sort((a, b) => order[a.axis] - order[b.axis] || a.c[1] - b.c[1] || a.c[0] - b.c[0]);
  holes.forEach((h, i) => { h.id = i + 1; });
  return holes;
}

// Zylinder als Modifikator-Netz (Dreiecke in Teilkoordinaten, flach wie pos)
function holeModifierMesh(h, ring = HOLE_RING_MM, seg = HOLE_SEGMENTS) {
  const [iu, iv, iw] = HOLE_AXES[h.axis], R = h.r + ring, tris = [];
  const P = (a, w) => { const p = [0, 0, 0]; p[iu] = h.c[0] + R * Math.cos(a); p[iv] = h.c[1] + R * Math.sin(a); p[iw] = w; return p; };
  const C = w => { const p = [0, 0, 0]; p[iu] = h.c[0]; p[iv] = h.c[1]; p[iw] = w; return p; };
  // Achsen x und y sind zyklisch vertauscht (u,v,w bleibt rechtshändig) → gleiche Umlaufrichtung
  for (let k = 0; k < seg; k++) {
    const a = 2 * Math.PI * k / seg, b = 2 * Math.PI * (k + 1) / seg;
    const p0 = P(a, h.w0), p1 = P(b, h.w0), q0 = P(a, h.w1), q1 = P(b, h.w1);
    tris.push(p0, p1, q1, p0, q1, q0);            // Mantel, Normale nach außen
    tris.push(C(h.w1), q0, q1, C(h.w0), p1, p0);  // Deckel oben/unten
  }
  return Float32Array.from(tris.flat());
}
