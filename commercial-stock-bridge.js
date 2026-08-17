(() => {
  'use strict';
  const getId = id => document.getElementById(id);
  const escText = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  const moneyText = value => Number(value || 0).toLocaleString('fr-FR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const normalize = value => String(value || '').trim().toLowerCase();
  const categoriesFallback = ['PRODUITS','ESSENCE JUPITER','DILUANT','COLLE','PEINTURE'];
  let stockRows = [];

  function stockStatus(row) {
    return Number(row.total_pieces || 0) > Number(row.minimum_stock || 0);
  }

  function existingProduct(row) {
    const code = normalize(row.product_code);
    return Array.isArray(window.products) ? window.products.find(item => normalize(item.code || item.productCode) === code) : null;
  }

  function categoryFor(row) {
    const value = String(row.category || '').trim();
    return value || 'PRODUITS';
  }

  function cardHtml(row, old) {
    const name = String(row.product_name || old?.name || 'منتوج جديد');
    const code = String(row.product_code || old?.code || '');
    const category = categoryFor(row);
    const image = row.image_url || old?.image || '';
    const available = stockStatus(row);
    const price = old?.price ?? 0;
    const perBox = Number(row.pieces_per_box || old?.qty || 0);
    return `<article class="card flip-card stock-direct-card" data-id="stock-${escText(row.id)}" data-stock-code="${escText(code)}">
      <div class="flip-card-inner">
        <div class="flip-face flip-front">
          <div class="photo ${available ? '' : 'is-unavailable'}">
            ${image ? `<img src="${escText(image)}" alt="${escText(name)}" loading="lazy" decoding="async">` : '<div class="no-photo">3D</div>'}
            <span class="badge">${escText(category)}</span>
            ${available ? '<div class="stock-available-label">متوفر</div>' : '<div class="unavailable-card-overlay"><span>غير متوفر حاليا</span></div>'}
          </div>
          <div class="card-body">
            <div class="flip-front-kicker">3D PEINTURES · PRODUIT</div>
            <h3>${escText(name)}</h3>
            <div class="product-code-line">Code : <b>${escText(code || '—')}</b></div>
            <div class="price">${moneyText(price)} <small>درهم / قطعة</small></div>
            <div class="stock-direct-meta">${perBox ? `${perBox} قطعة في العلبة` : 'معلومات الكمية عند رئيس المخزن'}</div>
          </div>
        </div>
      </div>
    </article>`;
  }

  function renderDirectProducts() {
    const grid = getId('grid');
    const empty = getId('empty');
    const carousel = getId('catalogCarousel');
    if (!grid) return;
    const active = normalize(getId('sectionTitle')?.textContent || 'PRODUITS');
    const query = normalize(getId('productSearch')?.value || '');
    const rows = stockRows.filter(row => {
      const category = normalize(categoryFor(row));
      const matchesCategory = !active || active === 'produits' || category === active;
      const text = `${row.product_name || ''} ${row.product_code || ''}`.toLowerCase();
      return matchesCategory && (!query || text.includes(query));
    });
    grid.innerHTML = rows.map(row => cardHtml(row, existingProduct(row))).join('');
    if (empty) empty.style.display = rows.length ? 'none' : 'block';
    if (carousel) carousel.style.display = rows.length ? '' : 'none';
    grid.querySelectorAll('.stock-direct-card').forEach(card => {
      card.style.opacity = '1';
      card.style.pointerEvents = 'auto';
      card.style.position = 'relative';
      card.style.left = 'auto';
      card.style.top = 'auto';
      card.style.transform = 'none';
    });
    const count = getId('count');
    if (count) count.textContent = `${rows.length} produit${rows.length !== 1 ? 's' : ''}`;
  }

  async function loadStockProducts() {
    const config = window.STOCK_CONFIG || {};
    if (!window.supabase || !config.url || !config.anonKey) return;
    const client = window.supabase.createClient(config.url, config.anonKey);
    const result = await client.from('stock_products').select('id,product_name,product_code,category,pieces_per_box,total_pieces,minimum_stock,image_url,updated_at').order('product_name');
    if (result.error) throw result.error;
    stockRows = Array.isArray(result.data) ? result.data : [];
    renderDirectProducts();
  }

  const style = document.createElement('style');
  style.textContent = `
    .catalog-carousel .carousel-stage { min-height: 0 !important; height: auto !important; overflow: visible !important; }
    .catalog-carousel .carousel-ring { position: relative !important; display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 14px !important; min-height: 0 !important; }
    .catalog-carousel .stock-direct-card { position: relative !important; inset: auto !important; width: auto !important; height: auto !important; min-height: 340px; transform: none !important; opacity: 1 !important; pointer-events: auto !important; }
    .stock-direct-card .flip-card-inner { transform: none !important; }
    .stock-direct-card .flip-face { position: relative !important; min-height: 100%; backface-visibility: visible !important; }
    .stock-direct-card .photo { min-height: 190px; }
    .stock-available-label { position: absolute; top: 10px; right: 10px; z-index: 4; background: #d9f7e7; color: #087443; border-radius: 999px; padding: 7px 12px; font-weight: 900; animation: stockPulse 1.8s infinite; }
    .stock-direct-meta { margin-top: 8px; color: #667085; font-size: 12px; }
    @keyframes stockPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.04); } }
    @media (max-width: 520px) { .catalog-carousel .carousel-ring { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 9px !important; } .catalog-carousel .stock-direct-card { min-height: 300px; } .stock-direct-card .photo { min-height: 150px; } }
  `;
  document.head.appendChild(style);

  document.addEventListener('click', event => {
    if (event.target.closest('.cat')) setTimeout(renderDirectProducts, 0);
  });
  document.addEventListener('input', event => {
    if (event.target && event.target.id === 'productSearch') renderDirectProducts();
  });

  window.addEventListener('load', async () => {
    try {
      await loadStockProducts();
      setInterval(() => loadStockProducts().catch(error => console.warn('Stock refresh failed', error)), 30000);
    } catch (error) {
      console.warn('Direct stock bridge failed', error);
      const empty = getId('empty');
      if (empty) { empty.style.display = 'block'; empty.textContent = 'ما قدرناش نحملو المنتجات من المخزون. تحقق من الاتصال وتحديث الصفحة.'; }
    }
  });
})();
