
/* AEZ Campo PRO - Paquete D R3 CLOUD
   Usuarios + Permisos + Reglas Comerciales con usuarios centralizados en la nube.
   Flujo correcto:
   - El usuario SOLO ve pantalla de ingreso.
   - Los usuarios se administran en la hoja APP_USUARIOS / USUARIOS_APP de la Base de Datos en la nube.
   - La app descarga usuarios automáticamente desde GOOGLE_SHEETS_API_URL.
   - Si no hay internet, permite login con el último catálogo de usuarios cacheado.
*/
(function(){
  'use strict';

  const D_VERSION = 'AEZ-PRO-D-R3-CLOUD-2026.06.25';
  const USERS_KEY = 'aez_users_v1';
  const USERS_SYNC_KEY = 'aez_users_last_sync_v1';
  const AUTH_KEY = 'aez_auth_profile_v1';
  const DEVICE_KEY = 'aez_device_id_v1';
  const SESSION_KEY = 'aez_session_v1';

  let currentUser = null;
  let pendingSupervisorResolve = null;
  let isFetchingUsers = false;

  function show(msg,t=3500){ try{ showAlert(msg,t); }catch(e){ alert(msg); } }
  function audit(action, detail){ try{ if(typeof aezAddAudit==='function') aezAddAudit(action,detail||{}); }catch(e){} }
  function readLS(k,f){ try{return JSON.parse(localStorage.getItem(k))||f;}catch(e){return f;} }
  function writeLS(k,v){ localStorage.setItem(k,JSON.stringify(v)); }
  function clean(v){ return String(v||'').trim().toUpperCase(); }
  function bool(v){ return v===true || ['SI','TRUE','1','YES','ACTIVO'].includes(clean(v)); }
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

  function users(){ return readLS(USERS_KEY,[]); }
  function setUsers(u){ writeLS(USERS_KEY,u||[]); localStorage.setItem(USERS_SYNC_KEY, new Date().toISOString()); }
  function userById(id){ return users().find(u=>clean(u.id)===clean(id)); }
  function can(p){ return !!(currentUser&&currentUser[p]); }
  function lastUsersSyncText(){
    const iso = localStorage.getItem(USERS_SYNC_KEY);
    if(!iso) return 'Sin sincronizar';
    try { return new Date(iso).toLocaleString('es-MX'); } catch(e){ return iso; }
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

  function getUsersArrayFromCloudPayload(data){
    if(!data) return [];
    return data.usuarios_app || data.APP_USUARIOS || data.app_usuarios || data.usuarios || data.USUARIOS || data.asesores || data.ASESORES || data.users || data.USERS || [];
  }

  async function fetchUsersFromCloud(silent=false){
    if(isFetchingUsers) return users().length;
    isFetchingUsers = true;
    updateLoginSyncStatus('Sincronizando usuarios...');
    try{
      if(typeof GOOGLE_SHEETS_API_URL === 'undefined' || !GOOGLE_SHEETS_API_URL || String(GOOGLE_SHEETS_API_URL).includes('AKI_VA_TU_URL')){
        throw new Error('URL de nube no configurada.');
      }
      const response = await fetch(GOOGLE_SHEETS_API_URL, { redirect:'follow', cache:'no-store' });
      const text = await response.text();
      if(text.includes('<html') || text.includes('<HTML')) throw new Error('La nube solicita iniciar sesión o no devolvió JSON.');
      const data = JSON.parse(text);
      const rawUsers = getUsersArrayFromCloudPayload(data);
      const normalized = [];
      for(const row of rawUsers){
        const u = await normalizeUser(row);
        if(u.id && u.pinHash) normalized.push(u);
      }
      if(!normalized.length){
        throw new Error('No se encontró hoja APP_USUARIOS/USUARIOS_APP o no tiene usuarios válidos.');
      }
      setUsers(normalized);
      audit('USERS_SYNC_CLOUD', { count: normalized.length });
      updateLoginSyncStatus(`Usuarios sincronizados: ${normalized.length}`);
      if(!silent) show(`Usuarios sincronizados: ${normalized.length}`);
      return normalized.length;
    }catch(err){
      updateLoginSyncStatus(`Usuarios offline/cache: ${users().length}`);
      if(!silent) show('No se pudieron sincronizar usuarios: ' + err.message, 6000);
      return users().length;
    }finally{
      isFetchingUsers = false;
    }
  }

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
          <p class="text-xs text-gray-500 mb-5 font-bold">Ingresa tus credenciales autorizadas.</p>
          <div class="flex flex-col gap-3">
            <input id="d-login-id" class="aez-d-input" placeholder="ID ASESOR">
            <input id="d-login-pin" class="aez-d-input" placeholder="PIN" type="password" inputmode="numeric">
            <button onclick="dLogin()" class="w-full py-4 bg-metallic text-white rounded-xl text-xs font-black uppercase shadow-btn border-b-4 border-blue-800">Entrar</button>
          </div>
          <p id="d-login-sync-status" class="text-[10px] text-gray-400 font-bold mt-4 uppercase">Validando usuarios...</p>
        </div>
      </div>`;
    document.body.appendChild(m);
  }

  function updateLoginSyncStatus(txt){
    const el = document.getElementById('d-login-sync-status');
    if(el) el.innerText = txt || `Última sincronización: ${lastUsersSyncText()}`;
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

  async function validate(id,pin){
    if(!users().length && navigator.onLine) await fetchUsersFromCloud(true);
    const u=userById(id);
    if(!u){
      return {ok:false,msg: users().length ? 'Usuario no autorizado o no existe en APP_USUARIOS.' : 'No hay usuarios cargados. Revisa la hoja APP_USUARIOS en la nube.'};
    }
    if(clean(u.activo)!=='SI')return{ok:false,msg:'Usuario inactivo.'};
    const h=await sha256(pin);
    if(h!==u.pinHash)return{ok:false,msg:'PIN incorrecto.'};
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
    updateLoginSyncStatus('Validando credenciales...');
    const r=await validate(id,pin);
    if(!r.ok){show(r.msg,6000);audit('LOGIN_FAIL',{id:clean(id),reason:r.msg}); updateLoginSyncStatus(`Última sincronización: ${lastUsersSyncText()}`); return;}
    setSession(r.user); show(`Bienvenido ${r.user.nombre}`);
  };

  async function showAccess(){
    ensureLoginModal();
    document.getElementById('modal-d-login').classList.remove('hidden');
    updateLoginSyncStatus('Sincronizando usuarios...');
    await fetchUsersFromCloud(true);
    updateLoginSyncStatus(`Última sincronización: ${lastUsersSyncText()}`);
    const saved=readLS(AUTH_KEY,null);
    if(saved){
      const fresh=userById(saved.id);
      if(fresh && clean(fresh.activo||'SI')==='SI'){
        setSession(fresh);
      }
    }
  }

  window.dLogout=function(){
    audit('LOGOUT',{id:currentUser?.id});
    currentUser=null; window.currentAEZUser=null;
    localStorage.removeItem(AUTH_KEY); localStorage.removeItem(SESSION_KEY);
    document.getElementById('modal-d-login')?.classList.remove('hidden');
    updateLoginSyncStatus(`Última sincronización: ${lastUsersSyncText()}`);
  };

  window.dCancelSupervisor=function(){document.getElementById('modal-d-supervisor').classList.add('hidden'); if(pendingSupervisorResolve)pendingSupervisorResolve(false); pendingSupervisorResolve=null;};
  window.dConfirmSupervisor=async function(){
    const id=document.getElementById('d-supervisor-id')?.value||'';
    const pin=document.getElementById('d-supervisor-pin')?.value||'';
    const r=await validate(id,pin);
    const ok=r.ok&&(r.user.puedeAutorizarDescuento||['SUPERVISOR','GERENTE','ADMIN'].includes(r.user.rol));
    if(!ok){show('Supervisor no autorizado.');audit('SUPERVISOR_AUTH_FAIL',{id:clean(id)});return;}
    document.getElementById('modal-d-supervisor').classList.add('hidden');
    audit('SUPERVISOR_AUTH_OK',{supervisor:r.user.id,solicitante:currentUser?.id});
    if(pendingSupervisorResolve)pendingSupervisorResolve(r.user);
    pendingSupervisorResolve=null;
  };
  function requestSupervisor(reason){
    ensureSupervisorModal();
    document.getElementById('d-supervisor-reason').innerText=reason;
    document.getElementById('d-supervisor-id').value='';
    document.getElementById('d-supervisor-pin').value='';
    document.getElementById('modal-d-supervisor').classList.remove('hidden');
    return new Promise(res=>pendingSupervisorResolve=res);
  }
  async function validateDiscount(v){
    const max=Number(currentUser?.descuentoMax||0);
    const val=Number(v||0);
    if(val<=max)return{ok:true,value:val};
    const sup=await requestSupervisor(`Descuento solicitado ${val}%. Máximo permitido para ${currentUser?.id}: ${max}%.`);
    if(sup){audit('DISCOUNT_OVERRIDE',{user:currentUser?.id,supervisor:sup.id,requested:val,max});return{ok:true,value:val};}
    show(`Descuento no autorizado. Máximo permitido: ${max}%`);
    return{ok:false,value:max};
  }

  function applyUI(){
    if(!currentUser)return;
    const st=document.getElementById('header-status');
    if(st)st.innerText=`${currentUser.rol} · ${currentUser.ruta||currentUser.sucursal||'AEZ'}`;
    const mgr=document.getElementById('aez-manager-panel');
    if(mgr) mgr.classList.toggle('hidden',!currentUser.puedeVerGerencial);
    const panel=document.getElementById('d-users-panel'); if(panel) panel.remove();
    if(!document.getElementById('d-logout-btn')){
      const header=document.querySelector('header .px-4.py-3');
      if(header){
        const b=document.createElement('button');
        b.id='d-logout-btn';
        b.onclick=dLogout;
        b.className='p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-colors shadow-inner ml-1';
        b.innerHTML='<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1"></path></svg>';
        header.appendChild(b);
      }
    }
  }

  function patch(){
    if(window.__AEZ_PRO_D_R3_PATCHED__)return;
    window.__AEZ_PRO_D_R3_PATCHED__=true;

    if(typeof checkProfile==='function'){
      const old=checkProfile;
      checkProfile=function(){ if(!currentUser){showAccess();return;} return old.apply(this,arguments); };
    }
    if(typeof openProfileModal==='function') openProfileModal=function(){ document.getElementById('modal-d-login')?.classList.remove('hidden'); };
    if(typeof saveProfile==='function') saveProfile=function(){show('El perfil se controla con usuario autorizado.');};
    if(typeof switchTab==='function'){
      const old=switchTab;
      switchTab=function(tab){
        if(!currentUser&&tab!=='inicio'){showAccess();return;}
        if(tab==='inventario'&&!can('puedeAjustarInventario')&&currentUser?.rol==='ASESOR'){
          show('Sin permiso para módulo de inventario.');return;
        }
        const r=old.apply(this,arguments);
        if(tab==='informes') setTimeout(applyUI,0);
        return r;
      };
    }
    if(typeof updateCartItem==='function'){
      const old=updateCartItem;
      updateCartItem=function(sku,field,value){
        if(field==='discount'){
          validateDiscount(value).then(r=>old.call(this,sku,field,r.value));
          return;
        }
        return old.apply(this,arguments);
      };
    }
    if(typeof saveManualKardex==='function'){
      const old=saveManualKardex;
      saveManualKardex=function(){
        if(!can('puedeAjustarInventario')){show('No tienes permiso para ajustes de inventario.');audit('BLOCK_INVENTORY_ADJUST',{user:currentUser?.id});return;}
        return old.apply(this,arguments);
      };
    }
    if(typeof exportGlobalData==='function'){
      const old=exportGlobalData;
      exportGlobalData=function(){
        if(!can('puedeExportar')){show('No tienes permiso para exportar reportes.');audit('BLOCK_EXPORT',{user:currentUser?.id,report:'global'});return;}
        return old.apply(this,arguments);
      };
    }
    if(typeof exportFullBackup==='function'){
      const old=exportFullBackup;
      exportFullBackup=function(){
        if(!can('puedeExportar')){show('No tienes permiso para respaldos/exportación.');return;}
        return old.apply(this,arguments);
      };
    }
    if(typeof exportManagerReport==='function'){
      const old=exportManagerReport;
      exportManagerReport=function(){
        if(!can('puedeVerGerencial')||!can('puedeExportar')){show('No tienes permiso para reporte gerencial.');return;}
        return old.apply(this,arguments);
      };
    }
    if(typeof getTempSaleObject==='function'){
      const old=getTempSaleObject;
      getTempSaleObject=function(){
        const sale=old.apply(this,arguments);
        if(currentUser){
          const d=new Date();
          const stamp=`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}`;
          sale.folio=`AEZ-${currentUser.id}-${stamp}-${String(folioGlobalCounter).padStart(4,'0')}`;
          sale.asesorId=currentUser.id;
          sale.asesorNombre=currentUser.nombre;
          sale.asesorRol=currentUser.rol;
          sale.sucursal=currentUser.sucursal;
          sale.ruta=currentUser.ruta;
          sale.deviceId=deviceId();
        }
        return sale;
      };
    }
    if(typeof pushToSheets==='function'){
      const old=pushToSheets;
      pushToSheets=function(action,payload){
        payload=payload||{};
        if(currentUser){
          payload.asesorId=currentUser.id;
          payload.asesorNombre=currentUser.nombre;
          payload.asesorRol=currentUser.rol;
          payload.sucursal=currentUser.sucursal;
          payload.ruta=currentUser.ruta;
          payload.deviceId=deviceId();
        }
        return old.call(this,action,payload);
      };
    }
  }

  async function init(){
    injectStyles(); ensureLoginModal(); ensureSupervisorModal(); patch();
    window.addEventListener('online',()=>fetchUsersFromCloud(true));
    await showAccess();
    console.log(`%c${D_VERSION} activo`,'color:#0A2558;font-weight:bold');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init); else init();
})();
