'use strict';
/* Konfigurator-Panel: Auswahl, Ergebnisanzeige, Editor, Import/Export – aus v4. */
let project=null;    // geladenes Modell: {name, parts:[{name, geom, extruder, plate}], selected, threemf, notes}
let geom=null;       // Analyse des gewählten Teils (makeGeom)
let lastOrdered=[];
let lastResult=null;  // letztes compute()-Ergebnis, für den 3MF-Export
let orcaFilamentJson='',orcaProcessJson='';

function currentPrinter(){return PRINTERS[$('printer').value]||PRINTERS.kobra_s1}
function fillNozzleMaterialSelect(){
  const p=currentPrinter(),sel=$('nozM'),cur=sel.value;
  sel.innerHTML=p.nozzleOptions.map(k=>'<option value="'+k+'"'+(k===p.nozzleDefault?' selected':'')+'>'+esc(NOZZLE_MATERIALS[k].label)+'</option>').join('');
  if(p.nozzleOptions.includes(cur))sel.value=cur;
}

$('supportLevel').addEventListener('change',()=>{const a=supportProfile($('supportLevel').value).angle;$('thresh').value=a;$('threshVal').textContent=a+'°';Stability.paint(geom)});
['material','nozD','nozM'].forEach(id=>$(id).addEventListener('change',()=>{store.last[id]=$(id).value;persist();update()}));
['object','goal','load','support','supportLevel'].forEach(id=>$(id).addEventListener('change',update));
$('printer').addEventListener('change',()=>{store.last.printer=$('printer').value;persist();fillNozzleMaterialSelect();store.last.nozM=$('nozM').value;persist();update()});

// Speichert und zeigt einen Hinweis, wenn der Browser kein dauerhaftes Speichern erlaubt.
function persist(){
  const ok=saveStore(),w=$('storeWarn');
  if(!ok){w.innerHTML='<b>Hinweis:</b> Dieser Browser erlaubt hier kein dauerhaftes Speichern. Deine Werte gelten nur bis zum Schließen – bitte über <b>Exportieren</b> sichern.';w.classList.remove('hidden')}
  else w.classList.add('hidden');
  return ok;
}
function currentInput(){
  const I={};
  ['printer','material','nozD','nozM','object','goal','load','support','supportLevel','thresh'].forEach(id=>{I[id]=$(id).value});
  return I;
}

// Kennwert-Kachel für die Übersicht; die ersten Zeilen (Temperaturen, Schichthöhe) sind hervorgehoben.
const KEY_ROWS=['Düse','Heizbett','Schichthöhe / erste Schicht'];
function specCell(x){
  const h=helpFor(x[0],getMat($('material').value).kind);
  return '<div class="spec-cell'+(KEY_ROWS.includes(x[0])?' key':'')+'"><span class="k">'+esc(x[0])+(h?'<span class="help" title="'+esc(h)+'">?</span>':'')+'</span>'+
    '<span class="v">'+x[1]+'</span>'+(x[2]?'<span class="n">'+x[2]+'</span>':'')+'</div>';
}

/* Zusätzlicher, gut sichtbarer Hinweis (Achtung-Box statt nur „Hinweise"): kleine runde Löcher
   (⌀ bis 6 mm, typisch für Wellen/Stifte/Lager) können auf ineinandergreifende oder eng passende
   Geometrie hindeuten – dort hilft oft die X-Y-Konturkompensation in Orca, die dieses Tool nicht
   selbst setzt. Keine Zahnrad-Erkennung (zu unsicher), nur ein Hinweis anhand vorhandener Löcher;
   bei „Präzisionsteil“ steht die ausführlichere Version schon in r.danger, daher hier nicht doppelt. */
function precisionHint(r){
  if(r.o==='precision'||!project||project.threemf)return null;
  const part=project.parts[project.selected];
  if(!part||typeof partHoles!=='function')return null;
  const small=partHoles(part).filter(h=>2*h.r<=6);
  if(!small.length)return null;
  return 'Kleine Löcher erkannt (⌀ bis '+de(2*Math.max(...small.map(h=>h.r)),1)+' mm, z. B. für Wellen/Stifte) – bei ineinandergreifenden oder eng passenden Teilen (z. B. Zahnrädern) vorher einen Testkörper mit dem kritischen Maß drucken und nachmessen. Weichen die Maße ab, in OrcaSlicer unter Prozesseinstellungen → Erweitert die X-Y-Konturkompensation anpassen (xy_contour_compensation für Außenkonturen/Zähne, xy_hole_compensation für Löcher).';
}

