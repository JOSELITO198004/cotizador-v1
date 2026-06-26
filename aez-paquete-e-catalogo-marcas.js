
/* AEZ Campo PRO - Paquete E R2: Catálogo General por Marca Cloud + PDF
   Cambios R2:
   - No usa carga manual de Excel.
   - Oculta botón de Archivo Local de la app base.
   - Toma productos desde la nube usando GOOGLE_SHEETS_API_URL.
   - Usa caché local para operar offline.
   - Genera vista imprimible/exportable a PDF con window.print().
*/
(function(){
  'use strict';

  const E_VERSION = 'AEZ-PRO-E-R2-CATALOGO-MARCAS-CLOUD-PDF-2026.06.25';
  const EXTRA_KEY = 'aez_product_extras_v2';
  const CLOUD_PRODUCTS_CACHE_KEY = 'aez_cloud_products_catalog_v1';

  function show(msg,t=3500){ try{ showAlert(msg,t); }catch(e){ alert(msg); } }
  function money(n){ try{return moneyFmtFull.format(Number(n||0));}catch(e){return new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(Number(n||0));} }
  function norm(k){ return String(k||'').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,''); }
  function clean(v){ return String(v ?? '').trim(); }
  function getJson(key, fallback){ try{return JSON.parse(localStorage.getItem(key))||fallback;}catch(e){return fallback;} }
  function setJson(key, value){ localStorage.setItem(key, JSON.stringify(value||{})); }
  function getExtraStore(){ return getJson(EXTRA_KEY, {}); }
  function saveExtraStore(o){ setJson(EXTRA_KEY, o||{}); }

  function findVal(row, names){
    const obj={}; Object.keys(row||{}).forEach(k=>obj[norm(k)]=row[k]);
    for(const n of names){ const key=norm(n); if(obj[key]!==undefined && obj[key]!==null && String(obj[key]).trim()!=='') return obj[key]; }
    return '';
  }
  function skuFromRow(row){ return clean(findVal(row, ['codigo','sku','producto','id','clave','clave_producto'])); }

  function getProductImage(prod, sku){
    if(prod?.imgProducto) return prod.imgProducto;
    const skuStr = String(sku||'');
    const folder = skuStr.length >= 5 ? skuStr.substring(0,5) : '00000';
    return `https://resources.apymsa.com.mx/imagenes/FotosSpeed/${folder}/${skuStr}3a.jpg`;
  }

  function fallbackBrandLogo(brand){
    return `<div class="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[10px] font-black text-primary uppercase text-center px-1">${brand||'MARCA'}</div>`;
  }

  function hideManualFileLoad(){
    const btn = document.getElementById('btnSelectFile');
    if(btn){
      btn.classList.add('hidden');
      btn.style.display = 'none';
    }
    const input = document.getElementById('dataFile');
    if(input){ input.classList.add('hidden'); }
  }

  function normalizeCloudProduct(row){
    const sku = skuFromRow(row);
    if(!sku) return null;
    const precio = parseFloat(String(findVal(row, ['precio','preciolista','precio_lista','lista','costo'])||0).replace(/[^0-9.-]/g,'')) || 0;
    return {
      codigo: sku,
      descripcion: clean(findVal(row, ['descripcion','descripcion_producto','desc','nombre'])) || 'S/D',
      marca: clean(findVal(row, ['marca','brand'])) || 'S/M',
      precioLista: precio,
      imgProducto: clean(findVal(row, ['img','imagen','url imagen','url_imagen','imagen producto','imgproducto'])),
      urlMarca: clean(findVal(row, ['url marca','url_marca','urlmarca','logo marca','logo_marca','url_logo_marca'])),
      caracteristica1: clean(findVal(row, ['caracteristicas 1','caracteristica 1','caracteristicas_1','caracteristica_1','caracteristica1'])),
      caracteristica2: clean(findVal(row, ['caracteristicas 2','caracteristica 2','caracteristicas_2','caracteristica_2','caracteristica2']))
    };
  }

  function applyCloudProductsToGlobal(products){
    if(typeof globalProducts === 'undefined' || !globalProducts?.set) return 0;
    let count = 0;
    products.forEach(p=>{
      if(!p || !p.codigo) return;
      const existing = globalProducts.get(p.codigo) || {};
      globalProducts.set(p.codigo, {...existing, ...p});
      count++;
    });
    return count;
  }

  function applyExtrasToProducts(){
    if(typeof globalProducts === 'undefined' || !globalProducts?.entries) return;
    const extras = getExtraStore();
    for(const [sku, extra] of Object.entries(extras)){
      const prod = globalProducts.get(sku);
      if(prod){ Object.assign(prod, extra); }
    }
  }

  async function syncProductsFromCloud(silent=false){
    try{
      if(typeof GOOGLE_SHEETS_API_URL === 'undefined' || !GOOGLE_SHEETS_API_URL){ throw new Error('URL de nube no configurada.'); }
      const res = await fetch(GOOGLE_SHEETS_API_URL, {redirect:'follow', cache:'no-store'});
      const txt = await res.text();
      if(txt.includes('<html') || txt.includes('<HTML')) throw new Error('La nube no devolvió JSON.');
      const data = JSON.parse(txt);
      const rows = data.productos || data.PRODUCTOS || [];
      if(!Array.isArray(rows) || !rows.length) throw new Error('La nube no devolvió productos.');
      const products = rows.map(normalizeCloudProduct).filter(Boolean);
      localStorage.setItem(CLOUD_PRODUCTS_CACHE_KEY, JSON.stringify(products));
      const extras = {};
      products.forEach(p=>{ extras[p.codigo] = {urlMarca:p.urlMarca, caracteristica1:p.caracteristica1, caracteristica2:p.caracteristica2, marca:p.marca, imgProducto:p.imgProducto}; });
      saveExtraStore(extras);
      const loaded = applyCloudProductsToGlobal(products);
      applyExtrasToProducts();
      if(!silent) show(`Catálogo actualizado desde nube: ${loaded} productos.`, 5000);
      return loaded;
    }catch(err){
      const cached = getJson(CLOUD_PRODUCTS_CACHE_KEY, []);
      if(Array.isArray(cached) && cached.length){
        applyCloudProductsToGlobal(cached);
        applyExtrasToProducts();
        if(!silent) show(`Sin nube. Usando caché: ${cached.length} productos.`, 5000);
        return cached.length;
      }
      if(!silent) show('No se pudo cargar catálogo desde nube: ' + err.message, 6000);
      return 0;
    }
  }

  function injectStyles(){
    if(document.getElementById('aez-brand-catalog-styles')) return;
    const s = document.createElement('style');
    s.id = 'aez-brand-catalog-styles';
    s.textContent = `
      .brand-cat-card{background:white;border:1px solid #eef2ff;border-radius:1.5rem;padding:1rem;box-shadow:0 1px 3px rgba(0,0,0,.05)}
      .brand-cat-chip{display:inline-flex;align-items:center;border-radius:.75rem;padding:.35rem .55rem;font-size:9px;font-weight:900;text-transform:uppercase;border:1px solid #e5e7eb;background:#f9fafb;color:#0A2558}
      .brand-cat-img{width:64px;height:64px;object-fit:contain;background:#fff;border-radius:1rem;border:1px solid #f1f5f9}
      .brand-cat-logo{max-width:70px;max-height:34px;object-fit:contain}
      .brand-cat-line{font-size:10px;font-weight:800;color:#64748b;background:#f8fafc;border:1px solid #e2e8f0;border-radius:.65rem;padding:.35rem .55rem;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #brand-catalog-pdf-area{display:none}
      @media print{
        body *{visibility:hidden!important}
        #brand-catalog-pdf-area,#brand-catalog-pdf-area *{visibility:visible!important}
        #brand-catalog-pdf-area{display:block!important;position:absolute;left:0;top:0;width:100%;background:#fff}
        @page{size:A4 portrait;margin:8mm}
      }
    `;
    document.head.appendChild(s);
  }

  function ensureInventoryTab(){
    const tabWrap = document.querySelector('#step-inventario .flex.bg-gray-100');
    if(!tabWrap || document.getElementById('btn-tab-catalogo-marcas')) return;
    const btn = document.createElement('button');
    btn.id = 'btn-tab-catalogo-marcas';
    btn.onclick = ()=>switchInvTab('catalogo_marcas');
    btn.className = 'flex-1 py-2 rounded-xl text-gray-500 text-xs font-black transition-all';
    btn.innerText = 'Catálogo Marcas';
    tabWrap.appendChild(btn);

    const container = document.createElement('div');
    container.id = 'inv-view-catalogo-marcas';
    container.className = 'hidden';
    container.innerHTML = `
      <div class="bg-white p-5 rounded-3xl border-2 border-blue-100 shadow-sm mb-5">
        <div class="flex justify-between items-start gap-3 mb-4">
          <div>
            <h3 class="text-sm font-black text-primary uppercase tracking-tight">Catálogo General por Marca</h3>
            <p class="text-[10px] font-bold text-gray-500 uppercase mt-1">Productos desde nube · venta de ruta</p>
          </div>
          <button onclick="refreshBrandCatalog(true)" class="bg-primary text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase">Actualizar nube</button>
        </div>
        <div class="grid grid-cols-2 gap-3 mb-3">
          <select id="brand-catalog-select" onchange="renderBrandProducts()" class="bg-white border-2 border-gray-100 rounded-2xl px-3 py-3 text-xs font-black text-primary outline-none"></select>
          <input id="brand-catalog-search" oninput="renderBrandProducts()" placeholder="Buscar SKU o descripción" class="bg-white border-2 border-gray-100 rounded-2xl px-3 py-3 text-xs font-black text-primary outline-none">
        </div>
        <div class="grid grid-cols-2 gap-3">
          <button onclick="exportCurrentBrandCatalogPDF()" class="bg-metallic text-white py-3 rounded-xl text-[10px] font-black uppercase shadow-btn border-b-4 border-blue-800">Exportar PDF</button>
          <button onclick="clearBrandCatalogCache()" class="bg-red-50 border-2 border-red-100 text-danger py-3 rounded-xl text-[10px] font-black uppercase">Limpiar Caché</button>
        </div>
      </div>
      <div id="brand-catalog-summary" class="mb-4"></div>
      <div id="brand-catalog-list" class="flex flex-col gap-3 pb-4"></div>
    `;
    document.getElementById('step-inventario').appendChild(container);
  }

  function patchInventoryTabs(){
    if(window.__AEZ_BRAND_CATALOG_R2_PATCHED__) return;
    window.__AEZ_BRAND_CATALOG_R2_PATCHED__ = true;
    if(typeof switchInvTab === 'function'){
      const old = switchInvTab;
      switchInvTab = function(tab){
        ensureInventoryTab();
        if(tab !== 'catalogo_marcas'){
          const v = document.getElementById('inv-view-catalogo-marcas'); if(v) v.classList.add('hidden');
          const b = document.getElementById('btn-tab-catalogo-marcas'); if(b) b.className = 'flex-1 py-2 rounded-xl text-gray-500 text-xs font-black transition-all';
          return old.apply(this, arguments);
        }
        document.getElementById('btn-tab-stock').className = 'flex-1 py-2 rounded-xl text-gray-500 text-xs font-black';
        document.getElementById('btn-tab-kardex').className = 'flex-1 py-2 rounded-xl text-gray-500 text-xs font-black';
        document.getElementById('btn-tab-catalogo-marcas').className = 'flex-1 py-2 rounded-xl bg-white shadow-sm text-xs font-black text-primary transition-all';
        document.getElementById('inv-view-stock').classList.add('hidden');
        document.getElementById('inv-view-kardex').classList.add('hidden');
        document.getElementById('inv-view-catalogo-marcas').classList.remove('hidden');
        refreshBrandCatalog(false);
      };
    }
    if(typeof switchTab === 'function'){
      const oldSwitchTab = switchTab;
      switchTab = function(tab){
        const r = oldSwitchTab.apply(this, arguments);
        if(tab === 'inventario') setTimeout(()=>{ensureInventoryTab(); hideManualFileLoad();}, 0);
        return r;
      };
    }
  }

  function getBrandMap(){
    applyExtrasToProducts();
    const map = new Map();
    if(typeof globalProducts === 'undefined' || !globalProducts?.entries) return map;
    for(const [sku, prod] of globalProducts.entries()){
      const brand = (prod.marca || 'SIN MARCA').trim() || 'SIN MARCA';
      if(!map.has(brand)) map.set(brand, []);
      map.get(brand).push({sku, prod});
    }
    return new Map([...map.entries()].sort((a,b)=>a[0].localeCompare(b[0])));
  }

  window.refreshBrandCatalog = async function(forceCloud=false){
    if(forceCloud || (typeof globalProducts !== 'undefined' && globalProducts.size === 0)) await syncProductsFromCloud(false);
    else applyExtrasToProducts();
    const select = document.getElementById('brand-catalog-select');
    if(!select) return;
    const current = select.value;
    const map = getBrandMap();
    const brands = [...map.keys()];
    select.innerHTML = `<option value="__ALL__">TODAS LAS MARCAS (${brands.length})</option>` + brands.map(b=>`<option value="${b.replace(/"/g,'&quot;')}">${b} (${map.get(b).length})</option>`).join('');
    if(current && [...select.options].some(o=>o.value===current)) select.value = current;
    renderBrandProducts();
  };

  window.renderBrandProducts = function(){
    const list = document.getElementById('brand-catalog-list');
    const summary = document.getElementById('brand-catalog-summary');
    const select = document.getElementById('brand-catalog-select');
    if(!list || !summary || !select) return;
    const brandFilter = select.value || '__ALL__';
    const q = (document.getElementById('brand-catalog-search')?.value || '').toLowerCase().trim();
    const map = getBrandMap();
    let items = [];
    for(const [brand, arr] of map.entries()){
      if(brandFilter !== '__ALL__' && brand !== brandFilter) continue;
      arr.forEach(x=>items.push({...x, brand}));
    }
    items = items.filter(({sku,prod,brand}) => !q || sku.toLowerCase().includes(q) || (prod.descripcion||'').toLowerCase().includes(q) || brand.toLowerCase().includes(q));
    const brandCount = brandFilter === '__ALL__' ? map.size : 1;
    summary.innerHTML = `<div class="brand-cat-card flex justify-between items-center"><div><div class="text-xs font-black text-primary uppercase">${brandFilter==='__ALL__'?'Catálogo general':brandFilter}</div><div class="text-[10px] font-bold text-gray-500 uppercase mt-1">${items.length} productos · ${brandCount} marca(s)</div></div><span class="brand-cat-chip">Nube / Caché</span></div>`;
    if(!items.length){ list.innerHTML = `<div class="brand-cat-card text-center text-[10px] font-bold text-gray-400 uppercase">Sin productos para mostrar. Presiona Actualizar nube.</div>`; return; }
    list.innerHTML = items.slice(0,150).map(({sku,prod,brand})=>productCardHTML(sku, prod, brand)).join('') + (items.length>150 ? `<div class="brand-cat-card text-center text-[10px] font-bold text-gray-400 uppercase">Mostrando 150 de ${items.length}. Usa búsqueda para filtrar.</div>` : '');
  };

  function productCardHTML(sku, prod, brand){
    const stock = (typeof localStock !== 'undefined' && localStock) ? (localStock[sku] || 0) : 0;
    const img = getProductImage(prod, sku);
    const logo = prod.urlMarca ? `<img src="${prod.urlMarca}" class="brand-cat-logo" onerror="this.outerHTML='${fallbackBrandLogo(brand).replace(/'/g,"\\'")}'">` : fallbackBrandLogo(brand);
    const c1 = prod.caracteristica1 || '';
    const c2 = prod.caracteristica2 || '';
    return `
      <div class="brand-cat-card">
        <div class="flex justify-between items-start gap-3 mb-3">
          <div class="flex items-center gap-3 min-w-0">
            <img src="${img}" class="brand-cat-img" onerror="this.src='https://placehold.co/160x160/f1f5f9/94a3b8?text=S/I'">
            <div class="min-w-0">
              <div class="text-sm font-black text-primary">${sku}</div>
              <div class="text-[10px] font-bold text-gray-500 uppercase line-clamp-2">${prod.descripcion || 'SIN DESCRIPCIÓN'}</div>
              <div class="flex gap-1 flex-wrap mt-2"><span class="brand-cat-chip">${stock} disp.</span><span class="brand-cat-chip">${money(prod.precioLista||0)}</span></div>
            </div>
          </div>
          <div class="shrink-0">${logo}</div>
        </div>
        ${(c1||c2) ? `<div class="flex flex-col gap-1 mb-3">${c1?`<div class="brand-cat-line">${c1}</div>`:''}${c2?`<div class="brand-cat-line">${c2}</div>`:''}</div>` : ''}
        <div class="grid grid-cols-2 gap-2">
          <button onclick="openBrandProductDetail('${sku.replace(/'/g,"\\'")}')" class="bg-gray-50 border-2 border-gray-100 text-primary py-2.5 rounded-xl text-[10px] font-black uppercase">Detalle</button>
          <button onclick="addProduct('${sku.replace(/'/g,"\\'")}'); showAlert('Producto agregado al carrito.');" class="bg-metallic text-white py-2.5 rounded-xl text-[10px] font-black uppercase shadow-btn border-b-4 border-blue-800">Agregar</button>
        </div>
      </div>`;
  }

  window.openBrandProductDetail = function(sku){
    const prod = globalProducts.get(sku);
    if(!prod){ show('Producto no encontrado.'); return; }
    show(`${sku} · ${prod.descripcion || ''}`, 5000);
  };

  window.clearBrandCatalogCache = function(){
    if(!confirm('¿Limpiar caché del catálogo por marca?')) return;
    localStorage.removeItem(EXTRA_KEY);
    localStorage.removeItem(CLOUD_PRODUCTS_CACHE_KEY);
    show('Caché de catálogo limpiada. Presiona Actualizar nube.');
    refreshBrandCatalog(false);
  };

  window.exportCurrentBrandCatalogPDF = function(){
    const brand = document.getElementById('brand-catalog-select')?.value || '__ALL__';
    const q = (document.getElementById('brand-catalog-search')?.value || '').toLowerCase().trim();
    const map = getBrandMap();
    let items = [];
    for(const [b, arr] of map.entries()){
      if(brand !== '__ALL__' && b !== brand) continue;
      arr.forEach(x=>items.push({...x, brand:b}));
    }
    items = items.filter(({sku,prod,brand}) => !q || sku.toLowerCase().includes(q) || (prod.descripcion||'').toLowerCase().includes(q) || brand.toLowerCase().includes(q));
    if(!items.length){ show('No hay productos para exportar.'); return; }
    buildPdfArea(items, brand);
    setTimeout(()=>window.print(), 300);
  };

  function buildPdfArea(items, brand){
    let area = document.getElementById('brand-catalog-pdf-area');
    if(!area){ area = document.createElement('div'); area.id='brand-catalog-pdf-area'; document.body.appendChild(area); }
    const title = brand==='__ALL__' ? 'Catálogo General por Marca' : `Catálogo Marca: ${brand}`;
    const chunks = [];
    for(let i=0;i<items.length;i+=9) chunks.push(items.slice(i,i+9));
    area.innerHTML = chunks.map((chunk,idx)=>`
      <section style="font-family:Inter,Arial,sans-serif;page-break-after:${idx<chunks.length-1?'always':'auto'};padding:4mm 2mm;background:#fff;color:#111827">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #0A2558;padding-bottom:8px;margin-bottom:10px">
          <div><h1 style="margin:0;color:#0A2558;font-size:22px;font-weight:900;text-transform:uppercase">Auto Eléctrica Zendejas</h1><div style="font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase">${title}</div></div>
          <div style="font-size:10px;font-weight:900;color:#64748b;text-transform:uppercase;text-align:right">Página ${idx+1} de ${chunks.length}<br>${new Date().toLocaleDateString('es-MX')}</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:9px">${chunk.map(x=>pdfCardHTML(x.sku,x.prod,x.brand)).join('')}</div>
        <div style="border-top:1px solid #e5e7eb;margin-top:10px;padding-top:6px;font-size:8px;font-weight:800;color:#64748b;text-transform:uppercase;display:flex;justify-content:space-between"><span>* Precios sujetos a cambio sin previo aviso</span><span>Catálogo de apoyo para venta en ruta</span></div>
      </section>`).join('');
  }

  function pdfCardHTML(sku, prod, brand){
    const img = getProductImage(prod, sku);
    const c1 = prod.caracteristica1 || '';
    const c2 = prod.caracteristica2 || '';
    const stock = (typeof localStock !== 'undefined' && localStock) ? (localStock[sku] || 0) : 0;
    const logo = prod.urlMarca ? `<img src="${prod.urlMarca}" style="max-width:62px;max-height:28px;object-fit:contain">` : `<span style="font-size:8px;font-weight:900;color:#64748b;text-transform:uppercase">${brand}</span>`;
    return `<div style="border:1px solid #cbd5e1;border-radius:10px;padding:9px;min-height:225px;break-inside:avoid;background:white;overflow:hidden">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;height:30px"><b style="color:#0A2558;font-size:14px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:2px 6px">${sku}</b>${logo}</div>
      <div style="height:82px;display:flex;align-items:center;justify-content:center;margin:5px 0"><img src="${img}" style="max-width:100%;max-height:78px;object-fit:contain"></div>
      <div style="font-size:9.5px;font-weight:800;color:#111827;text-transform:uppercase;line-height:1.25;height:34px;overflow:hidden">${prod.descripcion||''}</div>
      ${c1?`<div style="font-size:7.5px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:5px;padding:3px;margin-top:5px;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c1}</div>`:''}
      ${c2?`<div style="font-size:7.5px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:5px;padding:3px;margin-top:4px;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c2}</div>`:''}
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:8px;border-top:1px solid #f1f5f9;padding-top:6px"><div><div style="font-size:7px;font-weight:900;color:#94a3b8;text-transform:uppercase">Precio</div><div style="font-size:16px;font-weight:900;color:#0A2558">${money(prod.precioLista||0)}</div></div><div style="font-size:8px;font-weight:900;color:${stock>0?'#057A55':'#64748b'};background:${stock>0?'#DEF7EC':'#f8fafc'};border-radius:6px;padding:3px 5px;text-transform:uppercase">${stock} disp.</div></div>
    </div>`;
  }

  async function init(){
    injectStyles();
    hideManualFileLoad();
    patchInventoryTabs();
    ensureInventoryTab();
    await syncProductsFromCloud(true);
    applyExtrasToProducts();
    setTimeout(()=>{hideManualFileLoad(); ensureInventoryTab(); applyExtrasToProducts();},1000);
    console.log(`%c${E_VERSION} activo`, 'color:#0A2558;font-weight:bold');
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
