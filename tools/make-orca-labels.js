'use strict';
/* Erzeugt tools/orca-labels-en.json: englische Bezeichnungen der Orca-Einstellungen, exakt wie OrcaSlicer sie
   anzeigt. tests/i18n.js prüft damit, dass die englische Oberfläche Orcas Begriffe wörtlich übernimmt. Achtung:
   Orca beschriftet manche Felder nur im Zusammenhang ihrer Gruppe (nozzle_temperature = „Other layers“).
   Quelle: OrcaSlicer src/libslic3r/PrintConfig.cpp (def = this->add("key", …); def->label = L("…")).
   Aufruf: node tools/make-orca-labels.js <Pfad zu PrintConfig.cpp>
   (Datei z. B. von https://raw.githubusercontent.com/SoftFever/OrcaSlicer/main/src/libslic3r/PrintConfig.cpp)
   Nur die Schlüssel, die das Tool im Datenblatt nennt (KEYS unten), damit die Datei klein bleibt. */
const fs = require('fs');
const path = require('path');

const KEYS = ['nozzle_temperature', 'nozzle_temperature_initial_layer', 'hot_plate_temp', 'layer_height', 'initial_layer_print_height',
  'outer_wall_speed', 'inner_wall_speed', 'sparse_infill_speed', 'travel_speed', 'wall_loops', 'top_shell_layers', 'bottom_shell_layers',
  'sparse_infill_density', 'sparse_infill_pattern', 'fan_min_speed', 'fan_max_speed', 'filament_max_volumetric_speed', 'default_acceleration',
  'enable_support', 'brim_type', 'brim_width', 'line_width', 'initial_layer_line_width', 'outer_wall_line_width', 'inner_wall_line_width',
  'elefant_foot_compensation', 'seam_position', 'ironing_type', 'gap_infill_speed', 'initial_layer_speed', 'initial_layer_infill_speed',
  'top_surface_speed', 'internal_solid_infill_speed', 'raft_layers', 'filament_flow_ratio', 'pressure_advance', 'enable_pressure_advance',
  'nozzle_diameter', 'filament_z_hop', 'z_hop', 'enable_prime_tower', 'flush_into_infill', 'overhang_1_4_speed', 'bridge_speed',
  'internal_bridge_speed', 'close_fan_the_first_x_layers', 'retraction_length', 'filament_type', 'ensure_vertical_shell_thickness'];

const src = fs.readFileSync(process.argv[2], 'utf8');
const out = {};
for (const m of src.matchAll(/this->add\("([a-z0-9_]+)",[^)]*\);\s*\n\s*def->label = L\("([^"]+)"\)/g)) if (KEYS.includes(m[1]) && !(m[1] in out)) out[m[1]] = m[2];
const missing = KEYS.filter(k => !(k in out));
const file = path.join(__dirname, 'orca-labels-en.json');
const sorted = Object.fromEntries(Object.keys(out).sort().map(k => [k, out[k]]));
fs.writeFileSync(file, JSON.stringify(sorted, null, 1) + '\n');
console.log(Object.keys(out).length + ' Bezeichnungen → ' + file + (missing.length ? '\nnicht gefunden: ' + missing.join(', ') : ''));
