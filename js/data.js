'use strict';
/* Stammdaten – unverändert aus Druck-Konfigurator v4 übernommen. */
/* ================= DATA ================= */
// Alle Standardprofile beziehen sich auf die Werksdüse des Kobra S1: 0,4 mm gehärteter Stahl.
// Geschwindigkeits-Arrays: [Qualität, Ausgewogen, Schnell]
const P=(o)=>Object.assign({refD:0.4,refMat:'steel_hardened',abrasive:false,pa:null,accel:0,fanFirst:0,zhop:0.4,dry:'',notes:'',range:'',bedNote:''},o);
const BUILTIN=[
 P({id:'pla_hs',name:'Anycubic PLA High Speed',kind:'pla',status:'tested',
   nozzle:[215,215,220],range:'215–230 °C',bed:50,bedNote:'Smooth Plate',maxVol:18,flow:0.96,pa:0.025,
   first:20,outer:[80,100,120],inner:[110,145,180],fill:[140,180,220],top:60,gap:30,travel:300,
   retrLen:0.6,retrSpeed:35,fan:100,src:'Am Kobra S1 getestetes Startprofil (0,4-mm-Werksdüse, Smooth Plate).'}),
 P({id:'elegoo_hs',name:'ELEGOO Rapid PLA+ High Speed',kind:'pla',status:'generic',
   nozzle:[215,220,225],range:'210–230 °C',bed:50,bedNote:'Smooth Plate',maxVol:22,flow:0.98,
   first:20,outer:[100,140,180],inner:[150,200,260],fill:[180,240,300],top:80,gap:30,travel:300,
   retrLen:0.8,retrSpeed:40,fan:100,src:'Allgemeiner Startwert.'}),
 P({id:'pla',name:'PLA – Standard',kind:'pla',status:'generic',
   nozzle:[205,210,215],range:'195–220 °C',bed:60,maxVol:12,flow:0.98,
   first:20,outer:[50,60,80],inner:[80,100,120],fill:[100,120,150],top:40,gap:20,travel:250,
   retrLen:0.6,retrSpeed:30,fan:100,src:'Allgemeiner Startwert für normales (nicht High-Speed-)PLA.'}),
 P({id:'pla_matte',name:'PLA Matt',kind:'pla',status:'generic',
   nozzle:[210,215,220],range:'200–230 °C',bed:55,maxVol:15,flow:0.98,
   first:20,outer:[60,80,100],inner:[100,130,160],fill:[120,160,200],top:50,gap:25,travel:300,
   retrLen:0.6,retrSpeed:35,fan:100,src:'Allgemeiner Startwert.'}),
 P({id:'pla_silk',name:'PLA Silk',kind:'pla',status:'generic',
   nozzle:[210,215,220],range:'200–230 °C',bed:55,maxVol:10,flow:0.98,
   first:20,outer:[40,50,60],inner:[60,80,100],fill:[80,100,120],top:40,gap:20,travel:250,
   retrLen:0.8,retrSpeed:30,fan:100,src:'Allgemeiner Startwert. Silk glänzt am meisten bei langsamer Außenwand.'}),
 P({id:'pla_cf',name:'PLA-CF (Carbonfaser)',kind:'pla',status:'generic',abrasive:true,
   nozzle:[220,225,230],range:'210–240 °C',bed:60,maxVol:12,flow:0.96,
   first:20,outer:[60,80,100],inner:[90,120,150],fill:[110,150,180],top:50,gap:25,travel:300,
   retrLen:0.6,retrSpeed:30,fan:100,dry:'Vor dem Druck trocknen: ca. 55 °C für 6 Stunden.',src:'Allgemeiner Startwert. Nur mit gehärteter Düse.'}),
 P({id:'petg',name:'PETG',kind:'petg',status:'generic',
   nozzle:[240,245,250],range:'230–260 °C',bed:75,bedNote:'Klebestift als Trennschicht',maxVol:12,flow:0.95,
   first:20,outer:[50,70,90],inner:[80,110,140],fill:[100,140,180],top:40,gap:25,travel:250,
   retrLen:0.8,retrSpeed:30,fan:40,dry:'Vor dem Druck trocknen: ca. 65 °C für 4–6 Stunden.',src:'Allgemeiner Startwert.'}),
 P({id:'petg_hs',name:'PETG High Speed',kind:'petg',status:'generic',
   nozzle:[245,250,255],range:'230–260 °C',bed:75,bedNote:'Klebestift als Trennschicht',maxVol:20,flow:0.95,
   first:20,outer:[80,100,130],inner:[120,160,200],fill:[150,200,250],top:50,gap:30,travel:300,
   retrLen:0.8,retrSpeed:35,fan:40,dry:'Vor dem Druck trocknen: ca. 65 °C für 4–6 Stunden.',src:'Allgemeiner Startwert.'}),
 P({id:'petg_cf',name:'PETG-CF (Carbonfaser)',kind:'petg',status:'generic',abrasive:true,
   nozzle:[245,250,255],range:'240–270 °C',bed:75,bedNote:'Klebestift als Trennschicht',maxVol:10,flow:0.95,
   first:20,outer:[50,60,80],inner:[70,100,120],fill:[90,120,150],top:40,gap:25,travel:250,
   retrLen:0.8,retrSpeed:30,fan:30,dry:'Vor dem Druck trocknen: ca. 65 °C für 6–8 Stunden.',src:'Allgemeiner Startwert. Nur mit gehärteter Düse.'}),
 P({id:'abs',name:'ABS',kind:'abs',status:'generic',
   nozzle:[245,250,255],range:'230–260 °C',bed:95,bedNote:'Haube/Tür geschlossen',maxVol:16,flow:0.95,
   first:20,outer:[60,80,100],inner:[100,130,160],fill:[120,160,200],top:50,gap:25,travel:300,
   retrLen:0.6,retrSpeed:35,fan:15,dry:'Bei Bedarf trocknen: ca. 70 °C für 4 Stunden.',src:'Allgemeiner Startwert.'}),
 P({id:'asa',name:'ASA',kind:'asa',status:'generic',
   nozzle:[250,255,260],range:'240–270 °C',bed:95,bedNote:'Haube/Tür geschlossen',maxVol:14,flow:0.95,
   first:20,outer:[60,80,100],inner:[100,130,160],fill:[120,160,200],top:50,gap:25,travel:300,
   retrLen:0.6,retrSpeed:35,fan:20,dry:'Bei Bedarf trocknen: ca. 70 °C für 4 Stunden.',src:'Allgemeiner Startwert.'}),
 P({id:'tpu',name:'TPU 95A',kind:'tpu',status:'tested',
   nozzle:[230,230,230],range:'220–240 °C',bed:40,maxVol:2.0,flow:1.00,
   first:15,outer:[15,20,20],inner:[20,25,25],fill:[25,30,30],top:20,gap:15,travel:100,
   accel:800,retrLen:0.8,retrSpeed:20,fan:35,zhop:0.2,dry:'Vor dem Druck trocknen: ca. 50–55 °C für 4–6 Stunden.',
   src:'Am Kobra S1 getestetes Startprofil (0,4-mm-Werksdüse). Bewusst langsam.'})
];
const KIND_LABEL={pla:'PLA',petg:'PETG',abs:'ABS',asa:'ASA',tpu:'TPU / flexibel'};
const KIND_TEMPLATE={pla:'pla',petg:'petg',abs:'abs',asa:'asa',tpu:'tpu'};
const STATUS={tested:['tested','Getestet'],generic:['generic','Allgemeiner Startwert'],user:['user','Eigene Werte']};

