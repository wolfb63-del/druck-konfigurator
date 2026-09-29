'use strict';
/* Rechenkern – aus v4 übernommen. Einziger Unterschied: Eingaben kommen als
   Parameter statt aus dem DOM, damit tests/compare-v4.js ihn gegen v4 prüfen kann. */

// Objektart „Wasserdicht / Behälter“
const WATERTIGHT_TEMP_BOOST=5, WATERTIGHT_OUTER_FACTOR=0.7;
function supportProfile(level,tpu){
  const p={
    safe:{angle:45,xy:tpu?'0,40 mm':'0,35 mm',iface:tpu?3:2,gap:'0,50 mm',density:tpu?'15 %':'20 %',branch:tpu?'1,5–2,0 mm':'1,0–1,5 mm',small:'Ein'},
    balanced:{angle:45,xy:tpu?'0,40 mm':'0,35 mm',iface:2,gap:'0,50 mm',density:'20 %',branch:'1,0–1,5 mm',small:'Ein'},
    reduced:{angle:50,xy:tpu?'0,45 mm':'0,40 mm',iface:1,gap:'0,60 mm',density:'15 %',branch:'1,5–2,0 mm',small:'Ein'},
    minimal:{angle:55,xy:tpu?'0,50 mm':'0,45 mm',iface:1,gap:'0,60 mm',density:'10 %',branch:'2,0 mm',small:'Aus'}
  };return p[level]||p.balanced;
}
/* Z-Abstand Stütze↔Teil: eine Schichthöhe – so halten die Stützen sicher (abfallende Stützen gab es schon).
   PETG haftet stärker am Teil → eine Stufe (0,05 mm) mehr. Unten bei TPU mindestens 0,25 mm wie in v4. */
function supportZGap(layer,kind,tpu){
  const top=Math.round((layer+(kind==='petg'?0.05:0))*100)/100;
  return {top,bottom:tpu?Math.max(0.25,top):top};
}
// Untere Grenze einer Angabe wie "1,0–1,5 mm" oder "20 %" als Zahl
const lowerNum=s=>{const m=/(\d+(?:[.,]\d+)?)/.exec(String(s));return m?Number(m[1].replace(',','.')):null};
// kind = Filamenttyp des aktuell gewählten Filaments (v4 las ihn aus dem DOM)
function helpFor(label,kind){
  const keys=Object.keys(explanations);
  const key=keys.find(k=>label===k)||keys.find(k=>label.startsWith(k))||keys.find(k=>label.includes(k));
  if(!key)return '';
  let extra='';
  if(kind==='tpu'&&['Düse','Lüfter','Rückzug','Maximale Volumengeschwindigkeit','Außenwand','Innere Wand','Füllung','Travel','Beschleunigung'].includes(key))extra=' TPU reagiert deutlich empfindlicher auf hohe Geschwindigkeit als PLA.';
  return explanations[key]+extra;
}
function rowHTML(r,kind){const h=helpFor(r[0],kind);return '<div class="setting"><b>'+esc(r[0])+(h?'<span class="help" title="'+esc(h)+'">?</span>':'')+'</b><span class="value">'+r[1]+(r[2]?'<small>'+r[2]+'</small>':'')+'</span></div>'}

