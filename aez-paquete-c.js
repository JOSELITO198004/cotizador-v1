
/* AEZ Campo PRO - Paquete C: Control Gerencial
   Carga este archivo DESPUÉS del script principal y después de Paquete B si lo usas.
   Extiende informes, KPIs, auditoría, productividad, inventario y exportación gerencial.
*/
(function(){
  'use strict';

  const C_VERSION = 'AEZ-PRO-C-2026.06.25';
  const AUDIT_KEY = 'aez_audit_log_v1';
  const VISIT_KEY = 'aez_visit_log_v1';

  function money(n){
    try { return moneyFmtFull.format(Number(n || 0)); }
    catch(e){ return new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(Number(n||0)); }
  }
  function fmtDate(d){
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }
  function parseDate(str){
    if(!str) return null;
    const p = String(str).split('/');
    if(p.length !== 3) return null;
    return new Date(`${p[2]}-${p[1]}-${p[0]}T12:00:00`);
  }
  function dateKeyISO(d){
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function getMonthKey(){
    const d = new Date();
    return `${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }
  function readLS(key, fallback){
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch(e){ return fallback; }
  }
  function writeLS(key, value){ localStorage.setItem(key, JSON.stringify(value)); }
  function normalizeNum(v){ const n = Number(v || 0); return isNaN(n) ? 0 : n; }

  function addAudit(action, detail){
    const log = readLS(AUDIT_KEY, []);
    log.push({
      ts: new Date().toISOString(),
      fecha: fmtDate(new Date()),
      hora: new Date().toLocaleTimeString('es-MX'),
      asesor: typeof asesorName !== 'undefined' ? asesorName : '',
      action,
      detail: detail || {}
    });
    while(log.length > 1000) log.shift();
    writeLS(AUDIT_KEY, log);
  }
  window.aezAddAudit = addAudit;

  function getVisitLog(){ return readLS(VISIT_KEY, []); }
  function saveVisitLog(list){ writeLS(VISIT_KEY, list || []); }

  function calcMetrics(){
    const today = fmtDate(new Date());
    const monthKey = getMonthKey();
    const ventas = (sessionSales || []).filter(s => s.status === 'PAGADA');
    const cotizaciones = (sessionSales || []).filter(s => s.status !== 'PAGADA');
    const ventasHoy = ventas.filter(s => s.date === today);
    const ventasMes = ventas.filter(s => String(s.date||'').includes(monthKey));
    const totalHoy = ventasHoy.reduce((a,s)=>a+normalizeNum(s.total),0);
    const totalMes = ventasMes.reduce((a,s)=>a+normalizeNum(s.total),0);
    const ticketProm = ventasMes.length ? totalMes / ventasMes.length : 0;
    const clientesVentaMes = new Set(ventasMes.map(s=>s.clientId)).size;
    const clientesTotal = typeof globalClients !== 'undefined' ? globalClients.size : 0;
    const cobertura = clientesTotal ? (clientesVentaMes / clientesTotal) * 100 : 0;
    const conversionBase = ventasMes.length + cotizaciones.filter(s => String(s.date||'').includes(monthKey)).length;
    const conversion = conversionBase ? (ventasMes.length / conversionBase) * 100 : 0;
    const skuMap = {};
    const clientMap = {};
    let descuentoTotal = 0;
    let subtotalBruto = 0;
    ventasMes.forEach(s => {
      clientMap[s.clientId] = clientMap[s.clientId] || { id:s.clientId, name:s.clientName, total:0, count:0 };
      clientMap[s.clientId].total += normalizeNum(s.total); clientMap[s.clientId].count += 1;
      (s.items || []).forEach(i => {
        const sku = i.sku || 'S/SKU';
        const qty = normalizeNum(i.qty);
        const price = normalizeNum(i.listPrice);
        const disc = normalizeNum(i.discount);
        const bruto = qty * price;
        const neto = bruto * (1 - disc/100);
        subtotalBruto += bruto;
        descuentoTotal += (bruto - neto);
        skuMap[sku] = skuMap[sku] || { sku, desc:i.descripcion || '', qty:0, total:0 };
        skuMap[sku].qty += qty; skuMap[sku].total += neto;
      });
    });
    const topSku = Object.values(skuMap).sort((a,b)=>b.qty-a.qty).slice(0,8);
    const topClientes = Object.values(clientMap).sort((a,b)=>b.total-a.total).slice(0,8);
    const visitasMes = getVisitLog().filter(v => String(v.fecha||'').includes(monthKey));
    const inventarioValor = Object.entries(localStock || {}).reduce((a,[sku,qty]) => {
      const p = globalProducts && globalProducts.get ? globalProducts.get(sku) : null;
      return a + normalizeNum(qty) * normalizeNum(p ? p.precioLista : 0);
    },0);
    const sinMovimiento = [];
    if(typeof globalProducts !== 'undefined' && globalProducts.entries){
      const soldSkus = new Set((sessionSales||[]).filter(s=>s.status==='PAGADA').flatMap(s=>(s.items||[]).map(i=>i.sku)));
      for(const [sku,p] of globalProducts.entries()){
        if(!soldSkus.has(sku)) sinMovimiento.push({sku, desc:p.descripcion || '', stock: normalizeNum((localStock||{})[sku])});
        if(sinMovimiento.length >= 25) break;
      }
    }
    return { today, monthKey, ventas, cotizaciones, ventasHoy, ventasMes, totalHoy, totalMes, ticketProm, clientesVentaMes, clientesTotal, cobertura, conversion, topSku, topClientes, descuentoTotal, subtotalBruto, visitasMes, inventarioValor, sinMovimiento };
  }

  function injectStyles(){
    if(document.getElementById('aez-pro-c-styles')) return;
    const style = document.createElement('style');
    style.id = 'aez-pro-c-styles';
    style.textContent = `
      .aez-c-card{background:#fff;border:1px solid #eef2ff;border-radius:1.5rem;padding:1rem;box-shadow:0 1px 3px rgba(0,0,0,.05)}
      .aez-c-kpi{background:linear-gradient(135deg,#ffffff,#f8fafc);border:1px solid #e5e7eb;border-radius:1.25rem;padding:1rem;box-shadow:0 1px 3px rgba(0,0,0,.04)}
      .aez-c-label{font-size:9px;font-weight:900;text-transform:uppercase;color:#6b7280;letter-spacing:.05em}
      .aez-c-value{font-size:20px;font-weight:900;color:#0A2558;line-height:1.1;margin-top:.25rem}
      .aez-c-bar{height:8px;border-radius:999px;background:#e5e7eb;overflow:hidden}
      .aez-c-bar>span{display:block;height:100%;background:#0A2558;border-radius:999px}
      .aez-c-chip{display:inline-flex;border-radius:.75rem;padding:.35rem .55rem;font-size:9px;font-weight:900;text-transform:uppercase;border:1px solid #e5e7eb;background:#f9fafb;color:#0A2558}
      .aez-c-danger{background:#FDE8E8;color:#E02424;border-color:#FECACA}.aez-c-success{background:#DEF7EC;color:#057A55;border-color:#BBF7D0}.aez-c-warning{background:#FEF3C7;color:#B45309;border-color:#FDE68A}
    `;
    document.head.appendChild(style);
  }

  function ensureManagerPanel(){
    const informes = document.getElementById('step-informes');
    if(!informes || document.getElementById('aez-manager-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'aez-manager-panel';
    panel.className = 'mb-5';
    panel.innerHTML = `
      <div class="bg-white p-5 rounded-3xl border-2 border-blue-100 shadow-vibrant mb-5">
        <div class="flex justify-between items-center mb-4">
          <div>
            <h3 class="text-sm font-black text-primary uppercase tracking-tight">Panel Gerencial PRO</h3>
            <p class="text-[10px] font-bold text-gray-500 uppercase mt-1">KPIs comerciales, productividad e inventario</p>
          </div>
          <button onclick="renderManagerDashboard()" class="bg-primary text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase">Actualizar</button>
        </div>
        <div id="aez-manager-dashboard"></div>
        <div class="grid grid-cols-2 gap-3 mt-4">
          <button onclick="exportManagerReport()" class="bg-metallic text-white py-3.5 rounded-xl text-[10px] font-black uppercase shadow-btn border-b-4 border-blue-800">Excel Gerencial</button>
          <button onclick="openAuditModal()" class="bg-gray-50 border-2 border-gray-100 text-primary py-3.5 rounded-xl text-[10px] font-black uppercase">Bitácora</button>
        </div>
      </div>`;
    const firstCard = informes.querySelector('.bg-metallic') || informes.children[1];
    informes.insertBefore(panel, firstCard || informes.firstChild);
  }

  window.renderManagerDashboard = function(){
    injectStyles(); ensureManagerPanel();
    const m = calcMetrics();
    const dash = document.getElementById('aez-manager-dashboard');
    if(!dash) return;
    const coberturaPct = Math.min(100, Math.round(m.cobertura));
    const conversionPct = Math.min(100, Math.round(m.conversion));
    const descuentoPct = m.subtotalBruto ? Math.round((m.descuentoTotal / m.subtotalBruto)*100) : 0;
    dash.innerHTML = `
      <div class="grid grid-cols-2 gap-3 mb-4">
        <div class="aez-c-kpi"><div class="aez-c-label">Venta Hoy</div><div class="aez-c-value">${money(m.totalHoy)}</div></div>
        <div class="aez-c-kpi"><div class="aez-c-label">Venta Mes</div><div class="aez-c-value">${money(m.totalMes)}</div></div>
        <div class="aez-c-kpi"><div class="aez-c-label">Ticket Prom.</div><div class="aez-c-value">${money(m.ticketProm)}</div></div>
        <div class="aez-c-kpi"><div class="aez-c-label">Valor Inventario</div><div class="aez-c-value">${money(m.inventarioValor)}</div></div>
      </div>
      <div class="grid grid-cols-2 gap-3 mb-4">
        <div class="aez-c-card"><div class="flex justify-between mb-2"><span class="aez-c-label">Cobertura Clientes</span><span class="aez-c-chip ${coberturaPct>=60?'aez-c-success':coberturaPct>=30?'aez-c-warning':'aez-c-danger'}">${coberturaPct}%</span></div><div class="aez-c-bar"><span style="width:${coberturaPct}%"></span></div><div class="text-[10px] text-gray-500 font-bold mt-2">${m.clientesVentaMes}/${m.clientesTotal} clientes con compra</div></div>
        <div class="aez-c-card"><div class="flex justify-between mb-2"><span class="aez-c-label">Conversión</span><span class="aez-c-chip ${conversionPct>=70?'aez-c-success':conversionPct>=40?'aez-c-warning':'aez-c-danger'}">${conversionPct}%</span></div><div class="aez-c-bar"><span style="width:${conversionPct}%"></span></div><div class="text-[10px] text-gray-500 font-bold mt-2">Ventas vs cotizaciones del mes</div></div>
      </div>
      <div class="grid grid-cols-2 gap-3 mb-4">
        <div class="aez-c-card"><div class="aez-c-label mb-1">Descuento Estimado</div><div class="text-lg font-black text-danger">${money(m.descuentoTotal)}</div><div class="text-[10px] font-bold text-gray-500">${descuentoPct}% sobre bruto</div></div>
        <div class="aez-c-card"><div class="aez-c-label mb-1">Visitas Mes</div><div class="text-lg font-black text-primary">${m.visitasMes.length}</div><div class="text-[10px] font-bold text-gray-500">registradas desde Paquete C</div></div>
      </div>
      <div class="mb-4">
        <h4 class="text-xs font-black text-primary uppercase mb-2">Top Clientes del Mes</h4>
        <div class="flex flex-col gap-2">${m.topClientes.length ? m.topClientes.map(c=>`<div class="bg-gray-50 rounded-2xl p-3 flex justify-between items-center border border-gray-100"><div class="min-w-0 pr-2"><div class="text-xs font-black text-primary line-clamp-1">${c.name}</div><div class="text-[10px] font-bold text-gray-500">${c.count} compra(s)</div></div><div class="text-sm font-black text-success">${money(c.total)}</div></div>`).join('') : empty('Sin ventas del mes')}</div>
      </div>
      <div class="mb-4">
        <h4 class="text-xs font-black text-primary uppercase mb-2">Top SKU del Mes</h4>
        <div class="flex flex-col gap-2">${m.topSku.length ? m.topSku.map(s=>`<div class="bg-gray-50 rounded-2xl p-3 flex justify-between items-center border border-gray-100"><div class="min-w-0 pr-2"><div class="text-xs font-black text-primary">${s.sku}</div><div class="text-[10px] font-bold text-gray-500 uppercase line-clamp-1">${s.desc}</div></div><div class="text-sm font-black text-primary">${s.qty}</div></div>`).join('') : empty('Sin SKU vendidos')}</div>
      </div>
      <div>
        <h4 class="text-xs font-black text-primary uppercase mb-2">Alertas Operativas</h4>
        <div class="grid grid-cols-1 gap-2">
          ${alertLine('Pendientes de sincronizar', (offlineSyncQueue||[]).length, (offlineSyncQueue||[]).length>0 ? 'aez-c-warning':'aez-c-success')}
          ${alertLine('Cotizaciones activas', m.cotizaciones.length, m.cotizaciones.length>10 ? 'aez-c-warning':'')}
          ${alertLine('Productos sin movimiento', m.sinMovimiento.length, m.sinMovimiento.length>0 ? 'aez-c-warning':'aez-c-success')}
        </div>
      </div>`;
  };

  function empty(txt){ return `<div class="bg-gray-50 rounded-2xl p-4 text-center text-[10px] font-bold text-gray-400 uppercase border border-gray-100">${txt}</div>`; }
  function alertLine(label, value, cls){ return `<div class="bg-white rounded-2xl p-3 border border-gray-100 flex justify-between items-center"><span class="text-xs font-black text-primary uppercase">${label}</span><span class="aez-c-chip ${cls||''}">${value}</span></div>`; }

  function ensureAuditModal(){
    if(document.getElementById('modal-audit-log')) return;
    const modal = document.createElement('div');
    modal.id = 'modal-audit-log';
    modal.className = 'hidden fixed inset-0 z-[135] bg-primary/90 backdrop-blur-sm flex items-center justify-center p-3 modal-enter';
    modal.innerHTML = `
      <div class="bg-gray-100 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border-b-4 border-blue-500">
        <div class="p-4 bg-white border-b border-gray-200 flex justify-between items-center">
          <div><h2 class="text-sm font-black text-primary uppercase">Bitácora Gerencial</h2><p class="text-[10px] font-bold text-gray-500 uppercase">Últimos movimientos auditados</p></div>
          <button onclick="document.getElementById('modal-audit-log').classList.add('hidden')" class="text-gray-400 p-1.5 hover:text-danger rounded-xl"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
        </div>
        <div id="audit-log-content" class="p-4" style="max-height:70vh;overflow:auto"></div>
      </div>`;
    document.body.appendChild(modal);
  }

  window.openAuditModal = function(){
    ensureAuditModal();
    const list = readLS(AUDIT_KEY, []).slice(-100).reverse();
    const box = document.getElementById('audit-log-content');
    box.innerHTML = list.length ? list.map(l => `<div class="bg-white rounded-2xl p-3 border border-gray-100 mb-2"><div class="flex justify-between"><div class="text-xs font-black text-primary uppercase">${l.action}</div><div class="text-[9px] font-bold text-gray-400">${l.fecha} ${l.hora||''}</div></div><div class="text-[10px] font-bold text-gray-500 mt-1">${l.asesor || ''}</div><pre class="text-[9px] text-gray-500 whitespace-pre-wrap mt-2 bg-gray-50 p-2 rounded-xl">${JSON.stringify(l.detail||{}, null, 1)}</pre></div>`).join('') : empty('Sin bitácora aún');
    document.getElementById('modal-audit-log').classList.remove('hidden');
  };

  window.exportManagerReport = function(){
    const m = calcMetrics();
    const wb = XLSX.utils.book_new();
    const resumen = [{
      Fecha: m.today,
      Mes: m.monthKey,
      Venta_Hoy: m.totalHoy,
      Venta_Mes: m.totalMes,
      Ticket_Promedio: m.ticketProm,
      Clientes_Con_Compra_Mes: m.clientesVentaMes,
      Clientes_Total: m.clientesTotal,
      Cobertura_Pct: Number(m.cobertura.toFixed(2)),
      Conversion_Pct: Number(m.conversion.toFixed(2)),
      Descuento_Estimado: Number(m.descuentoTotal.toFixed(2)),
      Valor_Inventario: Number(m.inventarioValor.toFixed(2)),
      Cotizaciones_Activas: m.cotizaciones.length,
      Sync_Pendientes: (offlineSyncQueue||[]).length,
      Visitas_Mes: m.visitasMes.length
    }];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(m.topClientes.length?m.topClientes:[{Aviso:'Sin datos'}]), 'Top Clientes');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(m.topSku.length?m.topSku:[{Aviso:'Sin datos'}]), 'Top SKU');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(m.sinMovimiento.length?m.sinMovimiento:[{Aviso:'Sin datos'}]), 'Sin Movimiento');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(m.visitasMes.length?m.visitasMes:[{Aviso:'Sin datos'}]), 'Visitas');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(readLS(AUDIT_KEY, []).slice(-500)), 'Bitacora');
    XLSX.writeFile(wb, `Gerencial_AEZ_${dateKeyISO(new Date())}.xlsx`);
    addAudit('EXPORT_GERENCIAL', { fecha:m.today, ventaMes:m.totalMes });
  };

  function patchFunctions(){
    if(window.__AEZ_PRO_C_PATCHED__) return;
    window.__AEZ_PRO_C_PATCHED__ = true;

    if(typeof switchTab === 'function'){
      const oldSwitchTab = switchTab;
      switchTab = function(tab){
        oldSwitchTab.apply(this, arguments);
        if(tab === 'informes') setTimeout(()=>{ ensureManagerPanel(); renderManagerDashboard(); }, 0);
      };
    }

    if(typeof saveNewClient === 'function'){
      const oldSaveNewClient = saveNewClient;
      saveNewClient = function(){ const before = (localNewClients||[]).length; const r = oldSaveNewClient.apply(this, arguments); if((localNewClients||[]).length > before) addAudit('NUEVO_CLIENTE', localNewClients[localNewClients.length-1]); return r; };
    }

    if(typeof commitSale === 'function'){
      const oldCommitSale = commitSale;
      commitSale = function(tipo){ addAudit('COMMIT_SALE', { tipo, cliente: selectedClient ? selectedClient.id : null, items: cartItems ? cartItems.size : 0 }); return oldCommitSale.apply(this, arguments); };
    }

    if(typeof confirmPayment === 'function'){
      const oldConfirmPayment = confirmPayment;
      confirmPayment = function(){ addAudit('CONFIRM_PAYMENT_CLICK', { folio: saleToPay, metodo: document.getElementById('payment-method')?.value || '' }); return oldConfirmPayment.apply(this, arguments); };
    }

    if(typeof registerKardexMovement === 'function'){
      const oldRegisterKardex = registerKardexMovement;
      registerKardexMovement = function(sku, qty, type, motive, refFolio){ addAudit('KARDEX', { sku, qty, type, motive, refFolio }); return oldRegisterKardex.apply(this, arguments); };
    }

    if(typeof startVisit === 'function'){
      const oldStartVisit = startVisit;
      startVisit = function(id){ addAudit('VISITA_INICIO', { clientId:id }); return oldStartVisit.apply(this, arguments); };
    }

    if(typeof endVisit === 'function'){
      const oldEndVisit = endVisit;
      endVisit = function(id){
        const timer = document.getElementById(`timer-${id}`)?.innerText || '00:00';
        const client = globalClients && globalClients.get ? globalClients.get(id) : null;
        const visits = getVisitLog();
        visits.push({ fecha: fmtDate(new Date()), hora: new Date().toLocaleTimeString('es-MX'), asesor: asesorName || '', clientId:id, cliente: client ? client.razonSocial : '', duracion: timer });
        saveVisitLog(visits);
        addAudit('VISITA_FIN', { clientId:id, duracion:timer });
        return oldEndVisit.apply(this, arguments);
      };
    }
  }

  function init(){
    injectStyles(); ensureAuditModal(); patchFunctions();
    setTimeout(()=>{ ensureManagerPanel(); if(!document.getElementById('step-informes')?.classList.contains('hidden')) renderManagerDashboard(); }, 600);
    console.log(`%c${C_VERSION} activo`, 'color:#0A2558;font-weight:bold');
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
