'use strict';
/* Bedienung für „Eigenen Drucker verwenden“ (js/orca-custom.js): Dialog mit Anleitung, Datei einlesen,
   Drucker aktivieren. Eigene Drucker werden wie die Katalog-Auswahl in store.last.orcaPrinter gemerkt,
   zusätzlich die eingelesenen Daten in store.customPrinters (nötig, weil es dafür keine Katalogdaten
   zum Nachladen gibt): { settings: project_settings.config, orcaVersion }. */

// Sprachwahl (js/i18n.js); ohne sie deutsch
const C_TF = (s, v) => typeof trf === 'function' ? trf(s, v) : s.replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m));

// Gewähltes eigenes Profil aktivieren
function activateCustomPrinter(saved, fallbackName) {
  const entry = customPrinterEntry(saved.settings, fallbackName, saved.orcaVersion);
  PRINTERS.orca = entry;
  store.customPrinters[entry.orca.name] = saved;
  store.last.orcaPrinter = { vendor: 'custom', name: entry.orca.name };
  store.last.printer = 'orca';
  persist();
  setOrcaBtn(entry.label, null, entry.label, true);   // Kopfzeilen-Knopf (js/printer-picker.js)
  $('printer').value = 'orca';
  $('printer').dispatchEvent(new Event('change'));
  if (pickerNozzleOk(entry.orca.nozzle)) { $('nozD').value = nkey(entry.orca.nozzle); $('nozD').dispatchEvent(new Event('change')); }
  syncPrinterSwitch();
}

$('customPrinterOpen').addEventListener('click', () => {
  $('pickerDlg').close();
  $('customPrinterWarn').classList.add('hidden');
  $('customPrinterFile').value = '';
  $('customPrinterDlg').showModal();
});

$('customPrinterFile').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  const warn = $('customPrinterWarn');
  warn.classList.add('hidden');
  try {
    const zip = fflate.unzipSync(new Uint8Array(await file.arrayBuffer()));
    // Makerworld-Downloads bringen das Profil des Designers mit (meist Bambu), nicht den auf der Seite
    // gewählten Drucker – erkannt an den Makerworld-Kennungen im Modell (beobachtet 2026-09-29: A1-Profil
    // trotz anderer Auswahl). Solche Dateien gehören in „Modell öffnen“ (Umstellung auf den eigenen Drucker).
    const model = zip['3D/3dmodel.model'] ? fflate.strFromU8(zip['3D/3dmodel.model'].subarray(0, 8192)) : '';
    if (/<metadata name="(DesignModelId|DesignProfileId)"/.test(model))
      throw Error(C_TF('Das ist eine Makerworld-Datei – sie enthält das Druckerprofil des Designers, nicht deinen Drucker. Makerworld-Dateien bitte über „Modell öffnen“ laden und oben deinen Drucker wählen. Hier nur eine Datei verwenden, die du selbst in OrcaSlicer mit deinem Drucker gespeichert hast.'));
    const raw = zip['Metadata/project_settings.config'];
    if (!raw) throw Error(C_TF('Keine project_settings.config gefunden – ist das eine über „Projekt speichern unter …“ erzeugte OrcaSlicer-3MF?'));
    const settings = JSON.parse(fflate.strFromU8(raw));
    if (!settings.printer_settings_id) throw Error(C_TF('Kein Druckerprofil in der Datei enthalten.'));
    const info = zip['Metadata/slice_info.config'] ? fflate.strFromU8(zip['Metadata/slice_info.config']) : '';
    const orcaVersion = (/key="OrcaSlicer-Version" value="([^"]+)"/.exec(info) || [])[1] || '';
    activateCustomPrinter({ settings, orcaVersion }, file.name.replace(/\.3mf$/i, ''));
    $('customPrinterDlg').close();
    toast(C_TF('Drucker: {label}', { label: PRINTERS.orca.label }));
  } catch (err) {
    warn.textContent = C_TF('Konnte nicht gelesen werden: {msg}', { msg: err.message });
    warn.classList.remove('hidden');
  }
});
