/* Filament-Auswahl nach Hersteller → Material → Farbe aus der mitgelieferten SpoolmanDB (js/filament-db.js).
   Rechenlogik ohne DOM (Node-testbar); die Oberfläche steht in js/filament-ui.js.
   Das Tool rechnet mit einem von neun Typen (PLA, PETG, ABS, ASA, TPU, PLA-CF, PETG-CF, PA, PC). Die Datenbank hat
   rund 60 Materialnamen („PLA+“, „ABS+MATTE“, „PA6-GF“ …); filamentTypeFor ordnet sie diesen Typen zu.
   Bekannte Grenzen:
   - Die Zuordnung ist eine Faustregel nach dem Namen: PCTG und HTPET+ zählen als PETG (ähnliches Verhalten),
     PET-CF/PET-GF nicht; Mischungen wie PC+ABS zählen als PC, glasfaserverstärkte Sorten (-GF) als ihr Grundtyp.
   - Unbekannte Materialien (Holz, PVB, HIPS, PVA, PEEK …) ergeben '': der Aufrufer rechnet dann wie PLA und sagt es.
   - Temperaturen in der Datenbank sind Herstellerangaben, ungeprüft und bei vielen Herstellern leer (0). */

function filamentTypeFor(material) {
  const m = String(material || '').toUpperCase().replace(/\s+/g, '');
  if (!m) return '';
  if (/^(HT)?PLA.*CF/.test(m)) return 'PLA-CF';
  if (/^PETG.*CF/.test(m)) return 'PETG-CF';
  if (/^(PETG|PCTG|HTPET)/.test(m)) return 'PETG';
  if (/^(HT)?PLA/.test(m)) return 'PLA';
  if (/^ABS/.test(m)) return 'ABS';
  if (/^(ASA|EASYASA)/.test(m)) return 'ASA';
  if (/^(TPU|TPE|TPC)/.test(m)) return 'TPU';
  if (/^PA(\d|HT|-|$)/.test(m)) return 'PA';
  if (/^PC/.test(m)) return 'PC';
  return '';
}

const fdbSort = (a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' });

/* Hersteller alphabetisch */
function fdbManufacturers(db) { return Object.keys(db || {}).sort(fdbSort); }

/* Materialien eines Herstellers: [{material, type, count}], nach Typ-Zuordnung bekannte zuerst */
function fdbMaterials(db, manufacturer) {
  const m = (db || {})[manufacturer] || {};
  return Object.keys(m).map(material => ({ material, type: filamentTypeFor(material), count: m[material].length }))
    .sort((a, b) => (!a.type - !b.type) || fdbSort(a.material, b.material));
}

/* Farben eines Materials: [{name, hex ('#RRGGBB'), nozzle, bed}] (0 = nicht angegeben) */
function fdbColours(db, manufacturer, material) {
  return (((db || {})[manufacturer] || {})[material] || []).map(([name, hex, nozzle, bed]) => ({ name, hex: '#' + hex, nozzle, bed }));
}