function update(){
  if(typeof savePartFromForm==='function')savePartFromForm();
  const r=compute(currentInput(),geom,{getMat,settings:store.settings});lastOrdered=r.ordered;
  const row=x=>rowHTML(x,r.m.kind);
  $('mainTitle').textContent=r.printer.label+' – Druck-Konfigurator';
  document.title=r.printer.label+' – Druck-Konfigurator';
  $('orderedTitle').textContent='Einstellungen in '+r.printer.slicer+'-Reihenfolge';
  $('orderedIntro').innerHTML='Die Bezeichnungen orientieren sich an '+esc(r.printer.slicer)+'. Je nach Version und „Erweitert“-Schalter liegen einzelne Felder tiefer in der jeweiligen Registerkarte. Die Nahtposition gehört zu <b>Qualität</b>, nicht zu Struktur.';
  const st=STATUS[r.effectiveStatus]||STATUS.generic;
  $('matBadge').innerHTML='<span class="badge '+st[0]+'">'+st[1]+'</span>';
  document.body.dataset.printer=r.printer.id;
  document.querySelectorAll('.printer-switch [data-printer]').forEach(b=>{const on=b.dataset.printer===r.printer.id;b.setAttribute('aria-checked',String(on));b.tabIndex=on?0:-1});
  const T=s=>typeof tr==='function'?tr(s):s;   // Sprachwahl (js/i18n.js): zusammengesetzte Texte teilweise übersetzen
  $('resultPrinter').textContent=T('Startprofil')+' · '+r.printer.label;
  $('settings').innerHTML=r.rows.map(specCell).join('');
  $('orderedSettings').innerHTML=r.ordered.map(g=>'<div class="order-group"><div class="order-title">'+g[0]+'</div><div class="order-body">'+g[1].map(row).join('')+'</div></div>').join('');
  $('title').textContent=T(r.m.name)+' – '+T(r.ob.label)+' · '+T(GOAL_LABEL[r.g]);
  $('summary').innerHTML=(geom?de(geom.x,1)+' × '+de(geom.y,1)+' × '+de(geom.z,1)+' mm · ':'')+'<span class="badge '+st[0]+'" style="margin-left:0">'+st[1]+'</span> '+
    esc(r.m.overridden?'Standardprofil mit deinen eigenen Werten.':r.m.src)+' Düse: '+esc(r.nozLabel)+'.';
  orcaFilamentJson=buildOrcaFilamentJSON(r);
  orcaProcessJson=buildOrcaProcessJSON(r);
  $('orcaNote').innerHTML=orcaWarningText(r);
  const dangerAll=r.danger.concat(precisionHint(r)?[precisionHint(r)]:[]);
  $('danger').innerHTML=dangerAll.length?'<b>Achtung:</b><br>'+dangerAll.map(esc).join('<br>'):'';
  const stabHint=typeof Stability!=='undefined'&&geom?Stability.hintLine(geom):'';
  $('warning').innerHTML=r.warn.concat(stabHint?[stabHint]:[]).join('<br><br>');
  $('checks').innerHTML='<b>Vor dem Druck:</b> Filamentprofil prüfen · Düse '+esc(r.nozLabel)+' · Bett reinigen · erste Schicht beobachten'+(r.dryNeed&&r.m.dry?' · '+esc(r.m.dry):'')+(geom?'<br>STL-Maße und Überhanganalyse ('+r.a.th+'°) wurden berücksichtigt.':'');
  $('supportGuide').innerHTML='<h3>Stützen-Empfehlung</h3><b>'+esc(r.sup)+'</b><br>'+esc(r.supNeed)+
    (r.supOn?'<br><br><b>So stellst du es in '+esc(r.printer.slicer)+' ein:</b><br>1. <i>Stützstrukturen aktivieren</i> einschalten.<br>2. <i>Typ: Baum (automatisch)</i> und <i>nur kritische Bereiche</i> aktivieren.<br>3. <i>Schwellenwinkel: '+r.sp.angle+'°</i>.<br>4. <i>Nur auf Druckplatte</i> zuerst testen; bei unerreichbaren Innenflächen deaktivieren.<br>5. Raft aus. Immer die Schichtvorschau prüfen.':'<br><br>Im Slicer <i>Stützstrukturen aktivieren</i> ausgeschaltet lassen und in der Vorschau kurz kontrollieren, ob keine Bahnen frei in der Luft hängen.');
  if(r.a){const t=r.a.level==='none'?'Keine relevanten Überhänge über '+r.a.th+'° (Bodenfläche ausgenommen).':'Über '+r.a.th+'°: ca. '+de(r.a.flagged,0)+' mm² ('+de(r.a.ratio*100,1)+' % der Oberfläche, Bodenfläche ausgenommen).';document.querySelectorAll('.oh-info').forEach(el=>{el.textContent=t})}
  const tpu=r.tpu,sp=r.sp;
  if(r.supOn){
    const p=[['Stützstrukturen','Aktivieren, nur kritische Bereiche'],['Typ','Baum (automatisch)'],['Schwellenwinkel',sp.angle+'°'],['Nur auf Druckplatte','zunächst aktivieren'],['Kleine Überhänge entfernen',sp.small],['Druckbasis/Raft','0 Schichten'],['Oberer Z-Abstand',de(r.supZ.top,2)+' mm'],['Unterer Z-Abstand',de(r.supZ.bottom,2)+' mm'],['Wände um Stützstrukturen','0'],['Abstand Grundmuster',tpu?'3,0 mm':'2,5–3,0 mm'],['Obere Schnittstellenschichten',sp.iface],['Untere Schnittstellenschichten','1'],['Oberer Schnittstellenabstand',sp.gap],['Stützen/Objekt XY-Abstand',sp.xy],['Stützen/Objekt Abstand erste Schicht',tpu?'0,25 mm':'0,20 mm'],['Stützspitze','0,8 mm'],['Ast-Dichte',sp.density],['Astabstand',sp.branch],['Stützast-Durchmesser','2,0 mm']];
    $('supportParams').innerHTML='<div class="grid">'+p.map(x=>'<div><b>'+x[0]+'</b><br><span class="muted">'+x[1]+'</span></div>').join('')+'</div>';
  }else{
    $('supportParams').innerHTML='<p class="muted" style="margin:0">Für die aktuelle Auswahl'+(geom?' und dieses Modell':'')+' werden keine Stützen empfohlen. Die Stützparameter erscheinen hier, sobald Stützen nötig sind oder du bei „Support“ „Support erlaubt“ wählst und das Modell Überhänge hat.</p>';
  }
  lastResult=r;
  if(typeof renderPartList==='function')renderPartList();
  if(typeof renderOrient==='function')renderOrient();
  if(typeof renderPartScope==='function')renderPartScope();
  if(typeof renderSteps==='function')renderSteps();
  if(typeof renderHoles==='function')renderHoles();
  if(typeof Stability!=='undefined')Stability.renderCard();
  if(typeof updateExportMenu==='function')updateExportMenu(r);
  if(typeof enhanceHelp==='function')enhanceHelp();
}

