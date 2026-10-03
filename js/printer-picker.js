'use strict';
/* Auswahl „Anderer Drucker“: alle Drucker aus den OrcaSlicer-Systemprofilen (ORCA_PRINTER_INDEX).
   Die Daten eines Herstellers werden erst bei Bedarf per <script> nachgeladen – das funktioniert auch
   per Doppelklick (file://), anders als fetch(). Kobra S1 und U1 behalten ihre eigenen Vorlagen. */

// Sprachwahl (js/i18n.js); ohne sie deutsch. Zahlen: fmtNum aus i18n.js
// (util.js überdeckt den Namen num() mit dem Zahlen-Parser)
const K_TF = (s, v) => typeof trf === 'function' ? trf(s, v) : s.replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m));
const K_NUM = (v, d) => typeof fmtNum === 'function' ? fmtNum(v, d) : de(v, d);

/* Kopfzeilen-Knopf „Anderer Drucker“: Modell, Hersteller (null = „Eigener“) und Hilfetext. Der Zustand wird
   gemerkt, damit panel.js die Beschriftung nach einem Sprachwechsel neu schreiben kann (renderOrcaBtn). */
let orcaBtn = null;   // { label, vendor, name, change: true = „zum Ändern“, false = „zum Auswählen“ }
function setOrcaBtn(label, vendor, name, change) { orcaBtn = { label, vendor, name, change }; renderOrcaBtn(); }
function renderOrcaBtn() {
  if (!orcaBtn) return;
  $('printerOrcaLabel').textContent = orcaBtn.label;
  $('printerOrcaVendor').textContent = orcaBtn.vendor === null ? K_TF('Eigener') : orcaBtn.vendor;
  $('printerOrcaBtn').title = K_TF(orcaBtn.change ? '{name} – zum Ändern anklicken' : '{name} – zum Auswählen anklicken', { name: orcaBtn.name });
}

const loadedVendors = new Map();   // Hersteller → Promise
function loadOrcaVendor(vendor) {
  if (ORCA_PRINTER_DATA[vendor]) return Promise.resolve();
  if (!loadedVendors.has(vendor)) {
    const info = ORCA_PRINTER_INDEX.vendors[vendor];
    loadedVendors.set(vendor, new Promise((ok, fail) => {
      if (!info) { fail(Error(K_TF('Hersteller unbekannt: {v}', { v: vendor }))); return; }
      const s = document.createElement('script');
      s.src = 'js/orca-printers/' + info.file;
      s.onload = () => (ORCA_PRINTER_DATA[vendor] ? ok() : fail(Error(K_TF('Profildaten fehlen'))));
      s.onerror = () => { loadedVendors.delete(vendor); fail(Error(K_TF('Profildatei nicht ladbar: {f}', { f: info.file }))); };
      document.head.appendChild(s);
    }));
  }
  return loadedVendors.get(vendor);
}

// Nur Düsen, für die das Tool umrechnen kann (NOZ-Tabelle)
const pickerNozzleOk = n => !!NOZ[nkey(n)];
// In der Kopfzeile steht der Hersteller schon als Zeile darüber – im Modellnamen nicht wiederholen
const shortModelLabel = (label, vendor) => { const f = vendorLabel(vendor); return label.startsWith(f + ' ') ? label.slice(f.length + 1) : label; };

// Gewählten Orca-Drucker aktivieren (lädt die Herstellerdaten, stellt Düse passend ein)
async function activateOrcaPrinter(vendor, name) {
  await loadOrcaVendor(vendor);
  const entry = orcaPrinterEntry(vendor, name);
  if (!entry) throw Error(K_TF('Drucker nicht gefunden: {n}', { n: name }));
  PRINTERS.orca = entry;
  store.last.orcaPrinter = { vendor, name };
  setOrcaBtn(shortModelLabel(entry.label, vendor), vendorLabel(vendor), entry.label, true);
  $('printer').value = 'orca';
  $('printer').dispatchEvent(new Event('change'));
  if (pickerNozzleOk(entry.orca.nozzle)) { $('nozD').value = nkey(entry.orca.nozzle); $('nozD').dispatchEvent(new Event('change')); }
  syncPrinterSwitch();
}

