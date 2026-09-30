'use strict';
/* Eigene Werte im Browser speichern – aus v4. Gleicher Schlüssel wie v4, damit
   bereits gespeicherte Profile (gleicher file://-Ursprung) übernommen werden. */
const STORE_KEY='kobraS1Konfigurator.v4';
let store={profiles:{},settings:{steelOffset:5,steelVol:0.9},last:{},customPrinters:{}};
let storageOK=true;
function loadStore(){
  try{const s=JSON.parse(localStorage.getItem(STORE_KEY)||'null');
    if(s&&typeof s==='object'){store.profiles=s.profiles||{};Object.assign(store.settings,s.settings||{});store.last=s.last||{};store.customPrinters=migrateCustomPrinters(s.customPrinters||{})}
  }catch(e){storageOK=false}
}
/* Eigene Drucker: { settings, orcaVersion }. Eine Entwicklungsversion speicherte die project_settings.config
   direkt (ohne Hülle) – solche Einträge ließen die Druckerauswahl abstürzen („undefined is not valid JSON“,
   gemeldet 2026-09-30). Alte Einträge umwandeln, unbrauchbare verwerfen. */
function migrateCustomPrinters(cp){
  const out={};
  for(const [n,v] of Object.entries(cp)){
    if(v&&v.settings&&typeof v.settings==='object')out[n]=v;
    else if(v&&typeof v==='object'&&v.printer_settings_id)out[n]={settings:v,orcaVersion:''};
  }
  return out;
}
// Gibt zurück, ob dauerhaft gespeichert werden konnte; die Anzeige macht panel.js.
function saveStore(){
  try{localStorage.setItem(STORE_KEY,JSON.stringify(store));storageOK=true}catch(e){storageOK=false}
  return storageOK;
}
function allMats(){
  const list=BUILTIN.map(b=>{
    const u=store.profiles[b.id];
    return u?Object.assign({},b,u,{id:b.id,builtin:true,overridden:true,status:'user',src:b.src}):Object.assign({},b,{builtin:true});
  });
  Object.keys(store.profiles).forEach(id=>{
    if(!BUILTIN.some(b=>b.id===id))list.push(Object.assign(P({kind:'pla'}),store.profiles[id],{id,builtin:false,status:'user',src:'Eigenes Profil.'}));
  });
  return list;
}
function getMat(id){const l=allMats();return l.find(m=>m.id===id)||l[0]}
function builtinOf(id){return BUILTIN.find(b=>b.id===id)}
