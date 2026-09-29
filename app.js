'use strict';
const $=s=>document.querySelector(s),N=v=>v==null?'':String(v).trim(),esc=v=>N(v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const S={emp:[],sotk:null,units:[],ready:false,pending:null,pendingMeta:null,sotkSrc:'Bawaan (pre-loaded)',menu:'dash',tab:0,corpTitles:[],parseStats:null};
const NAV=[['dash','Dashboard'],['setup','Data & Set Up'],
 ['mon','Monitoring SDM',['Ringkasan SDM','Monitoring Karyawan','Monitoring Struktur Jabatan']],
 ['mp','Manpower Planning',['Gap Formasi','Proyeksi Pensiun']],
 ['sotk','SOTK & Outlet',['SOTK Explorer','Snapshot Outlet']],
 ['intel','SDM Intelligence',['Vacancy Priority','Grade Mismatch','Definitive Placement','Validasi Mapping SOTK']]];
const LV={W:'Kantor Wilayah',A:'Kantor Area',C:'Cabang'};
// Kelas Cabang tersedia pada level Cabang/Outlet dan ikut terbawa pada seluruh tabel/filter yang membuka level C.
const LB={W:['Departemen / Bidang','Bagian / Unit','Jabatan'],A:['Kantor Area','Org Name','Jabatan'],C:['Kantor Area','Kelas Cabang','Cabang','Outlet','Tipe Unit','Jabatan']};
const charts={};
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(t._tm);t._tm=setTimeout(()=>t.classList.remove('show'),2200)}
// ---------- Corporate Title (Pasal 15 — Penggolongan Jabatan & Personal Grade) ----------
function titleOf(g){const r=S.corpTitles.find(x=>g>=x.min&&g<=x.max);return r?r.title:''}
function bandOf(g){const r=S.corpTitles.find(x=>g>=x.min&&g<=x.max);return r?r.band:''}
// aturan Laddering ayat (4): BOD-4/BOD-5 = PG match (kecuali JG 6 & 10 boleh match/+1); BOD-1/2/3 = PG -1/match/+1 (kecuali JG11 match/+1, JG18 -1/match)
function laddered(jg){const b=bandOf(jg);if(!b)return[jg,jg];
  if(b==='BOD-4'||b==='BOD-5'){if(jg===6||jg===10)return[jg,jg+1];return[jg,jg]}
  if(jg===11)return[jg,jg+1];if(jg===18)return[jg-1,jg];return[jg-1,jg+1]}
function allowedRange(gmin,gmax){const a=laddered(gmin),b=laddered(gmax);return[Math.min(gmin,a[0],b[0]),Math.max(gmax,a[1],b[1])]}
// Kesesuaian Job Grade (jabatan) vs Person Grade (karyawan) — berlaku utk SELURUH karyawan, semua tingkatan, semua status posisi
function gradeCheck(e){if(!(e.g>0&&e.pg>0))return null;const[lo,hi]=laddered(e.g);return{lo,hi,ok:e.pg>=lo&&e.pg<=hi,band:bandOf(e.g)}}
// ---------- SOTK ----------
const grp=o=>/non\s*gadai/i.test(N(o))?'Non Gadai':/^gadai$|\bgadai\b/i.test(N(o))?'Gadai':'Bisnis';
const bid=(o,j)=>/pemimpin wilayah|deputy operasional|deputi operasional/i.test(N(j))?'Kantor Wilayah':N(o);
const keyNorm=v=>{
  if(v==null||v==='')return '';
  if(typeof v==='number'&&Number.isFinite(v))return Number.isInteger(v)?String(v):String(v).replace(/\.0+$/,'');
  const s=N(v);return /^\d+\.0+$/.test(s)?s.replace(/\.0+$/,''):s;
};
const tKey=(t,k)=>`${t}|${keyNorm(k)}`;

function buildSotk(sh){
  const deptMap=new Map();
  (sh.SOTK_WILAYAH||[]).forEach(r=>{const oc=keyNorm(r['ORG CODE']);if(oc&&!deptMap.has(oc))deptMap.set(oc,N(r['BRANCH NAME']))});
  S.deptByOrgW=deptMap;
  if(sh.CORPORATE_TITLE)S.corpTitles=(sh.CORPORATE_TITLE||[]).map(r=>({band:N(r.CORPORATE_BAND),title:N(r.CORPORATE_TITLE),min:+r.JOB_GRADE_MIN||0,max:+r.JOB_GRADE_MAX||0})).filter(x=>x.min>0&&x.max>0);

  const W=(sh.SOTK_WILAYAH||[]).map(r=>({t:'W',key:keyNorm(r.FORMASI_KEY),org:keyNorm(r['ORG CODE']),f:+r.FORMASI||0,gmin:+r['JOB GRADE MIN']||0,gmax:+r['JOB GRADE MAX']||0,job:N(r['JOB CODE']),elig:N(r.ELIGIBLE_JOB_CODES).split(/[,|]/).map(x=>x.trim()).filter(Boolean),matchMode:N(r.MATCH_MODE)||'EXACT_JOB_CODE',jobName:N(r['JOB NAME']),p:[bid(r['BRANCH NAME'],r['JOB NAME']),bid(r['ORG NAME'],r['JOB NAME']),N(r['JOB NAME'])],kelasSet:[]}));
  const A=(sh.SOTK_AREA||[]).map(r=>({t:'A',key:keyNorm(r.FORMASI_KEY),org:keyNorm(r['ORG CODE']),f:+r.FORMASI||0,gmin:+r['JOB GRADE MIN']||0,gmax:+r['JOB GRADE MAX']||0,job:N(r['JOB CODE']),klas:N(r['KLASIFIKASI AREA']),jobName:N(r['JOB NAME']),p:[N(r['NAMA UNIT KERJA']),grp(r['ORG NAME']),N(r['JOB NAME'])],kelasSet:[]}));

  const UM=new Map(),byBranch=new Map();
  (sh.UNIT_MASTER_CABANG||[]).forEach(r=>{
    const unitKey=keyNorm(r.UNIT_KEY),branchKey=keyNorm(r.BRANCH_KEY);
    const u={unitKey,branchKey,name:N(r.UNIT_NAME),area:N(r.KANTOR_AREA),branch:N(r.BRANCH_NAME),type:N(r.UNIT_TYPE),cluster:N(r.CLUSTER_TYPE),kelas:N(r.KELAS_UNIT)||'-'};
    if(unitKey)UM.set(unitKey,u);
    if(branchKey){if(!byBranch.has(branchKey))byBranch.set(branchKey,[]);byBranch.get(branchKey).push(u)}
  });
  S.unitMap=UM;S.branchUnitMap=byBranch;
  const branchMeta=new Map();
  byBranch.forEach((units,bk)=>{const u=units.find(x=>x.type==='CP/CPS')||units[0];branchMeta.set(bk,{area:u?u.area:'',branch:u?u.branch:'',kelas:u?u.kelas:'-',type:u?u.type:''})});
  S.branchMeta=branchMeta;

  const m=new Map();
  (sh.SOTK_CABANG||[]).forEach(r=>{
    const k=keyNorm(r.FORMASI_KEY);if(!k)return;
    const unitKey=keyNorm(r.UNIT_KEY||r['ORG CODE']),branchKey=keyNorm(r.BRANCH_KEY||r['ORG CODE']);
    const jn=N(r['JOB NAME ']||r['JOB NAME']),unit=UM.get(unitKey),bm=branchMeta.get(branchKey)||{};
    const kelas=N(r['KELAS CABANG'])||N(unit&&unit.kelas)||N(bm.kelas)||'-';
    const item=m.get(k);
    if(item){item.f+=(+r.FORMASI||0);item.kelasSet=[...new Set([...(item.kelasSet||[]),kelas].filter(Boolean))]}
    else m.set(k,{t:'C',key:k,unitKey,branchKey,f:+r.FORMASI||0,gmin:+r['JOB GRADE']||0,gmax:+r['JOB GRADE']||0,job:N(r['JOB CODE']),jobName:jn,kelasCabang:kelas,kelasSet:[kelas].filter(Boolean),p:[N(r.KANTOR_AREA_FILTER)||N(unit&&unit.area)||N(bm.area),kelas,N(r.BRANCH_FILTER)||N(unit&&unit.branch)||N(bm.branch),N(r.UNIT_FILTER)||N(unit&&unit.name)||N(r['NAMA UNIT KERJA']),N(r.UNIT_TYPE_FILTER)||N(unit&&unit.type)||N(r['OFFICE TYPE']),jn]});
  });
  const units=(sh.UNIT_MASTER_CABANG||[]).map(r=>({unitKey:keyNorm(r.UNIT_KEY),branchKey:keyNorm(r.BRANCH_KEY),name:N(r.UNIT_NAME),area:N(r.KANTOR_AREA),branch:N(r.BRANCH_NAME),type:N(r.UNIT_TYPE),cluster:N(r.CLUSTER_TYPE),kelas:N(r.KELAS_UNIT)||'-',p:[N(r.KANTOR_AREA),N(r.KELAS_UNIT)||'-',N(r.CLUSTER_TYPE),N(r.BRANCH_NAME),N(r.UNIT_TYPE),N(r.UNIT_NAME)]}));
  S.sotk={W,A,C:[...m.values()]};S.units=units;

  const cClasses=[...new Set(S.sotk.C.flatMap(r=>r.kelasSet||[]).filter(Boolean))];
  W.forEach(r=>r.kelasSet=cClasses.slice());
  const areaClasses=new Map();
  S.sotk.C.forEach(r=>{const a=N(r.p[0]);if(!areaClasses.has(a))areaClasses.set(a,new Set());(r.kelasSet||[]).forEach(k=>areaClasses.get(a).add(k))});
  A.forEach(r=>r.kelasSet=[...(areaClasses.get(N(r.p[0]))||[])]);
  S.byKey=new Map([...W,...A,...S.sotk.C].map(r=>[tKey(r.t,r.key),r]));
  buildIndex();
}
// ---------- Indeks pemetaan SOTK 2026: alias kode jabatan gabungan (mis. JOR|OFC), indeks per unit, daftar unit valid ----------
function buildIndex(){
  const alias=new Map(),byOwner=new Map(),orgs={W:new Set(),A:new Set(),C:new Set()};
  [...S.sotk.W,...S.sotk.A,...S.sotk.C].forEach(r=>{
    const owners=r.t==='C'?[r.unitKey,r.branchKey]:[r.org];
    owners.filter(Boolean).forEach(o=>{
      orgs[r.t].add(o);
      const ok=tKey(r.t,o);if(!byOwner.has(ok))byOwner.set(ok,[]);
      if(!byOwner.get(ok).includes(r))byOwner.get(ok).push(r);
      (r.elig&&r.elig.length?r.elig:N(r.job).split('|').map(x=>x.trim()).filter(Boolean)).forEach(j=>{const k=tKey(r.t,o+'|'+j);if(!alias.has(k))alias.set(k,r)});
    });
  });
  S.aliasKey=alias;S.byOwner=byOwner;S.orgSet=orgs;
  S.sotkMeta=(window.SOTK_PRELOAD&&window.SOTK_PRELOAD.SOTK_META)||S.sotkMeta||null;
}
// normalisasi nama jabatan untuk fuzzy matching
const SYN={staf:'staff',stf:'staff',penaksir:'penaksir',kepala:'kepala'};
const toks=v=>N(v).toLowerCase().replace(/&/g,' dan ').replace(/[^a-z0-9 ]+/g,' ').split(/\s+/).filter(x=>x&&!/^\d+$/.test(x)).map(x=>SYN[x]||x);
function jobSim(a,b){const A=[...new Set(toks(a))],B=[...new Set(toks(b))];if(!A.length||!B.length)return 0;
  const bs=new Set(B),i=A.filter(x=>bs.has(x)).length,m=Math.min(A.length,B.length);
  if(m===1&&i<1)return 0;return i/m*(i/Math.max(A.length,B.length)*0.5+0.5)}
