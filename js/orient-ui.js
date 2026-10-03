'use strict';
/* Bedienung der Ausrichtung je Teil: Vorschlag (js/orient.js), Fläche anklicken, 90°-Tasten, Original.
   Die Drehung wird auf die Originalpunkte angewandt (part.R), damit sich keine Rundungsfehler aufschaukeln. */

const orientCache = new WeakMap();   // Teil → {th, res}
let orientJob = 0;                   // verhindert, dass eine alte Berechnung eine neue überschreibt

const selectedPart = () => project && project.parts[project.selected];
// Makerworld-3MF: Lage des Designers bleibt (Entscheidung 2026-09-26); nur STL-Teile werden gedreht.
const orientable = () => !!project && !project.threemf;
// Sprachwahl (js/i18n.js); ohne sie deutsch
const O_TF = (s, v) => typeof trf === 'function' ? trf(s, v) : s.replace(/\{(\w+)\}/g, (m, k) => v[k]);
const O_NUM = (v, d) => typeof fmtNum === 'function' ? fmtNum(v, d) : de(v, d);
const mm2 = v => O_NUM(v, 0) + ' mm²';

function setPartRotation(part, R) {
  part.R = R;
  part.geom = makeGeom(part.name, rotatePositions(part.origPos, R));
  orientCache.delete(part);
  if (part === selectedPart()) showModel(part.geom); else renderPartList();
}

function orientResult(part, th) {
  const c = orientCache.get(part);
  if (c && c.th === th) return c.res;
  const res = evaluateOrientations(part.origPos, part.R, th);
  orientCache.set(part, { th, res });
  return res;
}

function supportText(s) {
  const total = s.onBed + s.onPart;
  if (total < 1) return O_TF('keine Stützen');
  return O_TF(s.onPart >= 1 ? '{a} Stützen (davon {b} auf dem Teil)' : '{a} Stützen (alle vom Bett)', { a: mm2(total), b: mm2(s.onPart) });
}

// Aufgerufen aus update(): Anzeige sofort, Berechnung kurz danach (kann bei großen Netzen dauern)
function renderOrient() {
  const box = $('orientBox'), part = selectedPart();
  box.classList.toggle('hidden', !part);
  if (!part) return;
  const tools = [...document.querySelectorAll('[data-orient]')];
  tools.forEach(b => { b.disabled = !orientable(); });
  $('orientPart').textContent = project.parts.length > 1 ? part.name : '';
  $('orientAll').classList.toggle('hidden', !orientable() || project.parts.length < 2);
  if (!orientable()) {
    $('orientInfo').classList.remove('busy');
    $('orientInfo').textContent = O_TF('Lage aus der 3MF bleibt erhalten – die Designer legen ihre Teile in der Regel schon richtig hin.');
    $('orientSuggest').classList.add('hidden');
    return;
  }
  const th = +$('thresh').value, cached = orientCache.get(part), job = ++orientJob;
  if (!cached || cached.th !== th) {
    $('orientInfo').textContent = O_TF('Prüfe mögliche Auflageflächen …');
    $('orientInfo').classList.add('busy');   // Fortschrittsbalken (css/ui-neu.css)
    $('orientSuggest').classList.add('hidden');
  }
  setTimeout(() => {
    if (job !== orientJob || part !== selectedPart()) return;
    const res = orientResult(part, th);
    $('orientInfo').classList.remove('busy');
    showOrientResult(part, res);
  }, cached && cached.th === th ? 0 : 30);
}

function showOrientResult(part, res) {
  const c = res.current;
  $('orientInfo').textContent = O_TF(c.contact < MIN_CONTACT_MM2 ? 'Aktuelle Lage: {s} · Auflage {c} – sehr wenig, Kippgefahr.' : 'Aktuelle Lage: {s} · Auflage {c}.', { s: supportText(c), c: mm2(c.contact) });
  const s = res.suggestion;
  $('orientSuggest').classList.toggle('hidden', !s);
  if (s) $('orientSuggestText').textContent = O_TF('Besser: andere Seite aufs Bett – {s}, Auflage {c}, Höhe {h} mm.', { s: supportText(s), c: mm2(s.contact), h: O_NUM(s.height, 1) });
  // Hinweis, falls die neue Lage ein kritisches Teil in Z schwächt (nur Text, js/fragility-ui.js)
  if (s && typeof Stability !== 'undefined') Stability.orientNote(part, s.R, $('orientStab')); else $('orientStab').classList.add('hidden');
}

function pickFace(part) {
  setTab('3d');
  $('btnPick').classList.add('active');
  toast(O_TF('Fläche anklicken, die aufs Bett soll (Esc bricht ab)'));
  Viewer.setPick(true, fi => {
    $('btnPick').classList.remove('active');
    const p = part.geom.pos, o = fi * 9;
    const ux = p[o + 3] - p[o], uy = p[o + 4] - p[o + 1], uz = p[o + 5] - p[o + 2], wx = p[o + 6] - p[o], wy = p[o + 7] - p[o + 1], wz = p[o + 8] - p[o + 2];
    const n = [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx];
    if (!Math.hypot(...n)) return;
    setPartRotation(part, mulMat3(rotationToDown(n), part.R));
    toast(O_TF('Fläche liegt jetzt auf dem Bett'));
  });
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('btnPick').classList.contains('active')) { Viewer.setPick(false); $('btnPick').classList.remove('active'); } });

async function orientAll() {
  const th = +$('thresh').value;
  let changed = 0;
  for (const [i, part] of project.parts.entries()) {
    $('orientInfo').textContent = O_TF('Prüfe Teil {i} von {n} …', { i: i + 1, n: project.parts.length });
    await new Promise(r => setTimeout(r, 0));   // Anzeige zwischendurch aktualisieren
    const res = orientResult(part, th);
    if (res.suggestion) { part.R = res.suggestion.R; part.geom = makeGeom(part.name, rotatePositions(part.origPos, part.R)); orientCache.delete(part); changed++; }
  }
  showModel(selectedPart().geom);
  toast(changed ? O_TF('{c} von {n} Teilen neu ausgerichtet', { c: changed, n: project.parts.length }) : O_TF('Alle Teile liegen bereits gut'));
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-orient]');
  if (!b || b.disabled || !orientable()) return;
  const part = selectedPart(), act = b.dataset.orient, th = +$('thresh').value;
  if (!part) return;
  if (act === 'apply') { const res = orientResult(part, th); if (res.suggestion) setPartRotation(part, res.suggestion.R); }
  else if (act === 'x' || act === 'y' || act === 'z') setPartRotation(part, mulMat3(rotateAxis(act, 90), part.R));
  else if (act === 'reset') setPartRotation(part, IDENTITY3);
  else if (act === 'pick') pickFace(part);
  else if (act === 'all') orientAll();
});