function orcaFilamentInherits(printerId,kindUpper){
  return (ORCA_FILAMENT_BASE[printerId]||{})[kindUpper]||ORCA_SYSTEM_FILAMENT[kindUpper]||'Generic PLA @System';
}
function orcaProcessInherits(printerId,nozD){
  return (ORCA_PROCESS_BASE[printerId]||{})[nozD]||null;
}
function buildOrcaFilamentJSON(r){
  const kindUpper=r.m.kind.toUpperCase();
  const temp=String(r.nozzle),bed=String(r.m.bed),fan=String(r.m.fan);
  const name='Druck-Konfigurator '+r.m.name;
  return JSON.stringify({
    type:'filament',
    name:name,
    version:'1.0.0.0',
    from:'User',
    instantiation:'true',
    inherits:orcaFilamentInherits(r.printer.id,kindUpper),
    filament_settings_id:[name],
    nozzle_temperature:[temp],
    nozzle_temperature_initial_layer:[temp],
    hot_plate_temp:[bed],hot_plate_temp_initial_layer:[bed],
    cool_plate_temp:[bed],cool_plate_temp_initial_layer:[bed],
    eng_plate_temp:[bed],eng_plate_temp_initial_layer:[bed],
    textured_plate_temp:[bed],textured_plate_temp_initial_layer:[bed],
    fan_min_speed:[fan],fan_max_speed:[fan]
  },null,2);
}
function buildOrcaProcessJSON(r){
  const inherits=orcaProcessInherits(r.printer.id,r.dSel);
  const name='Druck-Konfigurator '+r.m.name+' - '+r.ob.label;
  // Gyroid ist in beiden Pattern-Vorschlägen ("Gyroid" / "Gyroid oder Kubisch") die Primärempfehlung.
  const orcaPattern = r.pattern.indexOf('Gyroid')===0 ? 'gyroid' : 'crosshatch';
  return JSON.stringify({
    type:'process',
    name:name,
    version:'1.0.0.0',
    from:'User',
    instantiation:'true',
    inherits: inherits||'fdm_process_common',
    print_settings_id:[name],
    layer_height:String(r.layer),
    wall_loops:String(r.w),
    sparse_infill_density:r.inf+'%',
    sparse_infill_pattern:orcaPattern,
    top_shell_layers:String(r.t),
    bottom_shell_layers:String(r.b),
    outer_wall_speed:String(r.sp_outer),
    inner_wall_speed:String(r.sp_inner),
    sparse_infill_speed:String(r.sp_fill),
    internal_solid_infill_speed:String(r.sp_fill),
    top_surface_speed:String(r.top),
    gap_infill_speed:String(r.m.gap),
    initial_layer_speed:String(r.m.first),
    travel_speed:String(r.m.travel)
  },null,2);
}
function orcaWarningText(r){
  const parts=[];
  const kindUpper=r.m.kind.toUpperCase();
  if(!(ORCA_FILAMENT_BASE[r.printer.id]||{})[kindUpper]){
    parts.push('Kein '+esc(r.printer.label)+'-eigenes Preset für '+kindUpper+' bekannt – Filament-JSON erbt stattdessen von „'+esc(ORCA_SYSTEM_FILAMENT[kindUpper]||'Generic PLA @System')+'“. Das klappt nur, wenn diese generische Bibliothek in deiner OrcaSlicer-Installation mit installiert ist.');
  }
  if(!orcaProcessInherits(r.printer.id,r.dSel)){
    parts.push('Process-JSON: für '+de(+r.dSel,r.dSel==='0.25'?2:1)+' mm Düse ist am '+esc(r.printer.label)+' kein Preset verifiziert (nur 0,4 mm'+(r.printer.id==='snapmaker_u1'?'/0,6 mm/0,8 mm':'')+' geprüft) – Import kann fehlschlagen, Werte notfalls manuell eintragen.');
  }
  return parts.join('<br><br>');
}