/* ---------- Auswahlfenster ---------- */
const vendorLabel = v => (v === 'BBL' ? 'Bambu Lab' : v);
// Eigene Drucker (js/custom-printer-ui.js) stehen als eigene Gruppe ganz oben in der Herstellerliste
const CUSTOM_GROUP = '__custom';
function fillPickerVendors() {
  const sel = $('pickVendor');
  if (!sel.querySelector('option:not([value="' + CUSTOM_GROUP + '"])')) {
    const vendors = Object.keys(ORCA_PRINTER_INDEX.vendors).sort((a, b) => vendorLabel(a).localeCompare(vendorLabel(b), 'de'));
    sel.innerHTML = vendors.map(v => '<option value="' + esc(v) + '">' + esc(vendorLabel(v)) + ' (' + Object.keys(ORCA_PRINTER_INDEX.vendors[v].printers).length + ')</option>').join('');
  }
  const n = Object.keys(store.customPrinters).length;
  let opt = sel.querySelector('option[value="' + CUSTOM_GROUP + '"]');
  if (!n) { if (opt) opt.remove(); return; }
  if (!opt) { opt = document.createElement('option'); opt.value = CUSTOM_GROUP; sel.prepend(opt); }
  opt.textContent = K_TF('★ Eigene Drucker ({n})', { n });
}
function renderCustomList(q) {
  const cur = store.last.orcaPrinter && store.last.orcaPrinter.vendor === 'custom' && store.last.orcaPrinter.name;
  const names = Object.keys(store.customPrinters).filter(n => !q || n.toLowerCase().includes(q)).sort((a, b) => a.localeCompare(b, 'de'));
  $('pickList').innerHTML = names.length ? names.map(n => {
    const tpl = customPrinterTemplate(store.customPrinters[n].settings, n), noz = String(first((store.customPrinters[n].settings || {}).nozzle_diameter) || '');
    const ok = pickerNozzleOk(noz);
    return '<li class="pick-custom"><button type="button" data-pick="' + esc(n) + '"' + (n === cur ? ' aria-current="true"' : '') + (ok ? '' : ' disabled title="Diese Düsengröße kann das Tool nicht umrechnen"') + '>' +
      '<b translate="no">' + esc(n) + '</b><small>' + K_TF('Düse {d} mm', { d: K_NUM(Number(noz), 2) }) + (tpl.bed ? ' · ' + K_TF('Bett {w} × {h} mm', { w: K_NUM(tpl.bed[0], 0), h: K_NUM(tpl.bed[1], 0) }) : '') + '</small></button>' +
      '<button type="button" class="linkbtn" data-remove-custom="' + esc(n) + '" title="Aus der Liste entfernen">Entfernen</button></li>';
  }).join('') : '<li class="muted">Kein Drucker gefunden.</li>';
}
function renderPickerList() {
  const v = $('pickVendor').value, q = $('pickSearch').value.trim().toLowerCase();
  if (v === CUSTOM_GROUP) { renderCustomList(q); return; }
  const printers = Object.entries(ORCA_PRINTER_INDEX.vendors[v].printers)
    .filter(([n]) => !q || n.toLowerCase().includes(q))
    .sort((a, b) => a[1].model.localeCompare(b[1].model, 'de') || Number(a[1].nozzle) - Number(b[1].nozzle));
  const cur = store.last.orcaPrinter && store.last.orcaPrinter.name;
  $('pickList').innerHTML = printers.length ? printers.map(([n, p]) => {
    const ok = pickerNozzleOk(p.nozzle);
    return '<li><button type="button" data-pick="' + esc(n) + '"' + (n === cur ? ' aria-current="true"' : '') + (ok ? '' : ' disabled title="Diese Düsengröße kann das Tool nicht umrechnen"') + '>' +
      '<b translate="no">' + esc(p.model) + '</b><small>' + K_TF('Düse {d} mm · Bett {w} × {h} mm', { d: K_NUM(Number(p.nozzle), 2), w: K_NUM(p.bed[0], 0), h: K_NUM(p.bed[1], 0) }) + '</small></button></li>';
  }).join('') : '<li class="muted pick-empty">' + K_TF('Kein Drucker gefunden. Nicht in der Liste? Oben über <b>Eigenes Orca-Profil verwenden</b> dein eigenes Profil einlesen.') + '</li>';
}
function openPrinterPicker() {
  fillPickerVendors();
  const last = store.last.orcaPrinter;
  if (last && last.vendor === 'custom' && store.customPrinters[last.name]) $('pickVendor').value = CUSTOM_GROUP;
  else if (last && ORCA_PRINTER_INDEX.vendors[last.vendor]) $('pickVendor').value = last.vendor;
  $('pickSearch').value = '';
  renderPickerList();
  $('pickerDlg').showModal();
  $('pickSearch').focus();
}
$('pickVendor').addEventListener('change', renderPickerList);
$('pickSearch').addEventListener('input', renderPickerList);
$('pickList').addEventListener('click', async e => {
  const rm = e.target.closest('[data-remove-custom]');
  if (rm) {
    const n = rm.dataset.removeCustom;
    if (!confirm(K_TF('Eigenen Drucker „{name}“ aus der Liste entfernen?', { name: n }))) return;
    delete store.customPrinters[n];
    persist();
    fillPickerVendors();
    if (!Object.keys(store.customPrinters).length) $('pickVendor').selectedIndex = 0;
    renderPickerList();
    return;
  }
  const b = e.target.closest('[data-pick]'); if (!b || b.disabled) return;
  b.textContent = 'Lade Profil …';
  try {
    if ($('pickVendor').value === CUSTOM_GROUP) activateCustomPrinter(store.customPrinters[b.dataset.pick], b.dataset.pick);
    else await activateOrcaPrinter($('pickVendor').value, b.dataset.pick);
    $('pickerDlg').close(); toast(K_TF('Drucker: {label}', { label: PRINTERS.orca.label }));
  } catch (err) { toast(K_TF('Drucker konnte nicht geladen werden: {msg}', { msg: err.message })); renderPickerList(); }
});
$('pickerDlg').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });

// Beim Start den zuletzt gewählten Orca-Drucker wiederherstellen (Katalog oder eigenes Profil)
if (store.last.printer === 'orca' && store.last.orcaPrinter && store.last.orcaPrinter.vendor === 'custom') {
  const saved = store.customPrinters[store.last.orcaPrinter.name];
  if (saved && saved.settings) activateCustomPrinter(saved, store.last.orcaPrinter.name);
} else if (store.last.printer === 'orca' && store.last.orcaPrinter) {
  activateOrcaPrinter(store.last.orcaPrinter.vendor, store.last.orcaPrinter.name).catch(() => { /* bleibt beim S1 */ });
} else if (store.last.orcaPrinter && store.last.orcaPrinter.vendor === 'custom' && store.customPrinters[store.last.orcaPrinter.name]) {
  setOrcaBtn(store.last.orcaPrinter.name, null, store.last.orcaPrinter.name, false);
} else if (store.last.orcaPrinter && ORCA_PRINTER_INDEX.vendors[store.last.orcaPrinter.vendor]) {
  const fullName = store.last.orcaPrinter.name.replace(/ \d+(\.\d+)? nozzle$/, '');
  setOrcaBtn(shortModelLabel(fullName, store.last.orcaPrinter.vendor), vendorLabel(store.last.orcaPrinter.vendor), fullName, false);
}