/* ================= AUSWAHLLISTE & MEINE WERTE ================= */
function fillMaterialSelect(sel){
  const list=allMats(),cur=sel||$('material').value;
  const std=list.filter(m=>m.builtin),own=list.filter(m=>!m.builtin);
  const opt=m=>'<option value="'+esc(m.id)+'">'+(m.overridden?'★ ':'')+esc(m.name)+'</option>';
  $('material').innerHTML=(own.length?'<optgroup label="Eigene Filamente">'+own.map(opt).join('')+'</optgroup>':'')+
    '<optgroup label="Standardprofile (★ = mit eigenen Werten)">'+std.map(opt).join('')+'</optgroup>';
  $('material').value=list.some(m=>m.id===cur)?cur:'pla_hs';
  renderMyList();
}
function renderMyList(){
  const list=allMats().filter(m=>m.overridden||!m.builtin);
  $('myList').innerHTML=list.length?list.map(m=>'<div class="mylist-item"><span>'+esc(m.name)+'<br><span class="muted" style="font-size:12px">'+(m.builtin?'Standardprofil, eigene Werte':'Eigenes Filament')+' · '+de(m.refD,m.refD===0.25?2:1)+' mm '+(NOZZLE_MATERIALS[m.refMat||'steel_hardened']||NOZZLE_MATERIALS.steel_hardened).label+'</span></span><button class="linkbtn" data-sel="'+esc(m.id)+'" type="button">Auswählen</button></div>').join('')
    :'Noch keine eigenen Werte gespeichert.';
  $('myList').querySelectorAll('[data-sel]').forEach(b=>b.addEventListener('click',()=>{$('material').value=b.dataset.sel;store.last.material=b.dataset.sel;persist();update()}));
}