// Düsen: v = Volumenstrom-Faktor ggü. 0,4 mm, lh = Schichthöhe [Q,A,S], fl = erste Schicht, lw/lwo/lwf = Linienbreiten
/* 0,2 mm: Mediane aus den OrcaSlicer-Profilen aller 105 Drucker mit 0,2-mm-Düse (ausgewertet 2026-09-29):
   Schichthöhe 0,10 (0,08–0,14 in den Prozessprofilen), erste Schicht 0,12, Linienbreiten 0,22.
   Volumenstrom: Filamentprofile mit Düsenangabe setzen für 0,2 mm im Median 0,12 × den 0,4-mm-Wert (34 Paare, meist 1–2 mm³/s). */
const NOZ={
 '0.2': {v:0.12,lh:[0.08,0.10,0.14],fl:0.12,lw:0.22,lwo:0.22,lwf:0.22},
 '0.25':{v:0.4,lh:[0.08,0.10,0.12],fl:0.12,lw:0.27,lwo:0.25,lwf:0.30},
 '0.4': {v:1.0,lh:[0.16,0.20,0.24],fl:0.20,lw:0.45,lwo:0.42,lwf:0.50},
 '0.6': {v:1.6,lh:[0.24,0.30,0.36],fl:0.30,lw:0.65,lwo:0.62,lwf:0.75},
 '0.8': {v:2.0,lh:[0.32,0.40,0.48],fl:0.40,lw:0.85,lwo:0.82,lwf:1.00}
};