/* ================= ENGINE ================= */
// I = {printer,material,nozD,nozM,object,goal,load,support,supportLevel,thresh}
// ctx = {getMat, settings}; geom = Ergebnis von parseSTL oder null
function compute(I,geom,ctx){
  const printer=PRINTERS[I.printer]||PRINTERS.kobra_s1;
  const mk=I.material,o=I.object,g=I.goal,l=I.load,s=I.support,sl=I.supportLevel;
  // Beliebiger Orca-Drucker: Geschwindigkeiten, Beschleunigung und Volumenstrom höchstens so hoch wie in seinem Orca-Profil
  const m=printer.orca&&typeof orcaLimitMaterial==='function'?orcaLimitMaterial(ctx.getMat(mk),printer.orca):ctx.getMat(mk),ob=OBJ[o],tpu=m.kind==='tpu',sp=supportProfile(sl,tpu);
  const effectiveStatus=(m.status==='tested'&&!printer.testedOK)?'generic':m.status;
  const short=m.name;
  const base=Object.assign({},tpu?ob.tpu:ob.pla);
  const pi=g==='quality'?0:g==='fast'?2:1;
  const warn=[],danger=[];

  // Düse: Umrechnung vom Referenzprofil auf die gewählte Düse
  const dSel=nkey(I.nozD),mSel=I.nozM;
  const N=NOZ[dSel]||NOZ['0.4'],refKey=nkey(m.refD||0.4),R=NOZ[refKey]||NOZ['0.4'],refMat=m.refMat||'steel_hardened';
  const S=ctx.settings;
  const refFamily=(NOZZLE_MATERIALS[refMat]||NOZZLE_MATERIALS.steel_hardened).thermalFamily;
  const selFamily=(NOZZLE_MATERIALS[mSel]||NOZZLE_MATERIALS.steel_hardened).thermalFamily;
  let volF=N.v/R.v,tOff=0;
  if(selFamily!==refFamily){if(selFamily==='steel'){tOff=+S.steelOffset;volF*=+S.steelVol}else{tOff=-S.steelOffset;volF/=+S.steelVol}}
  const maxVol=Math.round(m.maxVol*volF*10)/10;
  // Wasserdicht: etwas heißer für besser verschmelzende Schichten, langsamere Außenwand
  const wtBoost=o==='watertight'?WATERTIGHT_TEMP_BOOST:0;
  const nozzle=Math.round(m.nozzle[pi]+tOff+wtBoost);
  const nozLabel=de(+dSel,dSel==='0.25'?2:1)+' mm '+NOZZLE_MATERIALS[mSel].label;

  // Schichthöhe
  let layer=tpu?N.lh[1]:N.lh[pi];
  if(!tpu&&o==='precision'&&g!=='fast')layer=Math.min(layer,N.lh[0]);
  if(geom&&geom.z<4)layer=N.lh[0];

  // Struktur
  let w=base.w,t=base.t,b=base.b,inf=base.i,pattern='Gyroid';
  const soft=!!ob.soft&&tpu;
  if(!soft){
    if(l==='medium'){w+=1;inf+=5}
    if(l==='high'){w+=2;inf=Math.max(inf,30);pattern='Gyroid oder Kubisch'}
    if(g==='strong'){w+=1;inf+=10;pattern='Gyroid oder Kubisch'}
    t=Math.max(t,Math.ceil(0.8/layer-1e-9));b=Math.max(b,Math.ceil(0.6/layer-1e-9));
  }else if(o==='tire'&&l==='high'){inf=25}
  if(ob.tpuOnly&&!tpu)warn.push('<b>Hinweis:</b> „'+ob.label+'“ ist ein TPU-Objekt. Mit '+esc(short)+' wird es steif; die Werte sind allgemeine Startwerte.');

  // Geschwindigkeiten (Slicer-Wert + effektive Grenze durch Volumenstrom)
  let top=m.top;if(o==='multicolor'||o==='precision'||g==='quality')top=Math.min(top,tpu?20:40);
  const capNote=(v,lw)=>{const c=Math.floor(maxVol/(layer*lw));return v>c?'effektiv ca. '+c+' mm/s (Grenze '+de(maxVol,1)+' mm³/s)':''};
  const sp_outer=o==='watertight'?Math.round(m.outer[pi]*WATERTIGHT_OUTER_FACTOR):m.outer[pi],sp_inner=m.inner[pi],sp_fill=m.fill[pi];
  const nOuter=capNote(sp_outer,N.lwo),nInner=capNote(sp_inner,N.lw),nFill=capNote(sp_fill,N.lw);
  const accelTxt=m.accel>0?de(m.accel,0)+' mm/s²':'Werksprofil beibehalten';
  const accelNote=m.accel>0?'':'bei Ringing reduzieren';
  const retr=de(m.retrLen,1)+' mm / '+de(m.retrSpeed,0)+' mm/s';
  // Rückzug bleibt beim Orca-Standard (Filament- bzw. Druckerprofil); der Wert aus den S1-Tests ist nur Richtwert
  const retrRow=['Rückzug','Orca-Standard','Richtwert '+retr+' (am S1 getestet)'];
  const enclosed=m.kind==='abs'||m.kind==='asa';

  // Stützen
  const a=geom?analyze(geom,+I.thresh):null;
  let supOn=false,sup,supNeed;
  if(o==='dumpling'&&tpu){
    sup='Geometrie prüfen';supNeed='Vor dem Druck die Schichtvorschau prüfen: Die Oberseite darf keine freien Bahnen oder Löcher zeigen.';
  }else if(!a){
    sup=s==='avoid'?'Nur bei zwingender Geometrie':'Nach Überhang prüfen';
    supNeed='Noch keine STL geladen. In der Slicer-Vorschau die Überhangfarbe prüfen.';
    supOn=o==='overhang'&&s!=='avoid';
  }else if(a.level==='none'){
    sup='Nicht nötig';supNeed='Keine relevanten Überhänge über '+a.th+'°. Flächen, die auf dem Druckbett liegen, werden nicht mitgezählt. Kleine Fasen und Bohrungen druckt der Slicer ohne Stütze.';
  }else if(a.level==='few'){
    if(s==='allow'){supOn=true;sup='Nur kritische Bereiche';}
    else{sup='Meist nicht nötig – Vorschau prüfen';}
    supNeed='Einzelne Überhänge (ca. '+de(a.flagged,0)+' mm², '+de(a.ratio*100,1)+' % der Oberfläche). Meist druckbar; nur stützen, wenn die Vorschau frei hängende Bahnen zeigt.';
  }else{
    if(s==='avoid'){sup='Vermeiden: zuerst Modell drehen';supNeed='Deutliche Überhänge (ca. '+de(a.flagged,0)+' mm²). Vor dem Aktivieren von Stützen das Modell im Slicer drehen oder um 10–20° kippen – das reduziert Stützen oft mehr als jede Einstellung. Nur wenn das nicht reicht, Baumstützen „nur kritische Bereiche“.'}
    else{supOn=true;sup='Ja – Baumstützen';supNeed='Deutliche Überhänge erkannt (ca. '+de(a.flagged,0)+' mm², '+de(a.ratio*100,1)+' % der Oberfläche'+(a.ceiling>50?', davon ca. '+de(a.ceiling,0)+' mm² fast waagerecht':'')+'). Baumstützen ab Druckbett, nur kritische Bereiche.'}
  }

  // Haftung
  let brim='Nicht nötig',brimNote='';
  if(geom){
    const foot=Math.max(1,geom.bedArea),slender=geom.z/Math.sqrt(foot),big=Math.max(geom.x,geom.y);
    if(foot<150||slender>4){brim='5–8 mm';brimNote='kleine Aufstandsfläche erkannt ('+de(foot,0)+' mm²)'}
    else if(enclosed&&big>80){brim='5 mm';brimNote='ABS/ASA neigt bei größeren Teilen zum Verziehen'}
    else if(big>110&&!tpu){brimNote='großes flaches Teil: wenn Ecken abheben, 3–5 mm Brim oder Mausohren'}
  }
  if(o==='tire'&&tpu&&brim==='Nicht nötig'){brim='0–5 mm';brimNote='bei Haftungsproblemen'}

  // Naht
  const round=['tire','dumpling','case','decor','overhang'].includes(o);
  const seam=round?'Ausgerichtet':'Hinten';
  const fanNote=tpu?'30–45 %':enclosed?'niedrig halten':'';

  // Übersicht
  const rows=[
    ['Düse',nozzle+' °C',[tOff?(tOff>0?'+':'−')+Math.abs(tOff)+' °C für '+NOZZLE_MATERIALS[mSel].label:'',wtBoost?'+'+wtBoost+' °C für dichte Schichten':''].filter(Boolean).join(' · ')],['Heizbett',m.bed+' °C',esc(m.bedNote)],
    ['Schichthöhe / erste Schicht',de(layer,2)+' / '+de(N.fl,2)+' mm'],
    ['Außenwand / Innenwand',sp_outer+' / '+sp_inner+' mm/s',nOuter||nInner],['Füllung / Travel',sp_fill+' / '+m.travel+' mm/s',nFill],
    ['Wandlinien',base.wr&&soft?base.wr:w],['Obere / untere Schichten',t+' / '+b],
    ['Fülldichte / Muster',(base.ir&&soft?base.ir:inf+' %')+' / '+pattern],
    ['Lüfter',m.fan+' %',fanNote],['Max. Volumenstrom',de(maxVol,1)+' mm³/s',volF!==1?'umgerechnet für '+nozLabel:''],
    ['Beschleunigung',accelTxt,accelNote],retrRow,['Support',sup],['Brim',brim,brimNote]
  ];

  const supZ=supportZGap(layer,m.kind,tpu);
  const ordered=[
    ['Qualität',[
      ['Schichthöhe',de(layer,2)+' mm'],['Höhe der ersten Schicht',de(N.fl,2)+' mm'],['Linienbreite Standard',de(N.lw,2)+' mm'],['Linienbreite erste Schicht',de(N.lwf,2)+' mm'],
      ['Linienbreite Außenwand',de(N.lwo,2)+' mm'],['Linienbreite Innenwand',de(N.lw,2)+' mm'],['Elefantenfußkompensation',enclosed?'0,15 mm':'0,1 mm'],
      ['Nahtposition',seam],['Glätten','Keine',o==='decor'?'nur bei großen flachen Oberseiten „Obere Oberfläche“':'']]],
    ['Struktur',[
      ['Wandlinien',base.wr&&soft?base.wr:w],['Obere Schichten',t],['Untere Schichten',b],
      ['Fülldichte',base.ir&&soft?base.ir:inf+' %'],['Füllmuster',pattern],['Lückenfüllung','Überall']]],
    ['Geschwindigkeit',[
      ['Erste Schicht',m.first+' mm/s'],['Füllung erste Schicht',Math.max(m.first,tpu?20:m.first)+' mm/s'],['Außenwand',sp_outer+' mm/s',nOuter],['Innere Wand',sp_inner+' mm/s',nInner],
      ['Füllung',sp_fill+' mm/s',nFill],['Obere Fläche',top+' mm/s'],['Lückenfüllung',m.gap+' mm/s'],['Travel',m.travel+' mm/s'],
      ['Beschleunigung',accelTxt,accelNote]].concat(tpu?[['Überhänge','15 / 12 / 10 mm/s'],['Brücken extern / intern','15 / 20 mm/s']]:[])],
    ['Stützen',supOn?[
      ['Stützstrukturen','Aktivieren'],['Typ','Baum (automatisch)'],['Schwellenwinkel',sp.angle+'°'],['Nur kritische Bereiche','Ein'],
      ['Nur auf Druckplatte','Ein, zuerst testen'],['Kleine Überhänge entfernen',sp.small],['Raft','0 Schichten'],
      ['Oberer Z-Abstand',de(supZ.top,2)+' mm'],['Unterer Z-Abstand',de(supZ.bottom,2)+' mm'],['Stützen/Objekt XY-Abstand',sp.xy],
      ['Obere Schnittstellenschichten',sp.iface],['Schnittstellenabstand',sp.gap]
    ]:[['Stützstrukturen','Nicht aktivieren',sup==='Nicht nötig'?'':sup],['Raft','0 Schichten']]],
  ];
  if(o==='multicolor'){
    if(printer.multicolorSystem==='ace'){
      ordered.push(['Multimaterial',[
        ['Reinigungsturm','Ein, Breite 30–35 mm','kostet weniger Material als der Standardturm'],
        ['In Füllung spülen','Ein','„In dieses Objekt spülen“ aus lassen'],
        ['Reinigungsvolumen','Multiplikator 0,8','Wechsel zu Weiß bei Verfärbung wieder erhöhen'],
        ['Filament-Zuordnung','Slicer-Farbe = ACE-Fach','vor „Druck starten“ im Dialog prüfen']]]);
    }else{
      ordered.push(['Mehrfarbig (Werkzeugwechsler)',[
        ['Werkzeugwechsel','Automatisch pro Farbe/Material','kein Reinigungsturm nötig – jeder Kopf bleibt vorgeheizt'],
        ['Werkzeug-Zuordnung','Slicer-Farbe = Toolhead-Slot','vor Druckstart in OrcaSlicer prüfen'],
        ['Rüstzeit pro Wechsel','ca. 5 s laut Hersteller','wirkt sich kaum auf die Gesamtdruckzeit aus']]]);
    }
  }
  const dryNeed=tpu||m.kind==='petg'||m.abrasive;
  ordered.push(['Material / Filament',[
    ['Profilname',esc(m.name)],['Düse',nozzle+' °C','erste und weitere Schichten'],['Herstellerbereich',esc(m.range)||'Angabe auf der Rolle'],
    ['Heizbett',m.bed+' °C',esc(m.bedNote)],['Lüfter erste Schicht',m.fanFirst+' %'],['Lüfter Folgeschichten',m.fan+' %',fanNote],
    ['Maximale Volumengeschwindigkeit',de(maxVol,1)+' mm³/s'],['Durchflussverhältnis',de(m.flow,2)]]
    .concat(m.pa!=null&&m.pa!==''?[['Pressure Advance',de(m.pa,3)]]:[]).concat([retrRow,['Filament trocken',dryNeed?'Ja, unbedingt':'Ja',esc(m.dry)]])]);
  ordered.push(['Sonstiges',[['Düsendurchmesser',nozLabel],['Brim',brim,brimNote],['Z-Hop',de(m.zhop,1)+' mm'],['Erste Schicht beobachten','Ja']]]);

  // Warnungen / Hinweise
  if(m.abrasive&&!NOZZLE_MATERIALS[mSel].hardened)danger.push('Faserverstärktes Filament schleift nicht gehärtete Düsen ('+esc(NOZZLE_MATERIALS[mSel].label)+') schnell aus. Nur mit gehärteter Stahldüse drucken.');
  if(m.abrasive&&+dSel<0.4)danger.push('Faserverstärkte Filamente verstopfen feine Düsen ('+String(+dSel).replace('.',',')+' mm) leicht – mindestens 0,4 mm, besser 0,6 mm verwenden.');
  if(tpu&&o==='multicolor'&&printer.multicolorSystem==='ace')danger.push('TPU in der Regel nicht über die ACE-Pro-Station zuführen, sondern über den externen Spulenhalter (Herstellerangabe prüfen).');
  if(printer.orca&&printer.orca.fixedStartTemp&&printer.orca.fixedStartTemp!==nozzle)danger.push('Der Start-G-Code im OrcaSlicer-Profil von '+esc(printer.label)+' heizt fest auf '+printer.orca.fixedStartTemp+' °C – Orca setzt dann keine eigene Düsentemperatur, gedruckt wird mit '+printer.orca.fixedStartTemp+' statt '+nozzle+' °C. Im Druckerprofil den Start-G-Code auf „M109 S[nozzle_temperature_initial_layer]“ ändern.');
  if(printer.orca)warn.push('<b>'+esc(printer.label)+':</b> Temperaturen und Materialwerte stammen aus Tests am Kobra S1 und sind hier allgemeine Startwerte. Geschwindigkeiten, Beschleunigung und Volumenstrom sind auf das OrcaSlicer-Profil dieses Druckers begrenzt. Ersten Druck beobachten und über „Werte anpassen“ nachjustieren.');
  if(printer.id==='snapmaker_u1')warn.push('<b>Snapmaker U1:</b> Temperatur- und Geschwindigkeitswerte sind von Anycubic-Tests übernommen, nicht auf dem U1 gegengetestet. Der U1 kann mechanisch deutlich mehr (CoreXY, laut Hersteller bis 500 mm/s) – vorsichtig steigern und die ersten Schichten sowie die Schichtvorschau genau beobachten.');

  if(m.notes)warn.push('<b>Deine Notizen:</b> '+esc(m.notes).replace(/\n/g,'<br>'));
  if(dSel!==refKey||mSel!==refMat)warn.push('<b>Umgerechnet:</b> Das Profil gilt für '+de(+refKey,refKey==='0.25'?2:1)+' mm '+(NOZZLE_MATERIALS[refMat]||NOZZLE_MATERIALS.steel_hardened).label+', gewählt ist '+nozLabel+'. Temperatur '+(tOff?(tOff>0?'+':'−')+Math.abs(tOff)+' °C':'unverändert')+', Volumenstrom ×'+de(volF,2)+', Schichthöhe und Linienbreite angepasst. Das ist eine Näherung – nach dem ersten Druck prüfen und über „Werte anpassen“ speichern.');
  if(+dSel<0.4)warn.push('<b>Feine Düse:</b> Nur für sehr kleine Details sinnvoll; die Druckzeit steigt stark.');
  if(o==='dumpling'&&tpu)warn.push('<b>Quetschbares Teil:</b> Richtwert 2 Wände, 3 obere und 3 untere Schichten, 5 % Gyroid. Sehr dünne Schalen (1 Wand, 0 % Füllung) geben der Deckschicht keine Auflage. Für weicheres Ergebnis nur die Fülldichte senken und in der Vorschau prüfen. Bei Kinderspielzeug auf lose Fäden, scharfe Kanten und verschluckbare Kleinteile achten.');
  if(tpu)warn.push('<b>TPU:</b> Bewusst langsam. Schnelle Werksprozessprofile sind für TPU ungeeignet – im Slicer ein eigenes, langsames Prozessprofil speichern und auswählen.');
  if(m.kind==='petg')warn.push('<b>PETG:</b> Haftet auf glatter PEI-Platte sehr stark – Klebestift als Trennschicht verwenden, sonst kann die Beschichtung ausreißen. Neigt zu Fäden: bei Bedarf Rückzug leicht erhöhen.');
  if(enclosed){
    if(printer.enclosureBuiltin)warn.push('<b>'+KIND_LABEL[m.kind]+':</b> Haube und Tür geschlossen lassen, Lüfter niedrig halten, Bett vor dem Start einige Minuten vorheizen. Beim Drucken entstehen Styrol-Dämpfe und ultrafeine Partikel – Raum gut lüften, nicht in Wohn- oder Schlafräumen drucken.');
    else warn.push('<b>'+KIND_LABEL[m.kind]+':</b> Der '+esc(printer.label)+' hat serienmäßig kein Gehäuse. Für ABS/ASA möglichst die optionale Top Cover verwenden oder zumindest für eine zugluftfreie, gut belüftete Umgebung sorgen; Bett vor dem Start einige Minuten vorheizen. Beim Drucken entstehen Styrol-Dämpfe und ultrafeine Partikel – Raum gut lüften, nicht in Wohn- oder Schlafräumen drucken.');
  }
  if(m.kind==='pla'&&printer.enclosureBuiltin)warn.push('<b>PLA im geschlossenen Drucker:</b> Bei langen Drucken den Deckel etwas öffnen – zu warme Luft im Bauraum kann Hitzestau im Hotend verursachen.');
  if(effectiveStatus==='generic')warn.push('<b>'+esc(short)+':</b> Allgemeine Startwerte. Nach dem ersten Druck anpassen und über „Werte anpassen“ als eigene Werte speichern. Bei matter oder lückiger Oberfläche die maximale Volumengeschwindigkeit um 2–3 mm³/s senken.');
  if(o==='precision')danger.push('Präzisionsteil: Vorher einen kleinen Testkörper mit dem kritischen Maß drucken und nachmessen. Weichen die Maße systematisch ab, in OrcaSlicer unter Prozesseinstellungen → Erweitert die X-Y-Konturkompensation (xy_contour_compensation für Außenkonturen, xy_hole_compensation für Löcher) oder das Durchflussverhältnis anpassen.');
  if(o==='multicolor')warn.push('<b>Mehrfarbig:</b> Jeder Farbwechsel kostet Zeit und Spülmaterial. Kleine Details in einer eigenen Farbe verursachen viele zusätzliche Wechsel. Eine größere Schichthöhe reduziert die Zahl der Wechsel.');
  if(o==='overhang'&&!a)warn.push('<b>Freiform:</b> Zuerst die Ausrichtung prüfen. Das Modell um 10–20° zu kippen reduziert Stützen oft deutlicher als jede Parameteränderung.');
  if(o==='watertight')warn.push('<b>Wasserdicht:</b> Dicht wird ein Teil über die Wand: '+w+' Wandlinien, '+t+' / '+b+' Deck-/Bodenschichten, +'+WATERTIGHT_TEMP_BOOST+' °C und eine langsamere Außenwand sind gesetzt; im Slicer „Lückenfüllung überall“. Lüfter eher niedrig halten. PETG und ASA werden dichter als PLA. Einfache Gefäße ohne Deckel: Vasenmodus mit breiter Linie (0,6–0,8 mm) ist oft dichter. Für dauerhaften Wasserkontakt oder Druck innen mit Epoxidharz beschichten. Nicht für Trinkwasser oder Lebensmittel geeignet – nach dem Druck mit Wasser testen.');
  if(o==='thin')warn.push('<b>Dünnwandig:</b> In der Vorschau prüfen, ob schmale Wände wirklich Bahnen bekommen. Bei zu dünnen Stellen im Slicer „Dünne Wände erkennen“ aktivieren.');

  return {m,ob,o,g,tpu,layer,sp,rows,ordered,sup,supOn,supNeed,warn,danger,a,nozLabel,dryNeed,printer,effectiveStatus,
    nozzle,w,t,b,inf,sp_outer,sp_inner,sp_fill,dSel,top,pattern,
    // Neu seit v5 (für den 3MF-Export); tests/compare-v4.js blendet diese Felder aus.
    maxVol,firstLayer:N.fl,brim,seam,supZ};
}
