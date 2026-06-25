
/* AEZ Campo PRO - Paquete B: Venta inteligente
   Carga este archivo DESPUÉS del script principal de index.html.
   No cambia la estructura base: extiende funciones existentes con módulos 360, sugerencias y seguimiento.
*/
(function(){
  'use strict';

  const B_VERSION = 'AEZ-PRO-B-2026.06.25';
  const LS_KEY = 'aez_client_intel_v1';

  function safeMoney(n){
    try { return moneyFmtFull.format(Number(n || 0)); }
    catch(e){ return new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(Number(n||0)); }
  }
  function todayDDMMYYYY(){
    const d = new Date();
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }
  function parseDDMMYYYY(str){
    if(!str) return null;
    const p = String(str).split('/');
    if(p.length !== 3) return null;
    return new Date(`${p[2]}-${p[1]}-${p[0]}T12:00:00`);
  }
  function daysBetween(dateObj){
    if(!dateObj) return null;
    const one = 24*60*60*1000;
    const a = new Date(); a.setHours(12,0,0,0);
    return Math.max(0, Math.floor((a.getTime() - dateObj.getTime()) / one));
  }
  function getIntel(){
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
    catch(e){ return {}; }
  }
  function saveIntel(data){ localStorage.setItem(LS_KEY, JSON.stringify(data || {})); }
  function getClientIntel(clientId){ return getIntel()[clientId] || { notas:'', siguienteAccion:'', prioridad:'MEDIA', actualizado:'' }; }
  function setClientIntel(clientId, data){
    const all = getIntel();
    all[clientId] = { ...(all[clientId] || {}), ...data, actualizado: new Date().toISOString() };
    saveIntel(all);
  }

  function getClientStats(clientId){
    const ventas = (sessionSales || []).filter(s => s.clientId === clientId && s.status === 'PAGADA');
    const cotizaciones = (sessionSales || []).filter(s => s.clientId === clientId && s.status !== 'PAGADA');
    const total = ventas.reduce((a,s)=>a + Number(s.total || 0), 0);
    const ticket = ventas.length ? total / ventas.length : 0;
    const sorted = [...ventas].sort((a,b)=>(parseDDMMYYYY(b.date)?.getTime()||0)-(parseDDMMYYYY(a.date)?.getTime()||0));
    const last = sorted[0] || null;
    const lastDays = last ? daysBetween(parseDDMMYYYY(last.date)) : null;
    const currentMonth = new Date();
    const mmYYYY = `${String(currentMonth.getMonth()+1).padStart(2,'0')}/${currentMonth.getFullYear()}`;
    const ventaMes = ventas.filter(s => String(s.date||'').includes(mmYYYY)).reduce((a,s)=>a+Number(s.total||0),0);
    const skuMap = {};
    ventas.forEach(s => (s.items || []).forEach(i => {
      if(!i.sku) return;
      if(!skuMap[i.sku]) skuMap[i.sku] = { sku:i.sku, descripcion:i.descripcion || '', qty:0, total:0 };
      skuMap[i.sku].qty += Number(i.qty || 0);
      skuMap[i.sku].total += Number(i.qty || 0) * Number(i.listPrice || 0) * (1 - (Number(i.discount || 0)/100));
    }));
    const frecuentes = Object.values(skuMap).sort((a,b)=>b.qty-a.qty).slice(0,5);
    return { ventas, cotizaciones, total, ticket, last, lastDays, ventaMes, frecuentes };
  }

  function getGlobalTopProducts(limit=5){
    const skuMap = {};
    (sessionSales || []).filter(s=>s.status==='PAGADA').forEach(s => (s.items || []).forEach(i => {
      if(!i.sku) return;
      skuMap[i.sku] = (skuMap[i.sku] || 0) + Number(i.qty || 0);
    }));
    return Object.entries(skuMap).sort((a,b)=>b[1]-a[1]).slice(0,limit).map(([sku,qty])=>({sku,qty}));
  }

  function injectStyles(){
    if(document.getElementById('aez-pro-b-styles')) return;
    const style = document.createElement('style');
    style.id = 'aez-pro-b-styles';
    style.textContent = `
      .aez-kpi-card{background:#fff;border:1px solid #eef2ff;border-radius:1.25rem;padding:1rem;box-shadow:0 1px 3px rgba(0,0,0,.05)}
      .aez-chip{display:inline-flex;align-items:center;gap:.25rem;border-radius:.75rem;padding:.35rem .55rem;font-size:9px;font-weight:900;text-transform:uppercase;border:1px solid #e5e7eb;background:#f9fafb;color:#0A2558}
      .aez-chip-danger{background:#FDE8E8;color:#E02424;border-color:#FECACA}
      .aez-chip-success{background:#DEF7EC;color:#057A55;border-color:#BBF7D0}
      .aez-chip-warning{background:#FEF3C7;color:#B45309;border-color:#FDE68A}
      .aez-pro-scroll{max-height:70vh;overflow:auto;-webkit-overflow-scrolling:touch}
    `;
    document.head.appendChild(style);
  }

  function ensure360Modal(){
    if(document.getElementById('modal-client-360')) return;
    const modal = document.createElement('div');
    modal.id = 'modal-client-360';
    modal.className = 'hidden fixed inset-0 z-[130] bg-primary/90 backdrop-blur-sm flex items-center justify-center p-3 modal-enter';
    modal.innerHTML = `
      <div class="bg-gray-100 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border-b-4 border-blue-500">
        <div class="p-4 bg-white border-b border-gray-200 flex justify-between items-center">
          <div>
            <h2 class="text-sm font-black text-primary uppercase tracking-tight">Ficha 360° Cliente</h2>
            <p id="client-360-subtitle" class="text-[10px] text-gray-500 font-bold uppercase mt-0.5"></p>
          </div>
          <button onclick="document.getElementById('modal-client-360').classList.add('hidden')" class="text-gray-400 p-1.5 hover:text-danger rounded-xl transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
        <div id="client-360-content" class="p-4 aez-pro-scroll"></div>
      </div>`;
    document.body.appendChild(modal);
  }

  window.openClient360 = function(clientId){
    injectStyles(); ensure360Modal();
    const client = globalClients.get(clientId);
    if(!client){ showAlert('Cliente no encontrado.'); return; }
    const st = getClientStats(clientId);
    const intel = getClientIntel(clientId);
    const lastTxt = st.last ? `${st.last.date} · ${safeMoney(st.last.total)}` : 'Sin compra registrada';
    const fugaClass = st.lastDays === null ? 'aez-chip-danger' : st.lastDays > 60 ? 'aez-chip-danger' : st.lastDays > 30 ? 'aez-chip-warning' : 'aez-chip-success';
    const fugaTxt = st.lastDays === null ? 'Sin historial' : `${st.lastDays} días sin compra`;
    const frecuentesHtml = st.frecuentes.length ? st.frecuentes.map(p => `
      <div class="bg-white rounded-2xl p-3 border border-gray-100 flex justify-between items-center">
        <div class="min-w-0 pr-3">
          <div class="text-xs font-black text-primary">${p.sku}</div>
          <div class="text-[10px] font-bold text-gray-500 uppercase line-clamp-1">${p.descripcion || 'Producto frecuente'}</div>
        </div>
        <button onclick="addProduct('${p.sku}'); document.getElementById('modal-client-360').classList.add('hidden'); switchTab('cotizador');" class="bg-primary text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase">Agregar</button>
      </div>`).join('') : `<div class="bg-white rounded-2xl p-4 text-center text-[10px] font-bold text-gray-400 uppercase border border-gray-100">Sin productos frecuentes aún</div>`;
    const cotHtml = st.cotizaciones.length ? st.cotizaciones.slice(-5).reverse().map(q => `
      <div class="bg-white rounded-2xl p-3 border border-yellow-100 flex justify-between items-center">
        <div><div class="text-xs font-black text-primary">${q.folio}</div><div class="text-[10px] font-bold text-gray-500">${q.date} · ${safeMoney(q.total)}</div></div>
        <button onclick="resumeQuote('${q.folio}'); document.getElementById('modal-client-360').classList.add('hidden');" class="bg-yellow-50 text-yellow-700 border border-yellow-200 px-3 py-2 rounded-xl text-[10px] font-black uppercase">Retomar</button>
      </div>`).join('') : `<div class="bg-white rounded-2xl p-4 text-center text-[10px] font-bold text-gray-400 uppercase border border-gray-100">Sin cotizaciones activas</div>`;

    document.getElementById('client-360-subtitle').innerText = `${client.id} · ${client.razonSocial}`;
    document.getElementById('client-360-content').innerHTML = `
      <div class="bg-metallic text-white rounded-3xl p-5 shadow-vibrant mb-4">
        <div class="text-[10px] font-bold uppercase text-blue-200 mb-1">${client.id}</div>
        <div class="text-lg font-black uppercase leading-tight">${client.razonSocial}</div>
        <div class="text-[10px] font-semibold text-blue-100 mt-2 uppercase">${client.ciudad || ''} · ${client.celular || 'Sin teléfono'}</div>
        <div class="mt-3"><span class="aez-chip ${fugaClass}">${fugaTxt}</span></div>
      </div>

      <div class="grid grid-cols-2 gap-3 mb-4">
        <div class="aez-kpi-card"><div class="text-[9px] font-black text-gray-400 uppercase mb-1">Venta Total</div><div class="text-lg font-black text-primary">${safeMoney(st.total)}</div></div>
        <div class="aez-kpi-card"><div class="text-[9px] font-black text-gray-400 uppercase mb-1">Ticket Prom.</div><div class="text-lg font-black text-primary">${safeMoney(st.ticket)}</div></div>
        <div class="aez-kpi-card"><div class="text-[9px] font-black text-gray-400 uppercase mb-1">Venta Mes</div><div class="text-lg font-black text-success">${safeMoney(st.ventaMes)}</div></div>
        <div class="aez-kpi-card"><div class="text-[9px] font-black text-gray-400 uppercase mb-1">Compras</div><div class="text-lg font-black text-primary">${st.ventas.length}</div></div>
      </div>

      <div class="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm mb-4">
        <div class="text-[10px] font-black text-primary uppercase mb-2">Última compra</div>
        <div class="text-sm font-black text-gray-700">${lastTxt}</div>
      </div>

      <div class="mb-4">
        <h3 class="text-xs font-black text-primary uppercase mb-2 pl-1">Productos frecuentes</h3>
        <div class="flex flex-col gap-2">${frecuentesHtml}</div>
      </div>

      <div class="mb-4">
        <h3 class="text-xs font-black text-primary uppercase mb-2 pl-1">Cotizaciones activas</h3>
        <div class="flex flex-col gap-2">${cotHtml}</div>
      </div>

      <div class="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm mb-4">
        <h3 class="text-xs font-black text-primary uppercase mb-3">Seguimiento comercial</h3>
        <textarea id="client-360-notes" class="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl p-3 text-xs font-bold outline-none focus:border-blue-500 min-h-[90px]" placeholder="Notas, acuerdos, objeciones, próxima necesidad...">${intel.notas || ''}</textarea>
        <div class="grid grid-cols-2 gap-3 mt-3">
          <select id="client-360-action" class="bg-white border-2 border-gray-100 rounded-2xl p-3 text-xs font-black text-primary outline-none">
            <option value="" ${!intel.siguienteAccion?'selected':''}>Siguiente acción...</option>
            <option value="LLAMAR" ${intel.siguienteAccion==='LLAMAR'?'selected':''}>Llamar</option>
            <option value="VISITAR" ${intel.siguienteAccion==='VISITAR'?'selected':''}>Visitar</option>
            <option value="COTIZAR" ${intel.siguienteAccion==='COTIZAR'?'selected':''}>Cotizar</option>
            <option value="COBRAR" ${intel.siguienteAccion==='COBRAR'?'selected':''}>Cobrar</option>
          </select>
          <select id="client-360-priority" class="bg-white border-2 border-gray-100 rounded-2xl p-3 text-xs font-black text-primary outline-none">
            <option value="BAJA" ${intel.prioridad==='BAJA'?'selected':''}>Baja</option>
            <option value="MEDIA" ${!intel.prioridad || intel.prioridad==='MEDIA'?'selected':''}>Media</option>
            <option value="ALTA" ${intel.prioridad==='ALTA'?'selected':''}>Alta</option>
          </select>
        </div>
        <button onclick="saveClient360('${clientId}')" class="w-full bg-metallic text-white py-3.5 rounded-xl text-xs font-black uppercase mt-3 shadow-btn border-b-4 border-blue-800">Guardar Seguimiento</button>
      </div>

      <div class="grid grid-cols-2 gap-3 pb-2">
        <button onclick="startOrder('${clientId}'); document.getElementById('modal-client-360').classList.add('hidden');" class="bg-primary text-white py-3.5 rounded-xl text-xs font-black uppercase shadow-btn border-b-4 border-blue-800">Nuevo Pedido</button>
        <button onclick="sendClientWhatsApp('${clientId}')" class="bg-success text-white py-3.5 rounded-xl text-xs font-black uppercase shadow-btn border-b-4 border-green-700">WhatsApp</button>
      </div>
    `;
    document.getElementById('modal-client-360').classList.remove('hidden');
  };

  window.saveClient360 = function(clientId){
    setClientIntel(clientId, {
      notas: document.getElementById('client-360-notes')?.value || '',
      siguienteAccion: document.getElementById('client-360-action')?.value || '',
      prioridad: document.getElementById('client-360-priority')?.value || 'MEDIA'
    });
    showAlert('Seguimiento guardado.');
    enhanceClientCards();
  };

  window.sendClientWhatsApp = function(clientId){
    const c = globalClients.get(clientId); if(!c) return;
    const phone = String(c.celular || '').replace(/\D/g,'');
    if(!phone || phone.length < 10){ showAlert('Cliente sin celular registrado.'); return; }
    const text = `Hola ${c.razonSocial}, soy ${asesorName || 'su asesor'} de Auto Eléctrica Zendejas. Le doy seguimiento a sus refacciones y cotizaciones.`;
    window.open(`https://wa.me/52${phone}?text=${encodeURIComponent(text)}`, '_blank');
  };

  window.resumeQuote = function(folio){
    const sale = (sessionSales || []).find(s => s.folio === folio);
    if(!sale){ showAlert('Cotización no encontrada.'); return; }
    selectedClient = globalClients.get(sale.clientId) || { id:sale.clientId, razonSocial:sale.clientName, rfc:sale.clientRfc, direccion:sale.clientDir, ciudad:sale.clientCity, celular:sale.clientPhone };
    cartItems.clear();
    (sale.items || []).forEach(i => {
      const prod = globalProducts.get(i.sku) || { codigo:i.sku, descripcion:i.descripcion || 'S/D', marca:'S/M', precioLista:i.listPrice || 0, imgProducto:i.img || '' };
      cartItems.set(i.sku, { productRef: prod, qty: i.qty || 1, listPrice: i.listPrice || prod.precioLista || 0, discount: i.discount || 0 });
    });
    saveCartToLocal();
    document.getElementById('cot-client-name').innerText = selectedClient.razonSocial;
    switchTab('cotizador');
    renderCartMobile();
    renderClientSuggestions();
    showAlert(`Cotización ${folio} retomada.`);
  };

  function enhanceClientCards(){
    const menus = document.querySelectorAll('[id^="menu-"]');
    menus.forEach(menu => {
      const clientId = menu.id.replace('menu-','');
      if(!menu.querySelector('.btn-client-360')){
        const btn = document.createElement('button');
        btn.className = 'btn-client-360 w-full bg-white border-2 border-blue-100 text-primary py-3.5 rounded-xl text-xs font-black uppercase active:scale-[0.98] shadow-sm flex items-center justify-center gap-2';
        btn.innerHTML = 'Ficha 360° / Seguimiento';
        btn.onclick = () => openClient360(clientId);
        menu.appendChild(btn);
      }
      const header = menu.previousElementSibling;
      if(header && !header.querySelector('.aez-badge-intel')){
        const st = getClientStats(clientId);
        const intel = getClientIntel(clientId);
        const badge = document.createElement('div');
        badge.className = 'aez-badge-intel flex gap-1 flex-wrap mt-2';
        const fugaClass = st.lastDays === null ? 'aez-chip-danger' : st.lastDays > 60 ? 'aez-chip-danger' : st.lastDays > 30 ? 'aez-chip-warning' : 'aez-chip-success';
        const fugaTxt = st.lastDays === null ? 'SIN HISTORIAL' : `${st.lastDays} DÍAS`;
        badge.innerHTML = `<span class="aez-chip ${fugaClass}">${fugaTxt}</span>${intel.siguienteAccion ? `<span class="aez-chip">${intel.siguienteAccion}</span>` : ''}${intel.prioridad==='ALTA' ? `<span class="aez-chip aez-chip-danger">ALTA</span>` : ''}`;
        header.appendChild(badge);
      }
    });
  }

  function ensureSuggestionsBox(){
    if(document.getElementById('pro-suggestions-box')) return;
    const anchor = document.getElementById('prod-search-results');
    if(!anchor) return;
    const box = document.createElement('div');
    box.id = 'pro-suggestions-box';
    box.className = 'hidden bg-white border border-blue-100 rounded-3xl p-4 shadow-sm mb-5';
    anchor.insertAdjacentElement('afterend', box);
  }

  window.renderClientSuggestions = function(){
    ensureSuggestionsBox();
    const box = document.getElementById('pro-suggestions-box');
    if(!box || !selectedClient){ return; }
    const st = getClientStats(selectedClient.id);
    let suggestions = st.frecuentes.map(x => ({sku:x.sku, reason:'Frecuente del cliente', qty:x.qty}));
    if(suggestions.length < 5){
      getGlobalTopProducts(8).forEach(x => { if(!suggestions.find(s=>s.sku===x.sku)) suggestions.push({sku:x.sku, reason:'Top general', qty:x.qty}); });
    }
    suggestions = suggestions.filter(s => globalProducts.has(s.sku) && !cartItems.has(s.sku)).slice(0,5);
    if(suggestions.length === 0){ box.classList.add('hidden'); return; }
    box.innerHTML = `<div class="flex justify-between items-center mb-3"><h3 class="text-xs font-black text-primary uppercase">Sugerencias Inteligentes</h3><span class="text-[9px] font-black text-gray-400 uppercase">${selectedClient.razonSocial}</span></div>
      <div class="flex flex-col gap-2">${suggestions.map(s => {
        const p = globalProducts.get(s.sku);
        const stock = localStock[s.sku] || 0;
        return `<div class="bg-gray-50 border border-gray-100 rounded-2xl p-3 flex items-center justify-between">
          <div class="min-w-0 pr-2"><div class="text-xs font-black text-primary">${s.sku} <span class="text-[9px] text-gray-400">${stock} disp.</span></div><div class="text-[10px] font-bold text-gray-500 uppercase line-clamp-1">${p.descripcion}</div><div class="text-[9px] font-black text-success uppercase mt-1">${s.reason}</div></div>
          <button onclick="addProduct('${s.sku}')" class="bg-primary text-white px-3 py-2.5 rounded-xl text-[10px] font-black uppercase">Agregar</button>
        </div>`;
      }).join('')}</div>`;
    box.classList.remove('hidden');
  };

  function enhanceQuotes(){
    const cont = document.getElementById('cotizaciones-list-container');
    if(!cont) return;
    (sessionSales || []).filter(s => s.status !== 'PAGADA').forEach(s => {
      const payBtn = cont.querySelector(`button[onclick="openPaymentModal('${s.folio}')"]`);
      if(payBtn && !payBtn.parentElement.querySelector(`button[data-resume-folio="${s.folio}"]`)){
        const btn = document.createElement('button');
        btn.dataset.resumeFolio = s.folio;
        btn.className = 'flex-1 bg-blue-50 border-2 border-blue-100 text-primary py-2.5 rounded-xl text-[10px] font-black uppercase active:scale-[0.98]';
        btn.innerText = 'Retomar';
        btn.onclick = () => resumeQuote(s.folio);
        payBtn.parentElement.insertBefore(btn, payBtn);
      }
    });
  }

  function patchFunctions(){
    if(window.__AEZ_PRO_B_PATCHED__) return;
    window.__AEZ_PRO_B_PATCHED__ = true;

    const oldRenderClientList = renderClientList;
    renderClientList = function(){ oldRenderClientList.apply(this, arguments); setTimeout(enhanceClientCards, 0); };

    const oldToggleClientMenu = toggleClientMenu;
    toggleClientMenu = function(id){ oldToggleClientMenu.apply(this, arguments); setTimeout(enhanceClientCards, 0); };

    const oldStartOrder = startOrder;
    startOrder = function(id){ oldStartOrder.apply(this, arguments); setTimeout(renderClientSuggestions, 0); };

    const oldSwitchTab = switchTab;
    switchTab = function(tab){ oldSwitchTab.apply(this, arguments); if(tab === 'cotizador') setTimeout(renderClientSuggestions, 0); if(tab === 'cotizaciones') setTimeout(enhanceQuotes, 0); };

    const oldAddProduct = addProduct;
    addProduct = function(sku){ oldAddProduct.apply(this, arguments); setTimeout(renderClientSuggestions, 0); };

    const oldRemoveCartItem = removeCartItem;
    removeCartItem = function(sku){ oldRemoveCartItem.apply(this, arguments); setTimeout(renderClientSuggestions, 0); };

    const oldRenderCotizacionesList = renderCotizacionesList;
    renderCotizacionesList = function(){ oldRenderCotizacionesList.apply(this, arguments); setTimeout(enhanceQuotes, 0); };
  }

  function init(){
    injectStyles(); ensure360Modal(); ensureSuggestionsBox(); patchFunctions();
    setTimeout(() => { try { enhanceClientCards(); renderClientSuggestions(); enhanceQuotes(); } catch(e){} }, 500);
    console.log(`%c${B_VERSION} activo`, 'color:#0A2558;font-weight:bold');
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