/* ================= EDITOR ================= */
const FIELDS=[
 ['Allgemein',[
  ['name','Profilname','text'],['kind','Filamenttyp','kind'],['abrasive','Faserverstärkt (Carbon/Glas)','bool'],
  ['refD','Werte ermittelt mit Düse','refD'],['refMat','Düsenmaterial dabei','refMat']]],
 ['Temperaturen',[
  ['nozzle','Düsentemperatur','tri','°C'],['range','Herstellerbereich (Rolle)','text'],['bed','Heizbett','num','°C'],['bedNote','Platte / Hinweis','text']]],
 ['Filamentprofil',[
  ['maxVol','Max. Volumengeschwindigkeit','num','mm³/s'],['flow','Durchflussverhältnis','num',''],['pa','Pressure Advance (leer = weglassen)','numopt',''],
  ['fanFirst','Lüfter erste Schicht','num','%'],['fan','Lüfter Folgeschichten','num','%'],
  ['retrLen','Rückzug Länge','num','mm'],['retrSpeed','Rückzug Geschwindigkeit','num','mm/s'],['zhop','Z-Hop','num','mm']]],
 ['Geschwindigkeiten',[
  ['first','Erste Schicht','num','mm/s'],['outer','Außenwand','tri','mm/s'],['inner','Innenwand','tri','mm/s'],['fill','Füllung','tri','mm/s'],
  ['top','Obere Fläche','num','mm/s'],['gap','Lückenfüllung','num','mm/s'],['travel','Travel','num','mm/s'],['accel','Beschleunigung (0 = Werksprofil)','num','mm/s²']]],
 ['Notizen',[['dry','Trocknung','text'],['notes','Meine Erfahrungen','area']]]
];
const EDIT_KEYS=FIELDS.flatMap(g=>g[1].map(f=>f[0]));
const dlg=$('editor');
function openDialog(){if(dlg.showModal)dlg.showModal();else dlg.setAttribute('open','')}
function closeDialog(){if(dlg.close)dlg.close();else dlg.removeAttribute('open')}
dlg.addEventListener('click',e=>{if(e.target===dlg)closeDialog()});

