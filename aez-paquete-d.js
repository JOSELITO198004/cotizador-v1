
/* AEZ Campo PRO - Paquete D ÚNICO CORREGIDO
   Usuarios + Permisos + Reglas Comerciales + Lectura de hoja USUARIOS_APP desde Excel Base.
   Correcciones aplicadas:
   - Sin usuario/contraseña por defecto visible.
   - Primer acceso único: creación inicial del administrador.
   - Cambio de PIN para administrador.
   - Sin botón de descarga/exportación de usuarios dentro de la app.
   - Administración de usuarios solo para ADMIN/GERENTE.
*/
(function(){
  'use strict';

  const D_VERSION = 'AEZ-PRO-D-UNICO-2026.06.25-R2';
  const USERS_KEY = 'aez_users_v1';
  const AUTH_KEY = 'aez_auth_profile_v1';
  const DEVICE_KEY = 'aez_device_id_v1';
  const SESSION_KEY = 'aez_session_v1';
  const USER_SHEETS = ['USUARIOS_APP','USUARIOS','ASESORES','USERS'];

  let currentUser = null;
  let pendingSupervisorResolve = null;

  function show(msg,t=3500){ try{ showAlert(msg,t); }catch(e){ alert(msg); } }
  function audit(action, detail){ try{ if(typeof aezAddAudit==='function') aezAddAudit(action,detail||{}); }catch(e){} }
  function readLS(k,f){ try{return JSON.parse(localStorage.getItem(k))||f;}catch(e){return f;} }
  function writeLS(k,v){ localStorage.setItem(k,JSON.stringify(v)); }
  function clean(v){ return String(v||'').trim().toUpperCase(); }
  function bool(v){ return v===true || ['SI','TRUE','1','YES'].includes(clean(v)); }
  function nkey(k){ return String(k||'').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_]/g,''); }
  function deviceId(){
    let id=localStorage.getItem(DEVICE_KEY);
    if(!id){ id='DEV-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,7).toUpperCase(); localStorage.setItem(DEVICE_KEY,id); }
    return id;
  }
  async function sha256(text){
    text=String(text||'');
    if(window.crypto&&crypto.subtle){
      const data=new TextEncoder().encode(text);
      const hash=await crypto.subtle.digest('SHA-256',data);
      return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
    }
    let h=0; for(let i=0;i<text.length;i++){h=((h<<5)-h)+text.charCodeAt(i);h|=0;}
    return 'fallback-'+Math.abs(h).toString(16);
  }

  async function normalizeUser(row){
    const item={}; Object.keys(row||{}).forEach(k=>item[nkey(k)]=row[k]);
    const id=clean(item.idasesor||item.id_asesor||item.id||item.codigo||item.usuario||item.noempleado||item.numempleado);
    const pin=String(item.pin||item.clave||item.password||item.contrasena||'').trim();
    const rol=clean(item.rol||item.puesto||'ASESOR');
    const u={
      id,
      nombre:String(item.nombre||item.asesor||item.vendedor||item.usuario||id).trim().toUpperCase(),
      rol,
      sucursal:String(item.sucursal||item.plaza||item.zona||'').trim().toUpperCase(),
      ruta:String(item.ruta||item.region||item.territorio||'').trim().toUpperCase(),
      activo:clean(item.activo||item.estatus||item.status||'SI'),
      descuentoMax:Number(item.descuentomax??item.descuento_max??item.descmax??item.descuento??0)||0,
      puedeAjustarInventario:bool(item.puedeajustarinv??item.puede_ajustar_inv??item.ajustainv??item.inventario),
      puedeExportar:bool(item.puedeexportar??item.puede_exportar??item.exportar),
      puedeVerGerencial:bool(item.puedevergerencial??item.puede_ver_gerencial??item.gerencial),
      puedeAutorizarDescuento:bool(item.puedeautorizardescuento??item.puede_autorizar_descuento??item.autorizadescuento),
      pinHash:String(item.pinhash||item.pin_hash||'').trim()
    };
    if(!u.pinHash&&pin) u.pinHash=await sha256(pin);
    if(u.rol==='GERENTE'||u.rol==='ADMIN'){
      u.puedeExportar=true;
      u.puedeVerGerencial=true;
      u.puedeAutorizarDescuento=true;
    }
    if(u.rol==='ADMIN') u.puedeAjustarInventario=true;
    return u;
  }

  function users(){return readLS(USERS_KEY,[]);}
  function setUsers(u){writeLS(USERS_KEY,u||[]);}
  function userById(id){return users().find(u=>clean(u.id)===clean(id));}
  function can(p){return !!(currentUser&&currentUser[p]);}
  function isAdminLike(){ return currentUser && ['ADMIN','GERENTE'].includes(currentUser.rol); }

  function injectStyles(){
    if(document.getElementById('aez-d-styles'))return;
    const s=document.createElement('style');
    s.id='aez-d-styles';
    s.textContent=`
      .aez-d-input{width:100%;background:#f9fafb;border:2px solid #e5e7eb;border-radius:1rem;padding:1rem;font-size:.875rem;font-weight:900;color:#0A2558;outline:none;text-transform:uppercase;text-align:center}.aez-d-input:focus{border-color:#1E40AF;background:white}
      .aez-d-chip{display:inline-flex;border-radius:.75rem;padding:.35rem .55rem;font-size:9px;font-weight:900;text-transform:uppercase;border:1px solid #dbeafe;background:#eff6ff;color:#0A2558}.aez-d-success{background:#DEF7EC;color:#057A55;border-color:#BBF7D0}.aez-d-danger{background:#FDE8E8;color:#E02424;border-color:#FECACA}.aez-d-warning{background:#FEF3C7;color:#B45309;border-color:#FDE68A}.aez-d-card{background:white;border:1px solid #eef2ff;border-radius:1.5rem;padding:1rem;box-shadow:0 1px 3px rgba(0,0,0,.05)}
    `;
    document.head.appendChild(s);
  }

  function ensureSetupModal(){
    if(document.getElementById('modal-d-setup'))return;
    const m=document.createElement('div');
    m.id='modal-d-setup';
    m.className='hidden fixed inset-0 z-[220] bg-primary/95 backdrop-blur-sm flex items-center justify-center p-4 modal-enter';
    m.innerHTML=`
      <div class="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border-b-4 border-blue-500">
        <div class="p-6 text-center">
          <div class="w-16 h-16 bg-blue-50 text-primary rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-100">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 11c0-1.105.895-2 2-2s2 .895 2 2-.895 2-2 2-2-.895-2-2zM6 20h12M6 4h12v4H6z"></path></svg>
          </div>
          <h2 class="text-lg font-black text-primary uppercase tracking-tight mb-2">Crear Administrador</h2>
          <p class="text-xs text-gray-500 mb-5 font-bold">Configura el acceso inicial del administrador. Este paso se realiza una sola vez en este dispositivo/base local.</p>
          <div class="flex flex-col gap-3">
            <input id="d-setup-id" class="aez-d-input" placeholder="ID ADMIN" value="ADMIN">
            <input id="d-setup-name" class="aez-d-input" placeholder="NOMBRE ADMIN">
            <input id="d-setup-pin1" class="aez-d-input" placeholder="NUEVO PIN" type="password" inputmode="numeric">
            <input id="d-setup-pin2" class="aez-d-input" placeholder="CONFIRMAR PIN" type="password" inputmode="numeric">
            <button onclick="dCreateInitialAdmin()" class="w-full py-4 bg-metallic text-white rounded-xl text-xs font-black uppercase shadow-btn border-b-4 border-blue-800">Crear Administrador</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(m);
  }

  function ensureLoginModal(){
    if(document.getElementById('modal-d-login'))return;
    const m=document.createElement('div');
    m.id='modal-d-login';
    m.className='hidden fixed inset-0 z-[200] bg-primary/95 backdrop-blur-sm flex items-center justify-center p-4 modal-enter';
    m.innerHTML=`
      <div class="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border-b-4 border-blue-500">
        <div class="p-6 text-center">
          <div class="w-16 h-16 bg-blue-50 text-primary rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-100">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
          </div>
          <h2 class="text-lg font-black text-primary uppercase tracking-tight mb-2">Acceso Autorizado</h2>
          <p class="text-xs text-gray-500 mb-5 font-bold">Ingresa tus credenciales para operar la app.</p>
          <div class="flex flex-col gap-3">
            <input id="d-login-id" class="aez-d-input" placeholder="ID ASESOR">
            <input id="d-login-pin" class="aez-d-input" placeholder="PIN" type="password" inputmode="numeric">
            <button onclick="dLogin()" class="w-full py-4 bg-metallic text-white rounded-xl text-xs font-black uppercase shadow-btn border-b-4 border-blue-800">Entrar</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(m);
  }

  function ensureSupervisorModal(){
    if(document.getElementById('modal-d-supervisor'))return;
    const m=document.createElement('div');
    m.id='modal-d-supervisor';
    m.className='hidden fixed inset-0 z-[210] bg-primary/95 backdrop-blur-sm flex items-center justify-center p-4 modal-enter';
    m.innerHTML=`
      <div class="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border-b-4 border-yellow-500">
        <div class="p-6 text-center">
          <h2 class="text-lg font-black text-primary uppercase mb-2">Autorización Supervisor</h2>
          <p id="d-supervisor-reason" class="text-xs text-gray-500 mb-5 font-bold"></p>
          <input id="d-supervisor-id" class="aez-d-input mb-3" placeholder="ID SUPERVISOR">
          <input id="d-supervisor-pin" class="aez-d-input mb-3" placeholder="PIN" type="password" inputmode="numeric">
          <div class="flex gap-3">
            <button onclick="dCancelSupervisor()" class="w-1/2 py-3 bg-gray-50 border-2 border-gray-100 text-primary rounded-xl text-xs font-black uppercase">Cancelar</button>
            <button onclick="dConfirmSupervisor()" class="w-1/2 py-3 bg-warning text-white rounded-xl text-xs font-black uppercase shadow-btn border-b-4 border-yellow-600">Autorizar</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(m);
  }

  function ensureChangePinModal(){
    if(document.getElementById('modal-d-change-pin'))return;
    const m=document.createElement('div');
    m.id='modal-d-change-pin';
    m.className='hidden fixed inset-0 z-[215] bg-primary/95 backdrop-blur-sm flex items-center justify-center p-4 modal-enter';
    m.innerHTML=`
      <div class="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border-b-4 border-blue-500">
        <div class="p-6 text-center">
          <h2 class="text-lg font-black text-primary uppercase mb-2">Cambiar PIN</h2>
          <p class="text-xs text-gray-500 mb-5 font-bold">Actualiza la contraseña/PIN del administrador actual.</p>
          <input id="d-change-old" class="aez-d-input mb-3" placeholder="PIN ACTUAL" type="password" inputmode="numeric">
          <input id="d-change-new1" class="aez-d-input mb-3" placeholder="NUEVO PIN" type="password" inputmode="numeric">
          <input id="d-change-new2" class="aez-d-input mb-3" placeholder="CONFIRMAR PIN" type="password" inputmode="numeric">
          <div class="flex gap-3">
            <button onclick="document.getElementById('modal-d-change-pin').classList.add('hidden')" class="w-1/2 py-3 bg-gray-50 border-2 border-gray-100 text-primary rounded-xl text-xs font-black uppercase">Cancelar</button>
            <button onclick="dChangeAdminPin()" class="w-1/2 py-3 bg-primary text-white rounded-xl text-xs font-black uppercase shadow-btn border-b-4 border-blue-800">Guardar</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(m);
  }

  function ensureUsersModal(){
    if(document.getElementById('modal-d-users'))return;
    const m=document.createElement('div');
    m.id='modal-d-users';
    m.className='hidden fixed inset-0 z-[205] bg-primary/95 backdrop-blur-sm flex items-center justify-center p-3 modal-enter';
    m.innerHTML=`
      <div class="bg-gray-100 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border-b-4 border-blue-500">
        <div class="p-4 bg-white border-b border-gray-200 flex justify-between items-center">
          <div><h2 class="text-sm font-black text-primary uppercase">Usuarios y Permisos</h2><p class="text-[10px] font-bold text-gray-500 uppercase">Administración restringida</p></div>
          <button onclick="document.getElementById('modal-d-users').classList.add('hidden')" class="text-gray-400 p-1.5 hover:text-danger rounded-xl"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
        </div>
        <div class="p-4" style="max-height:75vh;overflow:auto">
          <div class="grid grid-cols-2 gap-3 mb-4">
            <button onclick="document.getElementById('d-users-file').click()" class="bg-metallic text-white py-3 rounded-xl text-[10px] font-black uppercase shadow-btn border-b-4 border-blue-800">Importar Usuarios</button>
            <button onclick="dImportUsersFromExcelFile()" class="bg-green-50 border-2 border-green-100 text-success py-3 rounded-xl text-[10px] font-black uppercase">Excel Base</button>
            <button id="d-change-pin-btn" onclick="dOpenChangePin()" class="col-span-2 bg-gray-50 border-2 border-gray-100 text-primary py-3 rounded-xl text-[10px] font-black uppercase">Cambiar PIN Administrador</button>
          </div>
          <input id="d-users-file" type="file" accept=".csv,.json,.xlsx,.xls" class="hidden" onchange="dImportUsers(event)">
          <div id="d-users-list" class="flex flex-col gap-2"></div>
        </div>
      </div>`;
    document.body.appendChild(m);
  }

  window.dCreateInitialAdmin = async function(){
    const id=clean(document.getElementById('d-setup-id')?.value||'ADMIN');
    const nombre=String(document.getElementById('d-setup-name')?.value||'').trim().toUpperCase();
    const p1=String(document.getElementById('d-setup-pin1')?.value||'').trim();
    const p2=String(document.getElementById('d-setup-pin2')?.value||'').trim();
    if(users().length>0){ show('La configuración inicial ya fue realizada.'); document.getElementById('modal-d-setup').classList.add('hidden'); showLogin(true); return; }
    if(!id || !nombre || p1.length<4){ show('Completa ID, nombre y PIN mínimo de 4 dígitos.'); return; }
    if(p1!==p2){ show('Los PIN no coinciden.'); return; }
    const admin=await normalizeUser({ID_ASESOR:id,NOMBRE:nombre,PIN:p1,ROL:'ADMIN',SUCURSAL:'MATRIZ',RUTA:'GENERAL',ACTIVO:'SI',DESCUENTO_MAX:100,PUEDE_AJUSTAR_INV:'SI',PUEDE_EXPORTAR:'SI',PUEDE_VER_GERENCIAL:'SI',PUEDE_AUTORIZAR_DESCUENTO:'SI'});
    setUsers([admin]);
    document.getElementById('modal-d-setup').classList.add('hidden');
    setSession(admin);
    show('Administrador creado correctamente.');
  };

  function renderUsersList(){
    const b=document.getElementById('d-users-list'); if(!b)return;
    b.innerHTML=users().map(u=>`<div class="aez-d-card"><div class="text-xs font-black text-primary">${u.id} · ${u.nombre}</div><div class="text-[10px] font-bold text-gray-500 uppercase mt-1">${u.rol} · ${u.sucursal||'S/S'} · ${u.ruta||'S/R'}</div><div class="flex gap-1 flex-wrap mt-2"><span class="aez-d-chip ${u.activo==='SI'?'aez-d-success':'aez-d-danger'}">${u.activo==='SI'?'Activo':'Inactivo'}</span><span class="aez-d-chip">Desc. ${u.descuentoMax}%</span>${u.puedeExportar?'<span class="aez-d-chip">Exporta</span>':''}${u.puedeAjustarInventario?'<span class="aez-d-chip">Inventario</span>':''}</div></div>`).join('');
  }

  window.dShowUserImport=function(){
    if(!isAdminLike()){ show('Solo ADMIN o GERENTE puede administrar usuarios.'); audit('BLOCK_USERS_ADMIN',{user:currentUser?.id}); return; }
    ensureUsersModal(); renderUsersList();
    const btn=document.getElementById('d-change-pin-btn'); if(btn) btn.classList.toggle('hidden', currentUser?.rol!=='ADMIN');
    document.getElementById('modal-d-users').classList.remove('hidden');
  };

  function parseCSV(text){
    const rows=text.split(/\r?\n/).filter(r=>r.trim()); if(rows.length<2)return[];
    const h=rows[0].split(',').map(x=>x.trim());
    return rows.slice(1).map(line=>{const c=line.split(','); const o={}; h.forEach((k,i)=>o[k]=c[i]!==undefined?c[i].trim():''); return o;});
  }
  async function importRows(raw, origin){
    if(!isAdminLike()){ show('Sin permiso para importar usuarios.'); return 0; }
    if(!Array.isArray(raw)) raw=raw.usuarios||[];
    const list=[];
    for(const r of raw){ const u=await normalizeUser(r); if(u.id&&u.pinHash) list.push(u); }
    if(!list.length){show('No se encontraron usuarios válidos. Revisa ID_ASESOR y PIN.',6000);return 0;}
    setUsers(list); renderUsersList(); audit('USERS_IMPORT',{origin,count:list.length}); show(`Usuarios cargados: ${list.length}`,5000); return list.length;
  }
  async function importWorkbook(wb){
    const name=(wb.SheetNames||[]).find(n=>USER_SHEETS.includes(clean(n)));
    if(!name)return {found:false,count:0};
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[name],{defval:''});
    const count=await importRows(rows,name);
    return {found:true,count};
  }
  window.dImportUsers=async function(e){
    const file=e.target.files&&e.target.files[0]; if(!file)return;
    const name=file.name.toLowerCase();
    if(name.endsWith('.xlsx')||name.endsWith('.xls')){
      const buf=await file.arrayBuffer(); const wb=XLSX.read(buf,{type:'array'}); const r=await importWorkbook(wb);
      if(!r.found)show('No encontré hoja USUARIOS_APP en el Excel.',6000); e.target.value=''; return;
    }
    const text=await file.text(); let raw=[];
    try{raw=name.endsWith('.json')?JSON.parse(text):parseCSV(text);}catch(err){show('Archivo de usuarios inválido.');return;}
    await importRows(raw,file.name); e.target.value='';
  };
  window.dImportUsersFromExcelFile=function(){
    if(!isAdminLike()){ show('Sin permiso para importar usuarios.'); return; }
    const input=document.createElement('input'); input.type='file'; input.accept='.xlsx,.xls';
    input.onchange=async e=>{ const file=e.target.files&&e.target.files[0]; if(!file)return; try{ const buf=await file.arrayBuffer(); const wb=XLSX.read(buf,{type:'array'}); const r=await importWorkbook(wb); if(!r.found)show('No encontré hoja USUARIOS_APP en el Excel.',6000); }catch(err){show('No se pudo leer el Excel base.');} };
    input.click();
  };

  function attachExcelBaseListener(){
    const input=document.getElementById('dataFile'); if(!input||input.dataset.aezDExcel==='1')return;
    input.dataset.aezDExcel='1';
    input.addEventListener('change',function(e){
      const file=e.target.files&&e.target.files[0]; if(!file||!/\.xlsx?$|\.xls$/i.test(file.name))return;
      const reader=new FileReader();
      reader.onload=async ev=>{ try{ const wb=XLSX.read(ev.target.result,{type:'array'}); await importWorkbook(wb); }catch(err){console.warn('Usuarios Excel no leídos',err);} };
      reader.readAsArrayBuffer(file);
    });
  }

  async function validate(id,pin){
    const u=userById(id); if(!u)return{ok:false,msg:'Usuario no autorizado.'};
    if(clean(u.activo)!=='SI')return{ok:false,msg:'Usuario inactivo.'};
    const h=await sha256(pin); if(h!==u.pinHash)return{ok:false,msg:'PIN incorrecto.'};
    return{ok:true,user:u};
  }
  function setSession(u){
    currentUser=u; window.currentAEZUser=u; asesorName=u.nombre;
    localStorage.setItem('empresanueva_asesor',asesorName);
    writeLS(AUTH_KEY,{...u,lastAuthAt:new Date().toISOString(),deviceId:deviceId()});
    writeLS(SESSION_KEY,{id:u.id,startedAt:new Date().toISOString(),deviceId:deviceId()});
    const h=document.getElementById('header-asesor-name'); if(h)h.innerText=`${u.nombre} · ${u.id}`;
    const p=document.getElementById('modal-profile'); if(p)p.classList.add('hidden');
    const l=document.getElementById('modal-d-login'); if(l)l.classList.add('hidden');
    applyUI(); audit('LOGIN_OK',{id:u.id,rol:u.rol,deviceId:deviceId()});
  }
  window.dLogin=async function(){
    const id=document.getElementById('d-login-id')?.value||'';
    const pin=document.getElementById('d-login-pin')?.value||'';
    if(!id||!pin){show('Ingresa ID y PIN.');return;}
    const r=await validate(id,pin);
    if(!r.ok){show(r.msg);audit('LOGIN_FAIL',{id:clean(id),reason:r.msg});return;}
    setSession(r.user); show(`Bienvenido ${r.user.nombre}`);
  };
  function showAccess(){
    ensureSetupModal(); ensureLoginModal();
    if(users().length===0){ document.getElementById('modal-d-setup').classList.remove('hidden'); return; }
    const saved=readLS(AUTH_KEY,null);
    if(saved){ const fresh=userById(saved.id)||saved; if(clean(fresh.activo||'SI')==='SI'){setSession(fresh);return;} }
    document.getElementById('modal-d-login').classList.remove('hidden');
  }
  window.dLogout=function(){ audit('LOGOUT',{id:currentUser?.id}); currentUser=null; window.currentAEZUser=null; localStorage.removeItem(AUTH_KEY); localStorage.removeItem(SESSION_KEY); document.getElementById('modal-d-login')?.classList.remove('hidden'); };

  window.dOpenChangePin=function(){
    if(currentUser?.rol!=='ADMIN'){ show('Solo ADMIN puede cambiar este PIN.'); return; }
    ensureChangePinModal();
    ['d-change-old','d-change-new1','d-change-new2'].forEach(id=>{const el=document.getElementById(id); if(el)el.value='';});
    document.getElementById('modal-d-change-pin').classList.remove('hidden');
  };
  window.dChangeAdminPin=async function(){
    if(currentUser?.rol!=='ADMIN'){ show('Solo ADMIN puede cambiar este PIN.'); return; }
    const oldPin=document.getElementById('d-change-old')?.value||'';
    const n1=document.getElementById('d-change-new1')?.value||'';
    const n2=document.getElementById('d-change-new2')?.value||'';
    if(n1.length<4){ show('El nuevo PIN debe tener mínimo 4 dígitos.'); return; }
    if(n1!==n2){ show('Los PIN no coinciden.'); return; }
    const res=await validate(currentUser.id,oldPin);
    if(!res.ok){ show('PIN actual incorrecto.'); return; }
    const list=users(); const idx=list.findIndex(u=>u.id===currentUser.id);
    if(idx<0){ show('Usuario actual no encontrado.'); return; }
    list[idx].pinHash=await sha256(n1); setUsers(list); currentUser=list[idx]; writeLS(AUTH_KEY,{...currentUser,lastAuthAt:new Date().toISOString(),deviceId:deviceId()});
    document.getElementById('modal-d-change-pin').classList.add('hidden'); audit('ADMIN_PIN_CHANGED',{id:currentUser.id}); show('PIN actualizado correctamente.');
  };

  window.dCancelSupervisor=function(){document.getElementById('modal-d-supervisor').classList.add('hidden'); if(pendingSupervisorResolve)pendingSupervisorResolve(false); pendingSupervisorResolve=null;};
  window.dConfirmSupervisor=async function(){
    const id=document.getElementById('d-supervisor-id')?.value||''; const pin=document.getElementById('d-supervisor-pin')?.value||'';
    const r=await validate(id,pin);
    const ok=r.ok&&(r.user.puedeAutorizarDescuento||['SUPERVISOR','GERENTE','ADMIN'].includes(r.user.rol));
    if(!ok){show('Supervisor no autorizado.');audit('SUPERVISOR_AUTH_FAIL',{id:clean(id)});return;}
    document.getElementById('modal-d-supervisor').classList.add('hidden'); audit('SUPERVISOR_AUTH_OK',{supervisor:r.user.id,solicitante:currentUser?.id});
    if(pendingSupervisorResolve)pendingSupervisorResolve(r.user); pendingSupervisorResolve=null;
  };
  function requestSupervisor(reason){
    ensureSupervisorModal(); document.getElementById('d-supervisor-reason').innerText=reason; document.getElementById('d-supervisor-id').value=''; document.getElementById('d-supervisor-pin').value=''; document.getElementById('modal-d-supervisor').classList.remove('hidden'); return new Promise(res=>pendingSupervisorResolve=res);
  }
  async function validateDiscount(v){
    const max=Number(currentUser?.descuentoMax||0); const val=Number(v||0);
    if(val<=max)return{ok:true,value:val};
    const sup=await requestSupervisor(`Descuento solicitado ${val}%. Máximo permitido para ${currentUser?.id}: ${max}%.`);
    if(sup){audit('DISCOUNT_OVERRIDE',{user:currentUser?.id,supervisor:sup.id,requested:val,max});return{ok:true,value:val};}
    show(`Descuento no autorizado. Máximo permitido: ${max}%`); return{ok:false,value:max};
  }

  function applyUI(){
    if(!currentUser)return;
    const st=document.getElementById('header-status'); if(st)st.innerText=`${currentUser.rol} · ${currentUser.ruta||currentUser.sucursal||'AEZ'}`;
    const mgr=document.getElementById('aez-manager-panel'); if(mgr) mgr.classList.toggle('hidden',!currentUser.puedeVerGerencial);
    if(!document.getElementById('d-logout-btn')){
      const header=document.querySelector('header .px-4.py-3');
      if(header){ const b=document.createElement('button'); b.id='d-logout-btn'; b.onclick=dLogout; b.className='p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-colors shadow-inner ml-1'; b.innerHTML='<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1"></path></svg>'; header.appendChild(b); }
    }
  }
  function ensurePanel(){
    const inf=document.getElementById('step-informes'); if(!inf||document.getElementById('d-users-panel'))return;
    const p=document.createElement('div'); p.id='d-users-panel'; p.className='bg-white p-5 rounded-3xl border-2 border-gray-100 shadow-sm mb-5';
    p.innerHTML=`<h3 class="text-xs font-black text-primary uppercase tracking-wide mb-3 border-b border-gray-100 pb-2">Seguridad y Usuarios</h3><div class="flex justify-between items-center mb-3"><div><div class="text-sm font-black text-primary" id="d-current-user-label">${currentUser?currentUser.nombre+' · '+currentUser.id:'Sin sesión'}</div><div class="text-[10px] font-bold text-gray-500 uppercase" id="d-current-user-sub">${currentUser?currentUser.rol+' · DESC. MAX '+currentUser.descuentoMax+'% · '+deviceId():''}</div></div><span class="aez-d-chip aez-d-success">Paquete D</span></div><div class="grid grid-cols-2 gap-3"><button onclick="dShowUserImport()" class="bg-metallic text-white py-3 rounded-xl text-[10px] font-black uppercase shadow-btn border-b-4 border-blue-800">Usuarios</button><button onclick="dOpenChangePin()" class="bg-white border-2 border-blue-100 text-primary py-3 rounded-xl text-[10px] font-black uppercase ${currentUser?.rol==='ADMIN'?'':'hidden'}">Cambiar PIN</button><button onclick="dLogout()" class="col-span-2 bg-gray-50 border-2 border-gray-100 text-primary py-3 rounded-xl text-[10px] font-black uppercase">Cerrar Sesión</button></div>`;
    inf.insertBefore(p,inf.children[1]||inf.firstChild);
  }

  function patch(){
    if(window.__AEZ_PRO_D_R2_PATCHED__)return; window.__AEZ_PRO_D_R2_PATCHED__=true;
    if(typeof checkProfile==='function'){ const old=checkProfile; checkProfile=function(){ if(!currentUser){showAccess();return;} return old.apply(this,arguments); }; }
    if(typeof openProfileModal==='function') openProfileModal=function(){ document.getElementById('modal-d-login')?.classList.remove('hidden'); };
    if(typeof saveProfile==='function') saveProfile=function(){show('El perfil se controla con usuario autorizado.');};
    if(typeof switchTab==='function'){ const old=switchTab; switchTab=function(tab){ if(!currentUser&&tab!=='inicio'){showAccess();return;} if(tab==='inventario'&&!can('puedeAjustarInventario')&&currentUser?.rol==='ASESOR'){show('Sin permiso para módulo de inventario.');return;} const r=old.apply(this,arguments); if(tab==='informes')setTimeout(()=>{ensurePanel();applyUI();},0); return r; }; }
    if(typeof updateCartItem==='function'){ const old=updateCartItem; updateCartItem=function(sku,field,value){ if(field==='discount'){validateDiscount(value).then(r=>old.call(this,sku,field,r.value));return;} return old.apply(this,arguments);}; }
    if(typeof saveManualKardex==='function'){ const old=saveManualKardex; saveManualKardex=function(){ if(!can('puedeAjustarInventario')){show('No tienes permiso para ajustes de inventario.');audit('BLOCK_INVENTORY_ADJUST',{user:currentUser?.id});return;} return old.apply(this,arguments);}; }
    if(typeof exportGlobalData==='function'){ const old=exportGlobalData; exportGlobalData=function(){ if(!can('puedeExportar')){show('No tienes permiso para exportar reportes.');audit('BLOCK_EXPORT',{user:currentUser?.id,report:'global'});return;} return old.apply(this,arguments);}; }
    if(typeof exportFullBackup==='function'){ const old=exportFullBackup; exportFullBackup=function(){ if(!can('puedeExportar')){show('No tienes permiso para respaldos/exportación.');return;} return old.apply(this,arguments);}; }
    if(typeof exportManagerReport==='function'){ const old=exportManagerReport; exportManagerReport=function(){ if(!can('puedeVerGerencial')||!can('puedeExportar')){show('No tienes permiso para reporte gerencial.');return;} return old.apply(this,arguments);}; }
    if(typeof getTempSaleObject==='function'){ const old=getTempSaleObject; getTempSaleObject=function(){ const sale=old.apply(this,arguments); if(currentUser){ const d=new Date(); const stamp=`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}`; sale.folio=`AEZ-${currentUser.id}-${stamp}-${String(folioGlobalCounter).padStart(4,'0')}`; sale.asesorId=currentUser.id; sale.asesorNombre=currentUser.nombre; sale.asesorRol=currentUser.rol; sale.sucursal=currentUser.sucursal; sale.ruta=currentUser.ruta; sale.deviceId=deviceId(); } return sale;}; }
    if(typeof pushToSheets==='function'){ const old=pushToSheets; pushToSheets=function(action,payload){ payload=payload||{}; if(currentUser){payload.asesorId=currentUser.id;payload.asesorNombre=currentUser.nombre;payload.asesorRol=currentUser.rol;payload.sucursal=currentUser.sucursal;payload.ruta=currentUser.ruta;payload.deviceId=deviceId();} return old.call(this,action,payload);}; }
  }

  async function init(){
    injectStyles(); ensureSetupModal(); ensureLoginModal(); ensureSupervisorModal(); ensureChangePinModal(); ensureUsersModal();
    attachExcelBaseListener(); patch(); showAccess();
    setTimeout(()=>{attachExcelBaseListener();ensurePanel();applyUI();},1000);
    console.log(`%c${D_VERSION} activo`,'color:#0A2558;font-weight:bold');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init); else init();
})();