// Düsenmaterial: thermalFamily bestimmt die Temperatur-/Volumenstrom-Umrechnung
// (Messing leitet Wärme deutlich besser als Stahl – gehärteter und ungehärteter
// Stahl sind sich thermisch sehr ähnlich). hardened bestimmt die Warnung bei
// faserverstärktem Filament, unabhängig von thermalFamily.
const NOZZLE_MATERIALS={
  steel_hardened:{label:'Gehärteter Stahl',thermalFamily:'steel',hardened:true},
  steel_stainless:{label:'Edelstahl (Standard)',thermalFamily:'steel',hardened:false},
  brass:{label:'Messing',thermalFamily:'brass',hardened:false}
};
NOZZLE_MATERIALS.steel=NOZZLE_MATERIALS.steel_hardened; // Altwert aus gespeicherten Profilen

// Zwei Drucker, ein Werkzeug. Die Filament-/Prozesswerte (BUILTIN) sind
// materialbasiert und für beide direktangetriebenen Drucker eine sinnvolle
// Startbasis – auf dem Snapmaker U1 aber nicht gegengetestet (siehe testedOK).
const PRINTERS={
  kobra_s1:{
    id:'kobra_s1',label:'Anycubic Kobra S1 Combo',slicer:'OrcaSlicer',
    nozzleOptions:['steel_hardened','brass'],nozzleDefault:'steel_hardened',
    multicolorSystem:'ace',enclosureBuiltin:true,testedOK:true
  },
  snapmaker_u1:{
    id:'snapmaker_u1',label:'Snapmaker U1',slicer:'OrcaSlicer',
    nozzleOptions:['steel_stainless','steel_hardened'],nozzleDefault:'steel_stainless',
    multicolorSystem:'toolchanger',enclosureBuiltin:false,testedOK:false
  }
};

/* ================= ORCASLICER-EXPORT =================
   Vendor-Presets verifiziert gegen resources/profiles/<Vendor>/ im
   OrcaSlicer-Repo (github.com/OrcaSlicer/OrcaSlicer). Beide Vendor-Bäume sind
   in sich geschlossen (erben NICHT von der generischen OrcaFilamentLibrary),
   daher druckerspezifische inherits-Ziele statt "Generic X @System". */
const ORCA_FILAMENT_BASE={
  kobra_s1:{PETG:'Anycubic PETG @Anycubic Kobra S1 0.4 nozzle',ABS:'Anycubic ABS @Anycubic Kobra S1 0.4 nozzle',ASA:'Anycubic ASA @Anycubic Kobra S1 0.4 nozzle'},
  snapmaker_u1:{PLA:'Snapmaker PLA @U1 base',PETG:'Snapmaker PETG @U1 base',ABS:'Snapmaker ABS @U1 base',ASA:'Snapmaker ASA @U1 base',TPU:'Snapmaker TPU 95A @U1 base'}
};
const ORCA_SYSTEM_FILAMENT={PLA:'Generic PLA @System',PETG:'Generic PETG @System',ABS:'Generic ABS @System',ASA:'Generic ASA @System',TPU:'Generic TPU @System'};
const ORCA_PROCESS_BASE={
  kobra_s1:{'0.4':'0.20mm Standard @Anycubic Kobra S1 0.4 nozzle'},
  snapmaker_u1:{'0.4':'0.20 Standard @Snapmaker U1 (0.4 nozzle)','0.6':'0.20 Standard @Snapmaker U1 (0.6 nozzle)','0.8':'0.24 Standard @Snapmaker U1 (0.8 nozzle)'}
};

