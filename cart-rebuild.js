(function(){
  const $=id=>document.getElementById(id);
  function makeChoiceModal(){
    let modal=$('cartOrderModal');
    if(modal)return modal;
    modal=document.createElement('div');modal.id='cartOrderModal';modal.className='modal cart-order-rebuilt';modal.hidden=true;
    modal.innerHTML='<div class="modal-card order-card"><button type="button" class="close cart-order-close">×</button><div class="order-head"><div><span class="pill">3D PEINTURES</span><h2>Bon de commande</h2></div></div><div class="order-form"><label>بحث على الزبون<input id="cartOrderSearch" type="search" placeholder="كتب أول حروف من اسم الزبون"><div id="cartOrderResults" class="customer-results"></div></label><label>الزبون المختار<select id="cartOrderCustomer"><option value="">بدون زبون محدد</option></select></label><label>طريقة الأداء<select id="cartOrderPayment"><option value="عند الاستلام">الأداء عند الاستلام</option><option value="15 يوم">مدة الاستخلاص 15 يوم</option><option value="30 يوم">مدة الاستخلاص 30 يوم</option></select></label><div class="order-preview-title">تفاصيل الطلبية</div><div id="cartOrderPreview" class="order-preview-items"></div><div id="cartOrderTotal" class="order-preview-total"></div><button type="button" id="cartOrderConfirm" class="primary-btn">إنشاء وإرسال Bon de commande</button></div></div>';
    document.body.appendChild(modal);
    modal.querySelector('.cart-order-close').onclick=()=>{modal.hidden=true};
    $('cartOrderSearch').oninput=renderCustomers;
    $('cartOrderCustomer').onchange=()=>{$('cartOrderSearch').value=$('cartOrderCustomer').value};
    $('cartOrderConfirm').onclick=confirmOrder;
    return modal;
  }
  function clients(){return typeof window.getCommercialClients==='function'?window.getCommercialClients():[]}
  function renderCustomers(){const q=String($('cartOrderSearch').value||'').trim().toLowerCase(),all=clients(),matches=all.filter(c=>String(c.name||c.client||c.fullName||'').toLowerCase().includes(q));$('cartOrderCustomer').innerHTML='<option value="">بدون زبون محدد</option>'+all.map(c=>{const n=c.name||c.client||c.fullName||'';return `<option value="${String(n).replace(/"/g,'&quot;')}">${n}${c.city?' · '+c.city:''}</option>`}).join('');$('cartOrderResults').innerHTML=q?matches.map(c=>{const n=c.name||c.client||c.fullName||'';return `<button type="button" class="customer-result" data-rebuilt-customer="${String(n).replace(/"/g,'&quot;')}">${n}${c.city?' · '+c.city:''}</button>`}).join('')||'<small>ما لقيتش زبون بهاد الحروف</small>':'';document.querySelectorAll('[data-rebuilt-customer]').forEach(b=>b.onclick=()=>{$('cartOrderCustomer').value=b.dataset.rebuiltCustomer;$('cartOrderSearch').value=b.dataset.rebuiltCustomer;$('cartOrderResults').innerHTML=''})}
  function openChoice(){const modal=makeChoiceModal();if(typeof window.renderCommercialOrderPreview==='function')window.renderCommercialOrderPreview();const old=$('orderPreviewItems'),total=$('orderPreviewTotal');if(old&&$('cartOrderPreview'))$('cartOrderPreview').innerHTML=old.innerHTML;if(total&&$('cartOrderTotal'))$('cartOrderTotal').textContent=total.textContent;renderCustomers();$('cartOrderPayment').value='عند الاستلام';$('cartOrderSearch').value='';$('cartOrderResults').innerHTML='';modal.hidden=false;modal.style.display='grid';modal.style.zIndex='1200';const panel=$('cartPanel'),shade=$('shade');if(panel)panel.classList.remove('open');if(shade)shade.hidden=true;setTimeout(()=>$('cartOrderSearch').focus(),40)}
  function confirmOrder(){const name=$('cartOrderCustomer').value||'بدون زبون',payment=$('cartOrderPayment').value||'عند الاستلام';window.currentPaymentMethod=payment;$('cartOrderModal').hidden=true;if(typeof window.makeOrderImage==='function')window.makeOrderImage(name);}
  document.addEventListener('click',function(e){const btn=e.target.closest&&e.target.closest('#saveOrder');if(!btn)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();openChoice()},true);
  document.addEventListener('click',function(e){
    const close=e.target.closest&&e.target.closest('.cart-order-close,#cartOrderModal .close');
    if(!close)return;
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    const modal=$('cartOrderModal');if(modal){modal.hidden=true;modal.style.display='none';modal.style.visibility='hidden';}
    const panel=$('cartPanel'),shade=$('shade');if(panel)panel.classList.remove('open');if(shade)shade.hidden=true;
  },true);
})();
