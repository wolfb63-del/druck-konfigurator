/* Filament-Auswahl im Dialog „Belegung eintragen“: Hersteller → Material → Farbe (Daten: js/filament-db.js, Logik:
   js/filament-pick.js). Die Auswahl füllt nur Typ und Farbe der Zeile; beides bleibt danach von Hand änderbar.
   Die Datenbank (~170 KB) wird erst beim ersten Öffnen des Editors nachgeladen (geht auch über file://). */
let filamentDbPromise = null;
function loadFilamentDb() {
  if (typeof FILAMENT_DB !== 'undefined') return Promise.resolve(FILAMENT_DB);
  if (!filamentDbPromise) filamentDbPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'js/filament-db.js';
    s.onload = () => resolve(FILAMENT_DB);
    s.onerror = () => { filamentDbPromise = null; reject(new Error('Filament-Liste nicht ladbar')); };
    document.head.appendChild(s);
  });
  return filamentDbPromise;
}

const fpOpts = (first, items) => '<option value="">' + esc(first) + '</option>' + items.map(([v, label]) => '<option value="' + esc(String(v)) + '">' + esc(label) + '</option>').join('');

/* Hängt unter jede Slot-Zeile in rowsEl die Auswahl Hersteller → Material → Farbe */
function attachFilamentPicker(rowsEl) {
  const rows = [...rowsEl.querySelectorAll('.slot-edit-row')];
  const picks = rows.map(row => {
    const n = row.querySelector('[data-slot-type]').dataset.slotType;
    const div = document.createElement('div');
    div.className = 'slot-pick';
    div.innerHTML = '<span class="slot-pick-lbl">' + esc(E_TR('Aus Liste wählen')) + '</span>' +
      '<select data-fp-mf aria-label="' + esc(E_TF('Hersteller Slot {n}', { n: +n + 1 })) + '" disabled></select>' +
      '<select data-fp-mat aria-label="' + esc(E_TF('Material Slot {n}', { n: +n + 1 })) + '" disabled></select>' +
      '<select data-fp-col aria-label="' + esc(E_TF('Farbe aus Liste Slot {n}', { n: +n + 1 })) + '" disabled></select>' +
      '<small data-fp-note></small>';
    row.insertAdjacentElement('afterend', div);
    return { row, div };
  });
  loadFilamentDb().then(db => {
    const mfs = fdbManufacturers(db).map(m => [m, m]);
    picks.forEach(({ row, div }) => {
      const mf = div.querySelector('[data-fp-mf]'), mat = div.querySelector('[data-fp-mat]'), col = div.querySelector('[data-fp-col]'), note = div.querySelector('[data-fp-note]');
      const reset = (sel, first) => { sel.innerHTML = fpOpts(first, []); sel.disabled = true; };
      mf.innerHTML = fpOpts(E_TR('Hersteller …'), mfs); mf.disabled = false;
      reset(mat, E_TR('Material …')); reset(col, E_TR('Farbe …'));
      mf.onchange = () => {
        note.textContent = '';
        reset(col, E_TR('Farbe …'));
        if (!mf.value) { reset(mat, E_TR('Material …')); return; }
        mat.innerHTML = fpOpts(E_TR('Material …'), fdbMaterials(db, mf.value).map(m => [m.material, m.material + (m.type ? '' : ' – ' + E_TR('wie PLA gerechnet'))]));
        mat.disabled = false;
      };
      mat.onchange = () => {
        note.textContent = '';
        if (!mat.value) { reset(col, E_TR('Farbe …')); return; }
        col.innerHTML = fpOpts(E_TR('Farbe …'), fdbColours(db, mf.value, mat.value).map((c, i) => [i, c.name]));
        col.disabled = false;
      };
      col.onchange = () => {
        if (col.value === '') { note.textContent = ''; return; }
        const c = fdbColours(db, mf.value, mat.value)[+col.value], known = filamentTypeFor(mat.value), type = known || 'PLA';
        const typeSel = row.querySelector('[data-slot-type]');
        typeSel.value = type;
        row.querySelector('[data-slot-colour]').value = c.hex.toLowerCase();
        const temps = [c.nozzle ? E_TF('Düse {n} °C', { n: c.nozzle }) : '', c.bed ? E_TF('Bett {n} °C', { n: c.bed }) : ''].filter(Boolean).join(', ');
        note.textContent = [known ? E_TF('Eingetragen: {t}', { t: type }) : E_TR('Material unbekannt – wird wie PLA gerechnet.'),
          temps ? E_TF('Herstellerangabe: {t} (ungeprüft, fließt nicht in die Berechnung ein)', { t: temps }) : ''].filter(Boolean).join(' · ');
      };
    });
  }).catch(() => picks.forEach(({ div }) => { div.querySelector('[data-fp-note]').textContent = E_TR('Hersteller-Liste nicht verfügbar – Typ und Farbe bitte von Hand wählen.'); }));
}
