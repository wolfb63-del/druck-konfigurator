'use strict';
/* Bedienung des 3MF-Exports: Menüpunkt freischalten, Belegung live vom Drucker laden,
   Slot wählen, Änderungen zeigen, speichern. Dazu der Dialog „Drucker-Verbindung“. */

// Sprachwahl (js/i18n.js); ohne sie deutsch. Zahlen: fmtNum aus i18n.js
// (util.js überdeckt den Namen num() mit dem Zahlen-Parser)
const E_TF=(s,v)=>typeof trf==='function'?trf(s,v):s.replace(/\{(\w+)\}/g,(m,k)=>v&&k in v?v[k]:m);
const E_TR=s=>typeof tr==='function'?tr(s):s;
const E_NUM=(v,d)=>typeof fmtNum==='function'?fmtNum(v,d):de(v,d);
const E_LOC=()=>typeof I18N!=='undefined'&&I18N.lang()==='en'?'en-US':'de-DE';

// Menüpunkt nach jeder Neuberechnung aktualisieren (aufgerufen aus update()).
function updateExportMenu(r){
  const btn=$('export3mf'),note=$('export3mfNote'),cta=$('export3mfCta'),ctaNote=$('export3mfCtaNote');
  const tpl=exportTemplate(r.printer.id,r.dSel);
  let reason='';
  if(!tpl&&r.printer.orca)reason=E_TF('Düse passt nicht zum Orca-Profil ({a} mm) – unter „Drucker …“ das Profil mit {b} mm wählen',{a:E_NUM(+r.printer.orca.nozzle,2),b:E_NUM(+r.dSel,2)});
  else if(!tpl)reason=E_TF('nur mit 0,4-mm-Düse (keine Vorlage für {d} mm)',{d:E_NUM(+r.dSel,r.dSel==='0.25'?2:1)});
  else if(!project)reason='zuerst ein Modell laden';
  btn.disabled=!!reason;
  note.textContent=reason||'Slot wählen und speichern';
  cta.disabled=!!reason;
  ctaNote.textContent=reason||'öffnet den Dialog zur Slot-Wahl';
}
$('export3mfCta').addEventListener('click',openExportDialog);

const printerHost=id=>((store.settings.printerHosts||{})[id]||'').trim();
function slotKey(printerId){return 'exportSlot_'+printerId}
function chosenSlot(){const c=document.querySelector('input[name="slot"]:checked');return c?+c.value:0}
/* Slot-Wahl immer zeigen (gemeldet 2026-10-03): Teile aus einer 3MF bringen den Slot des Designers mit, die
   Wahl war dann ausgeblendet und die Datei landete z. B. ungefragt in Slot 4. Jetzt wählt der Dialog:
   „all“ = alle Teile in den gewählten Slot, „keep“ = je Teil eigener Slot (aus der Datei oder links gesetzt). */
const ownSlots=()=>project?[...new Set(project.parts.filter(p=>p.slot!=null).map(p=>p.slot))]:[];
function slotMode(){const c=document.querySelector('input[name="slotMode"]:checked');return c?c.value:'all'}
function dialogPlan(){
  const plan=exportPlan(chosenSlot());
  if(slotMode()!=='all')return plan;
  const jobs=plan.jobs.map(j=>({...j,slot:null}));
  return {jobs,slot:chosenSlot(),r:jobs[0].r,usesDefault:true};
}

/* Aktuelle Belegung für den Dialog, in dieser Reihenfolge: live vom Drucker (Moonraker), von Hand
   eingetragen (für Originalfirmware – bleibt gespeichert, bis man sie ändert), Orca-Vorlage. */
