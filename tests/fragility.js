'use strict';
/* Prüft die Fragilitätsanalyse (js/fragility.js) an Prüfkörpern mit bekannten Maßen:
   Wände 0,6 / 1,2 / 3 mm, Stift Ø 3 × 25 mm, Steg 1 × 4 mm, 1,2-mm-Wand stehend und liegend,
   umgedrehte Normalen, Laufzeit bei ~190.000 Dreiecken. Optional FRAG3MF=<Pfad>: echte Mehrteile-3MF
   (Teile, Slots und Geometrie dürfen sich durch die Analyse nicht ändern). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const fflate = require('../vendor/fflate.min.js');

const ROOT = path.join(__dirname, '..');
const ctx = vm.createContext({ console, TextDecoder });
for (const f of ['util', 'stl', 'import', 'orient', 'fragility'])
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
const K = vm.runInContext('({analyzeFragility, fragBuildGrid, fragCastRay, makeGeom, importModels, rotatePositions, rotateAxis})', ctx);

let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) pass++; else { fail++; console.log('FEHLER ' + name + (detail !== undefined ? ': ' + detail : '')); } }
const LW = 0.42;
const noRed = (cls, [a, b] = [0, cls.length]) => { for (let i = a; i < b; i++) if (cls[i] === 2) return false; return true; };   // 0,4-Düse: kritisch < 0,84 mm, dünn < 1,68 mm

// Quader mit nach außen zeigenden Normalen (12 Dreiecke)
function box(x0, y0, z0, x1, y1, z1) {
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  return f.map(t => t.map(i => v[i]));
}
// Zylinder (senkrecht) mit Deckeln
function cylinder(cx, cy, r, z0, z1, seg = 24) {
  const tris = [];
  for (let i = 0; i < seg; i++) {
    const a = 2 * Math.PI * i / seg, b = 2 * Math.PI * (i + 1) / seg;
    const pa = [cx + r * Math.cos(a), cy + r * Math.sin(a)], pb = [cx + r * Math.cos(b), cy + r * Math.sin(b)];
    tris.push([[cx, cy, z1], [...pa, z1], [...pb, z1]], [[cx, cy, z0], [...pb, z0], [...pa, z0]]);
    tris.push([[...pa, z0], [...pb, z0], [...pb, z1]], [[...pa, z0], [...pb, z1], [...pa, z1]]);
  }
  return tris;
}
function sphere(r, lat, lon) {
  const p = (i, j) => { const t = Math.PI * i / lat, f = 2 * Math.PI * j / lon; return [r * Math.sin(t) * Math.cos(f), r * Math.sin(t) * Math.sin(f), r + r * Math.cos(t)]; };
  const tris = [];
  for (let i = 0; i < lat; i++) for (let j = 0; j < lon; j++) {
    const a = p(i, j), b = p(i + 1, j), c = p(i + 1, j + 1), d = p(i, j + 1);
    if (i > 0) tris.push([a, b, d]);
    if (i < lat - 1) tris.push([b, c, d]);
  }
  return tris;
}
// Mehrere Körper zu einem Netz; liefert Positionen und je Körper den Dreiecksbereich
function build(bodies) {
  const ranges = {}, all = [];
  for (const [name, tris] of bodies) { ranges[name] = [all.length, all.length + tris.length]; for (const t of tris) all.push(t); }
  return { pos: Float32Array.from(all.flat(2)), ranges };
}
// Häufigste Klasse eines Körpers (nach Fläche) und höchste Klasse
function classOf(g, f, [a, b]) {
  const area = [0, 0, 0];
  let max = 0;
  for (let i = a; i < b; i++) { area[f.cls[i]] += g.area[i]; max = Math.max(max, f.cls[i]); }
  return { main: area.indexOf(Math.max(...area)), max };
}

// 1) Prüfkörper: Grundplatte mit Wänden, Stift und Steg
const spec = build([
  ['platte', box(0, 0, 0, 60, 40, 3)],
  ['wand06', box(5, 5, 3, 5.6, 35, 23)],
  ['wand12', box(15, 5, 3, 16.2, 35, 23)],
  ['wand30', box(25, 5, 3, 28, 35, 23)],
  ['stift', cylinder(40, 20, 1.5, 3, 28)],
  ['block1', box(48, 5, 3, 54, 11, 13)],
  ['block2', box(48, 29, 3, 54, 35, 13)],
  ['steg', box(50.5, 11, 9, 51.5, 29, 13)]
]);
let g = K.makeGeom('pruefkoerper', spec.pos);
let t0 = Date.now(), f = K.analyzeFragility(g, { lineWidth: LW });
console.log('Prüfkörper: ' + g.n + ' Dreiecke in ' + (Date.now() - t0) + ' ms, Stufe ' + f.level + ', Z am schwächsten: ' + JSON.stringify(f.zWorst && { z: +f.zWorst.z.toFixed(1), slender: +f.zWorst.slender.toFixed(0) }));
const c = name => classOf(g, f, spec.ranges[name]);
check('0,6-mm-Wand kritisch', c('wand06').main === 2, JSON.stringify(c('wand06')));
check('1,2-mm-Wand dünn (gelb)', c('wand12').main === 1, JSON.stringify(c('wand12')));
check('3-mm-Wand stabil', c('wand30').max === 0, JSON.stringify(c('wand30')));
check('Stift Ø 3 × 25 mm: in Z schwach (gelb)', c('stift').main === 1, JSON.stringify(c('stift')));
check('Steg 1 × 4 mm dünn (gelb)', c('steg').main === 1, JSON.stringify(c('steg')));
check('Blöcke stabil', c('block1').max === 0 && c('block2').max === 0, JSON.stringify([c('block1'), c('block2')]));
check('Grundplatte überwiegend stabil', c('platte').main === 0, JSON.stringify(c('platte')));
check('Gesamtstufe kritisch, Gründe dünn + Z', f.level === 'critical' && f.reasons.includes('thin') && f.reasons.includes('z'), f.level + ' ' + f.reasons);
check('dünnste Stelle ≈ 0,6 mm', f.minThick !== null && Math.abs(f.minThick - 0.6) < 0.05, f.minThick);
check('Konturen geschlossen', f.openSegments === 0, f.openSegments);
// Wandstärke gegen das Sollmaß (unabhängig vom Rechenweg: Maße stehen in der Konstruktion)
const thickOf = name => { const [a, b] = spec.ranges[name]; const v = []; for (let i = a; i < b; i++) if (Math.abs(g.ang[i]) < 1) v.push(f.thick[i]); v.sort((p, q) => p - q); return v[0]; };
check('Wandstärke gemessen 0,6 / 1,2 mm', Math.abs(thickOf('wand06') - 0.6) < 1e-3 && Math.abs(thickOf('wand12') - 1.2) < 1e-3, thickOf('wand06') + ' / ' + thickOf('wand12'));

// 2) Dieselbe 1,2-mm-Wand stehend und liegend
const standing = K.makeGeom('stehend', build([['w', box(0, 0, 0, 1.2, 30, 20)]]).pos);
const lying = K.makeGeom('liegend', build([['w', box(0, 0, 0, 30, 20, 1.2)]]).pos);
const fs1 = K.analyzeFragility(standing, { lineWidth: LW }), fl = K.analyzeFragility(lying, { lineWidth: LW });
console.log('1,2-mm-Wand stehend: ' + fs1.level + ' ' + fs1.reasons + ', Schlankheit ' + (fs1.zWorst ? fs1.zWorst.slender.toFixed(0) : '-') +
  ' · liegend: ' + fl.level + ' ' + fl.reasons + ', Schlankheit ' + (fl.zWorst ? fl.zWorst.slender.toFixed(1) : '-'));
check('stehend: dünn und in Z schwach', fs1.reasons.includes('thin') && fs1.reasons.includes('z'), fs1.reasons);
check('liegend: dünn, aber nicht in Z schwach', fl.reasons.includes('thin') && !fl.reasons.includes('z'), fl.reasons);
check('stehend deutlich schlanker als liegend', fs1.zWorst.slender > 10 * fl.zWorst.slender, fs1.zWorst.slender + ' / ' + fl.zWorst.slender);
// Gedreht mit den Werkzeugen der Ausrichtung: liegend → 90° um Y = stehend
const turned = K.makeGeom('gedreht', K.rotatePositions(lying.pos, K.rotateAxis('y', 90)));
const ft = K.analyzeFragility(turned, { lineWidth: LW });
check('liegende Wand um 90° gedreht wird in Z schwach', ft.reasons.includes('z'), ft.reasons);

// 3) Umgedrehte Normalen (Dreiecke falsch herum) → gleiche Einstufung
const flipped = Float32Array.from(spec.pos);
for (let i = 0; i < flipped.length; i += 9) for (let k = 0; k < 3; k++) { const t = flipped[i + 3 + k]; flipped[i + 3 + k] = flipped[i + 6 + k]; flipped[i + 6 + k] = t; }
const gf = K.makeGeom('umgedreht', flipped), ff = K.analyzeFragility(gf, { lineWidth: LW });
check('umgedrehte Normalen erkannt', ff.inverted === true);
check('umgedrehte Normalen: gleiche Klassen je Dreieck', ff.cls.every((v, i) => v === f.cls[i]), ff.cls.reduce((s, v, i) => s + (v !== f.cls[i]), 0) + ' abweichend');

// 4) Düse 0,6 (Linie 0,62): die 1,2-mm-Wand wird kritisch, die 3-mm-Wand bleibt stabil
const f6 = K.analyzeFragility(g, { lineWidth: 0.62 });
check('Düse 0,6: 1,2-mm-Wand kritisch', classOf(g, f6, spec.ranges.wand12).main === 2);
check('Düse 0,6: 3-mm-Wand stabil', classOf(g, f6, spec.ranges.wand30).max === 0);

// 5) Kugel Ø 40 (Auflage auf einem Punkt) und Laufzeit bei ~190.000 Dreiecken
const big = K.makeGeom('kugel', build([['k', sphere(20, 320, 300)]]).pos);
t0 = Date.now();
const fb = K.analyzeFragility(big, { lineWidth: LW });
const ms = Date.now() - t0;
console.log('Kugel ' + big.n + ' Dreiecke: ' + ms + ' ms, Stufe ' + fb.level + ', Schlankheit ' + (fb.zWorst ? fb.zWorst.slender.toFixed(0) : '-'));
check('Kugel: keine dünnen Wände', !fb.reasons.includes('thin'), fb.reasons);
check('Laufzeit 190.000 Dreiecke < 8 s', ms < 8000, ms);

// 5b) Fälle aus der Prüfung 2026-10-02 (Sollwerte analytisch, nicht aus dem eigenen Rechenweg)
const pinOnly = K.makeGeom('stift', build([['s', cylinder(0, 0, 1.5, 0, 25)]]).pos), fp = K.analyzeFragility(pinOnly, { lineWidth: LW });
// Trägheitsradius Vollkreis r/2 = 0,75 (24-Eck etwas kleiner); Material darüber 25 − 0,1 → ≈ 33
check('Stift: Schlankheit ≈ 25 / 0,75 (±5 %)', fp.zWorst && Math.abs(fp.zWorst.slender - 24.9 / 0.75) / 33.2 < 0.05, fp.zWorst && fp.zWorst.slender);
{
  const isl = vm.runInContext('fragIslands', ctx), seg = [];
  const a = 0.7, rot = ([x, y]) => [100 + x * Math.cos(a) - y * Math.sin(a), 200 + x * Math.sin(a) + y * Math.cos(a)];
  const P = [[0, 0], [2, 0], [2, 20], [0, 20]].map(rot);
  for (let i = 0; i < 4; i++) seg.push([...P[i], ...P[(i + 1) % 4], 0]);
  const I = isl(seg, new Int8Array(1).fill(1)).islands[0];
  check('Rechteck 2 × 20, gedreht und verschoben: Fläche 40, Trägheitsradius 2/√12', Math.abs(I.A - 40) < 1e-9 && Math.abs(I.rg - 2 / Math.sqrt(12)) < 1e-9, I.A + ' / ' + I.rg);
}
for (const R of [10, 20]) {
  const fk = K.analyzeFragility(K.makeGeom('kugel', build([['k', sphere(R, 60, 60)]]).pos), { lineWidth: LW });
  check('Befund Kugel/Kegel – Kugel R ' + R + ' auf dem Bett: nicht rot, nicht schwach', noRed(fk.cls) && fk.level === 'ok', fk.level + ' ' + (fk.zWorst && fk.zWorst.slender));
}
{ // Kegel mit Spitze nach unten (Höhe 20, Radius oben 20)
  const tris = [], seg = 32;
  for (let i = 0; i < seg; i++) {
    const a = 2 * Math.PI * i / seg, b = 2 * Math.PI * (i + 1) / seg, pa = [20 * Math.cos(a), 20 * Math.sin(a), 20], pb = [20 * Math.cos(b), 20 * Math.sin(b), 20];
    tris.push([[0, 0, 0], pb, pa], [[0, 0, 20], pa, pb]);
  }
  const fc = K.analyzeFragility(K.makeGeom('kegel', build([['k', tris]]).pos), { lineWidth: LW });
  // Die Spitze selbst ist dünn (< 2 Linien) und darf über die Wandstärke rot sein; Z darf nichts rot färben
  check('Befund Kugel/Kegel – Kegel auf der Spitze: in Z nicht rot, nicht schwach', noRed(fc.zCls) && !fc.reasons.includes('z'), fc.zWorst && fc.zWorst.slender);
}
{ // 45°-Leiste 1,2 mm × 3 mm hoch + hoher Turm in der leeren Ecke ihres Begrenzungsrechtecks
  const L = 30, c = Math.SQRT1_2, t = 1.2;
  const q = [[0, 0], [L * c, L * c], [L * c - t * c, L * c + t * c], [-t * c, t * c]];
  const prism = (pts, z0, z1) => { const r = []; const n = pts.length;
    for (let i = 1; i < n - 1; i++) r.push([[...pts[0], z1], [...pts[i], z1], [...pts[i + 1], z1]], [[...pts[0], z0], [...pts[i + 1], z0], [...pts[i], z0]]);
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; r.push([[...a, z0], [...b, z0], [...b, z1]], [[...a, z0], [...b, z1], [...a, z1]]); }
    return r; };
  const lb = build([['leiste', prism(q, 0, 3)], ['turm', box(18, 0, 0, 21, 3, 40)]]), gl = K.makeGeom('leiste', lb.pos);
  const fl2 = K.analyzeFragility(gl, { lineWidth: LW });
  // vorher: 8 von 12 Leisten-Dreiecken kritisch (Höhe des Turms als Material darüber); jetzt nur dünn (1,2 mm)
  check('Befund Material darüber – Leiste neben hohem Turm: nicht rot', noRed(fl2.cls, lb.ranges.leiste) && classOf(gl, fl2, lb.ranges.leiste).max === 1, JSON.stringify(classOf(gl, fl2, lb.ranges.leiste)));
}
{ // Eingebetteter, bündiger Körper (10 × 10 × 1 in der Oberseite eines Blocks) erzeugt keine dünne Wand
  const eb = K.makeGeom('eingebettet', build([['block', box(0, 0, 0, 30, 30, 10)], ['einlage', box(10, 10, 9, 20, 20, 10)]]).pos);
  const fe = K.analyzeFragility(eb, { lineWidth: LW });
  check('Befund eingebettete Körper – Block mit bündiger Einlage: nicht rot, keine dünnen Stellen', noRed(fe.cls) && fe.thinWarnArea + fe.thinCritArea === 0 && fe.bodies === 2, fe.thinWarnArea + fe.thinCritArea);
}
{ // Nur ein Körper falsch herum (Stift umgedreht auf normaler Platte) → gleiche Klassen wie ganz richtig
  const ok = build([['platte', box(0, 0, 0, 20, 20, 3)], ['stift', cylinder(10, 10, 1.5, 3, 28)]]);
  const bad = Float32Array.from(ok.pos), [a, b] = ok.ranges.stift;
  for (let i = a * 9; i < b * 9; i += 9) for (let k = 0; k < 3; k++) { const t = bad[i + 3 + k]; bad[i + 3 + k] = bad[i + 6 + k]; bad[i + 6 + k] = t; }
  const f1 = K.analyzeFragility(K.makeGeom('', ok.pos), { lineWidth: LW }), f2 = K.analyzeFragility(K.makeGeom('', bad), { lineWidth: LW });
  check('Befund umgedrehte Normalen – ein Körper umgedreht: nicht rot, gleiche Klassen, erkannt', noRed(f2.cls) && f2.inverted && f1.cls.every((v, i) => v === f2.cls[i]) && f1.level === f2.level && f1.level === 'warn', f1.level + '/' + f2.level);
}
{ // Raster gegen Brute Force, synthetisch (immer): Prüfkörper, Strahlen beider Richtungen
  const P = spec.pos, gg = K.makeGeom('', P), grid = K.fragBuildGrid(P, gg.n, gg.mn, gg.mx, gg.total);
  const all = { cs: 1e9, dims: [1, 1, 1], cells: new Map([[0, [...Array(gg.n).keys()]]]), mn: gg.mn, stamp: new Int32Array(gg.n), ray: 0 };
  let diff = 0, hits = 0;
  for (let i = 0; i < gg.n; i++) for (const s of [-1, 1]) {
    const o = i * 9, u = [0, 1, 2].map(k => P[o + 3 + k] - P[o + k]), w = [0, 1, 2].map(k => P[o + 6 + k] - P[o + k]);
    const nn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(...nn);
    const c3 = [0, 1, 2].map(k => (P[o + k] + P[o + 3 + k] + P[o + 6 + k]) / 3), d = nn.map(v => s * v / l);
    const x = K.fragCastRay(P, grid, i, ...c3, ...d, 50, -s), y = K.fragCastRay(P, all, i, ...c3, ...d, 50, -s);
    if (y < Infinity) hits++;
    if (!(x === y || Math.abs(x - y) < 1e-6)) diff++;
  }
  check('Raster = Brute Force (Prüfkörper, ' + hits + ' Treffer)', diff === 0 && hits > 100, diff);
}

// 6) Echte Mehrteile-3MF: Analyse ändert weder Teile, Slots noch Geometrie
const real = process.env.FRAG3MF;
if (real && fs.existsSync(real)) {
  const r = K.importModels([{ name: path.basename(real), bytes: new Uint8Array(fs.readFileSync(real)) }], fflate);
  const before = r.parts.map(p => ({ name: p.name, extruder: p.extruder, plate: p.plate, sum: p.pos.reduce((s, v) => s + v, 0), len: p.pos.length }));
  for (const p of r.parts) {
    const pg = K.makeGeom(p.name, p.pos);
    t0 = Date.now();
    const pf = K.analyzeFragility(pg, { lineWidth: LW });
    console.log('  Slot ' + p.extruder + '  ' + p.name.padEnd(30) + pf.level.padEnd(9) + (pf.reasons.join('+') || '-').padEnd(7) +
      ' dünnste ' + (pf.minThick === null ? '-' : pf.minThick.toFixed(2) + ' mm') + ', Z ' + (pf.zWorst ? pf.zWorst.slender.toFixed(0) : '-') +
      ', offen ' + pf.openSegments + ', ' + (Date.now() - t0) + ' ms');
    check(p.name + ': Ergebnis vollständig', pf.cls.length === pg.n && ['ok', 'warn', 'critical'].includes(pf.level));
  }
  // Raster gegen Brute Force: derselbe Strahl gegen alle Dreiecke in einer einzigen Zelle
  {
    const pg = K.makeGeom('', r.parts[0].pos), P = pg.pos, maxT = 10;   // länger als im Betrieb, damit genug Treffer verglichen werden
    const grid = K.fragBuildGrid(P, pg.n, pg.mn, pg.mx, pg.total);
    const all = { cs: 1e9, dims: [1, 1, 1], cells: new Map([[0, [...Array(pg.n).keys()]]]), mn: pg.mn, stamp: new Int32Array(pg.n), ray: 0 };
    let diff = 0, hits = 0, tested = 0;
    for (let i = 0; i < pg.n; i += 7) {
      const o = i * 9, u = [0, 1, 2].map(k => P[o + 3 + k] - P[o + k]), w = [0, 1, 2].map(k => P[o + 6 + k] - P[o + k]);
      const nn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(...nn);
      if (!l) continue;
      const c3 = [0, 1, 2].map(k => (P[o + k] + P[o + 3 + k] + P[o + 6 + k]) / 3), d = nn.map(v => -v / l);
      const a = K.fragCastRay(P, grid, i, ...c3, ...d, maxT, 1), b = K.fragCastRay(P, all, i, ...c3, ...d, maxT, 1);
      tested++; if (b < Infinity) hits++;
      if (!(a === b || Math.abs(a - b) < 1e-6)) diff++;
    }
    console.log('Raster vs. Brute Force: ' + tested + ' Strahlen, ' + hits + ' Treffer, ' + diff + ' abweichend');
    check('Raster liefert dieselben Abstände wie Brute Force', diff === 0 && hits > 0, diff + ' / ' + hits);
  }
  const after = r.parts.map(p => ({ name: p.name, extruder: p.extruder, plate: p.plate, sum: p.pos.reduce((s, v) => s + v, 0), len: p.pos.length }));
  check('3MF: Teile, Slots, Platten und Geometrie unverändert', JSON.stringify(before) === JSON.stringify(after));
  check('3MF: 9 Teile, alle Slot 3', r.parts.length === 9 && r.parts.every(p => p.extruder === 3), r.parts.map(p => p.extruder).join(','));
}

console.log(pass + '/' + (pass + fail) + ' bestanden');
process.exit(fail ? 1 : 0);