function inputFor(f,v){
  const [k,,type,unit]=f;const id='ed_'+k;
  const u=unit?'<span class="u">'+unit+'</span>':'';
  if(type==='text')return '<div class="ed-in"><input id="'+id+'" value="'+esc(v??'')+'"></div>';
  if(type==='area')return '<div class="ed-in"><textarea id="'+id+'" rows="3" placeholder="z. B. ab 225 °C weniger Fäden, Brim bei kleinen Teilen nötig …">'+esc(v??'')+'</textarea></div>';
  if(type==='num'||type==='numopt')return '<div class="ed-in"><input id="'+id+'" inputmode="decimal" value="'+(v===null||v===undefined||v===''?'':String(v).replace('.',','))+'">'+u+'</div>';
  if(type==='bool')return '<div class="ed-in"><input type="checkbox" id="'+id+'"'+(v?' checked':'')+'> <span class="muted" style="font-size:13px">nur mit gehärteter Düse</span></div>';
  if(type==='kind')return '<div class="ed-in"><select id="'+id+'">'+Object.keys(KIND_LABEL).map(x=>'<option value="'+x+'"'+(x===v?' selected':'')+'>'+KIND_LABEL[x]+'</option>').join('')+'</select></div>';
  if(type==='refD')return '<div class="ed-in"><select id="'+id+'">'+Object.keys(NOZ).map(x=>'<option value="'+x+'"'+(nkey(v)===x?' selected':'')+'>'+de(+x,x==='0.25'?2:1)+' mm</option>').join('')+'</select></div>';
  if(type==='refMat')return '<div class="ed-in"><select id="'+id+'">'+['steel_hardened','steel_stainless','brass'].map(x=>'<option value="'+x+'"'+(x===(v||'steel_hardened')?' selected':'')+'>'+NOZZLE_MATERIALS[x].label+'</option>').join('')+'</select></div>';
  if(type==='tri')return '<div class="ed-in"><div class="tri">'+[0,1,2].map(i=>'<div><input id="'+id+'_'+i+'" inputmode="decimal" value="'+String((v||[])[i]??'').replace('.',',')+'"><small>'+['Qualität','Ausgewogen','Schnell'][i]+'</small></div>').join('')+'</div>'+u+'</div>';
  return '';
}
function readForm(){
  const out={},errs=[];
  FIELDS.forEach(g=>g[1].forEach(f=>{
    const [k,label,type]=f,id='ed_'+k;
    if(type==='text'||type==='area'){out[k]=$(id).value.trim()}
    else if(type==='bool'){out[k]=$(id).checked}
    else if(type==='kind'||type==='refMat'){out[k]=$(id).value}
    else if(type==='refD'){out[k]=+$(id).value}
    else if(type==='numopt'){const s=$(id).value.trim();if(!s)out[k]=null;else{const n=num(s);if(isNaN(n))errs.push(label);else out[k]=n}}
    else if(type==='num'){const n=num($(id).value);if(isNaN(n))errs.push(label);else out[k]=n}
    else if(type==='tri'){const a=[0,1,2].map(i=>num($(id+'_'+i).value));if(a.some(isNaN))errs.push(label);else out[k]=a}
  }));
  if(!out.name)errs.push('Profilname');
  if(out.maxVol<=0)errs.push('Max. Volumengeschwindigkeit muss größer 0 sein');
  return {out,errs};
}
function openEditor(mode){
  // mode: 'edit' (aktuelles Filament) oder 'new'
  let src,title,sub,isBuiltin=false,isOwn=false,overridden=false;
  if(mode==='edit'){
    src=getMat($('material').value);isBuiltin=!!src.builtin;isOwn=!src.builtin;overridden=!!src.overridden;
    title='Werte anpassen: '+src.name;
    sub=isBuiltin?'Deine Werte ersetzen das Standardprofil. „Auf Standard zurücksetzen“ stellt es wieder her.':'Eigenes Filament bearbeiten.';
  }else{
    src=Object.assign({},builtinOf('pla'),{name:'Neues Filament',notes:'',status:'user'});
    title='Neues Filament anlegen';
    sub='Startwerte werden vom gewählten Filamenttyp übernommen – danach deine eigenen Werte eintragen.';
  }
  $('edTitle').textContent=title;$('edSub').textContent=sub;
  const renderBody=vals=>{
    $('edBody').innerHTML=FIELDS.map(g=>'<div class="ed-group"><h4>'+g[0]+'</h4>'+g[1].map(f=>'<div class="ed-row"><label for="ed_'+f[0]+'">'+f[1]+'</label>'+inputFor(f,vals[f[0]])+'</div>').join('')+'</div>').join('');
    if(mode==='new')$('ed_kind').addEventListener('change',()=>{
      const k=$('ed_kind').value;
      renderBody(Object.assign({},builtinOf(KIND_TEMPLATE[k]),{name:$('ed_name').value,notes:$('ed_notes').value,kind:k}));
    });
  };
  renderBody(src);
  let foot='<button class="btn sec" type="button" id="edCancel">Abbrechen</button>';
  if(isBuiltin&&overridden)foot+='<button class="btn danger" type="button" id="edReset">Auf Standard zurücksetzen</button>';
  if(isOwn)foot+='<button class="btn danger" type="button" id="edDelete">Löschen</button>';
  if(mode==='edit')foot+='<button class="btn sec" type="button" id="edCopy">Als neues Filament speichern</button>';
  foot+='<button class="btn" type="button" id="edSave">Speichern</button>';
  $('edFoot').innerHTML=foot;
  $('edCancel').onclick=closeDialog;
  if($('edReset'))$('edReset').onclick=()=>{if(!confirm('Eigene Werte für „'+src.name+'“ löschen und Standardwerte wiederherstellen?'))return;delete store.profiles[src.id];persist();closeDialog();fillMaterialSelect(src.id);update()};
  if($('edDelete'))$('edDelete').onclick=()=>{if(!confirm('Filament „'+src.name+'“ endgültig löschen?'))return;delete store.profiles[src.id];persist();closeDialog();fillMaterialSelect('pla_hs');update()};
  const save=asNew=>{
    const {out,errs}=readForm();
    if(errs.length){alert('Bitte prüfen: '+errs.join(', '));return}
    let id;
    if(asNew||mode==='new'){id='u'+Date.now().toString(36);if(asNew&&out.name===src.name)out.name+=' (Kopie)'}
    else id=src.id;
    store.profiles[id]=out;
    persist();closeDialog();fillMaterialSelect(id);store.last.material=id;persist();update();
  };
  $('edSave').onclick=()=>save(false);
  if($('edCopy'))$('edCopy').onclick=()=>save(true);
  openDialog();
}
$('editMat').addEventListener('click',()=>openEditor('edit'));
$('newMat').addEventListener('click',()=>openEditor('new'));