const OBJ={
  general:{label:'Funktionsteil',pla:{w:2,t:4,b:4,i:15},tpu:{w:2,t:3,b:3,i:10}},
  holder:{label:'Halterung',pla:{w:3,t:4,b:4,i:20},tpu:{w:3,t:3,b:3,i:15}},
  // Dichtheit kommt aus der Wand (≥ 4 Linien ≈ 1,6–2 mm) und einem dicken Boden, nicht aus der Füllung
  watertight:{label:'Wasserdicht / Behälter',pla:{w:4,t:5,b:6,i:15},tpu:{w:3,t:4,b:5,i:10}},
  precision:{label:'Präzisionsteil',pla:{w:3,t:5,b:5,i:25},tpu:{w:3,t:4,b:4,i:20}},
  thin:{label:'Dünnwandiges Gehäuse',pla:{w:2,t:4,b:4,i:15},tpu:{w:2,t:3,b:3,i:10}},
  decor:{label:'Dekoration',pla:{w:2,t:4,b:4,i:10},tpu:{w:2,t:3,b:3,i:10}},
  overhang:{label:'Freiform / Überhänge',pla:{w:2,t:4,b:4,i:15},tpu:{w:2,t:3,b:3,i:10}},
  multicolor:{label:'Mehrfarbig / Gravur',pla:{w:2,t:5,b:4,i:15},tpu:{w:2,t:4,b:3,i:10}},
  // HueForge (Farbschichten-Platte): feine Schichten, massiv, Linien – laut HueForge-Anleitung 0,16 mm erste Schicht, 0,08 mm Schichten, 100 % Füllung
  hueforge:{label:'HueForge / Bildplatte',pla:{w:2,t:5,b:4,i:100},tpu:{w:2,t:4,b:3,i:100}},
  tire:{label:'Reifen / Rad',soft:true,tpuOnly:true,pla:{w:3,t:4,b:4,i:20},tpu:{w:5,wr:'4–6',t:3,b:3,i:20,ir:'15–25 %'}},
  dumpling:{label:'Quetschbares Spielzeug',soft:true,tpuOnly:true,pla:{w:2,t:4,b:4,i:10},tpu:{w:2,t:3,b:3,i:5}},
  case:{label:'Flexible Hülle',soft:true,tpuOnly:true,pla:{w:2,t:4,b:4,i:15},tpu:{w:2,t:3,b:3,i:5}}
};
const GOAL_LABEL={balanced:'Ausgewogen',quality:'Qualität',fast:'Schnell',strong:'Stabilität'};

