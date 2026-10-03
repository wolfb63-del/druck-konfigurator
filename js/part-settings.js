'use strict';
/* Werte je Teil: Das Formular links zeigt die Einstellungen des gewählten Teils. Jedes Teil merkt sich
   Filament, Objektart, Priorität, Belastung, Support, Stützreduzierung und seinen Slot. Beim Export
   bekommt jedes Teil sein eigenes Ergebnis (partJobs); export3mf.js schreibt Abweichungen als
   Objekt-Einstellung und die Filamentwerte je Slot. */

// Sprachwahl (js/i18n.js); ohne sie deutsch
const S_TF = (s, v) => typeof trf === 'function' ? trf(s, v) : s.replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m));

const PART_FIELDS = ['material', 'object', 'goal', 'load', 'support', 'supportLevel'];
const formSnapshot = () => Object.fromEntries(PART_FIELDS.map(id => [id, $(id).value]));

// Beim Laden: alle Teile starten mit der aktuellen Auswahl
function initPartInputs(parts) {
  const snap = formSnapshot();
  parts.forEach(p => { if (!p.input) p.input = { ...snap }; });
}
function loadPartIntoForm(part) {
  if (!part.input) return;
  // Gibt es den gespeicherten Wert nicht mehr (z. B. Filament gelöscht), gilt die erste Option –
  // sonst bliebe die Auswahl des vorher gewählten Teils stehen und würde übernommen.
  for (const id of PART_FIELDS) {
    const sel = $(id), v = part.input[id];
    sel.value = [...sel.options].some(o => o.value === v) ? v : (sel.options[0] || {}).value;
  }
}
// Aus update(): aktuelle Auswahl gehört zum gewählten Teil
function savePartFromForm() {
  const p = project && project.parts[project.selected];
  if (p) p.input = formSnapshot();
}

// Slots des aktuellen Druckers: live vom Drucker, sonst aus der Orca-Vorlage
function slotChoices() {
  const r = lastResult, tpl = r && exportTemplate(r.printer.id, r.dSel);
  return tpl ? dialogSlots(tpl) : [];
}

function renderPartScope() {
  const multi = !!project && project.parts.length > 1;
  $('partScope').classList.toggle('hidden', !multi);
  if (!multi) return;
  const p = project.parts[project.selected], sel = $('partSlot'), slots = slotChoices();
  $('partScopeName').textContent = p.name;
  sel.innerHTML = '<option value="">wie beim Export gewählt</option>' +
    slots.map(s => '<option value="' + s.idx + '">' + S_TF('Slot {n}', { n: s.idx + 1 }) + (s.type ? ' · ' + esc(s.type) : '') + '</option>').join('');
  sel.value = p.slot === null || p.slot === undefined || p.slot >= slots.length ? '' : String(p.slot);
}
$('partSlot').addEventListener('change', () => {
  const p = project.parts[project.selected], v = $('partSlot').value;
  p.slot = v === '' ? null : +v;
  update();
});

// Je Teil ein eigenes Ergebnis; Drucker, Düse und Überhangwinkel gelten für alle
function partJobs() {
  const base = currentInput(), ctx = { getMat, settings: store.settings };
  return project.parts.map(p => ({ geom: p.geom, slot: p.slot ?? null, part: p, holes: p.holeGeom === p.geom ? p.holes || [] : [], r: compute({ ...base, ...(p.input || {}) }, p.geom, ctx) }));
}

/* Globale Werte = erstes Teil ohne eigenen Slot (dessen Slot wählt der Dialog); haben alle Teile einen
   eigenen Slot, das erste Teil mit seinem Slot. */
function exportPlan(defaultSlot) {
  const jobs = partJobs(), def = jobs.filter(j => j.slot === null);
  const slot = def.length ? defaultSlot : jobs[0].slot;
  return { jobs, slot, r: (def[0] || jobs[0]).r, usesDefault: def.length > 0 };
}

// Filament passend zu einem Slot-Typ: das bisherige, wenn es passt, sonst das erste Profil dieser Art
function materialForSlotType(type, current) {
  const mats = allMats();
  if (slotMatchesKind(type, (mats.find(m => m.id === current) || {}).kind)) return current;
  const m = mats.find(x => slotMatchesKind(type, x.kind));
  return m ? m.id : current;
}