// Pencarian node SOTK untuk 1 karyawan — bertingkat, tidak pernah melempar error
function locate(e){
  const t=e.t,own=[...new Set((t==='C'?[e.org,e.unitCode,e.br]:[e.org]).filter(Boolean))];
  for(const o of own){const x=S.byKey.get(tKey(t,o+'|'+e.job));if(x)return {row:x,tier:'Exact',note:'Kode unit + kode jabatan sama persis'}}
  for(const o of own){const x=S.aliasKey&&S.aliasKey.get(tKey(t,o+'|'+e.job));if(x)return {row:x,tier:'Alias',note:x.job.includes('|')?'Kode jabatan '+e.job+' termasuk kode yang boleh mengisi formasi '+x.job+(x.matchMode==='OR_JOB_CODE'?' (aturan OR)':''):'Cocok via kode cabang induk ('+x.job+') \u2014 kode unit tidak ada di master'}}
  const cand=o=>((S.byOwner&&S.byOwner.get(tKey(t,o)))||[]);
  let best=null;
  for(const o of own){cand(o).forEach(r=>{const sc=jobSim(e.jn,r.jobName);if(!best||sc>best.sc)best={row:r,sc,o}})}
  if(best&&best.sc>=0.75)return {row:best.row,tier:'Fuzzy',note:'Nama jabatan mirip \u201c'+best.row.jobName+'\u201d ('+Math.round(best.sc*100)+'%)'};
  // fallback induk: Area sub-departemen -> Kantor Area (KODE UNIT KERJA); Wilayah bagian -> departemen
  const par=t==='A'?[e.unitCode]:t==='W'&&e.org.length>5?[e.org.slice(0,5)]:[];
  for(const o of par){
    const x=S.byKey.get(tKey(t,o+'|'+e.job))||(S.aliasKey&&S.aliasKey.get(tKey(t,o+'|'+e.job)));if(x)return {row:x,tier:'Induk',note:'Ditempatkan pada unit induk '+o};
    cand(o).forEach(r=>{const sc=jobSim(e.jn,r.jobName);if(!best||sc>best.sc)best={row:r,sc,o}});
    if(best&&best.o===o&&best.sc>=0.75)return {row:best.row,tier:'Induk',note:'Unit induk '+o+', nama jabatan mirip \u201c'+best.row.jobName+'\u201d'};
  }
  const known=own.concat(par).some(o=>S.orgSet[t]&&S.orgSet[t].has(o));
  const sug=best&&best.sc>0.3?best.row:null;
  const pool=[...new Set(own.concat(par).flatMap(o=>cand(o).map(r=>r.jobName)))].slice(0,6);
  return {row:null,tier:'Tidak Cocok',note:known?'Unit ada di SOTK 2026, tetapi jabatan \u201c'+e.jn+'\u201d ('+e.job+') tidak memiliki formasi':'Unit/kode organisasi tidak ditemukan di SOTK 2026',
    sugg:pool.length?'Jabatan formasi di unit: '+pool.join(', '):(known?'':'Cek kode unit / usulkan unit baru')}
}
function loadPreload(){const P=window.SOTK_PRELOAD,o={};['SOTK_WILAYAH','SOTK_AREA','SOTK_CABANG','UNIT_MASTER_CABANG','CORPORATE_TITLE','WEB_FILTER_MASTER'].forEach(n=>{const H=P[n+'_H'];o[n]=(P[n]||[]).map(a=>Object.fromEntries((H||[]).map((h,i)=>[h,a[i]])))});buildSotk(o)}
function fillEmptyJabatan(){['W','A'].forEach(t=>S.sotk[t].forEach(r=>{if(r.jobName)return;const e=S.emp.find(x=>x.t===t&&x.org===r.org);if(e){r.jobName=e.jn;r.p[r.p.length-1]=e.jn}}))}
// ---------- Karyawan ----------
const toD=v=>{if(v instanceof Date)return v;if(typeof v==='number'&&v>20000)return new Date(Math.round((v-25569)*864e5));const d=new Date(v);return isNaN(d)?null:d};
const nk=r=>{const o={};for(const k in r)o[String(k).trim().replace(/\s+/g,' ').toUpperCase()]=r[k];return o};
const EMP_REQUIRED=['NIK PENDEK','NAMA'],EMP_SOFT=['ORG CODE','JOB CODE','OFFICE TYPE','POSITION TYPE NAME'];
function validEmployeeRows(rows){
  const accepted=[],seen=new Set();let blankOrInvalid=0,duplicates=0,incomplete=0;
  for(const r0 of rows||[]){
    const r=nk(r0),nik=keyNorm(r['NIK PENDEK']),hasCore=EMP_REQUIRED.every(k=>N(r[k])!=='');
    if(!nik||!hasCore){blankOrInvalid++;continue}
    if(seen.has(nik)){duplicates++;continue}
    if(EMP_SOFT.some(k=>N(r[k])===''))incomplete++;
    seen.add(nik);accepted.push(r0);
  }
  return {rows:accepted,totalInput:(rows||[]).length,blankOrInvalid,duplicates,unique:accepted.length,incomplete};
}
function resolveUnit(r){
  const org=keyNorm(r['ORG CODE']),br=keyNorm(r['BRANCH CODE']),unitKey=keyNorm(r['KODE UNIT KERJA']);
  const direct=(S.unitMap&&S.unitMap.get(unitKey))||(S.unitMap&&S.unitMap.get(org))||(S.unitMap&&S.unitMap.get(br));
  if(direct)return direct;
  const bm=S.branchMeta&&S.branchMeta.get(br);
  if(bm)return {unitKey:'',branchKey:br,name:N(r['NAMA UNIT KERJA']),area:bm.area,branch:bm.branch,type:N(r['UNIT TYPE'])||'',cluster:'',kelas:bm.kelas};
  return null;
}
function normEmp(rows){
  const clean=validEmployeeRows(rows).rows;
  return clean.map(r0=>{
    const r=nk(r0);let ot=N(r['OFFICE TYPE']);
    const org=keyNorm(r['ORG CODE']),br=keyNorm(r['BRANCH CODE']),unitCode=keyNorm(r['KODE UNIT KERJA']),job=keyNorm(r['JOB CODE']);
    const flags=[];EMP_SOFT.forEach(k=>{if(N(r[k])==='')flags.push(k)});
    let t=ot==='Kantor Wilayah'?'W':ot==='Kantor Area'?'A':ot?'C':'';
    if(!t){const has=x=>x&&S.orgSet;t=has(1)&&(S.orgSet.C.has(org)||S.orgSet.C.has(unitCode)||S.orgSet.C.has(br))?'C':has(1)&&S.orgSet.A.has(org)?'A':has(1)&&S.orgSet.W.has(org)?'W':'C';ot=t==='W'?'Kantor Wilayah':t==='A'?'Kantor Area':'(disimpulkan)'}
    const on=N(r['ORG NAME']),jn=N(r['JOB NAME']),brLbl=N(r['BRANCH NAME'])||N(r['NAMA UNIT KERJA']);
    const area=N(r['DEP NAME'])||N(r['AREA'])||'-',pg=+N(r['KODE PERSON GRADE'])||0,g=+N(r['KODE JOB GRADE'])||0;
    const e={t,nik:keyNorm(r['NIK PENDEK']),nama:N(r.NAMA),ot,org,br,unitCode,branch:brLbl,job,jn,pt:N(r['POSITION TYPE NAME'])||'Tidak Diketahui',flags,g,pg,end:toD(r['END DATE']),defOrg:N(r['ORG NAME DEF']),defJob:N(r['JOB NAME DEF']),defOrgC:keyNorm(r['ORG CODE DEF']),defJobC:keyNorm(r['JOB CODE DEF']),unit:N(r['NAMA UNIT KERJA']),wilayah:N(r['DIV NAME'])};
    e.corpTitle=(t==='W'||t==='A')?titleOf(pg):'';
    const deptRaw=(S.deptByOrgW&&S.deptByOrgW.get(org))||on,un=t==='C'?resolveUnit(r):null;
    if(t==='C'){e.area=un?un.area:area;e.cabang=un?un.branch:brLbl;e.outlet=un?un.name:(N(r['NAMA UNIT KERJA'])||on);e.unitType=un?un.type:(N(r['UNIT TYPE'])||'');e.kelasCabang=un?un.kelas:'-';e.clusterType=un?un.cluster:'';e.branchKey=un?un.branchKey:br}
    else{e.kelasCabang='';e.unitType='';e.cabang='';e.outlet='';e.area=area}
    e.p=t==='W'?[bid(deptRaw,jn),bid(on,jn),jn]:t==='A'?[e.unit||area,grp(on),jn]:[e.area||'-',e.kelasCabang||'-',e.cabang||'-',e.outlet||'-',e.unitType||'-',jn];
    return e;
  });
}
function match(){
  const cnt=new Map(),st={Exact:0,Alias:0,Fuzzy:0,Induk:0,'Tidak Cocok':0};
  S.emp.forEach(e=>{
    const L=locate(e);e.mapTier=L.tier;e.mapNote=L.note;e.mapSugg=L.sugg||'';e.sr=null;
    if(e.pt.toLowerCase()!=='definitif')return;
    st[L.tier]++;
    if(L.row){e.sr=L.row;const ck=tKey(e.t,L.row.key);cnt.set(ck,(cnt.get(ck)||0)+1)}
  });
  S.mapStats=st;
  fillEmptyJabatan();
  ['W','A','C'].forEach(t=>S.sotk[t].forEach(r=>{r.a=cnt.get(tKey(t,r.key))||0;r.gap=r.f-r.a}));
  S.units.forEach(u=>{u.f=0;u.a=0});
  const um=new Map(S.units.map(u=>[u.unitKey,u]));
  S.sotk.C.forEach(r=>{const u=um.get(r.unitKey);if(u){u.f+=r.f;u.a+=r.a}});
}
// ---------- Parsing (Web Worker + fallback) ----------
function parseFile(file,cb){
  const rd=new FileReader();
  rd.onload=()=>{
    const buf=rd.result,lib=new URL('lib/xlsx.full.min.js',location.href).href;let done=false;
    const finish=o=>{
      if(done)return;done=true;
      const firstSheet=Object.keys(o).find(k=>Array.isArray(o[k])&&o[k].length)||Object.keys(o)[0];
      const rows=o[firstSheet]||[],meta=validEmployeeRows(rows);
      cb({rows,firstSheet,meta,sheets:o});
    };
    const fb=()=>setTimeout(()=>{const wb=XLSX.read(buf,{type:'array',cellDates:true}),o={};wb.SheetNames.forEach(n=>o[n]=XLSX.utils.sheet_to_json(wb.Sheets[n],{defval:'',raw:true}));finish(o)},30);
    try{
      const src=`onmessage=e=>{importScripts(e.data.lib);const wb=XLSX.read(e.data.buf,{type:'array',cellDates:true}),o={};wb.SheetNames.forEach(n=>o[n]=XLSX.utils.sheet_to_json(wb.Sheets[n],{defval:'',raw:true}));postMessage(o)}`;
      const w=new Worker(URL.createObjectURL(new Blob([src])));w.onmessage=e=>{finish(e.data);w.terminate()};w.onerror=()=>{w.terminate();fb()};w.postMessage({buf,lib})
    }catch(x){fb()}
  };rd.readAsArrayBuffer(file)
}
// ---------- UI helpers ----------
const kpi=(l,v,info)=>`<div class="card kpi${info?' clk':''}" ${info?`data-info="${info}"`:''}><small>${l}</small><b>${v}</b></div>`,badge=g=>`<span class="b ${g>0?'r':g<0?'y':''}">${g}</span>`;
function chart(id,type,labels,data,label){charts[id]&&charts[id].destroy();const el=document.getElementById(id);if(!el)return;charts[id]=new Chart(el,{type,data:{labels,datasets:[{label,data,backgroundColor:['#00843D','#4CAF7D','#9AD3B3','#F5A800','#C9D6CF','#7FB99A','#BFD730','#2E7D5B']}]},options:{maintainAspectRatio:false,plugins:{legend:{display:type==='doughnut'}}}})}
function chartCard(id,title,body=''){return `<div class="card ch chart-card"><div class="chart-head"><h3>${esc(title)}</h3>${body}</div><div class="chart-canvas"><canvas id="${id}"></canvas></div></div>`}
function csv(cols,rows){const strip=h=>String(h).replace(/<[^>]*>/g,'');const head=cols.map(c=>'"'+c[0].replace(/"/g,'""')+'"').join(',');
 const body=rows.map(r=>cols.map(c=>'"'+strip(c[1](r)).replace(/"/g,'""')+'"').join(',')).join('\n');return head+'\n'+body}
function download(name,text){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));a.download=name+'.csv';a.click();URL.revokeObjectURL(a.href)}
function table(host,cols,rows,opt={}){const size=opt.size||50;let pg=0;const n=Math.max(1,Math.ceil(rows.length/size));
  const draw=()=>{const sl=rows.slice(pg*size,pg*size+size);
   host.innerHTML=(opt.name?`<div class="thead"><div></div><button class="btn ghost" id="expBtn">&#8681; Export CSV</button></div>`:'')+
    `<div class="tw"><table><thead><tr>${cols.map(c=>`<th>${c[0]}</th>`).join('')}</tr></thead><tbody>${sl.map(r=>`<tr>${cols.map(c=>`<td>${c[1](r)}</td>`).join('')}</tr>`).join('')||'<tr><td class="mu">Tidak ada data</td></tr>'}</tbody></table></div><div class="pg"><span>${rows.length.toLocaleString('id')} baris</span><button ${pg?'':'disabled'} data-d="-1">‹</button>${pg+1}/${n}<button ${pg<n-1?'':'disabled'} data-d="1">›</button></div>`;
   host.querySelectorAll('.pg button').forEach(b=>b.onclick=()=>{pg+=+b.dataset.d;draw()});
   if(opt.name)$('#expBtn').onclick=()=>{download(opt.name,csv(cols,rows));toast('CSV diunduh: '+opt.name+'.csv')}};draw()}
// panel: level + cascading filters + extras + search (mendukung preset dari navigasi cepat)
function panel({recs,labels=LB,levels=['W','A','C'],extras=[],cb}){
  const host=$('#ctl'),st={lvl:(S.presetLevel&&levels.includes(S.presetLevel))?S.presetLevel:levels[0],sel:[],q:S.presetSearch||''};S.presetLevel=null;S.presetSearch=null;
  host.innerHTML='<div class="ctl" id="cc"></div><div style="margin-top:10px"><input id="q" placeholder="Cari…" value="'+esc(st.q)+'"></div>';
  const run=()=>{
    const cc=$('#cc'),L=labels[st.lvl];let cur=recs(st.lvl);
    let h=levels.length>1?`<div><label>Level</label><select data-k="lv">${levels.map(l=>`<option value="${l}" ${l===st.lvl?'selected':''}>${LV[l]}</option>`).join('')}</select></div>`:'';
    L.forEach((lb,i)=>{const o=[...new Set(cur.map(r=>r.p[i]))].filter(Boolean).sort(),v=st.sel[i]||'';h+=`<div><label>${lb}</label><select data-k="${i}"><option value="">Semua</option>${o.map(x=>`<option ${x===v?'selected':''}>${esc(x)}</option>`).join('')}</select></div>`;if(v)cur=cur.filter(r=>r.p[i]===v)});
    extras.forEach((x,i)=>{const values=[];cur.forEach(r=>{const val=x.f(r);(Array.isArray(val)?val:[val]).forEach(v=>{if(v!==''&&v!=null&&!values.includes(v))values.push(v)})});values.sort();const v=st['x'+i]||'';h+=`<div><label>${x.l}</label><select data-k="x${i}"><option value="">Semua</option>${values.map(y=>`<option ${y===v?'selected':''}>${esc(y)}</option>`).join('')}</select></div>`;if(v)cur=cur.filter(r=>{const val=x.f(r);return Array.isArray(val)?val.includes(v):N(val)===N(v)})});
    cc.innerHTML=h;cc.querySelectorAll('select').forEach(s=>s.onchange=()=>{const k=s.dataset.k;if(k==='lv'){st.lvl=s.value;st.sel=[];extras.forEach((_,i)=>st['x'+i]='')}else if(k[0]==='x')st[k]=s.value;else{st.sel[+k]=s.value;st.sel.length=+k+1}run()});
    if(st.q){const q=st.q.toLowerCase();cur=cur.filter(r=>(r.p.join(' ')+(r.nama||'')+(r.nik||'')).toLowerCase().includes(q))}
    cb(cur,st.lvl);
  };
  $('#q').oninput=e=>{clearTimeout(st.tm);st.tm=setTimeout(()=>{st.q=e.target.value;run()},250)};run();
}
const shell=(x='')=>$('#view').innerHTML=`<div class="card" id="ctl"></div>${x}<div class="card" id="out"></div>`;
function jump(m,t){go(m,t||0)}
function openModal(i){$('#mdc').innerHTML=`<h3>${i.t}</h3><p class="mu">${i.d}</p>${i.r.map(([k,v])=>`<div class="mini"><span>${k}</span><b>${v}</b></div>`).join('')}<button class="btn sm" id="mdgo" style="margin-top:16px">Lihat rincian \u2192</button>`;$('#modal').hidden=false;$('#mdgo').onclick=()=>{closeModal();S.presetLevel=i.go[2]||null;go(i.go[0],i.go[1])}}
function closeModal(){$('#modal').hidden=true}
function logout(){closeModal();S.ready=false;S.emp=[];S.pending=null;$('#app').hidden=true;const l=$('#login');l.hidden=false;$('#pw').value='';$('#err').textContent='';requestAnimationFrame(()=>l.style.opacity=1);toast('Anda telah keluar')}
// ---------- Views ----------
const locCols=lv=>LB[lv].map((l,i)=>[l,r=>esc(r.p[i])]);
const loc={W:locCols('W').slice(0,2),A:locCols('A').slice(0,2),C:locCols('C').slice(0,4)};
const empCols=lv=>[['NIK',r=>r.nik],['Nama',r=>esc(r.nama)],...loc[lv],['Jabatan',r=>esc(r.jn)],['Position Type',r=>r.pt],['Grade (JG)',r=>r.g],['Person Grade',r=>r.pg||'-'],['Corporate Title',r=>esc(r.corpTitle||'-')],['End Date',r=>r.end?r.end.toISOString().slice(0,10):'']];
const gapCols=lv=>[...locCols(lv),['Formasi',r=>r.f],['Aktual (Definitif)',r=>r.a],['Gap',r=>badge(r.gap)]];
const NEED=new Set(['mon0','mon1','mon2','mp0','mp1','intel0','intel1','intel2','intel3']);
function emptyView(m,t){const n=NAV.find(x=>x[0]===m),nm=n[2]?n[2][t]:n[1];
 $('#view').innerHTML=`<div class="grid">${['Karyawan','Definitif','Match SOTK','Kepatuhan Grade'].map(x=>`<div class="card kpi ph"><small>${x}</small><b>\u2014</b></div>`).join('')}</div><div class="card empty"><div class="em-ic">&#9636;</div><h3>Belum ada data \u2014 ${esc(nm)}</h3><p>Halaman ini terbuka penuh, namun belum ada data karyawan untuk ditampilkan. Unggah file di <b>Data &amp; Set Up</b> untuk mengaktifkan grafik, tabel, dan filter.</p><button class="btn sm" id="gs">Buka Data &amp; Set Up</button><div class="em-skel"><i></i><i></i><i></i></div></div>`;$('#gs').onclick=()=>go('setup')}
const V={
dash(){if(!S.ready)return emptyView('dash',0);
 const d=S.emp.filter(e=>e.pt.toLowerCase()==='definitif'),f=['W','A','C'].reduce((a,t)=>a+S.sotk[t].reduce((x,r)=>x+r.f,0),0),matched=S.emp.filter(e=>e.sr).length;
 const gapAll=['W','A','C'].flatMap(t=>S.sotk[t].filter(r=>r.gap>0).map(r=>({...r,lv:t}))).sort((a,b)=>b.gap-a.gap),gapPos=gapAll.slice(0,6),totGap=gapAll.reduce((a,r)=>a+r.gap,0);
 const y=new Date().getFullYear(),soon=d.filter(e=>e.end&&e.end.getFullYear()>=y&&e.end.getFullYear()<=y+1).sort((a,b)=>a.end-b.end).slice(0,6);
 const lvSum=t=>({f:S.sotk[t].reduce((a,r)=>a+r.f,0),a:S.sotk[t].reduce((a,r)=>a+r.a,0),n:S.emp.filter(e=>e.t===t).length});
 const LWA=lvSum('W'),LAA=lvSum('A'),LCA=lvSum('C');
 const geAll=S.emp.filter(e=>e.g>0&&e.pg>0),mmList=geAll.filter(e=>!gradeCheck(e).ok),mmCount=mmList.length,compliance=geAll.length?Math.round((geAll.length-mmCount)/geAll.length*100):0;
 const bandOrder=['BOD-1','BOD-2','BOD-3','BOD-4','BOD-5'];
 const bandStat=bandOrder.map(b=>{const grp=geAll.filter(e=>gradeCheck(e).band===b);const ok=grp.filter(e=>gradeCheck(e).ok).length;return{b,ok,n:grp.length}}).filter(x=>x.n);
 const totalUnit=new Set(S.emp.map(e=>e.org)).size,totalOutlet=S.units.length,jabUnik=new Set(S.emp.map(e=>e.jn)).size,rataGrade=d.length?(d.reduce((a,e)=>a+e.g,0)/d.length).toFixed(1):'-';
 $('#view').innerHTML=`<div class="hero"><div><small>MANPOWER OVERVIEW</small><h2>Dashboard Monitoring SDM \u2014 Wilayah Jakarta 1</h2><p>Ringkasan tenaga kerja, formasi SOTK, kesiapan struktur organisasi, dan kepatuhan grade dalam satu tampilan.</p></div>
  <div class="hero-kpi"><div><b>${S.emp.length.toLocaleString('id')}</b><small>Total Karyawan</small></div><div><b>${d.length.toLocaleString('id')}</b><small>Definitif</small></div><div><b>${f.toLocaleString('id')}</b><small>Formasi SOTK</small></div></div></div>
  <div class="grid">${kpi('Karyawan Definitif',d.length.toLocaleString('id'),'def')}${kpi('Match ke SOTK',matched.toLocaleString('id')+' / '+d.length.toLocaleString('id'),'match')}${kpi('Gap Formasi (Kurang)',totGap.toLocaleString('id'),'gap')}${kpi('Kepatuhan Grade (JG vs PG)',compliance+'%','comp')}</div>
  <div class="factstrip"><div class="clk" data-info="unit"><b>${totalUnit.toLocaleString('id')}</b><small>Unit Organisasi</small></div><div class="clk" data-info="outlet"><b>${totalOutlet.toLocaleString('id')}</b><small>Cabang / Outlet</small></div><div class="clk" data-info="jab"><b>${jabUnik.toLocaleString('id')}</b><small>Jabatan Unik</small></div><div class="clk" data-info="grd"><b>${rataGrade}</b><small>rata rata grade definitif</small></div></div>
  <div class="section-t"><h3>Ringkasan per Tingkat Organisasi</h3><p>Klik kartu untuk membuka rincian Gap Formasi tingkat tersebut.</p></div>
  <div class="lvl-grid">
   <div class="lvl-card" data-info="lvW"><span class="lvl-tag">KANTOR WILAYAH</span><b>${LWA.n}</b><small>karyawan</small><div class="lvl-bar"><i style="width:${LWA.f?Math.min(100,LWA.a/LWA.f*100):0}%"></i></div><div class="lvl-foot"><span>Formasi ${LWA.f}</span><span>Aktual ${LWA.a}</span></div></div>
   <div class="lvl-card" data-info="lvA"><span class="lvl-tag">KANTOR AREA</span><b>${LAA.n}</b><small>karyawan</small><div class="lvl-bar"><i style="width:${LAA.f?Math.min(100,LAA.a/LAA.f*100):0}%"></i></div><div class="lvl-foot"><span>Formasi ${LAA.f}</span><span>Aktual ${LAA.a}</span></div></div>
   <div class="lvl-card" data-info="lvC"><span class="lvl-tag">CABANG / OUTLET</span><b>${LCA.n}</b><small>karyawan</small><div class="lvl-bar"><i style="width:${LCA.f?Math.min(100,LCA.a/LCA.f*100):0}%"></i></div><div class="lvl-foot"><span>Formasi ${LCA.f}</span><span>Aktual ${LCA.a}</span></div></div>
  </div>
  <div class="two dashboard-two">
   <div class="card ch chart-card"><div class="chart-head"><h3 id="c1ttl">Karyawan per Tipe Kantor</h3><div class="chart-tog"><button class="on" data-c="office">Tipe Kantor</button><button data-c="title">Corporate Title</button></div></div><div class="chart-canvas"><canvas id="c1"></canvas></div></div>
   <div class="card ch chart-card clk" data-info="grade"><div class="chart-head"><h3>Definitif per Job Grade</h3></div><div class="chart-canvas"><canvas id="c2"></canvas></div></div>
  </div>
  <div class="section-t"><h3>Kepatuhan Job Grade vs Person Grade</h3><p>Berdasarkan aturan Laddering Pasal 15 — seluruh karyawan, seluruh tingkatan. Klik untuk lihat rincian.</p></div>
  <div class="two dashboard-two">
   <div class="card ch chart-card clk" data-info="mm"><div class="chart-head"><h3>Kepatuhan Grade</h3></div><div class="chart-canvas"><canvas id="c3"></canvas></div></div>
   <div class="card chart-card"><div class="chart-head"><h3>Kepatuhan per Corporate Band</h3></div><div class="chart-canvas chart-list"><div id="bandBars"></div></div></div>
  </div>
  <div class="two"><div class="card"><div class="section-t"><h3>Top Kekurangan Formasi</h3><p>Klik untuk membuka Vacancy Priority.</p></div>${gapPos.map(r=>`<div class="mini clk" data-jump="intel0:${r.lv}"><span>${esc(r.p.slice(0,-1).join(' \u00b7 '))} \u2014 ${esc(r.jobName)}</span><b>+${r.gap}</b></div>`).join('')||'<p class="mu">Tidak ada gap.</p>'}</div>
  <div class="card"><div class="section-t"><h3>Proyeksi Pensiun Terdekat</h3><p>Klik untuk membuka Proyeksi Pensiun.</p></div>${soon.map(e=>`<div class="mini clk" data-jump="mp1:${e.t}"><span>${esc(e.nama)} \u2014 ${esc(e.jn)}</span><b>${e.end.toISOString().slice(0,10)}</b></div>`).join('')||'<p class="mu">Tidak ada dalam rentang ini.</p>'}</div></div>`;
 const om={};S.emp.forEach(e=>om[e.ot]=(om[e.ot]||0)+1);
 const tm={};d.filter(e=>e.corpTitle).forEach(e=>tm[e.corpTitle]=(tm[e.corpTitle]||0)+1);
 chart('c1','doughnut',Object.keys(om),Object.values(om),'Karyawan per Tipe Kantor');
 const gm={};d.forEach(e=>gm['G'+e.g]=(gm['G'+e.g]||0)+1);const gk=Object.keys(gm).sort((a,b)=>+a.slice(1)-+b.slice(1));chart('c2','bar',gk,gk.map(k=>gm[k]),'Definitif per Job Grade');
 chart('c3','doughnut',['Sesuai','Tidak Sesuai'],[geAll.length-mmCount,mmCount],'Kepatuhan Grade');
 $('#bandBars').innerHTML='<div class="section-t" style="margin-bottom:10px"><h3 style="font-size:13.5px;margin:0">Kepatuhan per Corporate Band</h3></div>'+(bandStat.map(x=>`<div class="mini"><span>${x.b}</span><b>${x.ok}/${x.n} (${Math.round(x.ok/x.n*100)}%)</b></div><div class="lvl-bar" style="margin:0 0 10px"><i style="width:${Math.round(x.ok/x.n*100)}%"></i></div>`).join('')||'<p class="mu">Belum ada data grade.</p>');
 $$c('.chart-tog button').forEach(b=>b.onclick=()=>{$$c('.chart-tog button').forEach(x=>x.classList.remove('on'));b.classList.add('on');if(b.dataset.c==='office'){$('#c1ttl').textContent='Karyawan per Tipe Kantor';chart('c1','doughnut',Object.keys(om),Object.values(om),'Karyawan per Tipe Kantor')}else{$('#c1ttl').textContent='Karyawan per Corporate Title (Wilayah & Area)';chart('c1','bar',Object.keys(tm),Object.values(tm),'Karyawan per Corporate Title')}});
 const fm=x=>x.toLocaleString('id'),pc=(a,b)=>b?Math.round(a/b*100)+'%':'0%';
 const lvI=(t,nm,L)=>({t:nm,d:'Perbandingan formasi SOTK dengan aktual karyawan definitif pada tingkat ini.',r:[['Karyawan',fm(L.n)],['Formasi SOTK',fm(L.f)],['Aktual definitif',fm(L.a)],['Gap (formasi \u2212 aktual)',fm(L.f-L.a)],['Pemenuhan formasi',pc(L.a,L.f)]],go:['mp',0,t]});
 const INFO={def:{t:'Karyawan Definitif',d:'Karyawan berstatus Position Type "Definitif"; menjadi dasar perhitungan aktual formasi.',r:[['Total karyawan',fm(S.emp.length)],['Definitif',fm(d.length)],['Non-definitif',fm(S.emp.length-d.length)],['Porsi definitif',pc(d.length,S.emp.length)]],go:['mon',1]},
  match:{t:'Match ke SOTK',d:'Karyawan definitif yang berhasil dipetakan ke kunci formasi SOTK (kode organisasi + kode jabatan).',r:[['Ter-match',fm(matched)],['Tanpa match',fm(d.length-matched)],['Tingkat match',pc(matched,d.length)],...Object.entries(S.mapStats||{}).map(([k,v])=>['Tier '+k,fm(v)])],go:['intel',3]},
  gap:{t:'Gap Formasi (Kurang)',d:'Total posisi yang formasinya masih lebih besar dari jumlah karyawan definitif. Berikut 5 kekurangan terbesar.',r:[['Total kekurangan',fm(totGap)],['Posisi dengan gap',fm(gapAll.length)],...gapPos.slice(0,5).map(x=>[esc(x.p.slice(0,-1).join(' \u00b7 ')+' \u2014 '+x.jobName),'+'+x.gap])],go:['intel',0]},
  comp:{t:'Kepatuhan Grade',d:'Kesesuaian Job Grade jabatan dengan Person Grade karyawan berdasarkan aturan Laddering Pasal 15.',r:[['Karyawan dinilai',fm(geAll.length)],['Sesuai',fm(geAll.length-mmCount)],['Tidak sesuai',fm(mmCount)],['Kepatuhan',compliance+'%']],go:['intel',1]},
  mm:{t:'Kepatuhan Grade',d:'Komposisi karyawan sesuai vs tidak sesuai terhadap aturan Laddering.',r:[['Sesuai',fm(geAll.length-mmCount)],['Tidak sesuai',fm(mmCount)],...bandStat.map(x=>['Band '+x.b,x.ok+'/'+x.n+' ('+pc(x.ok,x.n)+')'])],go:['intel',1]},
  unit:{t:'Unit Organisasi',d:'Jumlah kode organisasi unik pada data karyawan.',r:[['Unit organisasi',fm(totalUnit)],['Cabang / outlet (master)',fm(totalOutlet)]],go:['sotk',0]},
  outlet:{t:'Cabang / Outlet',d:'Jumlah unit pada master cabang, lengkap dengan formasi dan aktual.',r:[['Total outlet',fm(totalOutlet)],['Formasi cabang',fm(LCA.f)],['Aktual cabang',fm(LCA.a)]],go:['sotk',1]},
  jab:{t:'Jabatan Unik',d:'Jumlah nama jabatan berbeda pada seluruh data karyawan.',r:[['Jabatan unik',fm(jabUnik)],['Total karyawan',fm(S.emp.length)]],go:['mon',2]},
  grd:{t:'rata rata grade',d:'Nilai rata rata grade dihitung dari Job Grade seluruh karyawan definitif.',r:[['rata rata grade',rataGrade],['Definitif',fm(d.length)]],go:['mon',0]},
  grade:{t:'Sebaran Job Grade',d:'Jumlah karyawan definitif per Job Grade. Lima grade terbanyak:',r:Object.entries(gm).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>[k,fm(v)]),go:['mon',0]},
  lvW:lvI('W','Kantor Wilayah',LWA),lvA:lvI('A','Kantor Area',LAA),lvC:lvI('C','Cabang / Outlet',LCA)};
 $$c('[data-info]').forEach(el=>el.onclick=()=>{const i=INFO[el.dataset.info];if(i)openModal(i)});
 $$c('[data-jump]').forEach(el=>el.onclick=()=>{const[m,t]=el.dataset.jump.split(':');S.presetLevel=t||null;go(m.replace(/\d+$/,''),+(m.match(/\d+$/)||[0])[0])})},
setup(){const sc=['W','A','C'].map(t=>S.sotk[t].length);
 const dz=(id,t,sub,acc)=>`<label class="dz" id="dz-${id}" for="${id}"><span class="dz-ic">&#8679;</span><b>${t}</b><small>${sub}</small><em id="${id}n"></em><input type="file" id="${id}" accept="${acc}" hidden></label>`,st=(n,l)=>`<div class="su-st"><b>${n}</b><small>${l}</small></div>`;
 $('#view').innerHTML=`<div class="su-hero"><div><small>DATA &amp; SET UP</small><h2>Siapkan Data Monitoring SDM</h2><p>Semua menu dapat dibuka kapan saja. Unggah data karyawan agar grafik, tabel, dan analisis terisi otomatis.</p></div><span class="su-pill ${S.ready?'ok':''}">${S.ready?'\u25cf Data aktif \u00b7 '+S.emp.length.toLocaleString('id')+' karyawan':'\u25cb Menunggu data karyawan'}</span></div>
 <div class="su-steps"><div class="on"><i>1</i><span>SOTK Master<small>Bawaan / opsional</small></span></div><div class="${S.ready?'on':''}"><i>2</i><span>Data Karyawan<small>Upload .xlsx</small></span></div><div class="${S.ready?'on':''}"><i>3</i><span>Gunakan Data<small>Aktifkan dashboard</small></span></div></div>
 <div class="two su-two"><div class="card su-card"><div class="su-h"><span class="su-ic">&#9638;</span><div><h3>SOTK Master</h3><p class="mu">Sumber: ${esc(S.sotkSrc)}</p></div></div><div class="su-stats">${st(sc[0],'Wilayah')}${st(sc[1],'Area')}${st(sc[2],'Cabang')}${st(S.units.length,'Unit')}${st(S.corpTitles.length,'Corp. Title')}</div>${dz('fs2','Upload / Update SOTK Master','Seret file .xlsx ke sini atau klik untuk memilih','.xlsx')}<p id="ss" class="mu"></p><button class="btn o" id="us" disabled>Perbarui SOTK Master</button></div>
 <div class="card su-card"><div class="su-h"><span class="su-ic">&#9786;</span><div><h3>Data Karyawan</h3><p class="mu" id="fs">${S.ready?S.emp.length.toLocaleString('id')+' baris aktif':'Belum ada file'}</p></div></div><div class="su-note">Baris karyawan divalidasi dengan <code>NIK PENDEK</code>, <code>NAMA</code>, <code>ORG CODE</code>, <code>JOB CODE</code>, <code>OFFICE TYPE</code>, dan <code>POSITION TYPE NAME</code>. Duplikat NIK otomatis dibuang.</div>${dz('fe','Upload Data Karyawan','Seret file .xlsx / .xls ke sini atau klik untuk memilih','.xlsx,.xls')}<button class="btn" id="use" disabled>Gunakan Data</button></div></div>`;
 ['fe','fs2'].forEach(id=>{const z=$('#dz-'+id),i=$('#'+id);['dragover','dragenter'].forEach(v=>z.addEventListener(v,e=>{e.preventDefault();z.classList.add('hv')}));['dragleave','drop'].forEach(v=>z.addEventListener(v,()=>z.classList.remove('hv')));z.addEventListener('drop',e=>{e.preventDefault();if(e.dataTransfer.files[0]){i.files=e.dataTransfer.files;i.dispatchEvent(new Event('change'))}})});
 $('#fe').onchange=e=>{const f=e.target.files[0];if(!f)return;$('#fen').textContent=f.name;$('#fs').textContent='Membaca file…';$('#use').disabled=true;parseFile(f,z=>{const rows=z.rows||[],meta=z.meta||{};if(!meta.unique||!('JOB CODE' in nk(rows[0]||{}))){$('#fs').textContent='Format tidak dikenali atau tidak ada baris karyawan valid';return}$('#fs').textContent='Menormalisasi '+meta.unique.toLocaleString('id')+' karyawan unik…';setTimeout(()=>{S.pendingRaw=meta.rows;S.pending=normEmp(meta.rows);S.parseStats=meta;$('#fs').textContent=meta.unique.toLocaleString('id')+' karyawan siap digunakan'+(meta.duplicates?` · ${meta.duplicates} duplikat dibuang`:'')+(meta.blankOrInvalid?` · ${meta.blankOrInvalid} baris kosong/tidak valid diabaikan`:'');$('#use').disabled=false},20)})};
 $('#use').onclick=()=>{S.empRaw=S.pendingRaw;S.emp=S.pending;match();S.ready=true;toast('Data digunakan · '+S.emp.length.toLocaleString('id')+' karyawan · '+((S.mapStats||{})['Tidak Cocok']||0)+' definitif belum ter-mapping');side();go('dash')};
 $('#fs2').onchange=e=>{const f=e.target.files[0];if(!f)return;$('#fs2n').textContent=f.name;$('#ss').textContent='Membaca SOTK…';parseFile(f,z=>{const o=z.sheets||{};if(!o.SOTK_WILAYAH&&!o.SOTK_AREA&&!o.SOTK_CABANG){$('#ss').textContent='Sheet SOTK tidak ditemukan';return}S.pend2={o,n:f.name};$('#ss').textContent='Siap: '+f.name;$('#us').disabled=false})};
 $('#us').onclick=()=>{buildSotk(S.pend2.o);S.sotkSrc='Upload: '+S.pend2.n;if(S.ready){S.emp=normEmp(S.empRaw);match()}else match();toast('SOTK Master diperbarui');go('setup')}},
mon0(){shell('<div class="grid" id="kp"></div><div class="two dashboard-two">'+chartCard('c1','Komposisi Karyawan berdasarkan Position Type')+chartCard('c2','Distribusi Karyawan berdasarkan Job Grade')+'</div>');
 panel({recs:l=>S.emp.filter(e=>e.t===l),cb:rows=>{const c=f=>rows.reduce((m,r)=>(m[f(r)]=(m[f(r)]||0)+1,m),{}),pt=c(r=>r.pt),gr=c(r=>r.g);$('#kp').innerHTML=kpi('Karyawan',rows.length)+kpi('Definitif',pt.Definitif||0)+kpi('Non-definitif',rows.length-(pt.Definitif||0));chart('c1','doughnut',Object.keys(pt),Object.values(pt),'Position Type');const k=Object.keys(gr).sort((a,b)=>a-b);chart('c2','bar',k.map(x=>'G'+x),k.map(x=>gr[x]),'Jumlah Karyawan')}})},
mon1(){shell();panel({recs:l=>S.emp.filter(e=>e.t===l),extras:[{l:'Position Type',f:r=>r.pt}],cb:(r,lv)=>table($('#out'),empCols(lv),r,{name:'Monitoring_Karyawan'})})},
mon2(){shell();panel({recs:l=>S.emp.filter(e=>e.t===l),cb:(rows,lv)=>{const m={};rows.forEach(r=>{const kk=lv==='C'?r.p[2]+'|'+r.p[3]+'|'+r.jn:r.jn,x=m[kk]||(m[kk]={cab:r.p[2],out:r.p[3],jn:r.jn,n:0,d:0,g:0});x.n++;x.g+=r.g;if(r.pt.toLowerCase()==='definitif')x.d++});
  table($('#out'),[...(lv==='C'?[['Cabang',r=>esc(r.cab)],['Outlet',r=>esc(r.out)]]:[]),['Jabatan',r=>esc(r.jn)],['Total',r=>r.n],['Definitif',r=>r.d],['rata rata grade',r=>(r.g/r.n).toFixed(1)]],Object.values(m).sort((a,b)=>b.n-a.n),{name:'Struktur_Jabatan'})}})},
mp0(){shell('<div class="section-t page-section-title"><h3>Gap Formasi</h3><p>Perbandingan formasi SOTK dengan aktual karyawan definitif.</p></div><div class="grid" id="kp"></div>');panel({recs:l=>S.sotk[l],extras:[{l:'Status Gap',f:r=>r.gap>0?'Kurang':r.gap<0?'Lebih':'Sesuai'}],cb:(rows,lv)=>{const f=rows.reduce((a,r)=>a+r.f,0),a=rows.reduce((x,r)=>x+r.a,0);$('#kp').innerHTML=kpi('Formasi',f)+kpi('Aktual Definitif',a)+kpi('Gap',f-a);table($('#out'),gapCols(lv),rows,{name:'Gap_Formasi'})}})},
mp1(){const y0=new Date().getFullYear(),MN=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
 shell(`<div class="card filter-card"><div class="ctl"><div><label>Filter Rentang Tahun</label><select id="yr">${[1,2,3,5,10].map(n=>`<option value="${n}" ${n==3?'selected':''}>${n} tahun ke depan (${y0}–${y0+n-1})</option>`).join('')}</select></div><div><label>Filter Tahun Spesifik</label><select id="sy"><option value="">Semua (ikuti rentang)</option>${Array.from({length:11},(_,i)=>`<option value="${y0+i}">${y0+i}</option>`).join('')}</select></div></div><p class="mu" style="margin:10px 0 0;font-size:12px">Pilih tahun spesifik untuk menampilkan pensiun pada tahun itu saja (grafik per bulan).</p></div>${chartCard('c1','Proyeksi Pensiun')}`);
 const draw=()=>{const n=+$('#yr').value,sy=+$('#sy').value,lo=sy||y0,hi=sy||y0+n-1;$('#yr').style.opacity=sy?.5:1;const pool=S.emp.filter(e=>e.end&&e.end.getFullYear()>=lo&&e.end.getFullYear()<=hi);panel({recs:l=>pool.filter(e=>e.t===l),cb:(rows,lv)=>{const m={};if(sy)MN.forEach(x=>m[x]=0);else for(let y=lo;y<=hi;y++)m[y]=0;rows.forEach(r=>m[sy?MN[r.end.getMonth()]:r.end.getFullYear()]++);chart('c1','bar',Object.keys(m),Object.values(m),'Jumlah Karyawan');table($('#out'),empCols(lv),rows.slice().sort((a,b)=>a.end-b.end),{name:'Proyeksi_Pensiun'})}})};$('#yr').onchange=()=>{$('#sy').value='';draw()};$('#sy').onchange=draw;draw()},
sotk0(){shell();panel({recs:l=>S.sotk[l],cb:(r,l)=>table($('#out'),[...locCols(l),...(l==='A'?[['Klasifikasi Area',q=>esc(q.klas||'-')]]:[]),['Kode Jabatan',q=>esc(q.job||'-')],...(l==='W'?[['Aturan Pengisian',q=>esc(q.elig&&q.elig.length>1?'Boleh diisi '+q.elig.join(' / '):'Hanya '+(q.job||'-'))]]:[]),['Job Grade',q=>q.gmin===q.gmax?q.gmin:q.gmin+'–'+q.gmax],['Corporate Title',q=>esc(titleOf(q.gmin)||(q.gmin!==q.gmax?titleOf(q.gmax):'')||'-')],['Formasi',q=>q.f]],r,{name:'SOTK_Explorer'})})},
sotk1(){const L=['Area','Kelas Cabang','Klasifikasi','Cabang','Jenis Outlet','Outlet'];shell('<div class="grid" id="kp"></div>');
 panel({recs:()=>S.units,labels:{C:L},levels:['C'],cb:rows=>{const cl={};rows.forEach(u=>{const c=cl[u.p[2]]||(cl[u.p[2]]={n:0,f:0,a:0});c.n++;c.f+=u.f;c.a+=u.a});
  $('#kp').innerHTML=Object.entries(cl).map(([k,c])=>kpi(esc(k)+' · '+c.n+' outlet','Gap '+(S.ready?c.f-c.a:'–'))).join('')+'';
  table($('#out'),[...L.map((l,i)=>[l,u=>esc(u.p[i])]),['Formasi',u=>u.f],['Aktual',u=>S.ready?u.a:'–'],['Gap',u=>S.ready?badge(u.f-u.a):'–']],rows,{name:'Snapshot_Outlet'})}})},
intel0(){shell();panel({recs:l=>S.sotk[l].filter(r=>r.gap>0),cb:(r,l)=>table($('#out'),gapCols(l),r.slice().sort((a,b)=>b.gap-a.gap),{name:'Vacancy_Priority'})})},
intel1(){shell();
 panel({recs:l=>S.emp.filter(e=>e.t===l&&e.g>0&&e.pg>0),
  extras:[{l:'Status Kesesuaian',f:r=>gradeCheck(r).ok?'Sesuai':'Tidak Sesuai'},{l:'Corporate Band',f:r=>gradeCheck(r).band}],
  cb:(r,lv)=>{const rows=r.slice().sort((a,b)=>(gradeCheck(a).ok-gradeCheck(b).ok));
   table($('#out'),[['NIK',x=>x.nik],['Nama',x=>esc(x.nama)],...loc[lv],['Jabatan',x=>esc(x.jn)],['Job Grade',x=>x.g],['Band',x=>gradeCheck(x).band||'-'],['Rentang PG Sesuai',x=>{const c=gradeCheck(x);return c.lo===c.hi?c.lo:c.lo+'–'+c.hi}],['Person Grade',x=>x.pg],['Corporate Title (PG)',x=>esc(titleOf(x.pg)||'-')],['Status',x=>gradeCheck(x).ok?'<span class="b">Sesuai</span>':'<span class="b r">Tidak Sesuai</span>']],rows,{name:'Grade_Mismatch'})}})},
intel2(){shell();panel({recs:l=>S.emp.filter(e=>e.t===l&&(e.defOrgC!==e.org||e.defJobC!==e.job)),extras:[{l:'Position Type',f:r=>r.pt}],cb:(r,lv)=>table($('#out'),[['NIK',x=>x.nik],['Nama',x=>esc(x.nama)],...loc[lv],['Type',x=>x.pt],['Penempatan Saat Ini',x=>esc(x.unit+' — '+x.jn)],['Penempatan Definitif',x=>esc(x.defOrg+' — '+x.defJob)]],r,{name:'Definitive_Placement'})})},
intel3(){const st=S.mapStats||{},d=S.emp.filter(e=>e.pt.toLowerCase()==='definitif').length,ch=(S.sotkMeta&&S.sotkMeta.changes)||[];
 const chRows=ch.map(c=>{const n=c.org?S.emp.filter(e=>e.org===c.org).length:0;return `<div class="mini"><span><b>${esc(c.kind||'Perubahan')}</b> \u2014 ${esc(c.text||'')}</span><b>${c.org?n+' karyawan di unit ini':'Master data'}</b></div>`}).join('');
 shell('<div class="grid">'+kpi('Exact',st.Exact||0)+kpi('Alias / Fuzzy / Induk',(st.Alias||0)+' / '+(st.Fuzzy||0)+' / '+(st.Induk||0))+kpi('Tidak Cocok (Manual)',st['Tidak Cocok']||0)+kpi('Tingkat Match Definitif',d?Math.round(((d-(st['Tidak Cocok']||0))/d)*100)+'%':'-')+'</div>'+(chRows?'<div class="card"><div class="section-t"><h3>Log Perubahan SOTK (v2)</h3><p>Koreksi formasi, perpindahan induk, dan pembaruan master yang sudah dimuat.</p></div>'+chRows+'</div>':''));
 panel({recs:l=>S.emp.filter(e=>e.t===l),extras:[{l:'Status Mapping',f:r=>r.mapTier},{l:'Position Type',f:r=>r.pt}],
  cb:(r,lv)=>{const rows=r.slice().sort((a,b)=>(a.mapTier==='Tidak Cocok'?0:1)-(b.mapTier==='Tidak Cocok'?0:1));
   const tag=x=>`<span class="b ${x==='Tidak Cocok'?'r':x==='Exact'?'':'y'}">${esc(x)}</span>`;
   table($('#out'),[['NIK',x=>x.nik],['Nama',x=>esc(x.nama)],...loc[lv],['Kode Org',x=>esc(x.org)],['Jabatan',x=>esc(x.jn+' ('+x.job+')')],['Type',x=>x.pt],['Status Mapping',x=>tag(x.mapTier)],['Catatan',x=>esc(x.mapNote)],['Saran Penyesuaian Manual',x=>esc((x.flags&&x.flags.length?'Kolom kosong: '+x.flags.join(', ')+'. ':'')+x.mapSugg)]],rows,{name:'Validasi_Mapping_SOTK'})}})}
};
// ---------- Router ----------
const $$c=s=>[...document.querySelectorAll(s)];
const ICONS={dash:'M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6V11h-6v9Zm0-16v5h6V4h-6Z',setup:'M12 3l1.6 2.9 3.2.6-2.3 2.3.5 3.2L12 10.5 9 12l.5-3.2L7.2 6.5l3.2-.6L12 3Zm-7 12h4v6H5v-6Zm14 0h-4v6h4v-6Z',mon:'M9 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm1 4h4M10 11h4M10 15h2',mp:'M4 19V5m5 14V9m5 10V13m5 6V7',sotk:'M4 6h16M4 12h16M4 18h10',intel:'M12 2l2.4 5 5.6.8-4 4 1 5.6L12 15l-5 2.4 1-5.6-4-4 5.6-.8L12 2Z'};
function iconSvg(d){return `<i><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg></i>`}
function side(){const grp1=NAV.slice(0,2),grp2=NAV.slice(2);const item=n=>{const lk=false;return`<a data-m="${n[0]}" class="${S.menu===n[0]?'on':''} ${lk?'lk':''}">${iconSvg(ICONS[n[0]])}<span>${n[1]}</span>${lk?'<span class="lock">&#128274;</span>':''}</a>`};
 $('#nav').innerHTML='<div class="nav-lbl">UTAMA</div>'+grp1.map(item).join('')+'<div class="nav-lbl">MODUL SDM</div>'+grp2.map(item).join('');
 $('#nav').querySelectorAll('a').forEach(a=>a.onclick=()=>go(a.dataset.m));$('#stat').textContent=S.ready?S.emp.length.toLocaleString('id')+' karyawan':'Data belum dimuat'}
function go(m,t=0){S.menu=m;S.tab=t;side();const n=NAV.find(x=>x[0]===m);$('#ttl').textContent=n[1];
 $('#tabs').innerHTML=(n[2]||[]).map((x,i)=>`<a class="${i===t?'on':''}" data-i="${i}">${x}</a>`).join('');$('#tabs').querySelectorAll('a').forEach(a=>a.onclick=()=>go(m,+a.dataset.i));
 Object.values(charts).forEach(c=>c.destroy());const key=n[2]?m+t:m;if(!S.ready&&(key==='dash'||NEED.has(key)))return emptyView(m,t);V[key]()}
['logout','logout2'].forEach(i=>$('#'+i).onclick=logout);$('#modal').onclick=e=>{if(e.target.id==='modal'||e.target.id==='mdx')closeModal()};document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
$('#eye').onclick=()=>{const p=$('#pw');p.type=p.type==='password'?'text':'password'};
$('#go').onclick=()=>{if($('#u').value==='admin'&&$('#pw').value==='admin123'){$('#login').style.opacity=0;setTimeout(()=>{$('#login').hidden=true;$('#app').hidden=false;loadPreload();match();go('dash')},350)}else{$('#err').textContent='Username / password salah';toast('Login gagal')}};
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&!$('#login').hidden)$('#go').click()});
const gq=$('#gq');if(gq)gq.addEventListener('keydown',e=>{if(e.key==='Enter'&&gq.value.trim()){if(!S.ready){toast('Data karyawan belum dimuat');return}S.presetSearch=gq.value.trim();jump('mon',1)}});
