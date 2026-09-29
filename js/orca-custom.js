'use strict';
/* Eigener Drucker aus einem in OrcaSlicer leer gespeicherten Projekt (.3mf) – für Drucker, die nicht in
   den ~990 Katalogprofilen stecken (js/orca-printers/). Anders als bei den Katalog-Druckern (orca-generic.js)
   ist project_settings.config hier schon vollständig aufgelöst (keine inherits-Kette nötig, Orca hat beim
   Speichern selbst geflacht) – dieselben Bereinigungen gelten trotzdem, weil Orca das je nach Version und
   Drucker unterschiedlich exportiert (siehe orca-generic.js für die Fundstellen/Gründe).
   Kein DOM: customPrinterTemplate/customPrinterEntry sind reine Funktionen, testbar wie orca-generic.js. */

// orcaVersion: aus Metadata/slice_info.config der hochgeladenen Datei gelesen (custom-printer-ui.js). Eine
// leere Version lässt die Orca-CLI ohne Fehlermeldung abstürzen (beobachtet 2026-09-28), daher ein Fallback.
const CUSTOM_PRINTER_FALLBACK_VERSION = '2.4.2';
function customPrinterTemplate(ps, fallbackName, orcaVersion) {
  const settings = JSON.parse(JSON.stringify(ps));
  orcaCleanupSettings(settings);
  const name = settings.printer_settings_id || fallbackName || 'Eigener Drucker';
  const n = Math.max(1, (settings.filament_settings_id || ['']).length);
  const pts = (settings.printable_area || []).map(p => String(p).split('x').map(Number)).filter(p => p.length === 2 && p.every(Number.isFinite));
  const bedCenter = pts.length ? [(Math.min(...pts.map(p => p[0])) + Math.max(...pts.map(p => p[0]))) / 2, (Math.min(...pts.map(p => p[1])) + Math.max(...pts.map(p => p[1]))) / 2] : [125, 125];
  const bed = pts.length ? [Math.max(...pts.map(p => p[0])) - Math.min(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1])) - Math.min(...pts.map(p => p[1]))] : null;
  const startName = (settings.filament_settings_id || [])[0] || 'Generic PLA';
  settings.print_compatible_printers = [name];
  return {
    source: 'custom', vendor: 'custom', orcaVersion: orcaVersion || CUSTOM_PRINTER_FALLBACK_VERSION,
    printerPreset: name, bedCenter, bed,
    // Jeder Slot behält das beim Export in Orca hinterlegte Filamentprofil – ohne mitgelieferte Filamentdaten
    // (die Katalog-Drucker haben eine ganze Herstellerbibliothek, ein einzelnes Projekt nicht) kann das Tool
    // nicht nach Materialtyp umschalten; siehe Hinweis in der Bedienoberfläche (custom-printer-ui.js).
    slots: Array.from({ length: n }, (_, i) => ({ name: (settings.filament_settings_id || [])[i] || startName, type: 'PLA', colour: '' })),
    settings, filamentPresets: {}, filamentValues: {}, filamentKeys: [],
    process: settings   // project_settings.config enthält Geschwindigkeiten/Temperaturen schon aufgelöst
  };
}

// Drucker-Eintrag für PRINTERS.orca aus einem eigenen, hochgeladenen Profil
function customPrinterEntry(ps, fallbackName, orcaVersion) {
  const tpl = customPrinterTemplate(ps, fallbackName, orcaVersion);
  const nozzle = String((ps.nozzle_diameter || [0.4])[0] || 0.4);
  const speed = Number((ps.filament_max_volumetric_speed || [])[0]);
  const maxVol = speed > 0 ? { PLA: speed, PETG: speed, ABS: speed, ASA: speed, TPU: speed } : {};
  return {
    id: 'orca', label: tpl.printerPreset, slicer: 'OrcaSlicer',
    nozzleOptions: ['brass', 'steel_stainless', 'steel_hardened'], nozzleDefault: 'brass',
    multicolorSystem: null, enclosureBuiltin: false, testedOK: false,
    orca: { vendor: 'custom', name: tpl.printerPreset, nozzle, process: tpl.settings, maxVol,
      fixedStartTemp: typeof fixedStartTemp === 'function' ? fixedStartTemp({ machine_start_gcode: ps.machine_start_gcode }) : null,
      customTemplate: tpl }
  };
}