/* Düsen-Umrechnung */
$('settingsBtn').addEventListener('click',()=>{
  const S=store.settings;
  const cp=currentPrinter();
  $('edTitle').textContent='Düsen-Umrechnung';
  $('edSub').textContent='Gilt, wenn deine Düse eine andere Metallfamilie hat als die Düse, mit der ein Profil ermittelt wurde. Die Standardprofile beziehen sich auf eine Stahldüse ('+esc(NOZZLE_MATERIALS[cp.nozzleDefault].label)+' beim '+esc(cp.label)+'); gehärteter und ungehärteter Stahl gelten hier als gleichwertig, nur Messing weicht ab.';
  $('edBody').innerHTML='<div class="ed-group"><h4>Stahl (gehärtet oder Edelstahl) im Vergleich zu Messing</h4>'+
    '<div class="ed-row"><label for="st_off">Temperaturaufschlag Stahl</label><div class="ed-in"><input id="st_off" inputmode="decimal" value="'+String(S.steelOffset).replace('.',',')+'"><span class="u">°C</span></div></div>'+
    '<div class="ed-row"><label for="st_vol">Volumenstrom-Faktor Stahl</label><div class="ed-in"><input id="st_vol" inputmode="decimal" value="'+String(S.steelVol).replace('.',',')+'"><span class="u">× Messing</span></div></div>'+
    '<p class="muted" style="font-size:13px">Stahl leitet Wärme schlechter als Messing. Üblich sind 5–10 °C mehr und etwas weniger Durchsatz. Beispiel: Profil mit Stahl ermittelt, du druckst mit Messing → Temperatur −5 °C, Volumenstrom ÷ 0,9.</p></div>';
  $('edFoot').innerHTML='<button class="btn sec" type="button" id="edCancel">Abbrechen</button><button class="btn sec" type="button" id="stReset">Standard (5 °C / 0,9)</button><button class="btn" type="button" id="edSave">Speichern</button>';
  $('edCancel').onclick=closeDialog;
  $('stReset').onclick=()=>{$('st_off').value='5';$('st_vol').value='0,9'};
  $('edSave').onclick=()=>{
    const o=num($('st_off').value),v=num($('st_vol').value);
    if(isNaN(o)||o<0||o>30||isNaN(v)||v<=0.3||v>1.5){alert('Bitte gültige Werte eingeben (Aufschlag 0–30 °C, Faktor 0,3–1,5).');return}
    store.settings.steelOffset=o;store.settings.steelVol=v;persist();closeDialog();update();
  };
  openDialog();
});