/* ================= HELP TEXTS ================= */
const explanations={
 'Düsendurchmesser':'Größere Düse = mehr Durchsatz, dickere Schichten, gröbere Details. 0,2 und 0,25 mm nur für sehr feine Details. Schichthöhe, Linienbreite und Volumenstrom werden automatisch angepasst.',
 'Linienbreite':'Breite einer gedruckten Bahn, typischerweise 105–115 % des Düsendurchmessers. Wird aus der gewählten Düse abgeleitet.',
 'Düse':'Temperatur der Düse. Zu niedrig: schlechte Schichtverbindung und Risse. Zu hoch: Fäden, durchhängende Überhänge, Verfärbung.',
 'Heizbett':'Temperatur der Bauplatte. Höher verbessert die Haftung, kann aber die Unterseite verformen (Elefantenfuß).',
 'Schichthöhe':'Höhe jeder Schicht. Dünner = feinere Oberfläche, aber länger; dicker = schneller, aber gröbere Details. Bei Mehrfarbdruck bedeuten weniger Schichten auch weniger Farbwechsel.',
 'Höhe der ersten Schicht':'Höhe der ersten Lage. Beeinflusst Haftung und Toleranzen; zu hoch haftet schlecht, zu niedrig quetscht.',
 'Elefantenfuß':'Zieht die erste Schicht minimal nach innen, damit die Unterkante nicht breiter wird als das Modell.',
 'Glätten':'Fährt die oberste Fläche ein zweites Mal mit der heißen Düse ab. Nur bei großen, flachen Oberseiten sinnvoll; kostet deutlich Zeit.',
 'Nahtposition':'Position des Start-/Endpunkts jeder Außenwand. Beeinflusst die sichtbare Naht, nicht die Stabilität.',
 'Wandlinien':'Anzahl der Außen-/Innenwände. Mehr = stabiler und härter; weniger = weicher und schneller.',
 'Obere / untere Schichten':'Geschlossene Lagen oben und unten. Zu wenige oben: Löcher und durchscheinende Füllung. Ziel sind oben mindestens ca. 0,8 mm.',
 'Max. Volumenstrom':'Obergrenze für das Materialvolumen pro Sekunde. Sie bremst alle Geschwindigkeiten automatisch, wenn zu viel Material verlangt wird.',
 'Obere Schichten':'Geschlossene Lagen oben. Zu wenige: Löcher und durchscheinende Füllung. Ziel sind mindestens ca. 0,8 mm.',
 'Untere Schichten':'Geschlossene Lagen unten. Stabilisieren den Boden und die Haftung.',
 'Fülldichte':'Anteil der inneren Füllung. Mehr = stabiler und schwerer; weniger = weicher, aber die Oberseite kann Löcher bekommen.',
 'Füllmuster':'Gyroid ist ein guter Kompromiss aus Stabilität in alle Richtungen, Druckzeit und Flexibilität.',
 'Lückenfüllung':'Füllt sehr schmale Zwischenräume zwischen Konturen. Niedrige Geschwindigkeit hält dünne Stellen sauber.',
 'Füllung erste Schicht':'Geschwindigkeit der Füllung in der ersten Lage. Langsamer reduziert Ablösen.',
 'Erste Schicht':'Geschwindigkeit der ersten Lage. Langsamer = bessere Haftung.',
 'Außenwand':'Geschwindigkeit der sichtbaren Außenwand. Langsamer = glattere, maßhaltigere Oberfläche.',
 'Innere Wand':'Geschwindigkeit der Innenwände. Darf schneller sein als die Außenwand.',
 'Obere Fläche':'Geschwindigkeit der obersten sichtbaren Fläche. Langsamer = weniger Riefen und Löcher.',
 'Füllung':'Geschwindigkeit der inneren Füllbahnen. Wird automatisch durch die maximale Volumengeschwindigkeit begrenzt.',
 'Travel':'Bewegung ohne Extrusion. Höher spart Zeit, kann bei TPU aber Fäden und Zug am Teil erhöhen.',
 'Maximale Volumengeschwindigkeit':'Obergrenze für das Materialvolumen pro Sekunde. Sie bremst alle Geschwindigkeiten automatisch, wenn Schichthöhe × Linienbreite × Geschwindigkeit zu viel Material verlangt.',
 'Durchflussverhältnis':'Korrekturfaktor für die extrudierte Menge. 1,00 = keine Korrektur. In 0,02-Schritten anpassen, wenn Wände zu dick oder zu dünn sind.',
 'Pressure Advance':'Gleicht den Druckaufbau in der Düse aus. Sorgt für saubere Ecken ohne Beulen oder Lücken.',
 'Beschleunigung':'Wie schnell die Geschwindigkeit erreicht wird. Niedriger = weniger Ringing, aber langsamer. Bei TPU niedrig halten.',
 'Rückzug':'Filament wird vor Leerfahrten zurückgezogen. Zu wenig erzeugt Fäden; bei TPU kann zu viel das Filament knicken.',
 'Lüfter':'Kühlt die gerade gedruckte Schicht. Mehr stabilisiert Überhänge, kann aber die Schichtverbindung verschlechtern.',
 'Stützstrukturen':'Stützmaterial unter Überhängen. Die Empfehlung kommt aus der Überhanganalyse der STL; Flächen, die auf dem Bett liegen, zählen nicht.',
 'Support':'Stützmaterial unter Überhängen. Die Empfehlung kommt aus der Überhanganalyse der STL; Flächen, die auf dem Bett liegen, zählen nicht.',
 'Schwellenwinkel':'Ab diesem Überhangwinkel (von der Senkrechten) erzeugt der Slicer Stützen. Höher = weniger Stützen, aber unsauberere Überhänge.',
 'Brim':'Zusätzliche Randlinien am Boden. Verbessert die Haftung bei kleiner Aufstandsfläche oder abhebenden Ecken, erhöht aber die Nacharbeit.',
 'Z-Hop':'Düse hebt bei Leerfahrten an. Reduziert Kollisionen, kann bei TPU aber zusätzliche Fäden verursachen.',
 'Reinigungsvolumen':'Menge, die bei jedem Farbwechsel ausgespült wird. Wechsel zu dunklen Farben brauchen wenig, Wechsel zu Weiß viel.',
 'Reinigungsturm':'Turm, an dem nach dem Farbwechsel vorgedruckt wird. Stabilisiert den Düsendruck; beim Kobra S1 geht der Großteil der Spülung ohnehin in die Abfallrutsche.',
 'In Füllung spülen':'Nutzt einen Teil des Spülmaterials als Füllung im Inneren des Objekts und spart so Abfall.'
};
