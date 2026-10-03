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

/* ---------- Eigenes Profil aus Hersteller + Material (Hauptseite, Feld „Filament“) ----------
   Das Tool kennt Rechenwerte (Volumenstrom, Geschwindigkeiten, Rückzug …) nur für seine Standardprofile; die
   Datenbank liefert nur Temperaturen. Ein Hersteller-Profil ist deshalb das Standardprofil des Typs mit den
   Temperaturen der Datenbank – kein getestetes Profil. PA, PC und Unbekanntes haben kein Standardprofil → null. */
const FDB_TEMPLATE = { 'PLA': 'pla', 'PETG': 'petg', 'ABS': 'abs', 'ASA': 'asa', 'TPU': 'tpu', 'PLA-CF': 'pla_cf', 'PETG-CF': 'petg_cf' };

/* Id des Standardprofils für ein Material der Datenbank, null wenn das Tool dafür keine Werte kennt */
function filamentTemplateFor(material) { return FDB_TEMPLATE[filamentTypeFor(material)] || null; }

/* Materialien eines Herstellers, für die ein Profil möglich ist */
function fdbProfileMaterials(db, manufacturer) { return fdbMaterials(db, manufacturer).filter(m => FDB_TEMPLATE[m.type]); }

/* Häufigste angegebene Temperatur (Düse/Bett) aller Farben des Materials, 0 = keine Angabe */
function fdbTemps(db, manufacturer, material) {
  const mode = key => {
    const n = {};
    fdbColours(db, manufacturer, material).forEach(c => { if (c[key] > 0) n[c[key]] = (n[c[key]] || 0) + 1; });
    const best = Object.keys(n).sort((a, b) => n[b] - n[a] || a - b)[0];
    return best ? Number(best) : 0;
  };
  return { nozzle: mode('nozzle'), bed: mode('bed') };
}

const fdbProfileId = (manufacturer, material) => 'fdb_' + (manufacturer + '_' + material).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/* Neues Profil: Kopie des Standardprofils base mit Namen „Hersteller Material“ und den Temperaturen der Datenbank.
   base wird nicht verändert; die Düsentemperaturen [Qualität, Ausgewogen, Schnell] behalten ihren Abstand. */
function fdbProfile(base, manufacturer, material, temps) {
  const p = { ...base };
  for (const k of ['id', 'builtin', 'overridden', 'status', 'src']) delete p[k];
  p.name = manufacturer + ' ' + material;
  if (temps && temps.nozzle > 0) {
    const shift = temps.nozzle - base.nozzle[1];
    p.nozzle = base.nozzle.map(v => v + shift);
    p.range = temps.nozzle + ' °C (Herstellerangabe)';
  }
  if (temps && temps.bed > 0) p.bed = temps.bed;
  p.notes = 'Startwerte: Standardprofil „' + base.name + '“' + (temps && (temps.nozzle || temps.bed) ? ' mit den Temperaturen der SpoolmanDB (Herstellerangabe, ungeprüft)' : ' (die Datenbank nennt für dieses Material keine Temperatur)') + '. Übrige Werte nicht getestet – bitte prüfen und bei Bedarf anpassen.';
  return p;
}