/* Export / Import */
$('exportBtn').addEventListener('click',()=>{
  const data={format:'druck-konfigurator',version:4,exported:new Date().toISOString(),profiles:store.profiles,settings:store.settings,last:store.last};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='druck-konfigurator-meine-profile.json';
  document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
});
$('importBtn').addEventListener('click',()=>$('importFile').click());
$('importFile').addEventListener('change',()=>{
  const f=$('importFile').files[0];if(!f)return;
  const r=new FileReader();
  r.onload=()=>{
    try{
      const d=JSON.parse(r.result);
      if(!d||(d.format!=='druck-konfigurator'&&d.format!=='kobra-s1-konfigurator')||typeof d.profiles!=='object')throw Error('Keine Profildatei dieses Programms');
      const ids=Object.keys(d.profiles).filter(id=>{const p=d.profiles[id];return p&&typeof p==='object'&&p.name&&Array.isArray(p.nozzle)});
      const hasLast=d.last&&typeof d.last==='object'&&Object.keys(d.last).length>0;
      if(!ids.length&&!hasLast)throw Error('Die Datei enthält weder eigene Profile noch eine gespeicherte Auswahl');
      const parts=[];
      if(ids.length){const clash=ids.filter(id=>store.profiles[id]).length;parts.push(ids.length+' Profil(e)'+(clash?' ('+clash+' werden überschrieben)':''))}
      if(hasLast)parts.push('die zuletzt gespeicherte Auswahl (Drucker, Filament, Düse, Objekt, Ziel)');
      if(!confirm('Importieren: '+parts.join(' und ')+'?'))return;
      if(ids.length)ids.forEach(id=>{store.profiles[id]=Object.assign({},P({}),d.profiles[id])});
      if(hasLast)Object.assign(store.last,d.last);
      if(d.settings&&confirm('Auch die Düsen-Umrechnung aus der Datei übernehmen?'))Object.assign(store.settings,d.settings);
      persist();
      if(hasLast){
        if(store.last.printer&&PRINTERS[store.last.printer])$('printer').value=store.last.printer;
        fillNozzleMaterialSelect();
        if(store.last.nozD&&NOZ[nkey(store.last.nozD)])$('nozD').value=store.last.nozD;
        if(store.last.nozM&&NOZZLE_MATERIALS[store.last.nozM]&&currentPrinter().nozzleOptions.includes(store.last.nozM))$('nozM').value=store.last.nozM;
        ['object','goal','load','support','supportLevel'].forEach(id=>{if(store.last[id]!==undefined)$(id).value=store.last[id]});
      }
      fillMaterialSelect(store.last.material);update();
    }catch(e){alert('Import fehlgeschlagen: '+e.message)}
    $('importFile').value='';
  };
  r.readAsText(f);
});

/* ================= BUTTONS ================= */
$('printBtn').addEventListener('click',()=>window.print());
$('copyBtn').addEventListener('click',()=>{
  const strip=s=>String(s).replace(/<[^>]+>/g,'');
  const lines=['DRUCK-KONFIGURATOR – '+$('title').textContent];
  if(geom)lines.push('Modell: '+geom.name+' ('+de(geom.x,1)+' × '+de(geom.y,1)+' × '+de(geom.z,1)+' mm)');
  lastOrdered.forEach(g=>{lines.push('');lines.push(g[0]);g[1].forEach(r=>lines.push('  '+r[0]+': '+strip(r[1])+(r[2]?' ('+strip(r[2])+')':'')))});
  const dz=$('danger').innerText.trim();if(dz){lines.push('');lines.push(dz)}
  const w=$('warning').innerText.trim();if(w){lines.push('');lines.push('Hinweise:');lines.push(w)}
  const text=lines.join('\n'),btn=$('copyBtn');
  const done=ok=>{btn.textContent=ok?'Kopiert':'Kopieren nicht möglich';setTimeout(()=>btn.textContent='Als Text kopieren',1800)};
  const fallback=()=>{const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.left='-9999px';document.body.appendChild(ta);ta.select();let ok=false;try{ok=document.execCommand('copy')}catch(e){}ta.remove();done(ok)};
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(()=>done(true),fallback);else fallback();
});
function downloadJSON(text,filename,btn,label){
  const blob=new Blob([text],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;
  document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
  if(btn){btn.textContent='Gespeichert ✓';setTimeout(()=>btn.textContent=label,1800)}
}
$('orcaFilBtn').addEventListener('click',()=>{
  const label='Filament-JSON speichern';
  downloadJSON(orcaFilamentJson,'druck-konfigurator-'+currentPrinter().id+'-filament.json',$('orcaFilBtn'),label);
});
$('orcaProcBtn').addEventListener('click',()=>{
  const label='Process-JSON speichern';
  downloadJSON(orcaProcessJson,'druck-konfigurator-'+currentPrinter().id+'-process.json',$('orcaProcBtn'),label);
});