let slotState={printer:null,live:null,note:''};
let slotPicked=false; // Slot im offenen Dialog von Hand gewählt
const manualSlots=printerId=>((store.settings.manualSlots||{})[printerId])||null;
function slotSource(tpl){
  if(slotState.live)return {kind:'live',slots:slotState.live.slots.slice(0,tpl.slots.length)};
  const m=lastResult&&manualSlots(lastResult.printer.id);
  if(m)return {kind:'manual',slots:m.slice(0,tpl.slots.length).map(s=>({...s,present:!!s.type,name:s.type?'von Hand eingetragen':'leer'}))};
  // Die Vorlage kennt nur den Stand beim Speichern in Orca – Typ und Farbe daraus wären irreführend.
  return {kind:'template',slots:tpl.slots.map(()=>({type:'',colour:'',name:'',present:true}))};
}
function dialogSlots(tpl){return slotSource(tpl).slots.map((s,i)=>({type:s.type,colour:s.colour,name:s.name,present:s.present,idx:i}))}
// Belegung, die in die 3MF geschrieben wird (Typ und Farbe je Slot); Vorlage = unverändert lassen
function exportSlots(tpl){const s=slotSource(tpl);return s.kind==='template'?null:s.slots}

function renderSlotList(tpl,preselect){
  const slots=dialogSlots(tpl);
  $('slotList').innerHTML=slots.map(s=>
    '<label class="slot'+(s.present?'':' absent')+'" title="'+esc(E_TR(s.name))+'"><input type="radio" name="slot" value="'+s.idx+'"'+(s.idx===preselect?' checked':'')+'>'+
    '<span class="swatch" style="background:'+esc(/^#[0-9a-f]{6}$/i.test(s.colour)?s.colour:'#888888')+'"></span>'+
    '<span class="slot-text"><b>'+E_TF('Slot {n}',{n:s.idx+1})+'</b>'+(s.type?' · '+esc(s.type):s.present?'':' · '+E_TF('leer'))+'<small>'+esc(!s.present?E_TF('kein Filament'):s.name?E_TR(s.name):E_TF('unbekannt'))+'</small></span></label>').join('');
  const src=document.querySelector('.slot-source'),kind=slotSource(tpl).kind;
  src.classList.toggle('live',kind!=='template');src.classList.toggle('fallback',kind==='template'&&!!slotState.note);
  $('slotSource').textContent=kind==='live'
    ?E_TF('Live vom Drucker ({host}) · Stand {time}',{host:slotState.live.host,time:slotState.live.time.toLocaleTimeString(E_LOC(),{hour:'2-digit',minute:'2-digit'})})
    :kind==='manual'?E_TF('Von Hand eingetragen – gilt, bis du es änderst')
    :(slotState.note?slotState.note+' – ':'')+E_TF('Belegung unbekannt – wähle den Slot, in dem dein Filament steckt');
}

// Vorauswahl: passender Filamenttyp (live oder eingetragen), sonst zuletzt genutzter Slot
function preferredSlot(tpl,r){
  const slots=dialogSlots(tpl);
  if(slotSource(tpl).kind!=='template'){const m=slots.find(s=>s.present&&slotMatchesKind(s.type,r.m.kind));if(m)return m.idx}
  return Math.min(+(store.last[slotKey(r.printer.id)]||0),slots.length-1);
}

function renderExportDialog(){
  const tpl=exportTemplate(lastResult.printer.id,lastResult.dSel);
  const plan=dialogPlan(),r=plan.r,slot=plan.slot;
  const live=exportSlots(tpl);
  const {extra,notes,partSlot}=slotPlan(plan.jobs,r,slot);
  const {settings,changes}=buildProjectSettings(tpl,r,slot,live,extra);
  renderPartPlan(tpl,plan,partSlot,notes,settings);
  // Das Tool weiß ohne Belegung nicht, was im Drucker steckt: den Nutzer den passenden Slot wählen lassen
  const kinds=[...new Set(plan.jobs.filter(j=>j.slot===null).map(j=>ORCA_KIND[j.r.m.kind]||j.r.m.name))];
  $('slotHint').innerHTML=kinds.length>1?E_TF('<b>Wähle den Slot, in dem das Filament der Teile ohne eigenen Slot steckt</b> – siehe Tabelle unten.')
    :E_TF('<b>Wähle den Slot, in dem dein {kind} steckt</b> – die Werte in der Datei gelten für {kind}.',{kind:esc(kinds[0]||ORCA_KIND[r.m.kind]||r.m.name)});
  const kind=ORCA_KIND[r.m.kind]||'PLA',s=dialogSlots(tpl)[slot];
  const warn=$('slotWarn');
  const where={live:E_TF('laut Drucker'),manual:E_TF('laut deiner Eingabe'),template:E_TF('in deiner Vorlage')}[slotSource(tpl).kind];
  if(plan.jobs.length>1)warn.classList.add('hidden');
  else if(s&&!s.present){
    warn.innerHTML=E_TF('<b>Hinweis:</b> In Slot {n} hat der Drucker kein Filament erkannt.',{n:slot+1});warn.classList.remove('hidden');
  }else if(s&&s.type&&!slotMatchesKind(s.type,r.m.kind)){
    warn.innerHTML=E_TF('<b>Hinweis:</b> In Slot {n} steckt {where} <b>{type}</b>, gewählt ist <b>{name}</b> ({kind}). Die Werte werden trotzdem für {kind} geschrieben.',{n:slot+1,where,type:esc(s.type),name:esc(E_TR(r.m.name)),kind});
    warn.classList.remove('hidden');
  }else warn.classList.add('hidden');
  const objCount=plan.jobs.reduce((n,j)=>n+objectOverrides(settings,j.r).length,0)*(plan.jobs.length>1?1:0);
  $('changesTitle').textContent=objCount?E_TF('Was geändert wird ({n} Werte + {m} je Teil)',{n:changes.length,m:objCount}):E_TF('Was geändert wird ({n} Werte)',{n:changes.length});
  $('changesList').innerHTML='<table class="changes"><thead><tr><th>Einstellung</th><th>Vorlage</th><th>Neu</th></tr></thead><tbody>'+
    changes.map(c=>'<tr><td>'+esc(c.label)+'<small>'+esc(c.key)+'</small></td><td>'+esc(c.before??'–')+'</td><td><b>'+esc(c.after)+'</b></td></tr>').join('')+'</tbody></table>';
}

/* Mehrere Teile: Tabelle Teil · Slot · Filament · abweichende Werte, mit Hinweis, wenn der Slot laut
   Belegung ein anderes Filament hat. „Passend wählen“ stellt das Filament der Teile auf die Belegung um. */
function renderPartPlan(tpl,plan,partSlot,notes,settings){
  const multi=plan.jobs.length>1;
  $('partPlan').classList.toggle('hidden',!multi);
  // Slot-Liste nur ausblenden, wenn ausdrücklich „je Teil beibehalten“ gewählt ist und kein Teil den Standard-Slot nutzt
  const keepAll=slotMode()==='keep'&&!plan.usesDefault;
  $('slotList').classList.toggle('hidden',keepAll);$('slotHint').classList.toggle('hidden',keepAll);
  $('slotLegend').textContent=slotMode()==='all'?'Filament-Slot':multi?'Standard-Slot (für Teile ohne eigenen Slot)':'Filament-Slot';
  if(!multi)return;
  const slots=dialogSlots(tpl);let mismatch=0;
  $('partPlanTable').innerHTML='<table class="changes"><thead><tr><th>Teil</th><th>Slot</th><th>Filament</th><th>Eigene Werte</th></tr></thead><tbody>'+
    plan.jobs.map(j=>{
      const si=partSlot(j),s=slots[si],bad=s&&s.type&&!slotMatchesKind(s.type,j.r.m.kind);
      if(bad)mismatch++;
      const own=objectOverrides(settings,j.r);
      return '<tr><td translate="no">'+esc(j.geom.name)+'</td><td>'+(si+1)+(j.slot===null?' <small>Standard</small>':'')+(s&&s.type?'<small>'+esc(s.type)+'</small>':'')+'</td>'+
        '<td'+(bad?' class="bad"':'')+'>'+esc(j.r.m.name)+(bad?'<small>'+E_TF('passt nicht zu {type}',{type:esc(s.type)})+'</small>':'')+'</td>'+
        '<td title="'+esc(own.map(c=>E_TR(c.label)+': '+E_TR(String(c.value))).join('\n'))+'">'+(own.length?E_TF('{n} Werte',{n:own.length}):'–')+'</td></tr>';
    }).join('')+'</tbody></table>';
  $('partPlanNotes').innerHTML=notes.map(n=>'<li>'+esc(n)+'</li>').join('');
  $('matchLive').classList.toggle('hidden',!mismatch);
  $('matchLive').textContent=E_TF(mismatch>1?'Filament von {n} Teilen passend zur Belegung wählen':'Filament von {n} Teil passend zur Belegung wählen',{n:mismatch});
}
$('matchLive').addEventListener('click',()=>{
  const tpl=exportTemplate(lastResult.printer.id,lastResult.dSel),slots=dialogSlots(tpl),def=chosenSlot();
  let n=0;
  for(const p of project.parts){
    const s=slots[slotMode()==='all'||p.slot==null?def:p.slot];if(!s||!s.type)continue;
    const m=materialForSlotType(s.type,p.input.material);if(m!==p.input.material){p.input.material=m;n++}
  }
  loadPartIntoForm(project.parts[project.selected]);update();renderExportDialog();
  toast(n?E_TF(n>1?'{n} Teile auf das Filament im Slot umgestellt':'{n} Teil auf das Filament im Slot umgestellt',{n}):E_TF('Nichts umzustellen'));
});

async function loadLiveSlots(){
  const r=lastResult,tpl=exportTemplate(r.printer.id,r.dSel),host=printerHost(r.printer.id);
  if(!host){slotState={printer:r.printer.id,live:null,note:''};renderSlotList(tpl,chosenSlot());renderExportDialog();return}
  $('slotSource').textContent=E_TF('Frage {host} ab … (bis zu 16 s)',{host});$('slotReload').disabled=true;
  try{
    const live=await fetchLiveSlots(r.printer.id,host);
    if(slotState.printer!==r.printer.id&&slotState.printer!==null)return; // Drucker inzwischen gewechselt
    slotState={printer:r.printer.id,live,note:''};
    // Hat der Nutzer schon selbst gewählt, bleibt seine Wahl – die Antwort kann Sekunden später kommen.
    renderSlotList(tpl,slotPicked?chosenSlot():preferredSlot(tpl,r));
  }catch(e){
    slotState={printer:r.printer.id,live:null,note:e.message};
    renderSlotList(tpl,chosenSlot());
  }finally{$('slotReload').disabled=false}
  renderExportDialog();
}

/* Z-Offset je Drucker: im Browser gespeichert (store.settings.zOffset), leer = Wert der Vorlage */
const zOffsetFor=id=>((store.settings.zOffset||{})[id]??'');
function showZOffset(tpl,id){
  const inp=$('zOffset');if(!inp)return;
  inp.value=zOffsetFor(id);inp.placeholder=String((tpl.settings||{}).z_offset??'0').replace('.',',');
  // Sicherheitshinweis (Wunsch des Nutzers 2026-10-03): ohne eigenen Wert gilt der Vorlagenwert, meist 0 mm
  const warn=()=>{const eff=Number(String(inp.value.trim()||inp.placeholder).replace(',','.'));
    $('zOffsetWarn').innerHTML=E_TF('<b>Achtung Z-Offset:</b> Die Datei startet mit {v} mm. Braucht dein Drucker einen anderen Wert (z. B. 0,25 mm beim Kobra S1), trage ihn oben ein – sonst liegt die erste Schicht zu nah an der Platte oder haftet nicht.',{v:E_NUM(eff||0,2)});
    $('zOffsetWarn').classList.toggle('hidden',!!eff)};
  warn();
  $('zOffsetNote').textContent=E_TF('leer = Wert der Vorlage ({v} mm) · gilt für jeden Export mit diesem Drucker',{v:inp.placeholder});
  inp.onchange=()=>{
    const raw=inp.value.trim(),z={...(store.settings.zOffset||{})};
    if(raw==='')delete z[id];
    else if(withZOffset(tpl,raw)!==tpl)z[id]=raw.replace(',','.');
    else{inp.value=zOffsetFor(id);toast(E_TF('Z-Offset bitte zwischen −2 und 2 mm'));return}
    store.settings.zOffset=z;persist();warn();
  };
}
/* Reinigungslinie je Drucker: im Browser gespeichert (store.settings.purge[id] = {on, side}), Standard aus */
const purgeFor=id=>({on:false,side:'auto',...((store.settings.purge||{})[id]||{})});
const PURGE_SIDE_TXT={front:'vorne',back:'hinten',left:'links',right:'rechts'};
const PURGE_FIRMWARE=['kobra_s1','snapmaker_u1'];
// Plan für die gewählte Seite; null = aus oder nicht berechenbar
function purgePlanFor(tpl){
  const p=purgeFor(lastResult.printer.id);if(!p.on)return null;
  const dp=dialogPlan(),jobs=dp.jobs;
  // Mehrfarbdruck (mehrere Slots oder mehrfarbige Teile) → Prime-Tower steht mit auf dem Bett
  const multi=new Set(jobs.map(j=>j.slot===null||j.slot===undefined?dp.slot:j.slot)).size>1||jobs.some(j=>j.part&&j.part.partId);
  return planPurge(tpl,purgeBoxes(tpl,jobs,!!project.threemf),p.side,purgeMargin(tpl,jobs.map(j=>j.r&&j.r.brim)),multi);
}
function showPurge(tpl){
  const id=lastResult.printer.id,p=purgeFor(id),note=$('purgeNote');
  $('purgeOn').checked=p.on;$('purgeSide').value=p.side;$('purgeSide').disabled=!p.on;
  let txt=PURGE_FIRMWARE.includes(id)?E_TR('Dieser Drucker reinigt die Düse schon in der Firmware – die Linie kommt zusätzlich.'):'';
  if(p.on){
    const plan=purgePlanFor(tpl);
    if(!plan)txt=E_TR('Reinigungslinie hier nicht möglich (Vorlage ohne passende Werte, Rund-/Delta-Bett oder Sperrbereiche).');
    else if(!plan.ok)txt=E_TF('Zu wenig Platz {side}: {free} mm frei, nötig {need} mm – andere Seite wählen. Sonst wird die Linie weggelassen.',{side:E_TR(PURGE_SIDE_TXT[plan.side]),free:E_NUM(Math.max(0,plan.free[plan.side]),0),need:E_NUM(plan.need,0)});
    else txt=E_TF('Linie {side}, {free} mm Platz neben dem Objekt (inkl. Brim/Skirt).',{side:E_TR(PURGE_SIDE_TXT[plan.side]),free:E_NUM(plan.free[plan.side],0)})+(txt?' '+txt:'');
  }
  note.textContent=txt;
}
function setupPurge(tpl){
  const id=lastResult.printer.id,save=()=>{
    store.settings.purge={...(store.settings.purge||{}),[id]:{on:$('purgeOn').checked,side:$('purgeSide').value}};
    persist();showPurge(tpl);
  };
  $('purgeOn').onchange=save;$('purgeSide').onchange=save;showPurge(tpl);
}
function openExportDialog(){
  const r=lastResult,tpl=exportTemplate(r.printer.id,r.dSel);
  if(!tpl||!project)return;
  if(slotState.printer!==r.printer.id)slotState={printer:r.printer.id,live:null,note:''};
  $('exportSub').textContent=project.name+(project.parts.length>1&&!/Teile$/.test(project.name)?' ('+E_TF('{n} Teile',{n:project.parts.length})+')':'')+' · '+E_TR(r.m.name)+' · '+E_TF('Vorlage: {preset} (OrcaSlicer {ver})',{preset:tpl.printerPreset,ver:tpl.orcaVersion});
  const [bw,bd]=bedSize(tpl);
  let tooBig=[];
  if(project.threemf){
    // Makerworld-3MF: Platten bleiben, geprüft wird je Platte
    const {oversize}=plateShifts(project.parts.map(p=>({geom:p.geom,plate:p.plate})),tpl);
    tooBig=oversize.map(id=>E_TF('Platte {n}',{n:id}));
    $('exportSub').textContent+=' · '+E_TF('Einstellungen von „{p}“ werden ersetzt, Platten und Farben bleiben',{p:(project.threemf.settings||{}).printer_settings_id||'?'});
  }else tooBig=arrangeParts(project.parts.map(p=>p.geom),tpl).oversize.map(i=>project.parts[i].name);
  $('sizeWarn').textContent=tooBig.length?E_TF('Größer als das Bett ({w} × {d} mm): {list}. Bitte drehen oder in Orca skalieren/teilen.',{w:E_NUM(bw,0),d:E_NUM(bd,0),list:tooBig.join(', ')}):'';
  $('sizeWarn').classList.toggle('hidden',!tooBig.length);
  showZOffset(tpl,r.printer.id);
  renderSlotList(tpl,preferredSlot(tpl,r));
  slotPicked=false;
  setupPurge(tpl);
  $('slotList').onchange=()=>{slotPicked=true;renderExportDialog()};
  // Eigene Slots vorhanden: Wahl anbieten. Ein einziger gemeinsamer Slot (einfarbig) → „alle in gewählten Slot“,
  // verschiedene Slots (mehrfarbig) → „je Teil beibehalten“
  const own=ownSlots();
  $('slotMode').classList.toggle('hidden',!own.length);
  $('slotModeKeep').textContent=own.length===1?'('+E_TF(project.threemf?'Slot {n} aus der Datei':'Slot {n}',{n:own[0]+1})+')':own.length?'('+E_TF('Slots {list}',{list:own.map(s=>s+1).join(', ')})+')':'';
  document.querySelector('input[name="slotMode"][value="'+(own.length>1?'keep':'all')+'"]').checked=true;
  $('slotMode').onchange=renderExportDialog;
  renderExportDialog();
  $('exportDlg').showModal();
  loadLiveSlots();
}

function save3mf(){
  let tpl=withZOffset(exportTemplate(lastResult.printer.id,lastResult.dSel),zOffsetFor(lastResult.printer.id));
  const plan=dialogPlan(),r=plan.r,slot=plan.slot;
  const purge=purgePlanFor(tpl),purgeSkipped=!!purge&&!purge.ok;   // ohne Platz keine Linie: sie würde ins Objekt laufen
  if(purge&&purge.ok)tpl=withPurge(tpl,purge);
  try{
    const live=exportSlots(tpl);
    const {bytes}=project.threemf
      ?build3mfFromProject(tpl,r,plan.jobs,slot,fflate,live,project.threemf)
      :build3mf(tpl,r,plan.jobs,slot,fflate,live);
    const slotsUsed=new Set(plan.jobs.map(j=>j.slot===null?slot:j.slot));
    const base=project.name.replace(/\.(stl|3mf|zip)$/i,'').replace(/[^\w.-]+/g,'_');
    const short=r.printer.id==='snapmaker_u1'?'U1':r.printer.id==='orca'?r.printer.label.replace(/[^w.-]+/g,''):'KobraS1';
    const blob=new Blob([bytes],{type:'model/3mf'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=base+'_'+short+(slotsUsed.size===1?'_Slot'+(slot+1):'_'+slotsUsed.size+'Slots')+'.3mf';
    document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
    if(plan.usesDefault){store.last[slotKey(r.printer.id)]=slot;persist()}
    $('exportDlg').close();
    toast(E_TF('3MF gespeichert: {file}',{file:a.download})+(purgeSkipped?' · '+E_TR('Reinigungslinie weggelassen (kein Platz)'):''));
    if(typeof markExported==='function')markExported();
  }catch(e){
    toast(E_TF('3MF konnte nicht erstellt werden: {msg}',{msg:E_TR(e.message)}));
  }
}

$('export3mf').addEventListener('click',openExportDialog);
$('export3mfSave').addEventListener('click',save3mf);
$('slotReload').addEventListener('click',loadLiveSlots);

/* Belegung von Hand eintragen (Originalfirmware ohne Moonraker): Typ und Farbe je Slot,
   gespeichert je Drucker in store.settings.manualSlots, bis man sie ändert. */
const SLOT_TYPES=['PLA','PETG','ABS','ASA','TPU','PLA-CF','PETG-CF','PA','PC'];
function openSlotEditor(){
  const tpl=exportTemplate(lastResult.printer.id,lastResult.dSel),cur=dialogSlots(tpl);
  const types=[...new Set(SLOT_TYPES.concat(Object.keys(tpl.filamentPresets||{})))];
  $('slotEditRows').innerHTML=cur.map(s=>{
    const col=/^#[0-9a-f]{6}$/i.test(s.colour)?s.colour:'#888888',t=String(s.present?s.type:'').toUpperCase();
    return '<div class="slot-edit-row"><b>'+E_TF('Slot {n}',{n:s.idx+1})+'</b><select data-slot-type="'+s.idx+'" aria-label="'+esc(E_TF('Filament in Slot {n}',{n:s.idx+1}))+'"><option value="">leer</option>'+
      types.map(x=>'<option'+(x===t?' selected':'')+'>'+esc(x)+'</option>').join('')+'</select>'+
      '<input type="color" data-slot-colour="'+s.idx+'" value="'+col+'" aria-label="'+esc(E_TF('Farbe Slot {n}',{n:s.idx+1}))+'"></div>';
  }).join('');
  $('slotEdit').classList.remove('hidden');$('slotEditBtn').classList.add('hidden');
}
function closeSlotEditor(){$('slotEdit').classList.add('hidden');$('slotEditBtn').classList.remove('hidden')}
$('slotEditBtn').addEventListener('click',openSlotEditor);
$('slotEditCancel').addEventListener('click',closeSlotEditor);
$('slotEditSave').addEventListener('click',()=>{
  const id=lastResult.printer.id,tpl=exportTemplate(id,lastResult.dSel);
  const slots=[...document.querySelectorAll('[data-slot-type]')].map(sel=>({type:sel.value,colour:document.querySelector('[data-slot-colour="'+sel.dataset.slotType+'"]').value.toUpperCase()}));
  store.settings.manualSlots={...(store.settings.manualSlots||{}),[id]:slots};persist();
  slotState={printer:id,live:null,note:''}; // die eigene Eingabe gilt ab jetzt (Live-Abfrage bei Bedarf neu laden)
  closeSlotEditor();renderSlotList(tpl,preferredSlot(tpl,lastResult));renderExportDialog();
  toast('Belegung gespeichert');
});
$('slotEditReset').addEventListener('click',()=>{
  const id=lastResult.printer.id,tpl=exportTemplate(id,lastResult.dSel),m={...(store.settings.manualSlots||{})};
  delete m[id];store.settings.manualSlots=m;persist();
  closeSlotEditor();renderSlotList(tpl,chosenSlot());renderExportDialog();
  toast('Eigene Belegung gelöscht');
});
$('exportDlg').addEventListener('click',e=>{if(e.target===e.currentTarget)e.currentTarget.close()});

/* ================= Drucker-Verbindung ================= */
const IP_PATTERN=/^[A-Za-z0-9.-]+(:\d+)?$/;
const LINK_PRINTERS=['kobra_s1','snapmaker_u1'];
function openLinkDialog(){
  LINK_PRINTERS.forEach(id=>{$('host_'+id).value=printerHost(id);const res=$('linkRes_'+id);res.textContent='';res.className='muted small link-result'});
  $('linkDlg').showModal();
}
async function testLink(id){
  const host=$('host_'+id).value.trim(),res=$('linkRes_'+id);
  res.className='muted small link-result';res.textContent=E_TF('Frage {host} ab …',{host});
  try{
    if(!IP_PATTERN.test(host))throw Error(E_TF('Bitte eine IP-Adresse wie 192.168.1.50 eintragen'));
    const live=await fetchLiveSlots(id,host);
    res.classList.add('good');
    res.textContent=E_TF('Verbunden: {list}',{list:live.slots.map((s,i)=>E_TF('Slot {n} {t}',{n:i+1,t:s.present?s.type||'?':E_TF('leer')})).join(' · ')});
  }catch(e){res.classList.add('bad');res.textContent=e.message}
}
document.querySelectorAll('#linkDlg [data-test]').forEach(b=>b.addEventListener('click',()=>testLink(b.dataset.test)));
$('linkSave').addEventListener('click',()=>{
  const hosts={};
  for(const id of LINK_PRINTERS){
    const v=$('host_'+id).value.trim();
    if(v&&!IP_PATTERN.test(v)){const res=$('linkRes_'+id);res.className='small link-result bad';res.textContent='Ungültige Adresse';return}
    hosts[id]=v;
  }
  store.settings.printerHosts=hosts;persist();slotState={printer:null,live:null,note:''};
  $('linkDlg').close();toast('Drucker-Verbindung gespeichert');
});
$('linkDlg').addEventListener('click',e=>{if(e.target===e.currentTarget)e.currentTarget.close()});
ACTIONS.link=openLinkDialog;

if(lastResult)updateExportMenu(lastResult);
