'use strict';
/* Bohrlöcher verstärken – nur als Vorschlag (Entscheidung 2026-09-26): erkannte Löcher des gewählten
   Teils mit Häkchen; angehakte bekommen beim 3MF-Export einen Orca-Modifikator mit 100 % Füllung.
   Nach einer Drehung wird neu erkannt und die Auswahl zurückgesetzt (die Lage der Löcher ändert sich).
   Auch für übernommene Orca-/Bambu-3MF: export3mf.js hängt die Modifikatoren dort ans Objekt an. */

const AXIS_LABEL = { z: 'senkrecht', x: 'waagerecht (X)', y: 'waagerecht (Y)' };
// Sprachwahl (js/i18n.js); ohne sie deutsch
const H_TF = (s, v) => typeof trf === 'function' ? trf(s, v) : s.replace(/\{(\w+)\}/g, (m, k) => v[k]);
const H_NUM = (v, d) => typeof num === 'function' ? num(v, d) : de(v, d);


function partHoles(part) {
  if (part.holeGeom !== part.geom) { part.holeCands = findHoles(part.geom); part.holeGeom = part.geom; part.holes = []; }
  return part.holeCands;
}

function renderHoles() {
  const box = $('holeBox'), part = project && project.parts[project.selected];
  const usable = !!part;
  box.classList.toggle('hidden', !usable);
  if (!usable) return;
  const cands = partHoles(part), chosen = new Set((part.holes || []).map(h => h.id)), g = part.geom;
  $('holeInfo').textContent = cands.length
    ? H_TF(cands.length === 1 ? '{n} rundes Loch erkannt. Angehakte bekommen in Orca einen Ring von {ring} mm mit 100 % Füllung – die Last verteilt sich besser.' : '{n} runde Löcher erkannt. Angehakte bekommen in Orca einen Ring von {ring} mm mit 100 % Füllung – die Last verteilt sich besser.', { n: cands.length, ring: H_NUM(HOLE_RING_MM, 0) })
    : H_TF('Keine runden Löcher erkannt.');
  $('holeList').innerHTML = cands.map(h => {
    const [iu, iv] = HOLE_AXES[h.axis], at = H_TF('bei {a} {u} / {b} {v} mm', { a: 'xyz'[iu], u: H_NUM(h.c[0] - g.mn[iu], 0), b: 'xyz'[iv], v: H_NUM(h.c[1] - g.mn[iv], 0) });
    return '<li><label><input type="checkbox" data-hole="' + h.id + '"' + (chosen.has(h.id) ? ' checked' : '') + '>' +
      '<span><b>' + H_TF('Loch {id}', { id: h.id }) + '</b> · Ø ' + H_NUM(2 * h.r, 1) + ' mm · ' + H_TF('{d} mm tief', { d: H_NUM(h.depth, 1) }) + ' · ' + H_TF(AXIS_LABEL[h.axis]) + '<small>' + at + '</small></span></label></li>';
  }).join('');
  $('holeAll').classList.toggle('hidden', cands.length < 2);
}

$('holeList').addEventListener('change', e => {
  const cb = e.target.closest('[data-hole]'); if (!cb) return;
  const part = project.parts[project.selected], cands = partHoles(part);
  const ids = new Set((part.holes || []).map(h => h.id));
  if (cb.checked) ids.add(+cb.dataset.hole); else ids.delete(+cb.dataset.hole);
  part.holes = cands.filter(h => ids.has(h.id));
});
$('holeAll').addEventListener('click', () => {
  const part = project.parts[project.selected], cands = partHoles(part);
  part.holes = part.holes && part.holes.length === cands.length ? [] : cands.slice();
  renderHoles();
});
