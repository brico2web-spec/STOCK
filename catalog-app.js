const KEY="3d_peintures_catalog_v3";
const CATALOG_LAST_UPDATE_KEY="3d_peintures_catalog_last_update_v1";
const categories=["PRODUITS","ESSENCE JUPITER","DILUANT","COLLE","PEINTURE"];
function canonicalCategory(value){
 const normalized=String(value||"").trim().toUpperCase();
 return categories.find(c=>c.toUpperCase()===normalized)||categories[0];
}
let products=JSON.parse(localStorage.getItem(KEY)||"[]");
let active=categories[0], selectedImage="", selectedProductId=null, viewerBoxQty=0;
let carouselIndex=0, carouselStartX=null, carouselStartY=null, carouselMoved=false;
let focusProductId=null;
let cart=JSON.parse(localStorage.getItem("3d_peintures_cart_v4")||"[]");
let orders=JSON.parse(localStorage.getItem("3d_peintures_orders_v1")||"[]");
const COLLECTIONS_CYCLE_KEY="3d_peintures_collections_cycle_v1";
const COLLECTIONS_HISTORY_KEY="3d_peintures_collections_history_v1";
const ORDERS_AUTO_ARCHIVE_KEY="3d_peintures_orders_auto_archive_v1";
const COLLECTIONS_AUTO_ARCHIVE_KEY="3d_peintures_collections_auto_archive_v1";
const COMPANY_INVOICES_KEY="3d_peintures_company_invoices_v1";
const AUTO_ARCHIVE_INTERVAL_MS=24*60*60*1000;
const $=id=>document.getElementById(id);
function storageJson(key,fallback=[]){try{const value=JSON.parse(localStorage.getItem(key)||"null");return value??fallback}catch(err){return fallback}}
function saveStorageJson(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch(err){console.warn("Archive storage failed",err);return false}}
function autoArchiveSnapshot(){
 const ordersArchive=storageJson(ORDERS_AUTO_ARCHIVE_KEY,[]),collectionsArchive=storageJson(COLLECTIONS_AUTO_ARCHIVE_KEY,[]),now=Date.now();
 const latestOrders=ordersArchive[0],latestCollections=collectionsArchive[0];
 const shouldOrders=!latestOrders||now-Number(latestOrders.createdAtMs||0)>=AUTO_ARCHIVE_INTERVAL_MS;
 const shouldCollections=!latestCollections||now-Number(latestCollections.createdAtMs||0)>=AUTO_ARCHIVE_INTERVAL_MS;
 if(shouldOrders&&Array.isArray(orders)&&orders.length){
  let sales=0,paid=0,due=0;orders.forEach(order=>{const state=recalculateOrderPaymentState(order);sales+=Number(order.total)||0;paid+=Number(state.paid)||0;due+=Number(state.due)||0});
  ordersArchive.unshift({id:makeId(),createdAtMs:now,createdAt:new Date(now).toISOString(),count:orders.length,sales,paid,due,orders:JSON.parse(JSON.stringify(orders))});
  saveStorageJson(ORDERS_AUTO_ARCHIVE_KEY,ordersArchive.slice(0,30));
 }
 if(shouldCollections){
  const start=typeof collectionCycleStart==="function"?collectionCycleStart():"",rows=typeof collectionTrackerRows==="function"?collectionTrackerRows(start):[],totals=typeof collectionTotals==="function"?collectionTotals(rows):{installmentsTotal:0,priceChangesTotal:0,installmentRows:[],priceChangeRows:[]};
  if(rows.length){collectionsArchive.unshift({id:makeId(),createdAtMs:now,createdAt:new Date(now).toISOString(),rows:JSON.parse(JSON.stringify(rows)),orderDetails:collectionArchiveOrderDetails(),installmentsTotal:Number(totals.installmentsTotal)||0,priceChangesTotal:Number(totals.priceChangesTotal)||0});saveStorageJson(COLLECTIONS_AUTO_ARCHIVE_KEY,collectionsArchive.slice(0,30))}
 }
}
function renderOrdersAutoArchiveHistory(){
 const list=$("ordersArchiveHistory"),empty=$("ordersArchiveHistoryEmpty");if(!list||!empty)return;const archives=storageJson(ORDERS_AUTO_ARCHIVE_KEY,[]);empty.style.display=archives.length?"none":"block";list.innerHTML=archives.map((item,index)=>`<div class="auto-archive-row"><div><b>أرشيف الطلبيات رقم ${archives.length-index}</b><small>${formatPaymentDate(item.createdAt)} · ${Number(item.count)||0} كوموند</small></div><div><strong>${money(item.sales||0)} درهم</strong><small>خلص ${money(item.paid||0)} · باقي ${money(item.due||0)}</small></div></div>`).join("")}
function collectionArchiveOrderDetails(){
 return (Array.isArray(orders)?orders:[]).map(order=>{
  let state={paid:Number(order.paid)||0,due:Number(order.due)||Math.max(0,(Number(order.total)||0)-(Number(order.paid)||0))};
  try{state=recalculateOrderPaymentState(order)}catch(err){}
  return {id:order.id,client:String(order.client||"Client").trim()||"Client",company:order.company||"",orderCode:order.orderCode||"",date:order.date||order.updatedAt||"",updatedAt:order.updatedAt||"",total:Number(order.total)||0,paid:Number(state.paid)||0,due:Number(state.due)||0,status:order.status||"",paymentTermMode:order.paymentTermMode||"",paymentTermDays:order.paymentTermDays||"",items:(Array.isArray(order.items)?order.items:[]).map(item=>({name:item.name||item.productName||item.code||"منتوج",code:item.code||item.productCode||"",boxes:Number(item.boxes??item.qtyBoxes??0)||0,units:Number(item.deliveredUnits??item.units??item.paidUnits??item.quantity??item.qty??0)||0,unitPrice:Number(item.unitPrice??item.price??0)||0,lineTotal:Number(item.lineTotal??item.total??0)||0})),payments:getPaymentHistory(order).map(payment=>({amount:Number(payment.amount)||0,date:payment.date||order.date||""})),priceChanges:getPriceChangeHistory(order).map(change=>({productName:change.productName||"منتوج",oldPrice:Number(change.oldPrice)||0,newPrice:Number(change.newPrice)||0,adjustment:priceChangeAdjustment(order,change),date:change.date||order.updatedAt||order.date||""})),discounts:typeof getDiscountHistory==="function"?getDiscountHistory(order).map(item=>({amount:Number(item.amount)||0,date:item.date||order.updatedAt||order.date||""})):[],returns:typeof getReturnHistory==="function"?getReturnHistory(order).map(item=>({productName:item.productName||"منتوج",productCode:item.productCode||"",quantity:Number(item.quantity)||0,unitPrice:Number(item.unitPrice)||0,amount:Number(item.amount)||0,date:item.date||order.updatedAt||order.date||""})):[]};
 });
}
function renderCollectionsArchiveOrderDetails(item){
 const source=Array.isArray(item.orderDetails)?item.orderDetails:(Array.isArray(item.orders)?item.orders:[]),groups=new Map();
 source.forEach(order=>{const key=normalizeClientSearch(order.client)||"client",group=groups.get(key)||{client:order.client||"Client",orders:[]};group.orders.push(order);groups.set(key,group)});
 if(!groups.size)return '<div class="auto-archive-details-empty">تفاصيل الكوموندات ما كانتش محفوظة فهاد الأرشيف القديم.</div>';
 const groupHtml=[...groups.values()].map(group=>{
  const orderHtml=group.orders.map(order=>{
   const items=Array.isArray(order.items)?order.items:[];
   const itemsText=items.length?items.map(item=>esc(item.name||item.productName||item.code||"منتوج")+" × "+(Number(item.units??item.deliveredUnits??item.paidUnits??item.quantity??item.qty??0)||0)).join(" · "):"ما تسجل حتى منتوج";
   const payments=Array.isArray(order.payments)?order.payments:[],changes=Array.isArray(order.priceChanges)?order.priceChanges:[],discounts=Array.isArray(order.discounts)?order.discounts:[],returns=Array.isArray(order.returns)?order.returns:[];
   let operations="";
   if(payments.length)operations+='<small class="auto-archive-order-operations">الأقساط: '+payments.map(payment=>money(payment.amount||0)+' درهم').join(" · ")+'</small>';
   if(changes.length)operations+='<small class="auto-archive-order-operations">تغييرات الأثمنة: '+changes.length+' عملية</small>';
   if(discounts.length)operations+='<small class="auto-archive-order-operations">التخفيضات: '+discounts.map(discount=>money(discount.amount||0)+' درهم').join(" · ")+'</small>';
   if(returns.length)operations+='<small class="auto-archive-order-operations">الإرجاعات: '+returns.map(item=>(esc(item.productName||"منتوج")+' · '+(Number(item.quantity)||0)+' قطعة · −'+money(item.amount||0)+' درهم')).join(" | ")+'</small>';
   const term=order.paymentTermDays?' · أجل '+order.paymentTermDays+' يوم':'';
   return '<div class="auto-archive-order-detail"><div class="auto-archive-order-head"><div><b>كوموند '+esc(order.orderCode||"بدون رقم")+'</b><small>'+formatPaymentDate(order.date||order.updatedAt)+term+'</small></div><strong>'+money(order.total||0)+' درهم</strong></div><div class="auto-archive-order-money">الخلاص '+money(order.paid||0)+' درهم · الباقي '+money(order.due||0)+' درهم</div><div class="auto-archive-order-items">المنتوجات: '+itemsText+'</div>'+operations+'</div>';
  }).join("");
  return '<details class="auto-archive-client"><summary><b>'+esc(group.client)+'</b><small>'+group.orders.length+' كوموند</small></summary><div class="auto-archive-client-orders">'+orderHtml+'</div></details>';
 }).join("");
 return '<div class="auto-archive-client-details">'+groupHtml+'</div>';
}
function renderCollectionsAutoArchiveHistory(){
 const list=$("collectionsArchiveHistory"),empty=$("collectionsArchiveHistoryEmpty");if(!list||!empty)return;const archives=storageJson(COLLECTIONS_AUTO_ARCHIVE_KEY,[]);empty.style.display=archives.length?"none":"block";list.innerHTML=archives.map((item,index)=>`<div class="auto-archive-row auto-archive-collections-row"><div><b>أرشيف المستخلاصات رقم ${archives.length-index}</b><small>${formatPaymentDate(item.createdAt)} · ${(item.rows||[]).length} عملية · ${Array.isArray(item.orderDetails)?item.orderDetails.length:(Array.isArray(item.orders)?item.orders.length:0)} كوموند</small></div><div><strong>${money(item.installmentsTotal||0)} درهم</strong><small>تغييرات الأثمنة ${money(item.priceChangesTotal||0)} درهم</small></div>${renderCollectionsArchiveOrderDetails(item)}</div>`).join("")}

function updateAutoArchiveLabels(){const ordersLabel=$("ordersArchiveNextLabel"),collectionsLabel=$("collectionsArchiveNextLabel"),labels=[ordersLabel,collectionsLabel].filter(Boolean);const latest=Math.max(Number(storageJson(ORDERS_AUTO_ARCHIVE_KEY,[])[0]?.createdAtMs||0),Number(storageJson(COLLECTIONS_AUTO_ARCHIVE_KEY,[])[0]?.createdAtMs||0));const text=latest?`الأرشيف المقبل بعد ${Math.max(0,Math.ceil((AUTO_ARCHIVE_INTERVAL_MS-(Date.now()-latest))/3600000))} ساعة`:`أول أرشيف عند توفر البيانات`;labels.forEach(label=>label.textContent=text)}
products.forEach(p=>{if(p.costPrice==null)p.costPrice=0});

function save(){try{localStorage.setItem(KEY,JSON.stringify(products));localStorage.setItem(CATALOG_LAST_UPDATE_KEY,new Date().toISOString());return true}catch(err){console.error(err);toast(err&&err.name==="QuotaExceededError"?"Mémoire pleine : image trop grande.":"Impossible d'enregistrer le produit");return false}}
function catalogLastUpdate(){return localStorage.getItem(CATALOG_LAST_UPDATE_KEY)||""}
function makeId(){try{if(window.crypto&&typeof crypto.randomUUID==="function")return crypto.randomUUID()}catch(e){}return "p_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,10)}
function shortFilePart(value,fallback="Client"){
 const clean=String(value||fallback).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^\p{L}\p{N}]+/gu,"_").replace(/^_+|_+$/g,"").slice(0,42);
 return clean||fallback;
}
function shortFileDate(value=new Date()){
 const d=value instanceof Date?value:new Date(value);if(Number.isNaN(d.getTime()))return shortFileDate(new Date());
 return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function pdfFileName(type,client,date=new Date()){
 const base=shortFilePart(type,"PDF"),day=shortFileDate(date),person=client?`_${shortFilePart(client,"Client")}`:"";
 return `${base}_${day}${person}.pdf`;
}
function normalizeProductCode(value){return String(value||"").trim().toUpperCase().replace(/\s+/g,"")}
function productCode(p){return normalizeProductCode(p?.code||p?.productCode||"")}
function compressImage(file,maxSide=1000,quality=.78){return new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=()=>reject(new Error("Lecture impossible"));r.onload=e=>{const img=new Image();img.onerror=()=>reject(new Error("Image invalide"));img.onload=()=>{const ow=img.naturalWidth||img.width,oh=img.naturalHeight||img.height,s=Math.min(1,maxSide/Math.max(ow,oh)),w=Math.max(1,Math.round(ow*s)),h=Math.max(1,Math.round(oh*s)),c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d").drawImage(img,0,0,w,h);resolve(c.toDataURL("image/webp",quality))};img.src=e.target.result};r.readAsDataURL(file)})}
function saveCart(){localStorage.setItem("3d_peintures_cart_v4",JSON.stringify(cart));renderCart()}
function isAvailable(p){ return p && p.availability !== "unavailable"; }
function unavailableText(){ return "غير متوفر حاليا حالياً — هاد المنتوج غير متوفر حالياً"; }
function hasPromo10Plus1(p){ return !!(p && (p.promo10Plus1===true || p.promo10Plus1==="true")); }
function promoForBoxes(p, boxes){
 const paidBoxes=Math.max(0,Math.floor(Number(boxes)||0));
 const unitsPerBox=Math.max(0,Math.floor(Number(p?.qty)||0));
 const paidUnits=paidBoxes*unitsPerBox;
 const freeUnits=hasPromo10Plus1(p)?Math.floor(paidUnits/10):0;
 return {enabled:hasPromo10Plus1(p),paidBoxes,unitsPerBox,paidUnits,freeUnits,deliveredUnits:paidUnits+freeUnits};
}
function promoLabel(p, boxes){
 const info=promoForBoxes(p,boxes);
 return info.enabled?`10 + 1 Gratuit · +${info.freeUnits} pièce(s) offerte(s) dès ${info.paidUnits} pièce(s)`:"";
}
function priceTiersFor(p){
 const raw=Array.isArray(p?.priceTiers)?p.priceTiers:[];
 const parsed=raw.map(tier=>({minQty:Math.max(1,Math.floor(Number(tier?.minQty??tier?.min??0))),maxQty:tier?.maxQty==null||tier?.maxQty===""?null:Math.floor(Number(tier.maxQty)),price:Number(tier?.price)})).filter(tier=>Number.isFinite(tier.price)&&tier.price>=0&&tier.minQty>0);
 if(!parsed.length)return [{minQty:1,maxQty:null,price:Number(p?.price)||0}];
 const merged=new Map();
 parsed.forEach(tier=>merged.set(tier.minQty,tier));
 if(!merged.has(1))merged.set(1,{minQty:1,maxQty:parsed[0].minQty-1,price:Number(p?.price)||0});
 const tiers=[...merged.values()].sort((a,b)=>a.minQty-b.minQty);
 tiers.forEach((tier,index)=>{if(tier.maxQty==null&&tiers[index+1])tier.maxQty=tiers[index+1].minQty-1;if(tier.maxQty!=null&&tier.maxQty<tier.minQty)tier.maxQty=tier.minQty});
 return tiers;
}
function unitPriceForQuantity(p, units){
 const quantity=Math.max(1,Number(units)||1);
 const tiers=priceTiersFor(p);
 const selected=tiers.find(tier=>quantity>=tier.minQty&&(tier.maxQty==null||quantity<=tier.maxQty))||tiers[tiers.length-1];
 return selected.price;
}

function compressDataUrl(data,maxSide=900,quality=.68){
 return new Promise((resolve,reject)=>{
  const img=new Image(); img.onerror=()=>reject(new Error("Image invalide"));
  img.onload=()=>{const ow=img.naturalWidth||img.width,oh=img.naturalHeight||img.height,s=Math.min(1,maxSide/Math.max(ow,oh)),w=Math.max(1,Math.round(ow*s)),h=Math.max(1,Math.round(oh*s)),c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d").drawImage(img,0,0,w,h);resolve(c.toDataURL("image/webp",quality))};
  img.src=data;
 });
}
async function compactProductsImages(){
 for(const p of products){
  if(typeof p.image==="string" && p.image.length>180000){
   try{p.image=await compressDataUrl(p.image)}catch(e){}
  }
 }
}
function addToCart(id, boxes=1){
 const p=products.find(x=>x.id===id); if(!p)return;
 boxes=Math.max(1,Number(boxes)||1);
 if(!isAvailable(p)){toast(unavailableText());return}
 const row=cart.find(x=>x.id===id);
 if(row) row.qty+=boxes;
 else cart.push({id:p.id,qty:boxes});
 saveCart(); toast("Produit ajouté au panier");
}
function cartCount(){return cart.reduce((s,x)=>s+x.qty,0)}
function renderCart(){
 cart=cart.filter(row=>{const p=products.find(x=>x.id===row.id);return p && isAvailable(p);});
 localStorage.setItem("3d_peintures_cart_v4",JSON.stringify(cart));
 $("cartCount").textContent=cartCount();
 const box=$("cartItems"), empty=$("cartEmpty");
 if(!cart.length){box.innerHTML="";empty.style.display="block";$("cartTotal").textContent="0,00 درهم";return}
 empty.style.display="none";
 let total=0;
 box.innerHTML=cart.map(row=>{
   const p=products.find(x=>x.id===row.id); if(!p || !isAvailable(p))return "";
   const info=promoForBoxes(p,row.qty);
   const unitPrice=unitPriceForQuantity(p,info.paidUnits);
   const line=unitPrice*info.paidUnits; total+=line;
   const promoNote=info.enabled
     ? `<span class="cart-promo-note">🎁 10 + 1 Gratuit · +${info.freeUnits} pièce(s) offerte(s)</span><span class="cart-delivery-note">📦 Livré : ${info.deliveredUnits} pièce(s)</span>`
     : "";
   return `<div class="cart-row">
     ${p.image?`<img src="${p.image}" alt="">`:`<div></div>`}
     <div><h4>${esc(p.name)}</h4><small>${money(unitPrice)} درهم / unité · ${p.qty} unités / boîte</small>${promoNote}
       <div class="cart-qty"><button data-minus="${p.id}">−</button><span>${row.qty} boîte${row.qty!==1?"s":""}</span><button data-plus="${p.id}">+</button></div>
     </div><strong>${money(line)} درهم</strong>
   </div>`;
 }).join("");
 $("cartTotal").textContent=`${money(total)} درهم`;
 document.querySelectorAll("[data-plus]").forEach(b=>b.onclick=()=>changeCart(b.dataset.plus,1));
 document.querySelectorAll("[data-minus]").forEach(b=>b.onclick=()=>changeCart(b.dataset.minus,-1));
}
function changeCart(id,d){
 const row=cart.find(x=>x.id===id); if(!row)return;
 row.qty+=d;if(row.qty<=0)cart=cart.filter(x=>x.id!==id);
 saveCart();
}
function openCart(){$("cartDrawer").classList.add("show");$("cartOverlay").classList.add("show");renderCart()}
function closeCart(){$("cartDrawer").classList.remove("show");$("cartOverlay").classList.remove("show")}
function buildOrderMessage(){
 const now=new Date();
 const date=now.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"});
 const time=now.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
 let total=0;
 const lines=[
   "🛍️ COMMANDE — 3D PEINTURES",
   `📅 Date : ${date} à ${time}`,
   "",
   "━━━━━━━━━━━━━━━━━━━━",
   "📦 PRODUITS",
   "━━━━━━━━━━━━━━━━━━━━",
   ""
 ];

 cart.forEach((row,i)=>{
   const p=products.find(x=>x.id===row.id); if(!p)return;
   const boxes=Number(row.qty)||1;
   const info=promoForBoxes(p,boxes);
   const units=info.unitsPerBox||1;
   const unit=unitPriceForQuantity(p,info.paidUnits);
   const line=unit*info.paidUnits;
   total+=line;

   lines.push(`🔹 PRODUIT ${i+1}`);
   lines.push(`🧴 ${p.name}`);
   lines.push(`📦 ${boxes} boîte(s) × ${info.paidUnits} pièces payées`);
   if(info.enabled) lines.push(`🎁 Offre 10 + 1 : +${info.freeUnits} pièce(s) gratuite(s) — total livré ${info.deliveredUnits} pièces`);
   lines.push(`💵 ${money(unit)} درهم / unité`);
   lines.push(`💰 Sous-total : ${money(line)} درهم`);
   lines.push("");
   if(i < cart.length-1){
     lines.push("────────────────────");
     lines.push("");
   }
 });

 lines.push("━━━━━━━━━━━━━━━━━━━━");
 lines.push(`💰 TOTAL : ${money(total)} درهم`);
 lines.push("━━━━━━━━━━━━━━━━━━━━");
 return lines.join("\n");
}
async function sendCartOrder(){
 if(!cart.length){toast("السلة فارغة");return}
 const message=buildOrderMessage();
 const encoded=encodeURIComponent(message);
 // على Android يفتح WhatsApp مباشرة؛ وإذا لم يكن متاحاً يمكن استعمال المشاركة العادية.
 const wa=`https://wa.me/?text=${encoded}`;
 try{
   if(navigator.share){
     await navigator.share({title:"Commande 3D PEINTURES",text:message});
     return;
   }
 }catch(e){}
 window.open(wa,"_blank");
}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function money(v){return Number(v||0).toLocaleString("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2})}
function toast(t){const x=$("toast");x.textContent=t;x.classList.add("show");setTimeout(()=>x.classList.remove("show"),1800)}

function carouselCards(){return Array.from(document.querySelectorAll("#grid .flip-card"))}
function renderCarouselLevelDisplay(){
 const box=$("carouselLevelsDisplay");if(!box)return;
 const cards=carouselCards(),center=cards[carouselIndex],product=center?products.find(p=>String(p.id)===String(center.dataset.id)):null;
 if(!product){box.innerHTML="";box.classList.remove("is-changing");return}
 const tiers=priceTiersFor(product).slice(0,6),discountCount=tiers.length;
 const promo=hasPromo10Plus1(product)?`<div class="levels-display-promo"><span>🎁</span><div><b>عرض خاص: 10 + 1 مجانًا</b><small>عند شراء 10 قطع، تحصل على قطعة إضافية مجانًا</small></div></div>`:"";
 box.innerHTML=`<div class="levels-display-top"><div><small>خصومات الكمية</small></div><span>${discountCount} خصومات</span></div><div class="levels-display-track">${tiers.map((tier,index)=>{const quantity=tier.maxQty==null?`${tier.minQty}+`:`${tier.maxQty}`,total=tier.maxQty==null?"مفتوح":`${tier.maxQty} = ${money(tier.maxQty*tier.price)} درهم`;return `<div class="levels-display-card" style="--level-delay:${index*45}ms"><b>${quantity} قطعة</b><span>${money(tier.price)} درهم / قطعة</span><strong>${total}</strong></div>`}).join("")}</div>${promo}<div class="levels-display-hint">اضغط على السهم للانتقال إلى منتوج آخر · الخصومات والأسعار تتحدث تلقائيًا</div>`;
 box.classList.remove("is-changing");void box.offsetWidth;box.classList.add("is-changing");
}
function renderCarouselPositions(){
 const cards=carouselCards(), total=cards.length;
 if(!total){renderCarouselLevelDisplay();return}
 carouselIndex=((carouselIndex%total)+total)%total;
 const stageWidth=$("carouselStage")?.clientWidth||window.innerWidth;
 const gap=Math.min(340,Math.max(150,stageWidth*.72));
 cards.forEach((card,index)=>{
   let relative=index-carouselIndex;
   if(relative>total/2)relative-=total;
   if(relative<-total/2)relative+=total;
   const distance=Math.abs(relative);
   const visible=distance<=1;
   const scale=relative===0?1:.84;
   const x=relative*gap;
   const tilt=relative===0?0:(relative>0?-18:18);
   card.style.setProperty("--card-x",`${x}px`);
   card.style.setProperty("--card-tilt",`${tilt}deg`);
   card.style.setProperty("--card-scale",scale.toFixed(3));
   card.style.zIndex=String(relative===0?30:20-distance);
   card.style.opacity=visible?(relative===0?1:.72):0;
   card.style.pointerEvents=visible?"auto":"none";
   card.dataset.carouselRelative=String(relative);
   card.classList.toggle("is-center",relative===0);
   card.setAttribute("aria-hidden",relative===0?"false":"true");
 });
 renderCarouselLevelDisplay();
}
function moveCarousel(direction){
 const cards=carouselCards(); if(!cards.length)return;
 carouselIndex=(carouselIndex+direction+cards.length)%cards.length;
 cards.forEach(c=>c.classList.remove("is-flipped"));
 const center=cards[carouselIndex]; if(center){selectedProductId=center.dataset.id;cards.forEach(c=>c.classList.toggle("selected",c===center))}
 renderCarouselPositions();
}
function initProductCarousel(){
 $("carouselPrev")?.addEventListener("click",()=>moveCarousel(-1));
 $("carouselNext")?.addEventListener("click",()=>moveCarousel(1));
 const stage=$("carouselStage"); if(!stage)return;
 stage.addEventListener("pointerdown",e=>{
   if(e.target.closest("button,input,label"))return;
   carouselStartX=e.clientX;carouselStartY=e.clientY;carouselMoved=false;
 });
 stage.addEventListener("pointerup",e=>{
   if(carouselStartX===null)return;
   const dx=e.clientX-carouselStartX,dy=e.clientY-carouselStartY;
   if(Math.abs(dx)>38&&Math.abs(dx)>Math.abs(dy)){moveCarousel(dx<0?1:-1);carouselMoved=true;setTimeout(()=>carouselMoved=false,180)}
   carouselStartX=null;carouselStartY=null;
 });
 stage.addEventListener("pointercancel",()=>{carouselStartX=null;carouselStartY=null});
 window.addEventListener("resize",()=>renderCarouselPositions());
}

function focusUnitsPerBox(){
 const p=products.find(x=>x.id===focusProductId);return Math.max(1,Math.floor(Number(p?.qty)||1));
}
function updateFocusCalculation(){
 const p=products.find(x=>x.id===focusProductId); if(!p)return;
 const boxes=Math.max(1,Math.min(999,Math.floor(Number($("focusQty")?.value)||1))),unitsPerBox=Math.max(1,Math.floor(Number(p.qty)||1));
 const info=promoForBoxes(p,boxes);
 $("focusQty").value=String(boxes);$("focusPieces").value=String(info.paidUnits);
 $("focusBoxesTotal").textContent=String(info.paidBoxes);
 $("focusUnitsTotal").textContent=String(info.paidUnits);
  $("focusTotalPrice").textContent=money(unitPriceForQuantity(p,info.paidUnits)*info.paidUnits);
}
function setFocusQty(value){
 const next=Math.max(1,Math.min(999,Math.floor(Number(value)||1)));
 $("focusQty").value=String(next); updateFocusCalculation();
}
function setFocusPieces(value){
 const unitsPerBox=focusUnitsPerBox(),pieces=Math.max(1,Math.floor(Number(value)||unitsPerBox)),boxes=Math.max(1,Math.min(999,Math.ceil(pieces/unitsPerBox)));
 $("focusQty").value=String(boxes);updateFocusCalculation();
}
function openProductFocus(id){
 const p=products.find(x=>x.id===id); if(!p)return;
 focusProductId=id; selectedProductId=id;
 const available=isAvailable(p);
 $("focusImage").src=p.image||""; $("focusImage").alt=p.name||"";
 $("focusCategory").textContent=p.category||"PRODUIT";
 $("focusName").textContent=p.name||"Produit";
 $("focusCode").textContent=productCode(p)?`Code produit : ${productCode(p)}`:"";
 $("focusPrice").textContent=`${money(priceTiersFor(p)[0].price)} درهم / unité`;
 const availability=$("focusAvailability"); availability.textContent=available?"● DISPONIBLE":"● NON DISPONIBLE"; availability.classList.toggle("unavailable",!available);
 $("focusPromo").style.display=hasPromo10Plus1(p)?"block":"none";
 $("focusBackCode").textContent=`${productCode(p)||"—"} · ${p.category||"PRODUIT"}`;
 $("focusBackName").textContent=p.name||"Produit";
 $("focusDescription").textContent=p.description||"Produit disponible";
 $("focusBackPrice").textContent=`${money(priceTiersFor(p)[0].price)} درهم`;
 $("focusBackQty").textContent=String(Number(p.qty)||0);
 $("focusPromoNote").textContent=hasPromo10Plus1(p)?"🎁 Offre 10 + 1 : une pièce offerte dès 10 pièces payées":"";
 $("focusPromoNote").style.display=hasPromo10Plus1(p)?"block":"none";
  $("focusQty").value=1;
  $("focusPieces").value=Math.max(1,Math.floor(Number(p.qty)||1));
  updateFocusCalculation();
 $("focusCard").classList.toggle("is-unavailable",!available);
 $("focusCard").classList.remove("is-flipped");
 $("productFocus").classList.add("show"); $("productFocus").setAttribute("aria-hidden","false"); document.body.classList.add("focus-active");
}
function closeProductFocus(){
 $("productFocus").classList.remove("show"); $("productFocus").setAttribute("aria-hidden","true"); $("focusCard").classList.remove("is-flipped"); document.body.classList.remove("focus-active"); focusProductId=null;
}
function toggleFocusFlip(){if(focusProductId&&$("focusCard").classList.contains("is-unavailable"))return;$("focusCard").classList.toggle("is-flipped")}
function initProductFocus(){
 $("focusFlipHandle").onclick=e=>{e.stopPropagation();toggleFocusFlip()};
 $("focusBackButton").onclick=e=>{e.stopPropagation();$("focusCard").classList.remove("is-flipped")};
 $("closeProductFocus").onclick=closeProductFocus;
 $("productFocus").onclick=e=>{if(e.target===$("productFocus"))closeProductFocus()};
 $("focusAdd").onclick=e=>{e.stopPropagation();const qty=Math.max(1,Number($("focusQty").value)||1);if(focusProductId){addToCart(focusProductId,qty);closeProductFocus()}};
 $("focusQtyMinus").onclick=e=>{e.stopPropagation();setFocusQty(Number($("focusQty").value||1)-1)};
 $("focusQtyPlus").onclick=e=>{e.stopPropagation();setFocusQty(Number($("focusQty").value||1)+1)};
 $("focusQty").oninput=()=>{const clean=String($("focusQty").value||"").replace(/\D/g,"").slice(0,3);$("focusQty").value=clean;if(clean)updateFocusCalculation()};
 $("focusPiecesMinus").onclick=e=>{e.stopPropagation();setFocusPieces(Number($("focusPieces").value||focusUnitsPerBox())-focusUnitsPerBox())};
 $("focusPiecesPlus").onclick=e=>{e.stopPropagation();setFocusPieces(Number($("focusPieces").value||focusUnitsPerBox())+focusUnitsPerBox())};
 $("focusPieces").oninput=()=>{const clean=String($("focusPieces").value||"").replace(/\D/g,"").slice(0,5);$("focusPieces").value=clean;if(clean) setFocusPieces(clean)};
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&$("productFocus").classList.contains("show"))closeProductFocus()});
}

function render(){
 $("categories").innerHTML=categories.map(c=>`<button class="cat ${active===c?"active":""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("");
 document.querySelectorAll(".cat").forEach(b=>b.onclick=()=>{active=b.dataset.cat;selectedProductId=null;render()});
 $("sectionTitle").textContent=active;
  const q=String($("productSearch")?.value||"").trim().toLowerCase();
  const list=products.filter(p=>{
    const pCat = String(p.category||"").trim().toUpperCase();
    const activeCat = String(active||"").trim().toUpperCase();
    if(q){
      const code=productCode(p).toLowerCase();
      return code.includes(q)||String(p.name||"").toLowerCase().includes(q);
    }
    return pCat === activeCat;
  });
  $("sectionTitle").textContent=q?`Recherche : ${q}`:active;
  $("count").textContent=`${list.length} produit${list.length!==1?"s":""}`;
  $("grid").innerHTML=list.map(card).join("");
  $("empty").style.display=list.length?"none":"block";
  $("catalogCarousel").style.display=list.length?"":"none";
  if(list.length && carouselIndex>=list.length)carouselIndex=0;
  const selectCard=(cardEl)=>{
    document.querySelectorAll(".card.selected").forEach(other=>{ if(other!==cardEl) other.classList.remove("selected"); });
    cardEl.classList.add("selected");
    selectedProductId=cardEl.dataset.id;
  };
  document.querySelectorAll(".flip-card").forEach(cardEl=>{
    cardEl.onclick=e=>{
      if(carouselMoved||e.target.closest("button,input,label"))return;
      const relative=Number(cardEl.dataset.carouselRelative||0);
      if(relative!==0){moveCarousel(relative>0?1:-1);return;}
      selectCard(cardEl);
      openProductFocus(cardEl.dataset.id);
    };
  });
  document.querySelectorAll("[data-flip-add]").forEach(button=>button.onclick=e=>{
    e.preventDefault();e.stopPropagation();
    const cardEl=button.closest(".flip-card");
    const input=cardEl?.querySelector("[data-flip-qty]");
    const boxes=Math.max(1,Number(input?.value)||1);
    addToCart(button.dataset.flipAdd,boxes);
    if(cardEl)cardEl.classList.remove("is-flipped");
  });
  document.querySelectorAll("[data-flip-back]").forEach(button=>button.onclick=e=>{e.preventDefault();e.stopPropagation();button.closest(".flip-card")?.classList.remove("is-flipped")});
  document.querySelectorAll("[data-flip-qty]").forEach(input=>input.oninput=()=>{input.value=String(input.value||"").replace(/\D/g,"").slice(0,3)});
  renderCarouselPositions();
  initTierSliders();
 }

function priceTierSlider(p){
 const tiers=priceTiersFor(p).slice(0,6);
 if(!tiers.length)return "";
 const level=tiers[0],range=level.maxQty==null?`${level.minQty}+`:`${level.minQty}–${level.maxQty}`,total=level.maxQty==null?"مفتوح":`${level.maxQty} قطعة = ${money(level.maxQty*level.price)} درهم`;
 return `<div class="price-tier-slider" data-tier-slider="${esc(p.id)}" data-tier-count="${tiers.length}">
   <div class="price-tier-slider-head"><span>مستويات الكمية</span><small class="tier-counter">1 / ${tiers.length}</small></div>
   <div class="price-tier-track"><button type="button" class="tier-nav tier-prev" data-tier-prev="${esc(p.id)}" aria-label="المستوى السابق">‹</button><div class="tier-window"><div class="tier-level-strip" data-tier-strip>${tiers.map((tier,index)=>{const r=tier.maxQty==null?`${tier.minQty}+`:`${tier.minQty}–${tier.maxQty}`;return `<span class="tier-level-pill ${index===0?"active":""}" data-tier-level="${index}">${r} قطعة</span>`}).join("")}</div></div><button type="button" class="tier-nav tier-next" data-tier-next="${esc(p.id)}" aria-label="المستوى التالي">›</button></div>
   <div class="tier-info-card"><div><small>الفترة المختارة</small><strong class="tier-range">${range} قطعة</strong></div><div><small>ثمن القطعة</small><strong class="tier-unit-price">${money(level.price)} درهم</strong></div><div><small>الإجمالي عند الحد</small><strong class="tier-total">${total}</strong></div></div>
 </div>`;
}
function updateTierSlider(slider,index){
 const levels=slider.querySelectorAll("[data-tier-level]"),count=levels.length;if(!count)return;
 const safe=Math.max(0,Math.min(count-1,index));
 levels.forEach((level,i)=>level.classList.toggle("active",i===safe));
 const product=products.find(p=>String(p.id)===String(slider.dataset.tierSlider)),tier=product?priceTiersFor(product)[safe]:null;if(!tier)return;
 const range=tier.maxQty==null?`${tier.minQty}+`:`${tier.minQty}–${tier.maxQty}`;
 slider.querySelector(".tier-counter").textContent=`${safe+1} / ${count}`;
 slider.querySelector(".tier-range").textContent=`${range} قطعة`;
 slider.querySelector(".tier-unit-price").textContent=`${money(tier.price)} درهم`;
 slider.querySelector(".tier-total").textContent=tier.maxQty==null?"مفتوح":`${tier.maxQty} قطعة = ${money(tier.maxQty*tier.price)} درهم`;
 slider.querySelector("[data-tier-strip]").style.transform=`translateX(-${safe*100}%)`;
 slider.querySelector("[data-tier-prev]").disabled=safe===0;slider.querySelector("[data-tier-next]").disabled=safe===count-1;
}
function initTierSliders(){
 document.querySelectorAll("[data-tier-slider]").forEach(slider=>{
  const prev=slider.querySelector("[data-tier-prev]"),next=slider.querySelector("[data-tier-next]");
  prev.onclick=e=>{e.stopPropagation();const active=slider.querySelector(".tier-level-pill.active");updateTierSlider(slider,Number(active?.dataset.tierLevel||0)-1)};
  next.onclick=e=>{e.stopPropagation();const active=slider.querySelector(".tier-level-pill.active");updateTierSlider(slider,Number(active?.dataset.tierLevel||0)+1)};
  slider.querySelectorAll("[data-tier-level]").forEach(level=>level.onclick=e=>{e.stopPropagation();updateTierSlider(slider,Number(level.dataset.tierLevel||0))});
  updateTierSlider(slider,0);
 });
}
function card(p){
 const low=Number(p.qty)<=5, available=commercialAvailability(p)==='متوفر', code=productCode(p)||"—";
 return `<article class="card flip-card ${selectedProductId===p.id?"selected":""}" data-id="${esc(p.id)}">
  <div class="flip-card-inner">
   <div class="flip-face flip-front">
    <div class="photo ${available?"":"is-unavailable"}">
     ${p.image?`<img src="${p.image}" alt="${esc(p.name)}" loading="lazy" decoding="async">`:`<div class="no-photo">🎨</div>`}
     <span class="badge">${esc(p.category)}</span>
     ${available?"":`<div class="unavailable-card-overlay"><span>غير متوفر حاليا</span></div>`}
    </div>
    <div class="card-body">
     <div class="flip-front-kicker">3D PEINTURES · PRODUIT</div>
     <h3>${esc(p.name)}</h3>
     <div class="product-code-line">Code : <b>${esc(code)}</b></div>
     <div class="price">${money(priceTiersFor(p)[0].price)} <small>درهم / unité</small></div>
     <div class="flip-tap-hint">↻ اضغط لقلب البطاقة</div>
    </div>
   </div>
   <div class="flip-face flip-back">
    <div class="flip-back-top"><span>INFORMATIONS PRODUIT</span><button type="button" data-flip-back aria-label="العودة إلى صورة المنتج">↩</button></div>
    <h3>${esc(p.name)}</h3>
    <div class="flip-back-code">${esc(code)} · ${esc(p.category)}</div>
    <p class="flip-back-description">${esc(p.description||"Produit disponible")}</p>
    <div class="flip-specs">
      <div><span>PRIX / UNITÉ</span><strong>${money(priceTiersFor(p)[0].price)} درهم</strong></div>
      <div><span>UNITÉS / BOÎTE</span><strong>${Number(p.qty)||0}</strong></div>
    </div>
    ${available?`<label class="flip-qty">NOMBRE DE BOÎTES<input type="number" min="1" max="999" value="1" inputmode="numeric" data-flip-qty></label><button type="button" class="add-cart flip-add" data-flip-add="${esc(p.id)}"><span>🛒</span> Envoyer au panier</button>`:`<div class="flip-unavailable">غير متوفر حاليا</div>`}
    <small class="flip-back-footer">اضغط على البطاقة للعودة إلى الصورة</small>
   </div>
  </div>
 </article>`;
}

/* Menu administration — accès direct, sans code PIN */
$("menuBtn").onclick=e=>{e.stopPropagation();$("actionMenu").classList.toggle("show")};
document.addEventListener("click",e=>{if(!$("actionMenu").contains(e.target)&&e.target!==$("menuBtn"))$("actionMenu").classList.remove("show")});
  $("menuAdd").onclick=()=>{$("actionMenu").classList.remove("show");openForm()};
$("menuEdit").onclick=()=>{
 $("actionMenu").classList.remove("show");
 if(!selectedProductId)return toast("Sélectionnez d'abord un produit");
 const p=products.find(x=>x.id===selectedProductId);if(p)openForm(p);
};
$("menuDelete").onclick=()=>{
 $("actionMenu").classList.remove("show");
 if(!selectedProductId)return toast("Sélectionnez d'abord un produit");
 const p=products.find(x=>x.id===selectedProductId);
 if(p&&confirm(`Supprimer "${p.name}" ?`)){products=products.filter(x=>x.id!==selectedProductId);selectedProductId=null;save();render();toast("Produit supprimé")}
	};
		$("menuReturns").onclick=()=>openReturnsPage();
		$("menuCompanyInvoices").onclick=()=>openCompanyInvoices();
		$("menuPriceChangesArchive").onclick=()=>openPriceChangesArchive();
		$("menuDiscountsArchive").onclick=()=>openDiscountsArchive();
	$("menuOrders").onclick=()=>{$("actionMenu").classList.remove("show");openOrdersModal()};
$("menuCollections").onclick=()=>{$("actionMenu").classList.remove("show");openCollections()};
$("menuClients").onclick=()=>{$("actionMenu").classList.remove("show");openClientModal()};
$("menuImportClients").onclick=()=>{$("actionMenu").classList.remove("show");$("clientsExcelInput").click()};
$("menuExportProductsJson").onclick=()=>{$("actionMenu").classList.remove("show");exportLightBackup()};
$("menuImportProductsJson").onclick=()=>{$("actionMenu").classList.remove("show");const input=$("backupInput");if(input){input.value="";input.click()}};
const fullExportButton=$("menuExportProductsFullJson");if(fullExportButton)fullExportButton.onclick=()=>{$("actionMenu").classList.remove("show");exportBackup()};
const fullImportButton=$("menuImportProductsFullJson");if(fullImportButton)fullImportButton.onclick=()=>{$("actionMenu").classList.remove("show");const input=$("fullProductsJsonInput");if(input){input.value="";input.click()}};
$("allExcelRestoreInput").onchange=e=>importFullArchiveExcel(e.target.files[0]);
$("menuDashboard").onclick=()=>openDashboard();
$("exportOrdersArchiveExcel").onclick=exportOrdersArchiveExcel;
$("restoreOrdersArchiveExcel").onclick=openArchiveRestorePicker;
$("exportDashboardExcel").onclick=exportDashboardExcel;
$("restoreDashboardExcel").onclick=openArchiveRestorePicker;
$("exportClientsArchiveExcel").onclick=exportClientsArchiveExcel;
$("restoreClientsArchiveExcel").onclick=openArchiveRestorePicker;

/* Sauvegarde complète : produits + photos + codes + promotions + clients + commandes + panier */
function backupProductSnapshot(p,index,includeImage=true){
 const code=productCode(p),tiers=Array.isArray(p?.priceTiers)?p.priceTiers.map(t=>({minQty:Number(t?.minQty)||1,maxQty:t?.maxQty==null||t?.maxQty===""?null:Number(t.maxQty)||null,price:Number(t?.price)||0})).filter(t=>t.price>=0):[];
 return {
   id:String(p?.id||`p_restore_${Date.now().toString(36)}_${index}`),
   name:String(p?.name||"Produit").trim(),
   code,
   price:Number(p?.price)||0,
   costPrice:Number(p?.costPrice)||0,
   qty:Number(p?.qty)||0,
   category:canonicalCategory(p?.category),
   availability:p?.availability==="unavailable"?"unavailable":"available",
   description:String(p?.description||"").trim(),
   priceTiers:tiers,
   image:includeImage&&typeof p?.image==="string"?p.image:"",
   promo10Plus1:hasPromo10Plus1(p)
  };
}
async function exportBackup(){
 const backup={
  format:"3D_PEINTURES_PRODUCTS_IMAGES_JSON",
  version:4,
  createdAt:new Date().toISOString(),
  catalogUpdatedAt:catalogLastUpdate(),
  activeCategory:active,
  products:(Array.isArray(products)?products:[]).map((p,i)=>backupProductSnapshot(p,i,true)),
  cart:Array.isArray(cart)?cart:[],
  orders:Array.isArray(orders)?orders:[],
  clients:Array.isArray(clients)?clients:[],
  companyInvoices:companyInvoiceRows()
 };
 const text=JSON.stringify(backup),d=new Date(),pad=n=>String(n).padStart(2,"0"),name=`3D_PEINTURES_PRODUITS_IMAGES_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}.json`,fileType="application/json;charset=utf-8";
 try{
  const file=new File([text],name,{type:fileType});
  if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){await navigator.share({title:"منتوجات وصور 3D PEINTURES",text:"نسخة المنتجات مع الصور والمعلومات",files:[file]});toast(`تمت مشاركة ${products.length} منتوج(ات) مع الصور`);return}
 }catch(err){if(err?.name==="AbortError")return;console.warn("Full products share failed",err)}
 try{
  const blob=new Blob([text],{type:fileType}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.rel="noopener";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);toast(`تم تحميل ${products.length} منتوج(ات) مع الصور والمعلومات`);return
 }catch(err){console.warn("Full products download failed",err)}
 if(openTextBackupWindow(text,name)){toast("تم فتح ملف المنتجات والصور؛ احفظه من النافذة");return}
 if(await copyBackupToClipboard(text)){toast("تعذر التنزيل؛ تم نسخ ملف المنتجات والصور إلى الحافظة")}
 else toast("تعذر تحميل الملف. جرب مرة أخرى أو استعمل النسخة الخفيفة.");
}

function exportProductsJson(){
 const payload={format:"3D_PEINTURES_PRODUCTS_BACKUP",version:1,createdAt:new Date().toISOString(),activeCategory:active,products:(Array.isArray(products)?products:[]).map((p,i)=>backupProductSnapshot(p,i,false))};
 const blob=new Blob([JSON.stringify(payload)],{type:"application/json;charset=utf-8"});
 const url=URL.createObjectURL(blob);const a=document.createElement("a");const d=new Date();const pad=n=>String(n).padStart(2,"0");
 a.href=url;a.download=`3D_PEINTURES_PRODUITS_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
 toast(`تم تحميل ${products.length} منتوج(ات) نصية بدون صور`);
}
function stripBackupImages(value,key=""){
 if(Array.isArray(value))return value.map(v=>stripBackupImages(v));
 if(value&&typeof value==="object"){
  const result={};Object.entries(value).forEach(([k,v])=>{if(/image|photo|logo|avatar|thumbnail/i.test(k))return;result[k]=stripBackupImages(v,k)});return result;
 }
 return typeof value==="string"&&/^data:image\//i.test(value)?"":value;
}
function buildLightBackup(){
 const history=typeof collectionHistory==="function"?collectionHistory():[];
 const cycleStart=typeof collectionCycleStart==="function"?collectionCycleStart():localStorage.getItem(COLLECTIONS_CYCLE_KEY)||"";
 return stripBackupImages({
  format:"3D_PEINTURES_LIGHT_BACKUP",version:1,createdAt:new Date().toISOString(),activeCategory:active,
  products:(Array.isArray(products)?products:[]).map((p,i)=>backupProductSnapshot(p,i,false)),
  cart:Array.isArray(cart)?cart:[],orders:Array.isArray(orders)?orders:[],clients:Array.isArray(clients)?clients:[],companyInvoices:companyInvoiceRows(),
  collections:{cycleStart,history},
  contents:["products","cart","orders","clients","companyInvoices","collections"]
 });
}
function lightBackupFileName(){const d=new Date();return `3D_PEINTURES_SAUVEGARDE_LEGERE_${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}.json`}
function openTextBackupWindow(text,name){
 try{
  const win=window.open("","_blank");if(!win)return false;
  const safe=text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  win.document.open();win.document.write(`<meta name="viewport" content="width=device-width,initial-scale=1"><title>${name}</title><style>body{margin:0;background:#06152f;color:#f5d477;font-family:monospace}header{position:sticky;top:0;padding:14px;background:#0b2e63;color:#fff;font-family:Arial}textarea{display:block;width:100%;height:calc(100vh - 58px);box-sizing:border-box;padding:14px;background:#fff;color:#17233b;border:0;font:12px monospace;direction:ltr}</style><header>نسخة احتياطية نصية — اضغط مطولًا لنسخ المحتوى</header><textarea readonly>${safe}</textarea>`);win.document.close();return true;
 }catch(err){console.warn("Backup open fallback failed",err);return false}
}
async function copyBackupToClipboard(text){try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return true}}catch(err){console.warn("Clipboard backup failed",err)}return false}
async function exportLightBackup(){
 const text=JSON.stringify(buildLightBackup(),null,2),name=lightBackupFileName(),fileType="application/json;charset=utf-8";
 try{
  const file=new File([text],name,{type:fileType});
  if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){await navigator.share({title:"نسخة احتياطية 3D PEINTURES",text:"نسخة نصية خفيفة تشمل المنتجات والكوموندات والأقساط والديون والمستخلاصات",files:[file]});toast("تمت مشاركة النسخة الاحتياطية الخفيفة");return}
 }catch(err){if(err?.name==="AbortError")return;console.warn("Share backup failed",err)}
 try{
  const blob=new Blob([text],{type:fileType}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.rel="noopener";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);toast("تم تحميل نسخة JSON خفيفة بدون صور");return;
 }catch(err){console.warn("Download backup failed",err)}
 if(openTextBackupWindow(text,name)){toast("تم فتح النسخة في نافذة جديدة؛ احفظها يدويًا");return}
 if(await copyBackupToClipboard(text)){toast("تعذر التنزيل؛ تم نسخ النسخة إلى الحافظة")}
 else toast("تعذر تنزيل النسخة. افتح القائمة مرة أخرى وحاول النسخ إلى الحافظة.");
}

function excelSheet(rows, widths){
 const data=rows&&rows.length?rows:[{"ملاحظة":"لا توجد بيانات"}];
 const ws=XLSX.utils.json_to_sheet(data);
 if(widths)ws["!cols"]=widths.map(w=>({wch:w}));
 const ref=XLSX.utils.encode_range({s:{r:0,c:0},e:{r:Math.max(0,data.length),c:Math.max(0,(widths?.length||Object.keys(data[0]||{}).length)-1)}});
 ws["!autofilter"]={ref};
 ws["!freeze"]={xSplit:0,ySplit:1,topLeftCell:"A2",activePane:"bottomLeft",state:"frozen"};
 return ws;
}
function exportFullArchiveExcel(){
 try{
  if(typeof XLSX==="undefined")throw new Error("Excel library not loaded");
  const wb=XLSX.utils.book_new();
  const safeWrap=(fn,fallback=[])=>{try{return fn()}catch(e){console.warn("Excel sheet error",e);return fallback}};
  
  const productRows=safeWrap(()=>products.map((p,i)=>{const row=backupProductSnapshot(p,i);return {"المعرف":row.id,"كود المنتج":row.code,"اسم المنتج":row.name,"القسم":row.category,"الثمن (درهم)":row.price,"ثمن التكلفة (درهم)":row.costPrice,"الوحدات في العلبة":row.qty,"التوفر":row.availability==="unavailable"?"غير متوفر":"متوفر","عرض 10+1":row.promo10Plus1?"نعم":"لا","الوصف":row.description,"الصورة (Data URL)":row.image};}));
  const clientRows=safeWrap(()=>clients.map(c=>({"المعرف":c.id||"","اسم الزبون":c.name||"","الهاتف":c.phone||"","الشركة":c.company||c.societe||"","المدينة":c.city||"","العنوان":c.address||"","ICE":c.ice||"","صاحب الشيك/الكمبيالة":c.paymentHolder||c.paymentName||c.chequeName||"","رقم الشيك/الكمبيالة":c.paymentNumber||c.chequeNumber||"","نوع الأداء":paymentTypeLabel(c.paymentType),"تاريخ الإضافة":c.importedAt||c.createdAt||""})));
  const orderRows=safeWrap(()=>orders.map(o=>{ensureOrderDeadline(o);const state=recalculateOrderPaymentState(o);const deadline=deadlineState(o);return {"المعرف":o.id||"","التاريخ":o.date||"","الزبون":o.client||"","الشركة":o.company||"","ICE":o.ice||"","الهاتف":o.phone||"","الإجمالي (درهم)":Number(o.total)||0,"المخلص (درهم)":Number(state.paid)||0,"الباقي (درهم)":Number(state.due)||0,"الحالة":o.status||"unpaid","مدة الأداء (يوم)":deadline.term,"وضع الأجل":deadline.termKey==="cod"?"إستخلاص عند الإستلام / Paiement à la livraison":(deadline.termKey==="test_1m"?"تجربة دقيقة":"أيام"),"مدة الأداء (دقيقة)":deadline.termKey==="test_1m"?(Number(o.paymentTermMinutes)||1):"","تاريخ الاستحقاق":o.dueDate||"","صاحب الشيك/الكمبيالة":o.paymentHolder||o.paymentName||"","رقم الشيك/الكمبيالة":o.paymentNumber||"","نوع الأداء":paymentTypeLabel(o.paymentType),"الملاحظة":o.note||"","عدد العناصر":Array.isArray(o.items)?o.items.length:0};}));
  
  const paymentRows=[];
  safeWrap(()=>{orders.forEach(o=>{ensureOrderDeadline(o);getPaymentHistory(o).forEach((p,index)=>paymentRows.push({"معرف القسط":p.id||`payment_${index+1}`,"معرف الكوموند":o.id||"","الزبون":o.client||"","رقم القسط":index+1,"مبلغ القسط (درهم)":Number(p.amount)||0,"تاريخ وتوقيت الأداء":p.date||"","نوع الأداء":paymentTypeLabel(p.type||o.paymentType),"صاحب الشيك/الكمبيالة":p.holder||o.paymentHolder||"","رقم الشيك/الكمبيالة":p.number||o.paymentNumber||"","مدة الكوموند (يوم)":Number(o.paymentTermDays)||15,"تاريخ الاستحقاق":o.dueDate||""}));});});
  
  const itemRows=[];
  safeWrap(()=>{orders.forEach(o=>(Array.isArray(o.items)?o.items:[]).forEach((item,index)=>itemRows.push({"معرف الكوموند":o.id||"","رقم السطر":index+1,"معرف المنتج":item.id||"","كود المنتج":item.code||"","اسم المنتج":item.name||"","عدد العلب":Number(item.boxes??item.qty)||0,"عدد الوحدات":Number(item.units)||0,"الوحدات المجانية":Number(item.freeUnits)||0,"ثمن الوحدة (درهم)":Number(item.unitPrice??item.price)||0,"المجموع (درهم)":Number(item.lineTotal??item.total)||0,"بيانات السطر":JSON.stringify(item)})));});
  
  const cartRows=safeWrap(()=>(Array.isArray(cart)?cart:[]).map((item,index)=>({"رقم السطر":index+1,"معرف المنتج":item.id||"","عدد العلب":Number(item.qty)||0})));
  
  const summaryRows=[{"المعلومة":"نوع الملف","القيمة":"3D_PEINTURES_FULL_ARCHIVE"},{"المعلومة":"الإصدار","القيمة":4},{"المعلومة":"تاريخ التصدير","القيمة":new Date().toISOString()},{"المعلومة":"القسم النشط","القيمة":active||""},{"المعلومة":"عدد المنتجات","القيمة":products.length},{"المعلومة":"عدد الزبناء","القيمة":clients.length},{"المعلومة":"عدد الكوموندات","القيمة":orders.length},{"المعلومة":"عدد الأقساط","القيمة":paymentRows.length},{"المعلومة":"الصور محفوظة داخل ورقة المنتجات","القيمة":"نعم — Data URL"}];
  
  XLSX.utils.book_append_sheet(wb,excelSheet(summaryRows,[34,60]),"ملخص");
  XLSX.utils.book_append_sheet(wb,excelSheet(productRows,[24,18,28,18,14,18,16,16,12,36,64]),"Products");
  XLSX.utils.book_append_sheet(wb,excelSheet(clientRows,[24,24,18,24,18,30,20,28,24,24,24]),"Clients");
  XLSX.utils.book_append_sheet(wb,excelSheet(orderRows,[28,24,24,24,18,18,16,16,16,14,18,24,28,24,22,40,14]),"Orders");
  XLSX.utils.book_append_sheet(wb,excelSheet(paymentRows,[28,28,24,12,18,26,24,28,24,18,24]),"Installments");
  XLSX.utils.book_append_sheet(wb,excelSheet(itemRows,[28,12,28,18,28,14,14,16,18,16,60]),"Order Items");
  XLSX.utils.book_append_sheet(wb,excelSheet(cartRows,[12,28,14]),"Cart");
  
  const d=new Date(),pad=n=>String(n).padStart(2,"0");
  XLSX.writeFile(wb,`3D_PEINTURES_ARCHIVE_COMPLET_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}.xlsx`);
  toast(`تم تحميل الأرشيف الكامل: ${products.length} منتوج · ${orders.length} كوموند`);
 }catch(err){console.error("Critical Excel Error",err);toast("خطأ تقني أثناء إنشاء ملف Excel. يرجى مراجعة البيانات.");}
}

function exportOrdersAndAccountsExcel(){
 try{
  if(typeof XLSX==="undefined")throw new Error("Excel library not loaded");
  const safeCell=(value,max=32000)=>String(value??"").replace(/[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]/g,"").slice(0,max);
  const safeNumber=value=>{const n=Number(value);return Number.isFinite(n)?n:0};
  const safeDate=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?"":d.toISOString()};
  const orderRows=[],paymentRows=[],itemRows=[],errors=[];
  const accountMap=new Map();
  const accountFor=(name,client={})=>{
   const cleanName=safeCell(name||client.name||"بدون اسم عميل");
   const key=cleanName.trim().toLowerCase()||"__unknown__";
   if(!accountMap.has(key))accountMap.set(key,{name:cleanName||"بدون اسم عميل",company:safeCell(client.company||client.societe||""),ice:safeCell(client.ice||""),phone:safeCell(client.phone||""),orders:0,sales:0,paid:0,due:0,overdue:0,lastOrder:""});
   return accountMap.get(key);
  };
  (Array.isArray(clients)?clients:[]).forEach(c=>accountFor(c.name,c));
  (Array.isArray(orders)?orders:[]).forEach((o,orderIndex)=>{
   try{
    ensureOrderDeadline(o);
    const state=recalculateOrderPaymentState(o), deadline=deadlineState(o), clientObj=(Array.isArray(clients)?clients:[]).find(c=>String(c.name||"").trim().toLowerCase()===String(o.client||"").trim().toLowerCase())||{};
    const account=accountFor(o.client,clientObj), total=safeNumber(o.total), due=safeNumber(state.due), paid=safeNumber(state.paid), date=safeDate(o.date);
    account.orders+=1;account.sales+=total;account.paid+=paid;account.due+=due;if(deadline.overdue&&due>0)account.overdue+=due;if(date&&(!account.lastOrder||date>account.lastOrder))account.lastOrder=date;
    orderRows.push({"معرف الكوموند":safeCell(o.id),"التاريخ":date,"الزبون":safeCell(o.client),"الشركة":safeCell(o.company||clientObj.company||clientObj.societe),"ICE":safeCell(o.ice||clientObj.ice),"الهاتف":safeCell(o.phone||clientObj.phone),"الإجمالي (درهم)":total,"المخلص (درهم)":paid,"الباقي (درهم)":due,"الحالة":safeCell(o.status||"unpaid"),"مدة الأداء (يوم)":deadline.term,"وضع الأجل":deadline.termKey==="cod"?"إستخلاص عند الإستلام / Paiement à la livraison":(deadline.termKey==="test_1m"?"تجربة دقيقة":"أيام"),"مدة الأداء (دقيقة)":deadline.termKey==="test_1m"?(Number(o.paymentTermMinutes)||1):"","تاريخ الاستحقاق":safeDate(o.dueDate),"متأخر؟":deadline.overdue&&due>0?"نعم":"لا","نوع الأداء":safeCell(paymentTypeLabel(o.paymentType)),"رقم الشيك/الكمبيالة":safeCell(o.paymentNumber),"الملاحظة":safeCell(o.note)});
    getPaymentHistory(o).forEach((p,paymentIndex)=>paymentRows.push({"معرف القسط":safeCell(p.id||`payment_${orderIndex+1}_${paymentIndex+1}`),"معرف الكوموند":safeCell(o.id),"الزبون":safeCell(o.client),"رقم القسط":paymentIndex+1,"مبلغ القسط (درهم)":safeNumber(p.amount),"تاريخ وتوقيت الأداء":safeDate(p.date),"نوع الأداء":safeCell(paymentTypeLabel(p.type||o.paymentType)),"صاحب الشيك/الكمبيالة":safeCell(p.holder||o.paymentHolder),"رقم الشيك/الكمبيالة":safeCell(p.number||o.paymentNumber)}));
    (Array.isArray(o.items)?o.items:[]).forEach((item,itemIndex)=>itemRows.push({"معرف الكوموند":safeCell(o.id),"رقم السطر":itemIndex+1,"معرف المنتج":safeCell(item.id),"كود المنتج":safeCell(item.code),"اسم المنتج":safeCell(item.name),"عدد العلب":safeNumber(item.boxes??item.qty),"عدد الوحدات":safeNumber(item.units),"الوحدات المجانية":safeNumber(item.freeUnits),"ثمن الوحدة (درهم)":safeNumber(item.unitPrice??item.price),"المجموع (درهم)":safeNumber(item.lineTotal??item.total)}));
   }catch(error){console.warn("Order skipped during light export",orderIndex,error);errors.push(`الكوموند ${orderIndex+1}`)}
  });
  const accountRows=[...accountMap.values()].map(a=>({"الزبون":a.name,"الشركة":a.company,"ICE":a.ice,"الهاتف":a.phone,"عدد الكوموندات":a.orders,"إجمالي المبيعات (درهم)":Number(a.sales.toFixed(2)),"إجمالي المخلص (درهم)":Number(a.paid.toFixed(2)),"مجموع الباقي (درهم)":Number(a.due.toFixed(2)),"المتأخر عن الأجل (درهم)":Number(a.overdue.toFixed(2)),"آخر كوموند":a.lastOrder})).sort((a,b)=>b["مجموع الباقي (درهم)"]-a["مجموع الباقي (درهم)"]);
  const totalSales=orderRows.reduce((sum,r)=>sum+safeNumber(r["الإجمالي (درهم)"]),0),totalPaid=orderRows.reduce((sum,r)=>sum+safeNumber(r["المخلص (درهم)"]),0),totalDue=orderRows.reduce((sum,r)=>sum+safeNumber(r["الباقي (درهم)"]),0),totalOverdue=accountRows.reduce((sum,r)=>sum+safeNumber(r["المتأخر عن الأجل (درهم)"]),0);
  const summaryRows=[{"المعلومة":"نوع الملف","القيمة":"3D_PEINTURES_ORDERS_ACCOUNTS"},{"المعلومة":"تاريخ التصدير","القيمة":new Date().toISOString()},{"المعلومة":"عدد الكوموندات","القيمة":orderRows.length},{"المعلومة":"عدد الحسابات","القيمة":accountRows.length},{"المعلومة":"عدد الأقساط","القيمة":paymentRows.length},{"المعلومة":"إجمالي المبيعات (درهم)","القيمة":Number(totalSales.toFixed(2))},{"المعلومة":"إجمالي المخلص (درهم)","القيمة":Number(totalPaid.toFixed(2))},{"المعلومة":"مجموع الباقي (درهم)","القيمة":Number(totalDue.toFixed(2))},{"المعلومة":"المتأخر عن الأجل (درهم)","القيمة":Number(totalOverdue.toFixed(2))},{"المعلومة":"تنبيه","القيمة":errors.length?`تم تجاوز ${errors.length} سجل غير صالح`:"تم تصدير جميع السجلات"}];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,excelSheet(summaryRows,[34,62]),"الملخص");
  XLSX.utils.book_append_sheet(wb,excelSheet(orderRows,[28,24,24,24,18,18,16,16,16,14,18,24,12,24,24,42]),"الكوموندات");
  XLSX.utils.book_append_sheet(wb,excelSheet(accountRows,[24,24,18,18,16,20,20,18,22,24]),"الحسابات");
  XLSX.utils.book_append_sheet(wb,excelSheet(paymentRows,[28,28,24,12,18,26,24,24,24]),"الأقساط");
  XLSX.utils.book_append_sheet(wb,excelSheet(itemRows,[28,12,28,18,28,14,14,16,18,16]),"تفاصيل الطلبات");
  const d=new Date(),pad=n=>String(n).padStart(2,"0");
  XLSX.writeFile(wb,`3D_PEINTURES_COMMANDES_COMPTES_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}.xlsx`);
  toast(`تم تحميل ملف الكوموندات والحسابات: ${orderRows.length} كوموند · ${money(totalDue)} درهم باقي`);
 }catch(error){console.error("Light Excel export error",error);toast("تعذر تحميل ملف الكوموندات والحسابات. حاول مرة أخرى.")}
}

function openArchiveRestorePicker(){
 const input=$("allExcelRestoreInput");
 if(input){input.value="";input.click()}
}
function exportOrdersArchiveExcel(){
 exportOrdersAndAccountsExcel();
}
function exportClientsArchiveExcel(){
 try{
  if(typeof XLSX==="undefined")throw new Error("Excel library not loaded");
  const clientRows=(Array.isArray(clients)?clients:[]).map(c=>({"المعرف":c.id||"","اسم الزبون":c.name||"","الهاتف":c.phone||c.whatsapp||"","الشركة":c.company||c.societe||"","المدينة":c.city||"","العنوان":c.address||"","ICE":c.ice||"","صاحب الشيك/الكمبيالة":c.paymentHolder||c.paymentName||"","رقم الشيك/الكمبيالة":c.paymentNumber||c.chequeNumber||"","نوع الأداء":paymentTypeLabel(c.paymentType),"تاريخ الإضافة":c.importedAt||c.createdAt||""}));
  const accountMap=new Map();
  (Array.isArray(orders)?orders:[]).forEach(order=>{
   const name=String(order.client||"").trim();if(!name)return;
   const key=name.toLowerCase();const item=accountMap.get(key)||{name,orders:0,sales:0,paid:0,due:0};
   recalculateOrderPaymentState(order);item.orders+=1;item.sales+=Number(order.total)||0;item.paid+=paymentTotal(order);item.due+=Math.max(0,Number(order.total||0)-paymentTotal(order));accountMap.set(key,item);
  });
  const accountRows=[...accountMap.values()].map(a=>({"الزبون":a.name,"عدد الكوموندات":a.orders,"إجمالي المبيعات (درهم)":Number(a.sales.toFixed(2)),"إجمالي المخلص (درهم)":Number(a.paid.toFixed(2)),"مجموع الباقي (درهم)":Number(a.due.toFixed(2))})).sort((a,b)=>b["مجموع الباقي (درهم)"]-a["مجموع الباقي (درهم)"]);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,excelSheet(clientRows,[24,24,18,24,18,30,20,28,24,24,24]),"الكليان");
  XLSX.utils.book_append_sheet(wb,excelSheet(accountRows,[24,16,22,22,20]),"حسابات الكليان");
  const d=new Date(),pad=n=>String(n).padStart(2,"0");
  XLSX.writeFile(wb,`3D_PEINTURES_CLIENTS_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}.xlsx`);
  toast(`تم تحميل أرشيف الكليان: ${clientRows.length} كليان`);
 }catch(error){console.error("Clients Excel export error",error);toast("تعذر تحميل أرشيف الكليان")}
}
function exportDashboardExcel(){
 try{
  if(typeof XLSX==="undefined")throw new Error("Excel library not loaded");
  const selectedMonth=$("dashboardMonth")?.value||currentMonthKey();
  const selectedOrders=dashboardOrdersForMonth(selectedMonth),productMap=new Map(),hours=Array.from({length:24},()=>0);
  let sales=0;
  selectedOrders.forEach(order=>{
   sales+=Number(order.total)||0;const date=new Date(order.date);if(!Number.isNaN(date.getTime()))hours[date.getHours()]++;
   (Array.isArray(order.items)?order.items:[]).forEach(row=>{const product=products.find(p=>String(p.id)===String(row.id));const key=String(row.id||row.code||row.name||"unknown");const units=orderItemUnits(row);const line=Number(row.lineTotal??((Number(row.unitPrice??product?.price)||0)*units))||0;const item=productMap.get(key)||{name:row.name||product?.name||"Produit",units:0,sales:0};item.units+=units;item.sales+=line;productMap.set(key,item)});
  });
  const topProducts=[...productMap.values()].sort((a,b)=>b.units-a.units||b.sales-a.sales).slice(0,8),peakCount=Math.max(...hours,0),peakIndexes=hours.reduce((acc,value,index)=>value===peakCount&&value>0?acc.concat(index):acc,[]);
  const orderRows=selectedOrders.map(o=>{recalculateOrderPaymentState(o);const state=deadlineState(o);return {"معرف الكوموند":o.id||"","التاريخ":o.date||"","الزبون":o.client||"","الإجمالي (درهم)":Number(o.total)||0,"المخلص (درهم)":Number(o.paid)||0,"الباقي (درهم)":Number(o.due)||0,"مدة الأداء (يوم)":state.term,"تاريخ الاستحقاق":o.dueDate||""}});
  const itemRows=[],paymentRows=[];selectedOrders.forEach(o=>{(Array.isArray(o.items)?o.items:[]).forEach((item,index)=>itemRows.push({"معرف الكوموند":o.id||"","رقم السطر":index+1,"معرف المنتج":item.id||"","كود المنتج":item.code||"","اسم المنتج":item.name||"","عدد الوحدات":Number(item.units)||0,"المجموع (درهم)":Number(item.lineTotal??item.total)||0}));getPaymentHistory(o).forEach((p,index)=>paymentRows.push({"معرف القسط":p.id||`payment_${index+1}`,"معرف الكوموند":o.id||"","الزبون":o.client||"","رقم القسط":index+1,"مبلغ القسط (درهم)":Number(p.amount)||0,"تاريخ وتوقيت الأداء":p.date||"","نوع الأداء":paymentTypeLabel(p.type||o.paymentType)}))});
  const summaryRows=[{"المؤشر":"الشهر المحدد / Mois sélectionné","القيمة":selectedMonth},{"المؤشر":"عدد الكوموندات / Nombre de commandes","القيمة":selectedOrders.length},{"المؤشر":"إجمالي المبيعات (درهم) / Ventes","القيمة":Number(sales.toFixed(2))},{"المؤشر":"المنتوج الأكثر طلباً / Produit leader","القيمة":topProducts[0]?.name||"—"},{"المؤشر":"ذروة الطلبات / Heure de pointe","القيمة":peakIndexes.length?peakIndexes.map(h=>`${String(h).padStart(2,"0")}:00`).join(" · "):"—"},{"المؤشر":"نوع الملف","القيمة":"3D_PEINTURES_DASHBOARD_ARCHIVE"}];
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,excelSheet(summaryRows,[42,60]),"ملخص اللوحة");XLSX.utils.book_append_sheet(wb,excelSheet(topProducts.map((p,i)=>({"الترتيب":i+1,"المنتوج":p.name,"الوحدات":p.units,"المبيعات (درهم)":Number(p.sales.toFixed(2))})),[12,30,16,20]),"أفضل المنتجات");XLSX.utils.book_append_sheet(wb,excelSheet(hours.map((count,h)=>({"الساعة":`${String(h).padStart(2,"0")}:00`,"عدد الطلبات":count})),[16,18]),"أوقات الذروة");XLSX.utils.book_append_sheet(wb,excelSheet(orderRows,[28,24,24,18,18,16,18,24]),"بيانات الكوموندات");XLSX.utils.book_append_sheet(wb,excelSheet(itemRows,[28,12,28,18,28,16,18]),"تفاصيل dashboard");XLSX.utils.book_append_sheet(wb,excelSheet(paymentRows,[28,28,24,12,18,26,24]),"أقساط dashboard");
  XLSX.writeFile(wb,`3D_PEINTURES_DASHBOARD_${selectedMonth}.xlsx`);toast(`تم تحميل لوحة التحكم التجارية: ${selectedMonth}`);
 }catch(error){console.error("Dashboard Excel export error",error);toast("تعذر تحميل لوحة التحكم التجارية")}
}

async function importBackupFile(file){
 if(!file)return;
 const reader=new FileReader();
 reader.onload=async e=>{
   let previousState=null;
   try{
     const data=JSON.parse(e.target.result);
     const rawProducts=Array.isArray(data)?data:data?.products;
     if(!Array.isArray(rawProducts)) throw new Error("Format de sauvegarde invalide");
     if(!confirm(`Restaurer ${rawProducts.length} produit(s) et leurs photos ?\n\nLes données actuelles seront remplacées.`))return;

     previousState={products,cart,orders,clients,active,companyInvoices:localStorage.getItem(COMPANY_INVOICES_KEY)};
     const restored=rawProducts.map((p,i)=>backupProductSnapshot(p,i));
     const usedIds=new Set();
     restored.forEach((p,i)=>{
       if(usedIds.has(p.id)){p.id=`p_restore_${Date.now().toString(36)}_${i}_${Math.random().toString(36).slice(2,7)}`;}
       usedIds.add(p.id);
     });
     products=restored;
     cart=Array.isArray(data?.cart)?data.cart:[];
     orders=Array.isArray(data?.orders)?data.orders:[];
     clients=Array.isArray(data?.clients)?data.clients:[];
     if(Array.isArray(data?.companyInvoices))localStorage.setItem(COMPANY_INVOICES_KEY,JSON.stringify(data.companyInvoices));
     active=categories.includes(canonicalCategory(data?.activeCategory))?canonicalCategory(data.activeCategory):categories[0];

     // Réduire automatiquement les photos uniquement si le stockage du téléphone l'exige.
     if(!save()){
       await compactProductsImages();
       if(!save()) throw new Error("STORAGE_FULL");
     }
     try{
       localStorage.setItem("3d_peintures_orders_v1",JSON.stringify(orders));
       localStorage.setItem("3d_peintures_cart_v4",JSON.stringify(cart));
       localStorage.setItem(CLIENTS_KEY,JSON.stringify(clients));
     }catch(storageError){
       throw new Error("STORAGE_FULL");
     }
     saveClients();
     selectedProductId=null;
     selectedImage="";
     renderCart();
     render();
     toast(`Sauvegarde restaurée : ${products.length} produit(s), photos et informations récupérées`);
   }catch(err){
     if(previousState){
       products=previousState.products;cart=previousState.cart;orders=previousState.orders;clients=previousState.clients;active=previousState.active;if(previousState.companyInvoices==null)localStorage.removeItem(COMPANY_INVOICES_KEY);else localStorage.setItem(COMPANY_INVOICES_KEY,previousState.companyInvoices);
       renderCart();render();
     }
     alert(err?.message==="STORAGE_FULL"
       ? "La sauvegarde contient trop de photos pour la mémoire du navigateur. Les photos seront compressées automatiquement ; si le problème continue, utilisez moins de photos ou videz l'ancienne sauvegarde."
       : "Impossible de restaurer cette sauvegarde.\nLe fichier est invalide ou incomplet.");
   }finally{
     $("backupInput").value="";
   }
 };
 reader.readAsText(file);
}

async function importLightBackup(file){
 if(!file)return;
 const reader=new FileReader();
 reader.onload=async e=>{
  const previous={products,cart,orders,clients,active,cycle:localStorage.getItem(COLLECTIONS_CYCLE_KEY),history:localStorage.getItem(COLLECTIONS_HISTORY_KEY),companyInvoices:localStorage.getItem(COMPANY_INVOICES_KEY)};
  try{
   const data=JSON.parse(e.target.result),isLight=data?.format==="3D_PEINTURES_LIGHT_BACKUP",rawProducts=Array.isArray(data)?data:data?.products;
   if(!Array.isArray(rawProducts))throw new Error("BACKUP_INVALID");
   const hasBusinessData=isLight&&(Array.isArray(data.orders)||Array.isArray(data.clients)||Array.isArray(data.cart)||Array.isArray(data.companyInvoices)||data.collections);
   if(!isLight&&!Array.isArray(data?.products))throw new Error("BACKUP_INVALID");
   if(!confirm(`استرجاع النسخة النصية؟\n\n${rawProducts.length} منتوج · ${Array.isArray(data?.orders)?data.orders.length:0} كوموند · ${Array.isArray(data?.clients)?data.clients.length:0} زبناء\n\nسيتم تحديث البيانات الموجودة.`))return;
   const localImages=new Map((Array.isArray(products)?products:[]).map(p=>[String(p.id),typeof p.image==="string"?p.image:""]));
   const restored=rawProducts.map((p,i)=>{const clean=backupProductSnapshot(p,i,false);if(!clean.image&&localImages.has(String(clean.id)))clean.image=localImages.get(String(clean.id));return clean});
   const usedIds=new Set();restored.forEach((p,i)=>{if(usedIds.has(p.id))p.id=`p_light_${Date.now().toString(36)}_${i}_${Math.random().toString(36).slice(2,7)}`;usedIds.add(p.id)});
   products=restored;
   if(hasBusinessData){cart=Array.isArray(data.cart)?data.cart:[];orders=Array.isArray(data.orders)?data.orders:[];clients=Array.isArray(data.clients)?data.clients:[];if(Array.isArray(data.companyInvoices))localStorage.setItem(COMPANY_INVOICES_KEY,JSON.stringify(data.companyInvoices));if(data.collections?.cycleStart)localStorage.setItem(COLLECTIONS_CYCLE_KEY,String(data.collections.cycleStart));if(Array.isArray(data.collections?.history))localStorage.setItem(COLLECTIONS_HISTORY_KEY,JSON.stringify(data.collections.history.slice(0,100)))}
   active=categories.includes(canonicalCategory(data?.activeCategory))?canonicalCategory(data.activeCategory):categories[0];
   if(!save())throw new Error("STORAGE_FULL");
   localStorage.setItem("3d_peintures_orders_v1",JSON.stringify(orders));localStorage.setItem("3d_peintures_cart_v4",JSON.stringify(cart));localStorage.setItem(CLIENTS_KEY,JSON.stringify(clients));
   selectedProductId=null;selectedImage="";renderCart();render();toast(`تم استرجاع النسخة الخفيفة: ${products.length} منتوج · ${orders.length} كوموند · بدون صور`);
  }catch(err){
   products=previous.products;cart=previous.cart;orders=previous.orders;clients=previous.clients;active=previous.active;if(previous.companyInvoices==null)localStorage.removeItem(COMPANY_INVOICES_KEY);else localStorage.setItem(COMPANY_INVOICES_KEY,previous.companyInvoices);if(previous.cycle==null)localStorage.removeItem(COLLECTIONS_CYCLE_KEY);else localStorage.setItem(COLLECTIONS_CYCLE_KEY,previous.cycle);if(previous.history==null)localStorage.removeItem(COLLECTIONS_HISTORY_KEY);else localStorage.setItem(COLLECTIONS_HISTORY_KEY,previous.history);renderCart();render();
   alert(err?.message==="STORAGE_FULL"?"تعذر حفظ النسخة: الذاكرة ممتلئة.":err?.message==="BACKUP_INVALID"?"الملف غير صالح أو ليس نسخة 3D PEINTURES نصية.":"تعذر استرجاع النسخة النصية. البيانات الحالية لم تتغير.");
  }finally{$("backupInput").value=""}
 };
 reader.readAsText(file);
}
$("backupInput").onchange=e=>importLightBackup(e.target.files[0]);

function importProductsJson(file){
 if(!file)return;
 const reader=new FileReader();
 reader.onload=async e=>{
  let previousProducts=null,previousActive=null;
  try{
   const data=JSON.parse(e.target.result);
   const rawProducts=Array.isArray(data)?data:data?.products;
   if(!Array.isArray(rawProducts)||!rawProducts.length)throw new Error("PRODUCTS_EMPTY");
   if(!confirm(`رفع ${rawProducts.length} منتوج(ات) جاهزة؟\n\nسيتم استبدال قائمة المنتجات فقط، مع الحفاظ على الكوموندات والكليان.`))return;
   previousProducts=products;previousActive=active;
   const restored=rawProducts.map((p,i)=>backupProductSnapshot(p,i));
   const usedIds=new Set();
   restored.forEach((p,i)=>{if(usedIds.has(p.id))p.id=`p_json_${Date.now().toString(36)}_${i}_${Math.random().toString(36).slice(2,7)}`;usedIds.add(p.id)});
   products=restored;
   active=categories.includes(canonicalCategory(data?.activeCategory))?canonicalCategory(data.activeCategory):categories[0];
   if(!save()){
    await compactProductsImages();
    if(!save())throw new Error("STORAGE_FULL");
   }
   selectedProductId=null;selectedImage="";
   renderCart();render();
   toast(`تم رفع ${products.length} منتوج(ات) جاهزة بنجاح`);
  }catch(err){
   if(previousProducts){products=previousProducts;active=previousActive;save();renderCart();render()}
   alert(err?.message==="STORAGE_FULL"?"الملف كبير على ذاكرة المتصفح. حاول رفع نسخة أقل حجماً.":err?.message==="PRODUCTS_EMPTY"?"ملف JSON لا يحتوي على منتجات.":"تعذر رفع ملف المنتجات. تأكد من أنه ملف JSON صادر من التطبيق.");
  }finally{$("productsJsonInput").value=""}
 };
 reader.readAsText(file);
}

$("productsJsonInput").onchange=e=>importProductsJson(e.target.files[0]);
$("fullProductsJsonInput").onchange=e=>importBackupFile(e.target.files[0]);

function excelRows(wb,name){
 const actual=wb.SheetNames.find(s=>s===name)||wb.SheetNames.find(s=>String(s).toLowerCase()===String(name).toLowerCase());
 return actual?XLSX.utils.sheet_to_json(wb.Sheets[actual],{defval:""}):[];
}
function excelRowsAny(wb,names){
 for(const name of names){const rows=excelRows(wb,name);if(rows.length)return rows}
 return [];
}
function excelNum(value,fallback=0){
 if(typeof value==="number")return Number.isFinite(value)?value:fallback;
 const n=Number(String(value??"").trim().replace(/\s/g,"").replace(",","."));
 return Number.isFinite(n)?n:fallback;
}
function excelDate(value,fallback){
 if(value instanceof Date&&!Number.isNaN(value.getTime()))return value.toISOString();
 const d=new Date(value);return Number.isNaN(d.getTime())?(fallback===null?null:(fallback||new Date().toISOString())):d.toISOString();
}
function importFullArchiveExcel(file){
 if(!file)return;
 const reader=new FileReader();
 reader.onload=async e=>{
  let previousState=null;
  try{
   if(typeof XLSX==="undefined")throw new Error("Excel library not loaded");
   const wb=XLSX.read(e.target.result,{type:"array",cellDates:true});
   const productRows=excelRowsAny(wb,["Products","المنتجات"]).filter(r=>String(r["المعرف"]||r["اسم المنتج"]||r["كود المنتج"]||"").trim());
   const clientRows=excelRowsAny(wb,["Clients","الكليان","الزبناء"]).filter(r=>String(r["المعرف"]||r["اسم الزبون"]||r["الزبون"]||"").trim());
   const orderRows=excelRowsAny(wb,["Orders","الكوموندات","بيانات الكوموندات"]).filter(r=>String(r["المعرف"]||r["معرف الكوموند"]||r["الزبون"]||"").trim());
   const hasProducts=productRows.length>0,hasClients=clientRows.length>0,hasOrders=orderRows.length>0;
   const hasInstallments=excelRowsAny(wb,["Installments","الأقساط","أقساط dashboard"]).length>0;
   const hasItems=excelRowsAny(wb,["Order Items","تفاصيل الطلبات","تفاصيل dashboard"]).length>0;
   const hasCart=excelRows(wb,"Cart").length>0;
   if(!hasProducts&&!hasClients&&!hasOrders&&!hasInstallments&&!hasItems)throw new Error("ARCHIVE_EMPTY");
   if(!confirm(`استرجاع ملف Excel؟\n\n${productRows.length} منتوج · ${clientRows.length} كليان · ${orderRows.length} كوموند\n\nسيتم تحديث الأقسام الموجودة في الملف فقط، مع الحفاظ على باقي البيانات.`))return;
   previousState={products,cart,orders,clients,active};
   const importedProducts=productRows.map((r,i)=>({
    id:String(r["المعرف"]||`p_excel_${Date.now().toString(36)}_${i}`),name:String(r["اسم المنتج"]||"Produit").trim(),code:normalizeProductCode(r["كود المنتج"]),price:excelNum(r["الثمن (درهم)"]),costPrice:excelNum(r["ثمن التكلفة (درهم)"]),qty:Math.max(0,Math.floor(excelNum(r["الوحدات في العلبة"]))),category:canonicalCategory(r["القسم"]),availability:String(r["التوفر"]||"").trim()==="غير متوفر"?"unavailable":"available",promo10Plus1:["نعم","yes","true","1"].includes(String(r["عرض 10+1"]||"").trim().toLowerCase()),description:String(r["الوصف"]||""),image:typeof r["الصورة (Data URL)"]==="string"?r["الصورة (Data URL)"]:""
   }));
   const restoredProducts=hasProducts?importedProducts:products;
   const productIds=new Set();restoredProducts.forEach((p,i)=>{if(!p.id||productIds.has(String(p.id)))p.id=`p_excel_${Date.now().toString(36)}_${i}_${Math.random().toString(36).slice(2,7)}`;productIds.add(String(p.id))});
   const importedClients=clientRows.map((r,i)=>({id:String(r["المعرف"]||`c_excel_${Date.now().toString(36)}_${i}`),name:String(r["اسم الزبون"]||"").trim(),phone:String(r["الهاتف"]||""),company:String(r["الشركة"]||""),city:String(r["المدينة"]||""),address:String(r["العنوان"]||""),ice:String(r["ICE"]||""),paymentHolder:String(r["صاحب الشيك/الكمبيالة"]||""),paymentNumber:String(r["رقم الشيك/الكمبيالة"]||""),paymentType:paymentTypeValue(r["نوع الأداء"]),importedAt:excelDate(r["تاريخ الإضافة"],new Date().toISOString())})).filter(c=>c.name);
   const importedOrders=[];const orderMap=new Map();
   orderRows.forEach((r,i)=>{
    const id=String(r["المعرف"]||r["معرف الكوموند"]||r["معرف الطلب"]||`o_excel_${Date.now().toString(36)}_${i}`);
    const termLabel=String(r["وضع الأجل"]||r["مدة الأداء (يوم)"]||"").trim().toLowerCase();
    const isCodTerm=termLabel.includes("استلام")||termLabel.includes("livraison")||termLabel.includes("cod");
    const isTestTerm=!isCodTerm&&(termLabel.includes("تجربة")||termLabel.includes("test")||Number(r["مدة الأداء (دقيقة)"])===1);
    const term=isCodTerm||isTestTerm?0:([15,30].includes(excelNum(r["مدة الأداء (يوم)"],15))?excelNum(r["مدة الأداء (يوم)"],15):15);
    const termMinutes=isTestTerm?Math.max(1,excelNum(r["مدة الأداء (دقيقة)"],1)):null;
    const order={id,date:excelDate(r["التاريخ"]),client:String(r["الزبون"]||""),company:String(r["الشركة"]||""),ice:String(r["ICE"]||""),phone:String(r["الهاتف"]||""),total:excelNum(r["الإجمالي (درهم)"]),paid:0,due:0,profit:0,status:"unpaid",paymentTermDays:term,paymentTermMode:isCodTerm?"cod":(isTestTerm?"test_1m":"days"),paymentTermMinutes:termMinutes,dueDate:isCodTerm?"":excelDate(r["تاريخ الاستحقاق"],null),paymentHolder:String(r["صاحب الشيك/الكمبيالة"]||""),paymentNumber:String(r["رقم الشيك/الكمبيالة"]||""),paymentType:paymentTypeValue(r["نوع الأداء"]),note:String(r["الملاحظة"]||""),payments:[],items:[]};
    if(!order.dueDate&&!isCodTerm)order.dueDate=new Date(new Date(order.date).getTime()+(isTestTerm?termMinutes*60000:term*86400000)).toISOString();
    importedOrders.push(order);orderMap.set(id,order);
   });
   const restoredClients=hasClients?importedClients:clients;
   const restoredOrders=hasOrders?importedOrders:orders;
   excelRowsAny(wb,["Order Items","تفاصيل الطلبات","تفاصيل dashboard"]).forEach((r)=>{
    const order=orderMap.get(String(r["معرف الكوموند"]||""));if(!order)return;
    let item=null;try{item=JSON.parse(String(r["بيانات السطر"]||""))}catch(err){}
    order.items.push(item&&typeof item==="object"?item:{id:String(r["معرف المنتج"]||""),code:String(r["كود المنتج"]||""),name:String(r["اسم المنتج"]||""),boxes:excelNum(r["عدد العلب"]),qty:excelNum(r["عدد العلب"]),units:excelNum(r["عدد الوحدات"]),freeUnits:excelNum(r["الوحدات المجانية"]),unitPrice:excelNum(r["ثمن الوحدة (درهم)"]),lineTotal:excelNum(r["المجموع (درهم)"])});
   });
   excelRowsAny(wb,["Installments","الأقساط","أقساط dashboard"]).forEach((r)=>{
    const order=orderMap.get(String(r["معرف الكوموند"]||""));if(!order)return;
    order.payments.push({id:String(r["معرف القسط"]||makeId()),amount:excelNum(r["مبلغ القسط (درهم)"]),date:excelDate(r["تاريخ وتوقيت الأداء"]),type:paymentTypeValue(r["نوع الأداء"]),holder:String(r["صاحب الشيك/الكمبيالة"]||""),number:String(r["رقم الشيك/الكمبيالة"]||"")});
   });
   restoredOrders.forEach(o=>recalculateOrderPaymentState(o));
   const restoredCart=hasCart?excelRows(wb,"Cart").map(r=>({id:String(r["معرف المنتج"]||""),qty:Math.max(1,Math.floor(excelNum(r["عدد العلب"],1)))})).filter(r=>productIds.has(r.id)):cart;
   const summary=excelRowsAny(wb,["ملخص","الملخص","ملخص اللوحة"]);const summaryMap=new Map(summary.map(r=>[String(r["المعلومة"]||r["المؤشر"]||""),r["القيمة"]]));
   const restoredActive=summaryMap.get("القسم النشط")?canonicalCategory(summaryMap.get("القسم النشط")):active;
   products=restoredProducts;clients=restoredClients;orders=restoredOrders;cart=restoredCart;active=restoredActive;
   if(!save()){await compactProductsImages();if(!save())throw new Error("STORAGE_FULL")}
   localStorage.setItem("3d_peintures_orders_v1",JSON.stringify(orders));localStorage.setItem("3d_peintures_cart_v4",JSON.stringify(cart));saveClients();
   selectedProductId=null;selectedImage="";renderCart();render();renderDueAlerts();
   toast(`تم استرجاع الأرشيف: ${products.length} منتوج · ${orders.length} كوموند`);
  }catch(err){
   if(previousState){products=previousState.products;cart=previousState.cart;orders=previousState.orders;clients=previousState.clients;active=previousState.active;renderCart();render();renderDueAlerts()}
   alert(err?.message==="STORAGE_FULL"?"الصور كثيرة على ذاكرة المتصفح. جرب ملفاً أقل حجماً.":err?.message==="ARCHIVE_EMPTY"?"هذا الملف لا يحتوي على أوراق أرشيف 3D PEINTURES.":"تعذر استرجاع أرشيف Excel. تأكد من استعمال الملف الذي تم تصديره من التطبيق.");
  }finally{$("allExcelRestoreInput").value=""}
 };
 reader.readAsArrayBuffer(file);
}

/* Import clients Excel */
const CLIENTS_KEY="3d_peintures_clients_v1";
let clients=JSON.parse(localStorage.getItem(CLIENTS_KEY)||"[]");

function saveClients(){
  localStorage.setItem(CLIENTS_KEY,JSON.stringify(clients));
  renderClientList();
}
function clientField(row, names){
  const keys=Object.keys(row||{});
  const norm=x=>String(x||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[\s_\-./]/g,"");
  for(const wanted of names){
    const k=keys.find(key=>norm(key)===norm(wanted) || norm(key).includes(norm(wanted)));
    if(k && row[k]!=null && String(row[k]).trim()!=="") return String(row[k]).trim();
  }
  return "";
}
function paymentTypeValue(value){
  const raw=String(value||"").trim().toLowerCase();
  if(["cash","espèce","espèces","espece","especes","نقدا","نقداً","نقدا"].includes(raw))return "cash";
  if(["lettre_de_change","lettre de change","cambiale","cambial","كمبيالة","الكمبيالة"].includes(raw))return "lettre_de_change";
  return "cheque";
}
function paymentTypeLabel(value){
  const type=paymentTypeValue(value);
  if(type==="cash")return "نقداً / Espèces";
  if(type==="lettre_de_change")return "كمبيالة / Cambiale";
  return "شيك / Chèque";
}
let activeClientSuggestionIndex=-1,activeClientSuggestionItems=[];
function normalizeClientLookup(value){return String(value||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim()}
function uniqueOrderClients(){
 const known=new Set();
 return clients.filter(client=>{
  const key=normalizeClientLookup(client?.name);if(!key||known.has(key))return false;
  known.add(key);return true;
 }).sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"fr",{sensitivity:"base"}));
}
function hideClientSuggestions(){
 const box=$("clientSuggestions"),input=$("orderClient");
 activeClientSuggestionIndex=-1;activeClientSuggestionItems=[];
 if(box){box.hidden=true;box.innerHTML=""}
 if(input)input.setAttribute("aria-expanded","false");
}
function selectClientSuggestion(index){
 const client=activeClientSuggestionItems[Number(index)];if(!client)return;
 $("orderClient").value=String(client.name||"").trim();
 hideClientSuggestions();
}
function renderClientSuggestions(value=$("orderClient")?.value||""){
 const box=$("clientSuggestions"),input=$("orderClient");if(!box||!input)return;
 const query=normalizeClientLookup(value);
 activeClientSuggestionIndex=-1;
 if(!query){hideClientSuggestions();return}
 const matches=uniqueOrderClients().filter(client=>[client.name,client.company,client.city,client.ville].some(field=>normalizeClientLookup(field).includes(query))).slice(0,7);
 activeClientSuggestionItems=matches;
 box.hidden=false;input.setAttribute("aria-expanded","true");
 if(!matches.length){box.innerHTML='<div class="client-suggestion-empty">ما لقيناش كليان مطابق. تقدر تزيده بزر + Client.</div>';return}
 box.innerHTML=matches.map((client,index)=>{
  const details=[client.company,client.city||client.ville].filter(Boolean).join(" · ");
  return `<button class="client-suggestion" type="button" role="option" data-client-suggestion="${index}"><b>${esc(client.name||"")}</b>${details?`<small>${esc(details)}</small>`:""}</button>`;
 }).join("");
 box.querySelectorAll("[data-client-suggestion]").forEach(button=>{
  button.onmousedown=event=>event.preventDefault();
  button.onclick=()=>selectClientSuggestion(button.dataset.clientSuggestion);
 });
}
function handleClientSuggestionKeys(event){
 const box=$("clientSuggestions");if(!box||box.hidden)return;
 const options=[...box.querySelectorAll("[data-client-suggestion]")];
 if(event.key==="Escape"){hideClientSuggestions();return}
 if(!options.length)return;
 if(event.key==="ArrowDown"||event.key==="ArrowUp"){
  event.preventDefault();
  activeClientSuggestionIndex=event.key==="ArrowDown"?Math.min(activeClientSuggestionIndex+1,options.length-1):Math.max(activeClientSuggestionIndex-1,0);
  options.forEach((option,index)=>option.classList.toggle("is-active",index===activeClientSuggestionIndex));
  options[activeClientSuggestionIndex]?.scrollIntoView({block:"nearest"});
 }
 if(event.key==="Enter"&&activeClientSuggestionIndex>=0){event.preventDefault();selectClientSuggestion(options[activeClientSuggestionIndex].dataset.clientSuggestion)}
}
function renderClientList(){
 const box=$("clientSuggestions"),input=$("orderClient");if(!box||!input)return;
 if(!box.hidden&&input.value.trim())renderClientSuggestions(input.value);else hideClientSuggestions();
}
function importClientsExcel(file){
  if(!file)return;
  const reader=new FileReader();
  reader.onload=async e=>{
    try{
      if(typeof XLSX==="undefined") throw new Error("Excel library not loaded");
      const wb=XLSX.read(e.target.result,{type:"array"});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(ws,{defval:""});
      if(!rows.length) throw new Error("Le fichier est vide");
      const imported=[];
      rows.forEach((r,i)=>{
        const name=clientField(r,["Nom","Nom client","Client","Raison sociale","Client Name","Name","Societe","Société"]);
        if(!name)return;
        imported.push({
          id:"c_"+Date.now().toString(36)+"_"+i+"_"+Math.random().toString(36).slice(2,7),
          name,
          phone:clientField(r,["WhatsApp","Whatsapp","Téléphone","Telephone","Tel","Phone","GSM","Mobile"]),
          company:clientField(r,["Société","Societe","Company","Entreprise","Raison sociale"]),
          city:clientField(r,["Ville","City"]),
          address:clientField(r,["Adresse","Address"]),
          ice:clientField(r,["ICE","Identifiant fiscal"]),
          paymentHolder:clientField(r,["Titulaire du chèque","Titulaire cheque","Propriétaire chèque","Nom du chèque","Cheque holder","Payment holder"]),
          paymentNumber:clientField(r,["Numéro du chèque","Numero cheque","N° chèque","Num cheque","Numéro cambiale","Cheque number","Payment number"]),
          paymentType:paymentTypeValue(clientField(r,["Type de paiement","Type paiement","Payment type","Mode de paiement","Mode paiement","Type cheque","Type chèque"])),
          importedAt:new Date().toISOString()
        });
      });
      if(!imported.length) throw new Error("ما لقيتش عمود ديال اسم الكليان. خاص يكون مثلاً: Nom, Client أو Nom client.");
      const map=new Map(clients.map(c=>[String(c.name).trim().toLowerCase(),c]));
      imported.forEach(c=>map.set(c.name.trim().toLowerCase(),c));
      clients=[...map.values()];
      saveClients();
      toast(`تم إدخال ${imported.length} كليان من Excel`);
      $("orderClient").focus();
      setTimeout(()=>openOrdersModal(),350);
    }catch(err){
      alert("تعذر إدخال ملف Excel.\n"+(err.message||"تأكد من الملف والأعمدة."));
    }finally{
      $("clientsExcelInput").value="";
    }
  };
  reader.readAsArrayBuffer(file);
}
$("clientsExcelInput").onchange=e=>importClientsExcel(e.target.files[0]);
renderClientList();


/* Gestion des clients */
function openClientModal(prefillName=""){
  $("clientForm").reset();
  $("clientEditId").value="";
  const initialName=prefillName||$("orderClient").value.trim();
  const existing=clients.find(c=>String(c.name||"").trim().toLowerCase()===String(initialName||"").trim().toLowerCase());
  $("clientName").value=initialName;
  $("clientCompany").value=existing?.company||""; $("clientCity").value=existing?.city||existing?.ville||""; $("clientICE").value=existing?.ice||""; $("clientPaymentHolder").value=existing?.paymentHolder||existing?.chequeHolder||existing?.paymentName||""; $("clientPaymentNumber").value=existing?.paymentNumber||existing?.chequeNumber||""; $("clientPaymentType").value=paymentTypeValue(existing?.paymentType||existing?.paymentMode||existing?.modePaiement); $("clientWhatsapp").value=existing?.phone||"";
   renderClientStats();
   $("clientModal").classList.add("show");
}
function closeClientModal(){$("clientModal").classList.remove("show")}
function monthKey(value){
 const d=new Date(value);
 if(Number.isNaN(d.getTime()))return "";
 return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function currentMonthKey(){return monthKey(new Date())}
function renderClientStats(){
 const monthInput=$("clientStatsMonth"), listBox=$("clientStatsList"), summary=$("clientStatsSummary"), searchInput=$("clientStatsSearch");
 if(!monthInput||!listBox||!summary)return;
 if(!monthInput.value)monthInput.value=currentMonthKey();
 const selectedMonth=monthInput.value;
 const q=(searchInput?.value||"").trim().toLowerCase();
 const people=new Map();
 clients.forEach(c=>{
   const name=String(c.name||"").trim(); if(!name)return;
   people.set(name.toLowerCase(),{name,company:c.company||""});
 });
 orders.forEach(o=>{
   const name=String(o.client||"").trim(); if(!name)return;
   const key=name.toLowerCase(); if(!people.has(key))people.set(key,{name,company:""});
 });
 let rows=[...people.values()].map(person=>{
   const matched=orders.filter(o=>monthKey(o.date)===selectedMonth&&String(o.client||"").trim().toLowerCase()===person.name.toLowerCase());
   const total=matched.reduce((sum,o)=>sum+(Number(o.total)||0),0);
   return {...person,count:matched.length,total};
 });
 const totalOrders=rows.reduce((sum,row)=>sum+row.count,0);
 const activeClients=rows.filter(row=>row.count>0).length;
 const totalSales=rows.reduce((sum,row)=>sum+row.total,0);
 if(q) rows=rows.filter(r=>String(r.name).toLowerCase().includes(q)||String(r.company).toLowerCase().includes(q));
 rows.sort((a,b)=>b.total-a.total||b.count-a.count||a.name.localeCompare(b.name,"fr"));
 summary.innerHTML=`<span><b>${totalOrders}</b>طلبات</span><span><b>${activeClients}</b>زبناء نشيطين</span><span><b>${money(totalSales)}</b>درهم</span>`;
 listBox.innerHTML=rows.length?rows.map(row=>`<div class="client-stat-row"><div><strong>${esc(row.name)}</strong>${row.company?`<small>${esc(row.company)}</small>`:""}</div><span class="client-stat-orders">${row.count} طلب</span><span class="client-stat-total">${money(row.total)} درهم</span></div>`).join(""):"<div class=\"cart-empty\">لا يوجد نتائج.</div>";
}
function forecastMonthKey(baseKey,offset){
 const [year,month]=String(baseKey||currentMonthKey()).split("-").map(Number);
 const d=new Date(year,Math.max(0,month-1)+offset,1);
 return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function forecastMonthLabel(key){
 const [year,month]=String(key).split("-").map(Number);
 const d=new Date(year,month-1,1);
 return d.toLocaleDateString("fr-FR",{month:"short"}).replace(".","");
}
function orderItemUnits(row){
 const boxes=Math.max(0,Number(row?.qty)||0);
 const units=Math.max(0,Number(row?.units)||0);
 return Math.max(0,Number(row?.paidUnits ?? (boxes*units))||0);
}
function buildSalesForecast(targetMonth){
 const target=targetMonth||currentMonthKey();
 const historyKeys=Array.from({length:6},(_,i)=>forecastMonthKey(target,i-6));
 const recentKeys=historyKeys.slice(3);
 const previousKeys=historyKeys.slice(0,3);
 const monthly=new Map(historyKeys.map(key=>[key,{sales:0,orders:0,units:0}]));
 const productMap=new Map();
 let recentSales=0,previousSales=0;
 orders.forEach(order=>{
   const key=monthKey(order.date);
   if(!monthly.has(key))return;
   const month=monthly.get(key);
   const orderTotal=Number(order.total)||0;
   month.sales+=orderTotal;month.orders++;
   if(recentKeys.includes(key))recentSales+=orderTotal;
   if(previousKeys.includes(key))previousSales+=orderTotal;
   (order.items||[]).forEach(row=>{
     const units=orderItemUnits(row);
     month.units+=units;
     const id=String(row.id||row.code||row.name||"unknown");
     const product=products.find(p=>String(p.id)===String(row.id));
     const existing=productMap.get(id)||{name:row.name||product?.name||"Produit",units:0,sales:0,orders:0};
     existing.units+=units;
     existing.sales+=Number(row.lineTotal ?? ((Number(row.unitPrice ?? product?.price)||0)*units))||0;
     existing.orders++;
     productMap.set(id,existing);
   });
 });
 const recentProductRows=[...productMap.values()].filter(row=>row.units>0).map(row=>({
   ...row,
   averageUnits:row.units/3,
   forecastUnits:Math.max(1,Math.ceil(row.units/3)),
   averageSales:row.sales/3,
   forecastSales:row.sales/3
 })).sort((a,b)=>b.units-a.units||b.sales-a.sales).slice(0,8);
 const chart=historyKeys.map(key=>({...monthly.get(key),key,label:forecastMonthLabel(key)}));
 const trend=previousSales>0?((recentSales-previousSales)/previousSales)*100:null;
 return {target,chart,recentProductRows,forecastSales:recentSales/3,trend,recentSales,previousSales};
}
function exportSalesForecastToExcel(){
 const monthInput=$("salesForecastMonth");
 const target=monthInput?.value||forecastMonthKey(currentMonthKey(),1);
 try{
   if(typeof XLSX==="undefined") throw new Error("Excel library not loaded");
   const data=buildSalesForecast(target);
   const productRows=data.recentProductRows.map(row=>({
     "المنتوج":row.name,
     "القطع المباعة خلال آخر 3 أشهر":row.units,
     "المعدل الشهري":Number(row.averageUnits.toFixed(2)),
     "الكمية المتوقعة للشهر القادم":row.forecastUnits,
     "المبيعات خلال آخر 3 أشهر (درهم)":Number(row.sales.toFixed(2)),
     "المبيعات المتوقعة (درهم)":Number(row.forecastSales.toFixed(2))
   }));
   const monthlyRows=data.chart.map(row=>({"الشهر":row.key,"المبيعات (درهم)":Number(row.sales.toFixed(2)),"عدد الطلبات":row.orders,"القطع المباعة":row.units}));
   const summaryRows=[
     {"المؤشر":"الشهر المستهدف", "القيمة":target},
     {"المؤشر":"المبيعات المتوقعة (درهم)", "القيمة":Number(data.forecastSales.toFixed(2))},
     {"المؤشر":"المبيعات خلال آخر 3 أشهر (درهم)", "القيمة":Number(data.recentSales.toFixed(2))},
     {"المؤشر":"الاتجاه مقارنة بالـ 3 أشهر السابقة", "القيمة":data.trend===null?"لا توجد مقارنة كافية":`${data.trend.toFixed(2)}%`}
   ];
   const wb=XLSX.utils.book_new();
   const wsProducts=XLSX.utils.json_to_sheet(productRows.length?productRows:[{"المنتوج":"لا توجد بيانات كافية"}]);
   const wsMonthly=XLSX.utils.json_to_sheet(monthlyRows);
   const wsSummary=XLSX.utils.json_to_sheet(summaryRows);
   XLSX.utils.book_append_sheet(wb,wsProducts,"توقعات المنتوجات");
   XLSX.utils.book_append_sheet(wb,wsMonthly,"المبيعات الشهرية");
   XLSX.utils.book_append_sheet(wb,wsSummary,"الملخص");
   XLSX.writeFile(wb,`توقعات_المبيعات_${target}.xlsx`);
   toast("تم تحميل توقعات المبيعات Excel");
 }catch(err){console.error(err);toast("خطأ أثناء تحميل توقعات المبيعات")}
}
function renderSalesForecast(){
 const panel=$("salesForecastPanel"),monthInput=$("salesForecastMonth"),summary=$("salesForecastSummary"),chartBox=$("salesForecastChart"),productsBox=$("salesForecastProducts");
 if(!panel||!monthInput||!summary||!chartBox||!productsBox)return;
 if(!monthInput.value)monthInput.value=forecastMonthKey(currentMonthKey(),1);
 const data=buildSalesForecast(monthInput.value);
 const maxSales=Math.max(...data.chart.map(item=>item.sales),1);
 const trendText=data.trend===null?"لا توجد مقارنة كافية":`${data.trend>=0?"▲":"▼"} ${Math.abs(data.trend).toFixed(0)}% مقابل 3 أشهر قبل`;
 summary.innerHTML=`<span><b>${money(data.forecastSales)}</b>درهم متوقعة<small>للشهر القادم</small></span><span><b>${data.recentProductRows.length}</b>منتوجات<small>ذات مبيعات مسجلة</small></span><span><b>${esc(trendText)}</b><small>الاتجاه العام</small></span>`;
 chartBox.innerHTML=data.chart.map(item=>{
   const height=item.sales?Math.max(6,Math.round((item.sales/maxSales)*82)):4;
   return `<div class="forecast-bar-item"><span class="forecast-bar-value">${item.sales?money(item.sales):"0"}</span><div class="forecast-bar" style="height:${height}px" title="${money(item.sales)} درهم"></div><span class="forecast-bar-label">${esc(item.label)}</span></div>`;
 }).join("");
 productsBox.innerHTML=data.recentProductRows.length?data.recentProductRows.map(row=>`<div class="forecast-product-row"><div><strong>${esc(row.name)}</strong><small>معدل آخر 3 أشهر: ${row.averageUnits.toFixed(0)} قطعة / شهر</small></div><span class="forecast-product-stat">${row.units} قطعة</span><span class="forecast-product-next">متوقع: ${row.forecastUnits}</span></div>`).join(""):"<div class=\"forecast-empty\">لا توجد طلبات كافية لإعداد توقعات. سجّل بعض الطلبات أولاً.</div>";
}
function toggleSalesForecast(){
 const panel=$("salesForecastPanel"),button=$("salesForecastToggle"); if(!panel)return;
 const visible=panel.classList.toggle("show");
 if(visible){renderSalesForecast();if(button)button.textContent="📉 إخفاء توقعات المبيعات";}
 else if(button)button.textContent="📈 توقعات المبيعات";
}
function toggleClientStats(){
 const panel=$("clientStatsPanel"), button=$("clientStatsToggle"); if(!panel)return;
 const visible=panel.classList.toggle("show");
 if(visible){renderClientStats();if(button)button.textContent="📊 إخفاء الإحصائيات";}
 else if(button)button.textContent="📊 كشف الزبناء والإحصائيات";
}
function exportClientStatsToExcel(){
 const monthInput=$("clientStatsMonth"); if(!monthInput)return;
 const selectedMonth=monthInput.value || currentMonthKey();
 const people=new Map();
 clients.forEach(c=>{ const name=String(c.name||"").trim(); if(name) people.set(name.toLowerCase(),{name,company:c.company||""}); });
 orders.forEach(o=>{ const name=String(o.client||"").trim(); if(name && !people.has(name.toLowerCase())) people.set(name.toLowerCase(),{name,company:""}); });
 const rows=[...people.values()].map(person=>{
   const matched=orders.filter(o=>monthKey(o.date)===selectedMonth&&String(o.client||"").trim().toLowerCase()===person.name.toLowerCase());
   const total=matched.reduce((sum,o)=>sum+(Number(o.total)||0),0);
   return { "الزبون": person.name, "الشركة": person.company, "عدد الطلبات": matched.length, "المجموع (درهم)": total };
 }).sort((a,b)=>b["المجموع (درهم)"]-a["المجموع (درهم)"]);
 try {
   const ws = XLSX.utils.json_to_sheet(rows);
   const wb = XLSX.utils.book_new();
   XLSX.utils.book_append_sheet(wb, ws, "Statistiques");
   XLSX.writeFile(wb, `Statistiques_Clients_${selectedMonth}.xlsx`);
   toast("تم تحميل ملف Excel بنجاح");
 } catch(err) {
   console.error(err);
   toast("خطأ أثناء تحميل الملف");
 }
}
async function createClientBillingPDF(client){
 try{
   if(!window.html2canvas||!window.jspdf) throw new Error("PDF libraries unavailable");
   let logoB64="";
   try{
     const r=await fetch("https://www.dropbox.com/scl/fi/g6bef6j1a3gtse98o9ktp/Picsart_26-08-12_00-00-35-616.png?rlkey=z5wm1262vccogra8t9n71stei&st=5lq7g02n&raw=1");
     const blob=await r.blob();
     logoB64=await new Promise(resolve=>{const fr=new FileReader();fr.onload=e=>resolve(e.target.result);fr.readAsDataURL(blob)});
   }catch(e){console.warn("Logo client billing load failed",e)}
   const now=new Date();
   const date=now.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"});
   const watermark=logoB64?`<div style="position:absolute;top:57%;left:50%;transform:translate(-50%,-50%);width:500px;opacity:.08;z-index:0"><img src="${logoB64}" style="width:100%;height:auto"></div>`:"";
   const root=document.createElement("div");
   root.dir="ltr";
   root.style.cssText="position:fixed;left:-10000px;top:0;width:760px;background:#fff;color:#172033;padding:46px;font-family:Arial,sans-serif;z-index:-1;box-sizing:border-box";
   root.innerHTML=`${watermark}<div style="position:relative;z-index:1">
     <div style="border-bottom:4px solid #c49a38;padding-bottom:20px;margin-bottom:34px">
       <div style="font-size:17px;letter-spacing:4px;color:#b58a2a;font-weight:700">3D PEINTURES</div>
       <div style="font-size:32px;font-weight:800;margin-top:8px">FICHE DE FACTURATION</div>
       <div style="font-size:13px;color:#667085;margin-top:9px">Document d'informations client · ${date}</div>
     </div>
     <div style="padding:24px;border:1px solid #dfe3e8;border-radius:16px;background:#fffdf7">
       <div style="font-size:14px;letter-spacing:1px;color:#9a6b12;font-weight:800;margin-bottom:20px">INFORMATIONS À UTILISER POUR LA FACTURATION</div>
       <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px 28px;font-size:16px">
         <div style="padding-bottom:13px;border-bottom:1px solid #e5e7eb"><span style="display:block;color:#667085;font-size:12px;margin-bottom:6px">NOM DU CLIENT</span><b>${esc(client.name||"—")}</b></div>
         <div style="padding-bottom:13px;border-bottom:1px solid #e5e7eb"><span style="display:block;color:#667085;font-size:12px;margin-bottom:6px">SOCIÉTÉ</span><b>${esc(client.company||"—")}</b></div>
         <div style="padding-bottom:13px;border-bottom:1px solid #e5e7eb"><span style="display:block;color:#667085;font-size:12px;margin-bottom:6px">ICE</span><b>${esc(client.ice||"—")}</b></div>
         <div style="padding-bottom:13px;border-bottom:1px solid #e5e7eb"><span style="display:block;color:#667085;font-size:12px;margin-bottom:6px">TITULAIRE DU CHÈQUE / CAMBIALE</span><b>${esc(client.paymentHolder||client.chequeHolder||client.paymentName||"—")}</b></div>
         <div style="padding-bottom:13px;border-bottom:1px solid #e5e7eb"><span style="display:block;color:#667085;font-size:12px;margin-bottom:6px">NUMÉRO DU CHÈQUE / CAMBIALE</span><b>${esc(client.paymentNumber||client.chequeNumber||"—")}</b></div>
         <div style="padding-bottom:13px;border-bottom:1px solid #e5e7eb"><span style="display:block;color:#667085;font-size:12px;margin-bottom:6px">TYPE DE PAIEMENT</span><b>${esc(paymentTypeLabel(client.paymentType||client.paymentMode||client.modePaiement))}</b></div>
         <div style="padding-bottom:13px;border-bottom:1px solid #e5e7eb"><span style="display:block;color:#667085;font-size:12px;margin-bottom:6px">DATE D'ENVOI</span><b>${date}</b></div>
       </div>
     </div>
     <div style="margin-top:28px;padding:18px 20px;border-left:4px solid #c49a38;background:#fff9e9;color:#344054;font-size:15px;line-height:1.6">Merci d'utiliser ces informations pour préparer la facture du client indiqué ci-dessus.</div>
     <div style="margin-top:100px;text-align:center;color:#667085;font-size:13px">Document neutre · 3D PEINTURES</div>
   </div>`;
   document.body.appendChild(root);
   const canvas=await html2canvas(root,{scale:2,backgroundColor:"#fff",useCORS:true,logging:false});
   const {jsPDF}=window.jspdf;
   const pdf=new jsPDF({orientation:"p",unit:"mm",format:"a4"});
   const pageW=210,pageH=297,margin=8,imgW=pageW-margin*2,imgH=canvas.height*imgW/canvas.width,pagePx=Math.floor(canvas.width*(pageH-margin*2)/imgH);
   let yPx=0,page=0;
   while(yPx<canvas.height){const sliceH=Math.min(pagePx,canvas.height-yPx);const slice=document.createElement("canvas");slice.width=canvas.width;slice.height=sliceH;slice.getContext("2d").drawImage(canvas,0,yPx,canvas.width,sliceH,0,0,canvas.width,sliceH);if(page>0)pdf.addPage();pdf.addImage(slice.toDataURL("image/jpeg",.92),"JPEG",margin,margin,imgW,sliceH*imgW/canvas.width);yPx+=sliceH;page++}
   document.body.removeChild(root);
   return {blob:pdf.output("blob"),name:pdfFileName("Fiche",client.name||"Client",now)};
 }catch(err){console.error(err);return null}
}
async function shareClientBillingPDF(client){
 const result=await createClientBillingPDF(client);
 if(!result){toast("تعذر إنشاء ملف معلومات الفوترة");return}
 const file=new File([result.blob],result.name,{type:"application/pdf"});
 if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){
   try{await navigator.share({title:"Fiche de facturation — "+(client.name||"Client"),text:"معلومات الفوترة الخاصة بالزبون",files:[file]});toast("تم تجهيز ملف معلومات الفوترة");return}catch(e){if(e?.name==="AbortError")return}
 }
 const url=URL.createObjectURL(file);const a=document.createElement("a");a.href=url;a.download=result.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);toast("تم تحميل ملف معلومات الفوترة PDF");
}
function normalizeClientSearch(value){return String(value||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim()}
function renderClientsDirectory(){
 const box=$("clientsDirectoryList"),count=$("clientsDirectoryCount");if(!box)return;
 const query=normalizeClientSearch($("clientsDirectorySearch")?.value||""),groups=new Map();
 (Array.isArray(clients)?clients:[]).forEach(client=>{
  const city=String(client.city||client.ville||"بدون مدينة").trim()||"بدون مدينة",haystack=[city,client.company,client.ice,client.phone,client.address].map(normalizeClientSearch).join(" ");
  if(query&&!haystack.includes(query))return;
  const key=normalizeClientSearch(city)||"بدون مدينة",group=groups.get(key)||{city,clients:0,companies:new Set(),orders:0,due:0,members:[]};group.clients++;group.members.push(client);
  if(client.company||client.societe)group.companies.add(String(client.company||client.societe).trim());
  (Array.isArray(orders)?orders:[]).filter(order=>normalizeClientSearch(order.client)===normalizeClientSearch(client.name)).forEach(order=>{group.orders++;try{group.due+=Math.max(0,Number(recalculateOrderPaymentState(order).due)||0)}catch(e){group.due+=Math.max(0,(Number(order.total)||0)-(Number(order.paid)||0))}});
  groups.set(key,group);
 });
 if(count)count.textContent=String(clients.length);
 const rows=[...groups.values()].sort((a,b)=>b.clients-a.clients||a.city.localeCompare(b.city,"fr"));
 box.innerHTML=rows.length?rows.map((group,cityIndex)=>`<div class="client-city-card"><button class="client-city-toggle" type="button" data-city-index="${cityIndex}"><span class="client-city-heading"><span class="client-city-icon">⌂</span><span><b>${esc(group.city)}</b><small>ضغط باش تشوف الكليان ديال هاد المدينة</small></span><strong>${group.clients}</strong><em>⌄</em></span></button><div class="client-city-metrics"><span><b>${group.clients}</b><small>زبناء</small></span><span><b>${group.orders}</b><small>طلبيات</small></span><span><b>${money(group.due)} درهم</b><small>الباقي</small></span></div><div class="client-city-members" data-city-members="${cityIndex}" hidden>${group.members.map(client=>`<div class="client-city-client"><div><b>${esc(client.name||"زبون بدون اسم")}</b><small>${esc(client.company||client.ice||client.phone||"")}</small></div><div class="client-directory-actions"><button type="button" data-directory-invoice="${esc(client.id)}">📄 Infos facturation</button><button type="button" data-directory-edit="${esc(client.id)}">تعديل</button></div></div>`).join("")}</div></div>`).join(""): `<div class="cart-empty">${query?"ما لقيتش مدينة أو شركة مطابقة للبحث.":"مازال ما تسجل حتى زبون."}</div>`;
 box.querySelectorAll(".client-city-toggle").forEach(btn=>btn.onclick=()=>{const panel=box.querySelector(`[data-city-members="${btn.dataset.cityIndex}"]`);if(!panel)return;const open=!panel.hidden;panel.hidden=open;btn.classList.toggle("is-open",!open)});
 box.querySelectorAll("[data-directory-edit]").forEach(btn=>btn.onclick=()=>{const c=clients.find(x=>String(x.id)===String(btn.dataset.directoryEdit));if(!c)return;closeClientsDirectory();openClientModal(c.name);$("clientEditId").value=c.id;$("clientName").value=c.name||"";$("clientCompany").value=c.company||"";$("clientCity").value=c.city||c.ville||"";$("clientICE").value=c.ice||"";$("clientPaymentHolder").value=c.paymentHolder||c.chequeHolder||c.paymentName||"";$("clientPaymentNumber").value=c.paymentNumber||c.chequeNumber||"";$("clientPaymentType").value=paymentTypeValue(c.paymentType||c.paymentMode||c.modePaiement);$("clientWhatsapp").value=c.phone||""});
 box.querySelectorAll("[data-directory-invoice]").forEach(btn=>btn.onclick=()=>{const c=clients.find(x=>String(x.id)===String(btn.dataset.directoryInvoice));if(c)shareClientBillingPDF(c)});
}
function openClientsDirectory(){renderClientsDirectory();$("clientsDirectoryModal")?.classList.add("show");setTimeout(()=>$("clientsDirectorySearch")?.focus(),80)}
function closeClientsDirectory(){$("clientsDirectoryModal")?.classList.remove("show")}

function returnsSearchNormalize(value){return String(value??"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f\u064B-\u065F]/g,"").replace(/\s+/g," ").trim()}
function returnNumber(value){const raw=String(value??"").replace(/[^0-9,.-]/g,"").replace(",",".");const n=Number(raw);return Number.isFinite(n)?n:0}
function normalizeReturnRows(order){
 const candidates=[];
 const addRows=rows=>{if(Array.isArray(rows))candidates.push(...rows)};
 addRows(order?.returns);addRows(order?.returnHistory);addRows(order?.returnsHistory);addRows(order?.retours);
 if(Array.isArray(order?.operations))addRows(order.operations.filter(row=>/return|retour|رجوع|مرتجع/i.test(String(row?.type||row?.kind||row?.operation||row?.action||""))));
 if(Array.isArray(order?.payments))addRows(order.payments.filter(row=>row?.isReturn===true||/return|retour|رجوع|مرتجع/i.test(String(row?.type||row?.kind||row?.operation||row?.action||""))));
 try{if(typeof getReturnHistory==="function")addRows(getReturnHistory(order))}catch(error){}
 const seen=new Set(),rows=[];
 candidates.forEach((item,index)=>{if(!item||typeof item!=="object")return;const quantity=Math.max(0,returnNumber(item.quantity??item.qty??item.units??item.returnedUnits??item.pieces??item.count));const unitPrice=Math.max(0,returnNumber(item.unitPrice??item.price??item.returnPrice??item.prix));const storedAmount=returnNumber(item.amount??item.total??item.lineTotal??item.value);const amount=Math.max(0,storedAmount||quantity*unitPrice);if(quantity<=0||amount<=0)return;const productName=String(item.productName??item.name??item.product??item.itemName??"منتوج").trim()||"منتوج",productCode=String(item.productCode??item.code??item.itemCode??"").trim(),date=item.date||item.createdAt||item.timestamp||order?.updatedAt||order?.date||"",id=String(item.id??item.returnId??"").trim(),key=id||[date,productCode,productName,quantity,unitPrice,amount].join("|");if(seen.has(key))return;seen.add(key);rows.push({id:id||`return-${index}`,productName,productCode,quantity,unitPrice,amount,date})});return rows}
function collectAllReturnOrders(){
 const merged=new Map();
 const addOrder=source=>{if(!source||typeof source!=="object")return;const client=String(source.client??source.clientName??source.customer??"زبون غير مسجل").trim()||"زبون غير مسجل",orderCode=String(source.orderCode??source.bonCode??source.bonNumber??source.codeBon??"").trim(),date=source.date||source.createdAt||source.updatedAt||"",key=String(source.id??source.orderId??"").trim()||[returnsSearchNormalize(client),returnsSearchNormalize(orderCode),String(date)].join("|");let target=merged.get(key);if(!target){target={...source,client,orderCode,date,__returnRows:[]};merged.set(key,target)}else{if(!target.client||target.client==="زبون غير مسجل")target.client=client;if(!target.orderCode)target.orderCode=orderCode;if(!target.date)target.date=date}normalizeReturnRows(source).forEach(row=>{const rowKey=row.id||[row.date,row.productCode,row.productName,row.quantity,row.unitPrice,row.amount].join("|");if(!target.__returnRows.some(existing=>(existing.id||[existing.date,existing.productCode,existing.productName,existing.quantity,existing.unitPrice,existing.amount].join("|"))===rowKey))target.__returnRows.push(row)})};
 (Array.isArray(orders)?orders:[]).forEach(addOrder);
 storageJson(ORDERS_AUTO_ARCHIVE_KEY,[]).forEach(archive=>(Array.isArray(archive?.orders)?archive.orders:[]).forEach(addOrder));
 storageJson(COLLECTIONS_AUTO_ARCHIVE_KEY,[]).forEach(archive=>{const source=Array.isArray(archive?.orderDetails)?archive.orderDetails:(Array.isArray(archive?.orders)?archive.orders:[]);source.forEach(addOrder)});
 return [...merged.values()].filter(order=>Array.isArray(order.__returnRows)&&order.__returnRows.length);
}
function collectReturnGroups(){const groups=new Map();collectAllReturnOrders().forEach(order=>{const history=Array.isArray(order.__returnRows)?order.__returnRows:[],client=String(order.client||"زبون غير مسجل").trim()||"زبون غير مسجل",key=returnsSearchNormalize(client)||"unknown";history.forEach(item=>{const record={id:item.id||makeId(),client,orderId:order.id||order.orderId||"",orderCode:String(order.orderCode||"").trim(),orderDate:order.date||order.updatedAt||item.date,productName:item.productName||"منتوج",productCode:item.productCode||"",quantity:Math.max(0,returnNumber(item.quantity)),unitPrice:Math.max(0,returnNumber(item.unitPrice)),amount:Math.max(0,returnNumber(item.amount)),date:item.date||order.updatedAt||order.date};let group=groups.get(key);if(!group){group={key,client,total:0,units:0,operations:0,orders:new Map()};groups.set(key,group)}group.total+=record.amount;group.units+=record.quantity;group.operations++;const orderKey=String(record.orderId||`${record.client}|${record.orderCode}|${record.orderDate}`);let orderGroup=group.orders.get(orderKey);if(!orderGroup){orderGroup={orderId:record.orderId,orderCode:record.orderCode,orderDate:record.orderDate,items:[]};group.orders.set(orderKey,orderGroup)}orderGroup.items.push(record)})});return [...groups.values()].map(group=>({...group,orders:[...group.orders.values()]})).sort((a,b)=>b.total-a.total||a.client.localeCompare(b.client,"fr"))}
function renderReturnsPage(){const list=$("returnsClientsList"),empty=$("returnsEmpty");if(!list||!empty)return;const groups=collectReturnGroups(),total=groups.reduce((sum,g)=>sum+g.total,0),units=groups.reduce((sum,g)=>sum+g.units,0),operations=groups.reduce((sum,g)=>sum+g.operations,0);if($("returnsTotalAmount"))$("returnsTotalAmount").textContent=`${money(total)} درهم`;if($("returnsTotalUnits"))$("returnsTotalUnits").textContent=String(units);if($("returnsClientsCount"))$("returnsClientsCount").textContent=String(groups.length);if($("returnsOperationsCount"))$("returnsOperationsCount").textContent=String(operations);const query=returnsSearchNormalize($("returnsSearch")?.value||"");const filtered=groups.map(group=>{const clientMatch=!query||returnsSearchNormalize(group.client).includes(query);const orders=clientMatch?group.orders:group.orders.map(order=>({...order,items:order.items.filter(item=>[item.productName,item.productCode,item.orderCode,item.orderId].some(value=>returnsSearchNormalize(value).includes(query)))})).filter(order=>order.items.length);return {...group,orders}}).filter(group=>group.orders.length);empty.style.display=groups.length&&!filtered.length?"block":"none";empty.textContent=groups.length&&!filtered.length?"ما لقيتش إرجاع مطابق للبحث.":"مازال ما تسجل حتى رجوع سلعة فالبونات.";list.innerHTML=filtered.map(group=>`<details class="returns-client-card" open><summary><div><b>${esc(group.client)}</b><small>${group.operations} عملية · ${group.units} قطعة · ${group.orders.length} بون</small></div><strong>${money(group.total)} درهم</strong></summary><div class="returns-client-orders">${group.orders.map(order=>`<section class="returns-order-card"><div class="returns-order-head"><div><b>Bon de commande ${esc(order.orderCode||"بدون رقم")}</b><small>${formatPaymentDate(order.orderDate)}</small></div><span>${order.items.length} إرجاع</span></div>${order.items.map(item=>`<div class="returns-item-row"><div class="returns-item-main"><b>${esc(item.productName)}</b><small>${item.productCode?`Code: ${esc(item.productCode)} · `:""}<span class="returns-calc">${item.quantity} قطعة × ${money(item.unitPrice)} درهم = ${money(item.amount)} درهم</span></small><small>${formatPaymentDate(item.date)}</small></div><strong>−${money(item.amount)} درهم</strong></div>`).join("")}</section>`).join("")}</div></details>`).join("")}
function openReturnsPage(){$("actionMenu")?.classList.remove("show");renderReturnsPage();$("returnsModal")?.classList.add("show")}
function closeReturnsPage(){$("returnsModal")?.classList.remove("show")}

function collectOperationArchiveOrders(){
 const merged=new Map();
 const addOrder=order=>{if(!order||typeof order!=="object")return;const client=String(order.client||order.clientName||order.customer||"زبون غير مسجل").trim()||"زبون غير مسجل",code=String(order.orderCode||order.bonCode||order.bonNumber||"").trim(),date=order.date||order.createdAt||order.updatedAt||"",key=String(order.id||order.orderId||"").trim()||`${returnsSearchNormalize(client)}|${returnsSearchNormalize(code)}|${date}`;if(!merged.has(key))merged.set(key,{...order,client,orderCode:code,date})};
 (Array.isArray(orders)?orders:[]).forEach(addOrder);
 storageJson(ORDERS_AUTO_ARCHIVE_KEY,[]).forEach(archive=>(Array.isArray(archive?.orders)?archive.orders:[]).forEach(addOrder));
 storageJson(COLLECTIONS_AUTO_ARCHIVE_KEY,[]).forEach(archive=>{const source=Array.isArray(archive?.orderDetails)?archive.orderDetails:(Array.isArray(archive?.orders)?archive.orders:[]);source.forEach(addOrder)});
 return [...merged.values()];
}
function collectPriceChangeArchiveRows(){
 const rows=[];
 collectOperationArchiveOrders().forEach(order=>{getPriceChangeHistory(order).forEach((change,index)=>{const adjustment=priceChangeAdjustment(order,change);rows.push({id:change.id||`${order.id||order.orderCode||order.client}-price-${index}`,client:order.client||"زبون غير مسجل",orderCode:order.orderCode||"",orderId:order.id||"",productName:change.productName||"منتوج",productCode:change.productCode||"",oldPrice:Number(change.oldPrice)||0,newPrice:Number(change.newPrice)||0,difference:Number(change.difference??(Number(change.newPrice)||0)-(Number(change.oldPrice)||0)),quantity:priceChangeQuantity(order,change),adjustment,date:change.date||order.updatedAt||order.date})})});
 return rows.sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));
}
function collectDiscountArchiveRows(){
 const rows=[];
 collectOperationArchiveOrders().forEach(order=>{getDiscountHistory(order).forEach((item,index)=>rows.push({id:item.id||`${order.id||order.orderCode||order.client}-discount-${index}`,client:order.client||"زبون غير مسجل",orderCode:order.orderCode||"",orderId:order.id||"",amount:Math.max(0,Number(item.amount)||0),date:item.date||order.updatedAt||order.date}))});
 return rows.sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));
}
function renderPriceChangesArchivePage(){
 const list=$("priceChangesArchiveList"),empty=$("priceChangesArchiveEmpty");if(!list||!empty)return;const rows=collectPriceChangeArchiveRows(),query=returnsSearchNormalize($("priceChangesArchiveSearch")?.value||""),filtered=query?rows.filter(row=>returnsSearchNormalize(row.client).includes(query)):rows,totalClients=new Set(rows.map(row=>returnsSearchNormalize(row.client))).size,up=rows.filter(row=>row.adjustment>0).length,down=rows.filter(row=>row.adjustment<0).length;
 if($("priceChangesArchiveCount"))$("priceChangesArchiveCount").textContent=String(rows.length);if($("priceChangesArchiveClients"))$("priceChangesArchiveClients").textContent=String(totalClients);if($("priceChangesArchiveUp"))$("priceChangesArchiveUp").textContent=String(up);if($("priceChangesArchiveDown"))$("priceChangesArchiveDown").textContent=String(down);
 empty.style.display=rows.length&&!filtered.length?"block":"none";empty.textContent=rows.length&&!filtered.length?"ما لقيتش تغيير أثمنة مطابق للبحث.":"مازال ما تسجل حتى تغيير فالثمن.";
 list.innerHTML=filtered.map(row=>`<article class="archive-operation-card price-change-archive-card"><div class="archive-operation-head"><div><b>${esc(row.client)}</b><small>Bon: ${esc(row.orderCode||"بدون رقم")}</small></div><time>${formatPaymentDate(row.date)}</time></div><div class="archive-operation-product"><b>${esc(row.productName)}</b>${row.productCode?`<small>Code: ${esc(row.productCode)}</small>`:""}</div><div class="archive-operation-grid"><div><small>الثمن القديم</small><strong>${money(row.oldPrice)} درهم</strong></div><div><small>الثمن الجديد</small><strong>${money(row.newPrice)} درهم</strong></div><div><small>الكمية</small><strong>${row.quantity}</strong></div><div><small>أثر التغيير</small><strong class="${row.adjustment>0?"archive-positive":"archive-negative"}">${row.adjustment>0?"+":"−"}${money(Math.abs(row.adjustment))} درهم</strong></div></div></article>`).join("");
}
function renderDiscountsArchivePage(){
 const list=$("discountsArchiveList"),empty=$("discountsArchiveEmpty");if(!list||!empty)return;const rows=collectDiscountArchiveRows(),query=returnsSearchNormalize($("discountsArchiveSearch")?.value||""),filtered=query?rows.filter(row=>returnsSearchNormalize(row.client).includes(query)):rows,total=rows.reduce((sum,row)=>sum+row.amount,0),max=rows.reduce((value,row)=>Math.max(value,row.amount),0),clientsCount=new Set(rows.map(row=>returnsSearchNormalize(row.client))).size;
 if($("discountsArchiveCount"))$("discountsArchiveCount").textContent=String(rows.length);if($("discountsArchiveClients"))$("discountsArchiveClients").textContent=String(clientsCount);if($("discountsArchiveTotal"))$("discountsArchiveTotal").textContent=`${money(total)} درهم`;if($("discountsArchiveMax"))$("discountsArchiveMax").textContent=`${money(max)} درهم`;
 empty.style.display=rows.length&&!filtered.length?"block":"none";empty.textContent=rows.length&&!filtered.length?"ما لقيتش Remise مطابق للبحث.":"مازال ما تسجل حتى Remise.";
 list.innerHTML=filtered.map((row,index)=>`<article class="archive-operation-card discount-archive-card"><div class="archive-operation-head"><div><b>${esc(row.client)}</b><small>Remise رقم ${index+1} · Bon: ${esc(row.orderCode||"بدون رقم")}</small></div><time>${formatPaymentDate(row.date)}</time></div><div class="discount-archive-highlight"><span>قيمة التخفيض</span><strong>−${money(row.amount)} درهم</strong></div><div class="discount-archive-meta"><span>الزبون: ${esc(row.client)}</span><span>رقم البون: ${esc(row.orderCode||"بدون رقم")}</span><span>التاريخ: ${formatPaymentDate(row.date)}</span></div></article>`).join("");
}
function openPriceChangesArchive(){$("actionMenu")?.classList.remove("show");renderPriceChangesArchivePage();$("priceChangesArchiveModal")?.classList.add("show")}
function closePriceChangesArchive(){$("priceChangesArchiveModal")?.classList.remove("show")}
function openDiscountsArchive(){$("actionMenu")?.classList.remove("show");renderDiscountsArchivePage();$("discountsArchiveModal")?.classList.add("show")}
function closeDiscountsArchive(){$("discountsArchiveModal")?.classList.remove("show")}

let companyInvoiceSelectedClientId="";
let companyInvoiceSelectedOrderId="";
function companyInvoiceClientSearchRows(query){
 const needle=normalizeClientSearch(query);
 return (Array.isArray(clients)?clients:[]).filter(client=>{
  const hay=[client.name,client.company,client.city,client.ville,client.ice,client.phone].map(normalizeClientSearch).join(" ");
  return !needle||hay.includes(needle);
 }).slice(0,10);
}
function companyInvoiceClientOrders(client){
 if(!client)return [];
 const name=normalizeClientSearch(client.name);
 return (Array.isArray(orders)?orders:[]).filter(order=>normalizeClientSearch(order.client||order.clientName)===name).sort((a,b)=>new Date(b.date||b.createdAt||0)-new Date(a.date||a.createdAt||0));
}
function companyInvoiceClientSnapshot(client){
 if(!client)return null;
 return {id:client.id||"",name:client.name||"",company:client.company||"",city:client.city||client.ville||"",ice:client.ice||"",phone:client.phone||"",paymentHolder:client.paymentHolder||client.chequeHolder||client.paymentName||"",paymentNumber:client.paymentNumber||client.chequeNumber||"",paymentType:client.paymentType||client.paymentMode||client.modePaiement||""};
}
function companyInvoiceOrderSnapshot(order){
 if(!order)return null;
 const copy=JSON.parse(JSON.stringify(order));
 return {id:copy.id||"",orderCode:copy.orderCode||copy.bonCode||copy.bonNumber||"",client:copy.client||"",date:copy.date||copy.createdAt||"",items:Array.isArray(copy.items)?copy.items:[],total:Number(copy.total)||0,baseTotal:Number(copy.baseTotal)||0,payments:Array.isArray(copy.payments)?copy.payments:[],installments:Array.isArray(copy.installments)?copy.installments:[],priceChanges:Array.isArray(copy.priceChanges)?copy.priceChanges:[],returns:Array.isArray(copy.returns)?copy.returns:[],operations:Array.isArray(copy.operations)?copy.operations:[],company:copy.company||"",ice:copy.ice||"",phone:copy.phone||"",paymentNumber:copy.paymentNumber||"",paymentType:copy.paymentType||""};
}
function companyInvoiceSelectedClient(){return (Array.isArray(clients)?clients:[]).find(client=>String(client.id)===String(companyInvoiceSelectedClientId))||null}
function companyInvoiceSelectedOrder(){const client=companyInvoiceSelectedClient();const list=companyInvoiceClientOrders(client);return list.find(order=>String(order.id)===String(companyInvoiceSelectedOrderId))||null}
function renderCompanyInvoiceClientResults(query){
 const box=$("companyInvoiceClientResults");if(!box)return;
 const value=String(query||"").trim();
 if(!value){box.hidden=true;box.innerHTML="";return}
 const matches=companyInvoiceClientSearchRows(value);
 box.hidden=false;
 box.innerHTML=matches.length?matches.map(client=>`<button type="button" class="company-invoice-client-result" data-company-invoice-client="${esc(client.id)}"><b>${esc(client.name||"زبون بلا اسم")}</b><small>${esc([client.company,client.city||client.ville,client.ice,client.phone].filter(Boolean).join(" · ")||"بدون تفاصيل إضافية")}</small></button>`).join(""):`<div class="company-invoice-client-no-results">ما لقيتش كليان مطابق. تقدر تكمل الفاتورة بلا اختيار كليان.</div>`;
 box.querySelectorAll("[data-company-invoice-client]").forEach(button=>button.onclick=()=>selectCompanyInvoiceClient(button.dataset.companyInvoiceClient));
}
function renderCompanyInvoiceSelectedClient(){
 const box=$("companyInvoiceSelectedClient"),select=$("companyInvoiceOrderId"),preview=$("companyInvoiceOrderPreview");if(!box||!select||!preview)return;
 const client=companyInvoiceSelectedClient();
 if(!client){box.hidden=true;box.innerHTML="";select.innerHTML='<option value="">معلومات الكليان فقط بلا طلبية</option>';preview.hidden=true;preview.innerHTML="";return}
 box.hidden=false;
 box.innerHTML=`<div class="company-invoice-selected-head"><b>الكليان المختار</b><button type="button" id="clearCompanyInvoiceClient" aria-label="حذف الكليان المختار">×</button></div><div class="company-invoice-client-facts"><span><small>الاسم</small><b>${esc(client.name||"—")}</b></span><span><small>الشركة</small><b>${esc(client.company||"—")}</b></span><span><small>المدينة</small><b>${esc(client.city||client.ville||"—")}</b></span><span><small>ICE</small><b>${esc(client.ice||"—")}</b></span><span><small>الهاتف</small><b>${esc(client.phone||"—")}</b></span><span><small>الأداء</small><b>${esc(paymentTypeLabel(client.paymentType||client.paymentMode||client.modePaiement)||"—")}</b></span></div>${companyInvoiceClientHistoryHtml(client)}`;
 $("clearCompanyInvoiceClient")?.addEventListener("click",clearCompanyInvoiceClient);
 const clientOrders=companyInvoiceClientOrders(client),previous=companyInvoiceSelectedOrderId;
 select.innerHTML='<option value="">معلومات الكليان فقط بلا طلبية</option>'+clientOrders.map(order=>`<option value="${esc(order.id||"")}">${esc(order.orderCode||order.id||"طلبية بلا رقم")} · ${companyInvoiceDateLabel(order.date||order.createdAt)} · ${money(order.total)} درهم</option>`).join("");
 if(previous&&clientOrders.some(order=>String(order.id)===String(previous)))select.value=previous;else if(clientOrders.length===1){companyInvoiceSelectedOrderId=String(clientOrders[0].id||"");select.value=companyInvoiceSelectedOrderId}else companyInvoiceSelectedOrderId="";
 renderCompanyInvoiceOrderPreview();
}
function renderCompanyInvoiceOrderPreview(){
 const preview=$("companyInvoiceOrderPreview");if(!preview)return;const order=companyInvoiceSelectedOrder();
 if(!order){preview.hidden=true;preview.innerHTML="";return}
 const items=Array.isArray(order.items)?order.items:[],total=Number(order.total)||0,paid=typeof paymentTotal==="function"?paymentTotal(order):0,due=Math.max(0,total-paid);
 preview.hidden=false;preview.innerHTML=`<div><b>تفاصيل الطلبية المختارة</b><span>${esc(order.orderCode||order.id||"بدون رقم")} · ${companyInvoiceDateLabel(order.date||order.createdAt)}</span></div><div class="company-invoice-order-items">${items.slice(0,6).map(item=>`<span>${esc(item.name||"منتوج")} · ${Number(item.paidUnits??item.quantity??item.qty??0)} قطعة · ${money(item.lineTotal??item.total??0)} درهم</span>`).join("")||"<span>ما كايناش تفاصيل المنتجات</span>"}</div><strong>مجموع الطلبية: ${money(total)} درهم · الخلاص: ${money(paid)} درهم · الباقي: ${money(due)} درهم</strong>`;
}
function selectCompanyInvoiceClient(id){const client=(Array.isArray(clients)?clients:[]).find(item=>String(item.id)===String(id));if(!client)return;companyInvoiceSelectedClientId=String(client.id);companyInvoiceSelectedOrderId="";$("companyInvoiceClientSearch").value=client.name||"";$("companyInvoiceClientResults").hidden=true;renderCompanyInvoiceSelectedClient()}
function clearCompanyInvoiceClient(){companyInvoiceSelectedClientId="";companyInvoiceSelectedOrderId="";$("companyInvoiceClientSearch").value="";renderCompanyInvoiceClientResults("");renderCompanyInvoiceSelectedClient()}
function resetCompanyInvoicePicker(){companyInvoiceSelectedClientId="";companyInvoiceSelectedOrderId="";$("companyInvoiceClientSearch").value="";renderCompanyInvoiceClientResults("");renderCompanyInvoiceSelectedClient()}
function companyInvoiceRows(){const rows=storageJson(COMPANY_INVOICES_KEY,[]);return Array.isArray(rows)?rows.filter(row=>row&&typeof row==="object"):[]}
function companyInvoiceDateLabel(value){const d=new Date(value);return Number.isNaN(d.getTime())?"—":d.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"})}
function companyInvoiceStatusKey(row){return row?.status==="received"||row?.status==="ready"?"ready":"processing"}
function companyInvoiceStatusLabel(status){return status==="ready"?"جاهزة":"قيد المعالجة"}
function companyInvoiceClientHistoryRows(client){
 if(!client)return [];
 const clientId=String(client.id||""),name=normalizeClientSearch(client.name||"");
 return companyInvoiceRows().filter(row=>String(row.clientId||row.clientInfo?.id||"")===clientId||(name&&normalizeClientSearch(row.clientInfo?.name||"")===name)).sort((a,b)=>new Date(b.createdAt||b.date||0)-new Date(a.createdAt||a.date||0));
}
function companyInvoiceClientHistoryHtml(client){
 const rows=companyInvoiceClientHistoryRows(client);
 if(!rows.length)return `<div class="company-invoice-client-history company-invoice-client-history-empty">مازال ما كايناش فاتورة محفوظة لهاد الكليان.</div>`;
 return `<div class="company-invoice-client-history"><div class="company-invoice-client-history-head"><b>فواتير هاد الكليان</b><span>${rows.length} فاتورة</span></div>${rows.slice(0,6).map(row=>{const status=companyInvoiceStatusKey(row),clientName=row.clientInfo?.name||"كليان بلا اسم";return `<div class="company-invoice-client-history-row"><div><b>${esc(clientName)}</b><small>${companyInvoiceDateLabel(row.date)}</small></div><span class="company-invoice-status-pill ${status}">${companyInvoiceStatusLabel(status)}</span></div>`}).join("")}</div>`;
}
function renderCompanyInvoices(){
 const list=$("companyInvoicesList"),empty=$("companyInvoicesEmpty");if(!list||!empty)return;
 const rows=companyInvoiceRows().sort((a,b)=>new Date(b.createdAt||b.date||0)-new Date(a.createdAt||a.date||0)),query=normalizeClientSearch($("companyInvoiceArchiveSearch")?.value||""),filtered=rows.filter(row=>{const name=row.clientInfo?.name||row.clientName||"";return !query||normalizeClientSearch(name).includes(query)}),received=rows.filter(row=>companyInvoiceStatusKey(row)==="ready").length,pending=rows.length-received;
 if($("companyInvoicesCount"))$("companyInvoicesCount").textContent=String(rows.length);if($("companyInvoicesReceived"))$("companyInvoicesReceived").textContent=String(received);if($("companyInvoicesPending"))$("companyInvoicesPending").textContent=String(pending);
 empty.style.display=rows.length&&!filtered.length?"block":"none";empty.textContent=rows.length&&!filtered.length?"ما لقيتش كليان مطابق للبحث.":"مازال ما تسجل حتى فاتورة للشركة.";
 list.innerHTML=filtered.map(row=>{const status=companyInvoiceStatusKey(row),clientName=row.clientInfo?.name||row.clientName||"كليان بلا اسم",clientFacts=[row.clientInfo?.company,row.clientInfo?.city,row.clientInfo?.ice,row.clientInfo?.phone].filter(Boolean).join(" · ");return `<article class="company-invoice-card ${status==="ready"?"is-ready is-received":"is-processing is-pending"}"><div class="company-invoice-card-head"><div><b>${esc(clientName)}</b><small>معلومات الكليان</small></div><span class="company-invoice-status-pill ${status}"><i></i>${companyInvoiceStatusLabel(status)}</span></div><div class="company-invoice-meta"><span>تاريخ التسجيل: <b>${companyInvoiceDateLabel(row.date)}</b></span><span>آخر تحديث: <b>${companyInvoiceDateLabel(row.updatedAt||row.createdAt||row.date)}</b></span></div><div class="company-invoice-client-summary"><b>معلومات الكليان</b><span>${esc(clientName)}</span><span>${esc(clientFacts||"بدون تفاصيل إضافية")}</span></div>${row.orderSnapshot?`<div class="company-invoice-order-summary"><b>الطلبية المرتبطة</b><span>${esc(row.orderSnapshot.orderCode||row.orderSnapshot.id||"بدون رقم")} · ${companyInvoiceDateLabel(row.orderSnapshot.date)}</span></div>`:""}${row.note?`<div class="company-invoice-note">${esc(row.note)}</div>`:""}<div class="company-invoice-status-title">حالة الفاتورة</div><div class="company-invoice-status-actions"><button type="button" class="company-invoice-status-btn pending-btn ${status==="processing"?"active":""}" data-company-invoice-status="pending" data-company-invoice-id="${esc(row.id)}">قيد المعالجة</button><button type="button" class="company-invoice-status-btn received-btn ${status==="ready"?"active":""}" data-company-invoice-status="received" data-company-invoice-id="${esc(row.id)}">✓ جاهزة</button><button type="button" class="company-invoice-pdf" data-company-invoice-share-pdf="${esc(row.id)}">📄 إرسال PDF للشركة</button><button type="button" class="company-invoice-delete" data-company-invoice-delete="${esc(row.id)}" aria-label="حذف الفاتورة">×</button></div></article>`}).join("");
 list.querySelectorAll("[data-company-invoice-status]").forEach(button=>button.onclick=()=>updateCompanyInvoiceStatus(button.dataset.companyInvoiceId,button.dataset.companyInvoiceStatus));list.querySelectorAll("[data-company-invoice-share-pdf]").forEach(button=>button.onclick=()=>shareCompanyInvoicePDF(button.dataset.companyInvoiceSharePdf));list.querySelectorAll("[data-company-invoice-delete]").forEach(button=>button.onclick=()=>{if(!confirm("واش بغيتي تحذف هاد الفاتورة؟"))return;const next=companyInvoiceRows().filter(row=>String(row.id)!==String(button.dataset.companyInvoiceDelete));saveStorageJson(COMPANY_INVOICES_KEY,next);renderCompanyInvoices();toast("تحيدات الفاتورة")})
}
function updateCompanyInvoiceStatus(id,status){const rows=companyInvoiceRows(),row=rows.find(item=>String(item.id)===String(id));if(!row)return;row.status=status==="received"||status==="ready"?"received":"pending";row.updatedAt=new Date().toISOString();saveStorageJson(COMPANY_INVOICES_KEY,rows);renderCompanyInvoices();toast(row.status==="received"?"الفاتورة ولات جاهزة":"الفاتورة ولات قيد المعالجة")}
function saveCompanyInvoiceForm(event){
 event.preventDefault();
 const client=companyInvoiceSelectedClient(),order=companyInvoiceSelectedOrder();
 if(!client){toast("اختار الكليان أولا باش نرسل الفاتورة");return}
 const now=new Date(),date=now.toISOString().slice(0,10),number=`FAC-${date.replaceAll("-","")}-${String(Date.now()).slice(-4)}`,company="3D PEINTURES",amount=Math.max(0,Number(order?.total)||0),note=order?`فاتورة مرتبطة بالطلبية ${order.orderCode||order.id||""}`:"فاتورة معلومات الكليان بلا طلبية";
 const rows=companyInvoiceRows();
 rows.unshift({id:makeId(),company,number,amount,date,note,status:"pending",createdAt:now.toISOString(),updatedAt:now.toISOString(),clientId:client.id||"",clientInfo:companyInvoiceClientSnapshot(client),orderId:order?.id||"",orderSnapshot:companyInvoiceOrderSnapshot(order)});
 if(!saveStorageJson(COMPANY_INVOICES_KEY,rows)){toast("تعذر إرسال الفاتورة");return}
 $("companyInvoiceForm")?.reset();resetCompanyInvoicePicker();renderCompanyInvoices();toast("ترسلات الفاتورة وتحفظات فالأرشيف")
}
async function createCompanyInvoicePDF(row){
 let root=null;
 try{
  if(!window.html2canvas||!window.jspdf)throw new Error("PDF libraries unavailable");
  const client=row.clientInfo||companyInvoiceClientSnapshot((Array.isArray(clients)?clients:[]).find(item=>String(item.id)===String(row.clientId)))||{};
  root=document.createElement("div");root.dir="ltr";root.style.cssText="position:fixed;left:-10000px;top:0;width:760px;background:#fff;color:#172033;padding:42px;font-family:Arial,sans-serif;box-sizing:border-box;direction:ltr;text-align:left";
  root.innerHTML=`<div style="min-height:980px;border:1px solid #d9e1ec;border-radius:24px;background:linear-gradient(145deg,#ffffff 0%,#f7fbff 72%,#fffaf0 100%);padding:36px;box-sizing:border-box;display:flex;flex-direction:column"><div style="height:5px;border-radius:8px;background:linear-gradient(90deg,#173f78 0%,#173f78 62%,#c89b3c 62%,#c89b3c 100%);margin:-36px -36px 30px"></div><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding-bottom:22px;border-bottom:1px solid #dbe4ef"><div><div style="font-size:18px;letter-spacing:4px;color:#c08b2c;font-weight:900">3D PEINTURES</div><div style="font-size:12px;letter-spacing:1.6px;color:#667085;margin-top:7px">SERVICE COMMERCIAL</div><div style="font-size:16px;color:#173f78;font-weight:900;margin-top:8px">Mr ZAMZAM NEZAR</div></div><div style="text-align:right;padding:12px 14px;border:1px solid #d9e1ec;border-radius:12px;background:#fff"><div style="font-size:10px;color:#98a2b3;letter-spacing:1px">DATE D'ENVOI</div><div style="font-size:16px;font-weight:900;color:#173f78;margin-top:5px">${companyInvoiceDateLabel(new Date(row.createdAt||row.date||Date.now()))}</div></div></div><div style="margin-top:30px;text-align:center"><div style="font-size:27px;font-weight:900;color:#172033">معلومات الكليان</div><div style="width:76px;height:4px;border-radius:8px;background:#c89b3c;margin:12px auto 0"></div><div style="font-size:12px;color:#667085;margin-top:11px">FICHE D'INFORMATIONS CLIENT</div></div><section style="margin-top:30px;border:2px solid #b9d7c4;border-radius:18px;padding:24px;background:linear-gradient(135deg,#f6fff8,#ffffff);box-shadow:0 10px 24px rgba(23,63,120,.07)"><div style="display:flex;align-items:center;gap:10px;padding-bottom:15px;border-bottom:1px solid #d9eee0"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#12b76a"></span><div style="font-size:17px;color:#087443;font-weight:900">بيانات الكليان</div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:22px 28px;padding-top:23px;font-size:15px"><div><span style="display:block;color:#667085;font-size:11px;margin-bottom:6px">الاسم</span><b style="font-size:17px;color:#172033">${esc(client.name||"—")}</b></div><div><span style="display:block;color:#667085;font-size:11px;margin-bottom:6px">الشركة</span><b style="font-size:17px;color:#172033">${esc(client.company||"—")}</b></div><div><span style="display:block;color:#667085;font-size:11px;margin-bottom:6px">المدينة</span><b style="font-size:16px;color:#172033">${esc(client.city||"—")}</b></div><div><span style="display:block;color:#667085;font-size:11px;margin-bottom:6px">ICE</span><b style="font-size:16px;color:#172033;direction:ltr;display:block">${esc(client.ice||"—")}</b></div><div><span style="display:block;color:#667085;font-size:11px;margin-bottom:6px">الهاتف</span><b style="font-size:16px;color:#172033;direction:ltr;display:block">${esc(client.phone||"—")}</b></div><div><span style="display:block;color:#667085;font-size:11px;margin-bottom:6px">طريقة الأداء</span><b style="font-size:16px;color:#172033">${esc(paymentTypeLabel(client.paymentType)||"—")}</b></div></div></section><div style="flex:1"></div><div style="margin-top:22px;text-align:center;color:#667085;font-size:10px;line-height:1.5"><div style="font-size:11px;color:#667085">المرجو معالجة الطلب في أقرب فرصة.</div><div style="font-size:9px;color:#98a2b3;margin-top:4px">شكراً لتعاونكم وثقتكم.</div></div><div style="margin-top:22px;padding-top:15px;border-top:1px solid #dbe4ef;display:flex;justify-content:space-between;gap:12px;color:#98a2b3;font-size:10px"><span>وثيقة معلومات الكليان</span><span>Mr ZAMZAM NEZAR · ${companyInvoiceDateLabel(new Date(row.createdAt||row.date||Date.now()))}</span></div></div>`;
  document.body.appendChild(root);const canvas=await html2canvas(root,{scale:2,backgroundColor:"#fff",useCORS:true,logging:false});const {jsPDF}=window.jspdf,pdf=new jsPDF({orientation:"p",unit:"mm",format:"a4"}),pageW=210,pageH=297,margin=8,imgW=pageW-margin*2,imgH=canvas.height*imgW/canvas.width,pagePx=Math.floor(canvas.width*(pageH-margin*2)/imgW);let yPx=0,page=0;
  while(yPx<canvas.height){const sliceH=Math.min(pagePx,canvas.height-yPx),slice=document.createElement("canvas");slice.width=canvas.width;slice.height=sliceH;slice.getContext("2d").drawImage(canvas,0,yPx,canvas.width,sliceH,0,0,canvas.width,sliceH);if(page>0)pdf.addPage();pdf.addImage(slice.toDataURL("image/jpeg",.92),"JPEG",margin,margin,imgW,sliceH*imgW/canvas.width);yPx+=sliceH;page++}
  const clientName=client.name||"Client";return {blob:pdf.output("blob"),name:pdfFileName("Infos-Client",clientName,new Date(row.date||row.createdAt||Date.now()))};
 }catch(error){console.error("Company invoice PDF failed",error);return null}finally{if(root&&root.parentNode)root.parentNode.removeChild(root)}
}
async function shareCompanyInvoicePDF(id){
 const row=companyInvoiceRows().find(item=>String(item.id)===String(id));if(!row){toast("ما لقيتش الفاتورة");return}
 const result=await createCompanyInvoicePDF(row);if(!result){toast("تعذر إنشاء ملف PDF");return}
 const file=new File([result.blob],result.name,{type:"application/pdf"});
 if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){try{await navigator.share({title:`معلومات الكليان — ${row.clientInfo?.name||""}`,text:"المرجو معالجة الطلب في أقرب فرصة.",files:[file]});toast("توجد PDF جاهز للإرسال للشركة");return}catch(error){if(error?.name==="AbortError")return}}
 const url=URL.createObjectURL(file),opened=window.open(url,"_blank");if(!opened){const link=document.createElement("a");link.href=url;link.download=result.name;document.body.appendChild(link);link.click();link.remove()}setTimeout(()=>URL.revokeObjectURL(url),6000);toast("توجد PDF جاهز، تحل أو تهبط حسب دعم الهاتف")
}
function openCompanyInvoices(){$("actionMenu")?.classList.remove("show");renderCompanyInvoiceSelectedClient();renderCompanyInvoices();$("companyInvoicesModal")?.classList.add("show")}
function closeCompanyInvoices(){$("companyInvoicesModal")?.classList.remove("show")}

function saveClientForm(e){
 e.preventDefault();
 const name=$("clientName").value.trim(); if(!name){alert("دخل اسم الكليان");return}
  const data={id:$("clientEditId").value||("c_"+Date.now().toString(36)),name,company:$("clientCompany").value.trim(),city:$("clientCity").value.trim(),ice:$("clientICE").value.trim(),paymentHolder:$("clientPaymentHolder").value.trim(),paymentNumber:$("clientPaymentNumber").value.trim(),paymentType:paymentTypeValue($("clientPaymentType").value),phone:$("clientWhatsapp").value.trim()};
 const idx=clients.findIndex(c=>c.id===data.id);
 const duplicate=clients.findIndex(c=>c.id!==data.id && String(c.name||"").trim().toLowerCase()===name.toLowerCase());
 if(duplicate>=0){ clients[duplicate]={...clients[duplicate],...data,id:clients[duplicate].id}; }
 else if(idx>=0) clients[idx]=data; else clients.unshift(data);
   saveClients(); renderClientStats(); $("orderClient").value=name; hideClientSuggestions(); closeClientModal(); toast("تم حفظ معلومات الكليان");

}

/* Commandes : archive, paiements et bénéfice */
function orderCartSummary(){
 let total=0,profit=0;
 cart.forEach(row=>{
   const p=products.find(x=>x.id===row.id); if(!p)return;
   const boxes=Number(row.qty)||0, units=Number(p.qty)||0;
   const paidUnits=units*boxes;
   const unitPrice=unitPriceForQuantity(p,paidUnits);
   total += unitPrice*paidUnits;
   profit += (unitPrice-Number(p.costPrice||0))*paidUnits;
 });
 return {total,profit};
}
function syncOrderChoiceCards(){
 const termInput=document.querySelector('input[name="orderPaymentTermChoice"]:checked');
 const term=termInput?.value||"cod";
 const paymentInputs=[...document.querySelectorAll('input[name="orderPaymentTypeChoice"]')];
 const cashInput=paymentInputs.find(input=>input.value==="cash");
 paymentInputs.forEach(input=>{
  const locked=term!=="cod"&&input.value!=="cash";
  input.disabled=locked;
  input.closest(".order-choice")?.classList.toggle("is-disabled",locked);
 });
 if(term!=="cod"&&cashInput)cashInput.checked=true;
 const paymentType=document.querySelector('input[name="orderPaymentTypeChoice"]:checked')?.value||"cash";
 $("orderPaymentTerm").value=term;
 $("orderPaymentType").value=paymentType;
 document.querySelectorAll(".order-choice").forEach(choice=>choice.classList.toggle("is-selected",!!choice.querySelector("input")?.checked));
}
function resetOrderChoiceCards(){
 const term=document.querySelector('input[name="orderPaymentTermChoice"][value="cod"]');
 const cash=document.querySelector('input[name="orderPaymentTypeChoice"][value="cash"]');
 if(term)term.checked=true;
 if(cash)cash.checked=true;
 syncOrderChoiceCards();
}
function openOrderModal(){
 if(!cart.length){toast("السلة فارغة");return}
 const x=orderCartSummary();
  $("orderClient").value="";hideClientSuggestions();
  resetOrderChoiceCards();
 $("orderGrandTotal").textContent=money(x.total)+" درهم";
 // La fenêtre d'enregistrement passe au-dessus du panier : le panier et ses boutons restent derrière.
 $("orderModal").classList.add("show");
 // Ne pas ouvrir automatiquement le clavier sur Android.
}
function closeOrderModal(){hideClientSuggestions();$("orderModal").classList.remove("show")}
async function createOrderPDF(order){
 try{
   if(!window.html2canvas || !window.jspdf) throw new Error("PDF libraries unavailable");

   // Pre-load logo as base64 so html2canvas can render it offline
   let logoB64 = "";
   try{
     const r = await fetch("https://www.dropbox.com/scl/fi/g6bef6j1a3gtse98o9ktp/Picsart_26-08-12_00-00-35-616.png?rlkey=z5wm1262vccogra8t9n71stei&st=5lq7g02n&raw=1");
     const blob = await r.blob();
     logoB64 = await new Promise(res=>{ const fr=new FileReader(); fr.onload=e=>res(e.target.result); fr.readAsDataURL(blob); });
   }catch(e){ console.warn("Logo load failed",e); }

   const root=document.createElement("div");
   root.dir="ltr";
   root.style.cssText="position:fixed;left:-10000px;top:0;width:760px;background:#fff;color:#172033;padding:42px;font-family:Arial,sans-serif;z-index:-1;box-sizing:border-box";
   const d=new Date(order.date);
   const date=d.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"});
   const time=d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
    const productSubtotal=(Array.isArray(order.items)?order.items:[]).reduce((sum,row)=>{const p=products.find(x=>x.id===row.id)||{};const boxes=Number(row.qty)||0;const units=Number(row.units??p.qty)||0;const unitPrice=Number(row.unitPrice??p.price)||0;const paidUnits=Number(row.paidUnits??(boxes*units))||0;return sum+Number(row.lineTotal??(unitPrice*paidUnits))||sum},0);
    const rows=order.items.map(row=>{
      const p=products.find(x=>x.id===row.id)||{};
      const boxes=Number(row.qty)||0;
      const units=Number(row.units ?? p.qty)||0;
      const unitPrice=Number(row.unitPrice ?? p.price)||0;
      const paidUnits=Number(row.paidUnits ?? (boxes*units))||0;
      const freeUnits=Number(row.freeUnits ?? (hasPromo10Plus1(p)?Math.floor(paidUnits/10):0))||0;
      const deliveredUnits=paidUnits+freeUnits;
      const line=Number(row.lineTotal ?? (unitPrice*paidUnits))||0;
      const promoNote=freeUnits>0?`<div style="margin-top:4px;color:#d92d20;font-size:11px;font-weight:800">🎁 10 + 1 GRATUIT · +${freeUnits} pièce(s) offerte(s) · livré : ${deliveredUnits}</div>`:"";
      return `<tr><td style="padding:8px;border-bottom:1px solid #ddd;text-align:left"><div>${esc(row.name||p.name||"Produit")}</div>${promoNote}</td><td style="padding:8px;border-bottom:1px solid #ddd;text-align:center">${boxes}</td><td style="padding:8px;border-bottom:1px solid #ddd;text-align:center">${units}</td><td style="padding:8px;border-bottom:1px solid #ddd;text-align:right">${money(unitPrice)} درهم</td><td style="padding:8px;border-bottom:1px solid #ddd;text-align:right;font-weight:700">${money(line)} درهم</td></tr>`;
    }).join("");
    const scheduleState=deadlineState(order);
    const scheduleHtml=paymentScheduleHtml(order,scheduleState);
    const isCodOrder=scheduleState.termKey==="cod";
    const creditDueDate=scheduleState.dueDate?scheduleState.dueDate.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"}):"—";
    const creditFooterHtml=isCodOrder?"":`<div style="margin-top:22px;border-top:2px solid #12386f;border-bottom:2px solid #12386f;padding:12px 4px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;direction:ltr;text-align:center"><div><div style="font-size:10px;color:#667085">Total produits</div><div style="font-size:15px;font-weight:700;color:#172033;margin-top:4px">${money(productSubtotal)} درهم</div><div style="font-size:10px;color:#667085;margin-top:2px">مجموع ثمن المنتجات</div></div><div><div style="font-size:10px;color:#667085">Date limite de règlement</div><div style="font-size:14px;font-weight:700;color:#c62828;margin-top:4px">${creditDueDate}</div><div style="font-size:10px;color:#c62828;margin-top:2px">تاريخ آخر أجل للاستخلاص</div></div><div><div style="font-size:10px;color:#667085">Total du bon</div><div style="font-size:17px;font-weight:900;color:#c62828;margin-top:4px">${money(order.total)} درهم</div><div style="font-size:10px;color:#667085;margin-top:2px">الإجمالي للبون</div></div></div>`;

   const watermarkHtml = logoB64
     ? `<div style="position:absolute;top:55%;left:50%;transform:translate(-50%,-50%);width:620px;opacity:0.18;z-index:0;pointer-events:none;"><img src="${logoB64}" style="width:100%;height:auto;filter:none;"></div>`
     : `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:80px;font-weight:900;color:#ddd;opacity:0.15;z-index:0;pointer-events:none;white-space:nowrap;transform:translate(-50%,-50%) rotate(-30deg);">3D PEINTURES</div>`;

   root.innerHTML=`
     ${watermarkHtml}
     <div style="position:relative;z-index:1;">
       <div style="border-bottom:3px solid #12386f;padding-bottom:12px;margin-bottom:17px">
         <div style="font-size:13px;letter-spacing:3px;color:#b58a2a;font-weight:700">3D PEINTURES</div>
         <div style="font-size:25px;font-weight:800;margin-top:4px;letter-spacing:.2px">BON DE COMMANDE</div>
         <div style="font-size:11px;color:#667085;margin-top:5px">${date} à ${time}</div>
       </div>
       <div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:17px;direction:ltr">
         <div style="flex:1;border:1px solid #ddd;border-radius:9px;padding:12px">
           <div style="color:#777;font-size:10px;letter-spacing:.5px">CLIENT</div>
           <div style="font-size:18px;font-weight:800;margin-top:5px">${esc(order.client)}</div>
           ${order.company?`<div style="margin-top:5px;font-size:11px"><b>Société :</b> ${esc(order.company)}</div>`:""}
           ${order.ice?`<div style="margin-top:4px;font-size:11px"><b>ICE :</b> ${esc(order.ice)}</div>`:""}
           ${order.paymentNumber?`<div style="margin-top:4px;font-size:11px"><b>N° chèque / cambiale :</b> ${esc(order.paymentNumber)}</div>`:""}
           ${order.paymentType?`<div style="margin-top:4px;font-size:11px"><b>Type de paiement :</b> ${esc(paymentTypeLabel(order.paymentType))}</div>`:""}
           ${order.phone?`<div style="margin-top:4px;font-size:11px"><b>Téléphone :</b> ${esc(order.phone)}</div>`:""}
         </div>
         <div style="width:180px;border:1px solid #ddd;border-radius:9px;padding:12px">
           <div style="color:#777;font-size:10px;letter-spacing:.5px">DATE</div>
           <div style="font-size:14px;font-weight:700;margin-top:5px">${date} · ${time}</div>
         </div>
       </div>
       <table style="width:100%;border-collapse:collapse;font-size:12px;direction:ltr">
         <thead>
           <tr style="background:#12386f;color:#fff">
             <th style="padding:8px;text-align:left">Désignation</th>
             <th style="padding:8px">Boîtes</th>
             <th style="padding:8px">Unités / boîte</th>
             <th style="padding:8px;text-align:right">Prix unitaire</th>
             <th style="padding:8px;text-align:right">Total</th>
           </tr>
         </thead>
         <tbody>${rows}</tbody>
       </table>
       ${isCodOrder?`<div style="margin:14px 0 0 auto;width:280px;border:1px solid #d9ad4d;border-radius:9px;padding:10px 12px;direction:ltr;background:#fffdf7"><div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;color:#172033"><span>Total produits</span><b>${money(productSubtotal)} درهم</b></div><div style="font-size:10px;color:#667085;margin-top:3px;text-align:right">مجموع أثمان المنتجات</div></div>`:""}
       ${creditFooterHtml}
       ${isCodOrder?`<div style="margin-top:20px">${scheduleHtml}</div>`:""}
       <div style="margin-top:28px;text-align:center;color:#777;font-size:14px">Merci pour votre confiance · 3D PEINTURES</div>
     </div>`;

   document.body.appendChild(root);
   const canvas=await html2canvas(root,{scale:2,backgroundColor:"#ffffff",useCORS:true,logging:false});
   const {jsPDF}=window.jspdf;
   const pdf=new jsPDF({orientation:"p",unit:"mm",format:"a4"});
   const pageW=210,pageH=297,margin=8;
   const imgW=pageW-margin*2;
   const imgH=canvas.height*imgW/canvas.width;
   const pagePx=Math.floor(canvas.width*(pageH-margin*2)/imgH);
   let yPx=0, page=0;
   while(yPx<canvas.height){
     const sliceH=Math.min(pagePx,canvas.height-yPx);
     const slice=document.createElement("canvas"); slice.width=canvas.width; slice.height=sliceH;
     slice.getContext("2d").drawImage(canvas,0,yPx,canvas.width,sliceH,0,0,canvas.width,sliceH);
     if(page>0) pdf.addPage();
     pdf.addImage(slice.toDataURL("image/jpeg",.92),"JPEG",margin,margin,imgW,sliceH*imgW/canvas.width);
     yPx+=sliceH; page++;
   }
   document.body.removeChild(root);
   return {blob:pdf.output("blob"),name:pdfFileName("Bon",order.client||"Client",d)};
 }catch(err){console.error(err); return null;}
}
async function createInvoiceRequestPDF(order){
 try{
   if(!window.html2canvas || !window.jspdf) throw new Error("PDF libraries unavailable");
   let logoB64="";
   try{
     const r=await fetch("https://www.dropbox.com/scl/fi/g6bef6j1a3gtse98o9ktp/Picsart_26-08-12_00-00-35-616.png?rlkey=z5wm1262vccogra8t9n71stei&st=5lq7g02n&raw=1");
     const blob=await r.blob();
     logoB64=await new Promise(resolve=>{const fr=new FileReader();fr.onload=e=>resolve(e.target.result);fr.readAsDataURL(blob)});
   }catch(e){console.warn("Logo invoice request load failed",e)}
   const clientObj=clients.find(c=>String(c.name||"").trim().toLowerCase()===String(order.client||"").trim().toLowerCase())||{};
   const company=order.company||clientObj.company||"";
   const ice=order.ice||clientObj.ice||"";
   const paymentName=order.paymentName||clientObj.paymentName||clientObj.chequeName||"";
   const d=new Date(order.date);
   const date=d.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"});
   const time=d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
   const scheduleState=deadlineState(order);
   const scheduleHtml=paymentScheduleHtml(order,scheduleState);
   const rows=(order.items||[]).map(row=>{
     const p=products.find(x=>x.id===row.id)||{};
     const boxes=Number(row.qty)||0;
     const units=Number(row.units??p.qty)||0;
     const unitPrice=Number(row.unitPrice??p.price)||0;
     const paidUnits=Number(row.paidUnits??(boxes*units))||0;
     const freeUnits=Number(row.freeUnits??(hasPromo10Plus1(p)?Math.floor(paidUnits/10):0))||0;
     const delivered=paidUnits+freeUnits;
     const line=Number(row.lineTotal??(unitPrice*paidUnits))||0;
     return `<tr><td style="padding:11px;border-bottom:1px solid #e6e8ed;text-align:left"><b>${esc(row.name||p.name||"Produit")}</b>${freeUnits?`<div style="margin-top:4px;color:#ad7b16;font-size:11px;font-weight:700">10 + 1 Gratuit · livré ${delivered} pièces</div>`:""}</td><td style="padding:11px;border-bottom:1px solid #e6e8ed;text-align:center">${boxes}</td><td style="padding:11px;border-bottom:1px solid #e6e8ed;text-align:center">${units}</td><td style="padding:11px;border-bottom:1px solid #e6e8ed;text-align:right">${money(unitPrice)} درهم</td><td style="padding:11px;border-bottom:1px solid #e6e8ed;text-align:right;font-weight:800">${money(line)} درهم</td></tr>`;
   }).join("");
   const watermark=logoB64?`<div style="position:absolute;top:57%;left:50%;transform:translate(-50%,-50%);width:520px;opacity:.10;z-index:0"><img src="${logoB64}" style="width:100%;height:auto"></div>`:"";
   const root=document.createElement("div");
   root.dir="ltr";
   root.style.cssText="position:fixed;left:-10000px;top:0;width:760px;background:#fff;color:#172033;padding:42px;font-family:Arial,sans-serif;z-index:-1;box-sizing:border-box";
   root.innerHTML=`${watermark}<div style="position:relative;z-index:1">
     <div style="border-bottom:4px solid #c49a38;padding-bottom:18px;margin-bottom:24px">
       <div style="font-size:16px;letter-spacing:4px;color:#b58a2a;font-weight:700">3D PEINTURES</div>
       <div style="font-size:32px;font-weight:800;margin-top:6px">DEMANDE DE FACTURE</div>
       <div style="font-size:14px;color:#667085;margin-top:8px">Date de la demande : ${date} · ${time}</div>
     </div>
     <div style="border:1px solid #dfe3e8;border-radius:13px;padding:18px;margin-bottom:22px;background:#fffdf7">
       <div style="font-size:14px;color:#9a6b12;font-weight:800;margin-bottom:12px">INFORMATIONS DE FACTURATION</div>
       <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:15px">
         <div><span style="color:#667085">Nom du client</span><br><b>${esc(order.client||"—")}</b></div>
         <div><span style="color:#667085">Société</span><br><b>${esc(company||"—")}</b></div>
         <div><span style="color:#667085">ICE</span><br><b>${esc(ice||"—")}</b></div>
         <div><span style="color:#667085">Nom du chèque / cambiale</span><br><b>${esc(paymentName||"—")}</b></div>
       </div>
     </div>
     <div style="margin:0 0 22px">${scheduleHtml}</div>
     <div style="font-size:16px;font-weight:800;margin:0 0 9px">DÉTAIL DE LA COMMANDE</div>
     <table style="width:100%;border-collapse:collapse;font-size:14px;direction:ltr">
       <thead><tr style="background:#172f57;color:#fff"><th style="padding:11px;text-align:left">Désignation</th><th style="padding:11px">Boîtes</th><th style="padding:11px">Unités / boîte</th><th style="padding:11px;text-align:right">Prix unitaire</th><th style="padding:11px;text-align:right">Total</th></tr></thead>
       <tbody>${rows||`<tr><td colspan="5" style="padding:18px;text-align:center;color:#667085">Aucun produit</td></tr>`}</tbody>
     </table>
     <div style="margin-top:24px;margin-left:auto;width:330px;border:2px solid #c49a38;border-radius:13px;padding:16px"><div style="display:flex;justify-content:space-between;font-size:21px;font-weight:900"><span>Total commande</span><span>${money(order.total)} درهم</span></div></div>
     <div style="margin-top:30px;padding:16px;border-left:4px solid #c49a38;background:#fff9e9;font-size:16px;line-height:1.55">Nous vous prions de bien vouloir établir la facture correspondante à cette commande avec les informations de facturation indiquées ci-dessus.</div>
     <div style="margin-top:32px;text-align:center;color:#667085;font-size:13px">Merci pour votre collaboration · 3D PEINTURES</div>
   </div>`;
   document.body.appendChild(root);
   const canvas=await html2canvas(root,{scale:2,backgroundColor:"#ffffff",useCORS:true,logging:false});
   const {jsPDF}=window.jspdf;
   const pdf=new jsPDF({orientation:"p",unit:"mm",format:"a4"});
   const pageW=210,pageH=297,margin=8,imgW=pageW-margin*2,imgH=canvas.height*imgW/canvas.width,pagePx=Math.floor(canvas.width*(pageH-margin*2)/imgH);
   let yPx=0,page=0;
   while(yPx<canvas.height){const sliceH=Math.min(pagePx,canvas.height-yPx);const slice=document.createElement("canvas");slice.width=canvas.width;slice.height=sliceH;slice.getContext("2d").drawImage(canvas,0,yPx,canvas.width,sliceH,0,0,canvas.width,sliceH);if(page>0)pdf.addPage();pdf.addImage(slice.toDataURL("image/jpeg",.92),"JPEG",margin,margin,imgW,sliceH*imgW/canvas.width);yPx+=sliceH;page++}
   document.body.removeChild(root);
   return {blob:pdf.output("blob"),name:pdfFileName("Facture",order.client||"Client",d)};
 }catch(err){console.error(err);return null}
}
async function shareInvoiceRequestPDF(order){
 const result=await createInvoiceRequestPDF(order);
 if(!result){toast("تعذر إنشاء ملف طلب الفاتورة");return}
 const file=new File([result.blob],result.name,{type:"application/pdf"});
 if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){
   try{await navigator.share({title:"Demande de facture — "+(order.client||"Client"),text:"طلب فاتورة للشركة",files:[file]});toast("تم تجهيز ملف طلب الفاتورة");return}catch(e){if(e?.name==="AbortError")return}
 }
 const url=URL.createObjectURL(file);const a=document.createElement("a");a.href=url;a.download=result.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);toast("تم تحميل ملف طلب الفاتورة PDF");
}
async function createOrderImage(order){
 try{
  if(!window.html2canvas)throw new Error("html2canvas unavailable");
  recalculateOrderPaymentState(order);
  const deadline=deadlineState(order),isCodTerm=deadline.termKey==="cod",dueDateText=deadline.dueDate?deadline.dueDate.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"}):"—";
  const isFullyPaid=Math.max(0,Number(order.total||0)-paymentTotal(order))<=0.000001;const dueNoticeHtml=isFullyPaid?`<div style="margin-top:18px;padding:14px 16px;border:3px solid #17824b;border-radius:13px;background:#ecfdf3;color:#087443;text-align:center;font-size:22px;font-weight:950">✓ خالص بالكامل</div>`:isCodTerm?`<div style="margin-top:18px;padding:14px 16px;border:3px solid #b42318;border-radius:13px;background:#fff1f0;color:#b42318;text-align:center;font-size:21px;font-weight:900">طريقة الاستخلاص: عند الاستلام</div>`:`<div style="margin-top:18px;padding:14px 16px;border:3px solid #b42318;border-radius:13px;background:#fff1f0;color:#b42318;text-align:center;font-size:21px;font-weight:900">آخر أجل للاستخلاص: ${dueDateText}</div>`;
  const d=new Date(order.date),date=d.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"}),time=d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}),changes=getPriceChangeHistory(order),payments=getPaymentHistory(order),paid=paymentTotal(order),total=Number(order.total)||0,baseTotal=Number(order.baseTotal),hasChanges=changes.length>0,priceAdjustmentTotal=changes.reduce((sum,change)=>sum+priceChangeAdjustment(order,change),0);
     const returns=getReturnHistory(order),returnsTotal=returnTotal(order),hasReturns=returns.length>0;
   const returnsSectionHtml=hasReturns?`<div style="margin-top:17px;padding:14px;border:2px solid #17824b;border-radius:14px;background:#fff4e5"><div style="display:flex;justify-content:space-between;gap:10px;color:#b54708;font-size:17px;font-weight:900"><span>الإرجاعات / Retours</span><strong>−${money(returnsTotal)} درهم</strong></div>${returns.map((item,index)=>`<div style="display:flex;justify-content:space-between;gap:10px;margin-top:8px;padding:9px 10px;border:1px solid #f2b56b;border-radius:10px;background:#fff"><span><b style="color:#b54708">${esc(item.productName||"منتوج")}${item.productCode?` · ${esc(item.productCode)}`:""}</b><small style="display:block;color:#8a4b08;margin-top:3px;direction:ltr;text-align:left">الإرجاع: ${Number(item.quantity)||0} قطعة × ${money(item.unitPrice||0)} درهم = ${money(item.amount||0)} درهم · ${formatPaymentDate(item.date)}</small></span><strong style="color:#b54708">−${money(item.amount)} درهم</strong></div>`).join("")}</div>`:"";
   const itemChangeRows=(row)=>changes.filter(change=>{const matched=priceChangeOrderItem(order,change);if(!matched)return false;const rowId=String(row.id||"").trim(),matchedId=String(matched.id||"").trim(),rowCode=String(row.code||"").trim().toLowerCase(),matchedCode=String(matched.code||"").trim().toLowerCase(),rowName=String(row.name||"").trim().toLowerCase(),matchedName=String(matched.name||"").trim().toLowerCase();return matched===row||(rowId&&matchedId&&rowId===matchedId)||(rowCode&&matchedCode&&rowCode===matchedCode)||(rowName&&matchedName&&rowName===matchedName)});
     const rows=(Array.isArray(order.items)?order.items:[]).map(row=>{const p=products.find(x=>String(x.id)===String(row.id))||{},boxes=Number(row.qty??row.boxes)||0,units=Number(row.units??p.qty)||0,unitPrice=Number(row.unitPrice??p.price)||0,paidUnits=Number(row.paidUnits??(boxes*units))||0,freeUnits=Number(row.freeUnits??(hasPromo10Plus1(p)?Math.floor(paidUnits/10):0))||0,deliveredUnits=paidUnits+freeUnits,returnedUnits=returnedQuantityForItem(order,row),baseLine=Number(row.lineTotal??(unitPrice*paidUnits))||0,rowChanges=itemChangeRows(row),rowAdjustment=rowChanges.reduce((sum,change)=>sum+priceChangeAdjustment(order,change),0),adjustedLine=Math.max(0,baseLine+rowAdjustment),lastChange=rowChanges[rowChanges.length-1],oldMarkup=lastChange?`<span style="text-decoration:line-through;color:#98a2b3;margin-right:8px">${money(lastChange.oldPrice)} درهم</span><b style="color:#6941c6">${money(lastChange.newPrice)} درهم</b><small style="display:block;color:#6941c6;margin-top:3px">تغيير محسوب على ${priceChangeQuantity(order,lastChange)} وحدة</small>`:`<b>${money(unitPrice)} درهم</b>`;return `<tr><td style="padding:12px;border-bottom:1px solid #e4e8ef;text-align:left"><b>${esc(row.name||p.name||"منتوج")}</b>${freeUnits?`<small style="display:block;color:#b42318;margin-top:4px">عرض 10 + 1 · مجاني: ${freeUnits} · مجموع التسليم: ${deliveredUnits}</small>`:""}${returnedUnits?`<small style="display:block;color:#b54708;margin-top:4px">↩ مرتجع: ${returnedUnits} قطعة</small>`:""}</td><td style="padding:12px;border-bottom:1px solid #e4e8ef;text-align:center">${boxes}</td><td style="padding:12px;border-bottom:1px solid #e4e8ef;text-align:center">${units}</td><td style="padding:12px;border-bottom:1px solid #e4e8ef;text-align:center;font-weight:800">${paidUnits}</td><td style="padding:12px;border-bottom:1px solid #e4e8ef;text-align:center">${oldMarkup}</td><td style="padding:12px;border-bottom:1px solid #e4e8ef;text-align:center;font-weight:900">${money(adjustedLine)} درهم</td></tr>`}).join("");
  const paymentRows=payments.length?payments.map((payment,index)=>`<div style="display:flex;justify-content:space-between;gap:10px;padding:9px 10px;border:1px solid #c7cbd1;border-radius:10px;background:#f1f3f5;margin-top:7px"><span><b style="color:#4b5563">قسط رقم ${index+1}</b><small style="display:block;color:#6b7280;margin-top:3px">${formatPaymentDate(payment.date)}</small></span><strong style="color:#4b5563">${money(payment.amount)} درهم</strong></div>`).join(""):`<div style="padding:10px;border:1px dashed #c7cbd1;border-radius:10px;color:#9ca3af;text-align:center;background:#f8f9fa">مازال ما تسجل حتى قسط</div>`;
  const changeRows=changes.length?changes.map(change=>{const adjustment=priceChangeAdjustment(order,change),quantity=priceChangeQuantity(order,change);return `<div style="display:flex;justify-content:space-between;gap:10px;padding:10px;border:1px solid #c4b5fd;border-radius:10px;background:#f5f3ff;margin-top:7px"><div><b style="color:#4c1d95">${esc(change.productName||"منتوج")}${change.productCode?` · ${esc(change.productCode)}`:""}</b><small style="display:block;color:#6b5ca5;margin-top:4px">الثمن: <span style="text-decoration:line-through">${money(change.oldPrice)} درهم</span> → <b style="color:#6941c6">${money(change.newPrice)} درهم</b> · الكمية: ${quantity}</small></div><strong style="color:#6941c6">${adjustment>0?"+":"−"}${money(Math.abs(adjustment))} درهم</strong></div>`}).join(""):`<div style="padding:10px;border:1px dashed #c4b5fd;border-radius:10px;color:#8b7bb5;text-align:center;background:#faf9ff">ما تسجل حتى تغيير فالثمن</div>`;
  const paymentSectionHtml=!isCodTerm&&payments.length?`<div style="margin-top:17px;padding:14px;border:2px solid #9ca3af;border-radius:14px;background:#eef0f2"><div style="font-size:17px;font-weight:900;color:#4b5563">سجل الأقساط</div>${paymentRows}</div>`:"";
     const changeSectionHtml=!isCodTerm&&changes.length?`<div style="margin-top:17px;padding:14px;border:2px solid #7f56d9;border-radius:14px;background:#f4f3ff"><div style="font-size:17px;font-weight:900;color:#6941c6">تغييرات الأثمنة</div>${changeRows}</div>`:"";
   const discounts=getDiscountHistory(order),discountsTotal=discounts.reduce((sum,item)=>sum+(Number(item.amount)||0),0),originalOrderTotal=Number.isFinite(baseTotal)?baseTotal:Math.max(0,total-priceAdjustmentTotal+discountsTotal+returnsTotal),discountSectionHtml=discounts.length?`<div style="margin-top:17px;padding:14px;border:2px solid #17824b;border-radius:14px;background:#ecfdf3"><div style="font-size:17px;font-weight:900;color:#087443">Remise / تخفيضات</div>${discounts.map((item,index)=>`<div style="display:flex;justify-content:space-between;gap:10px;margin-top:7px;color:#087443;font-size:13px;font-weight:800"><span>تخفيض رقم ${index+1} · ${formatPaymentDate(item.date)}</span><strong>−${money(item.amount)} درهم</strong></div>`).join("")}<div style="display:flex;justify-content:space-between;gap:10px;margin-top:9px;padding-top:8px;border-top:1px solid #9bd5b2;color:#087443;font-size:14px;font-weight:950"><span>مجموع التخفيضات</span><strong>−${money(discountsTotal)} درهم</strong></div></div>`:"";
   const installmentSummaryHtml=isCodTerm?"":`<div style="display:flex;justify-content:space-between;gap:10px;margin-top:7px;color:#667085;font-size:12px"><span>مجموع الأقساط</span><span>${money(paid)} درهم</span></div>`;
  const hasVisibleChanges=hasChanges&&!isCodTerm;
  const root=document.createElement("div");root.dir="ltr";root.style.cssText="position:fixed;left:-10000px;top:0;width:820px;background:#f5f7fb;color:#172033;padding:28px;font-family:Arial,'Noto Naskh Arabic',sans-serif;box-sizing:border-box;z-index:999999;visibility:visible;opacity:1;direction:ltr;text-align:left";
  root.innerHTML=`<div style="background:#06152f;color:#fff;border-radius:18px 18px 0 0;padding:22px;border-bottom:4px solid #d9b866"><div style="font-size:15px;letter-spacing:3px;color:#f5d77a;font-weight:900">3D PEINTURES</div><div style="font-size:28px;font-weight:900;margin-top:8px">Bon de commande</div><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:10px;padding:10px 12px;border:1px solid rgba(255,255,255,.32);border-radius:10px;background:rgba(255,255,255,.08)"><span style="font-size:12px;color:#f5d77a;font-weight:800">N. Bon Commande</span><b style="font-size:18px;direction:ltr;min-height:21px">${esc(order.orderCode||"")}</b></div><div style="font-size:13px;color:#d4dbea;margin-top:8px">${date} · ${time}</div></div><div style="background:#fff;border-radius:0 0 18px 18px;padding:22px"><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px"><div style="padding:12px;border:1px solid #e4e8ef;border-radius:12px;background:#f7f9fc"><span style="display:block;color:#98a2b3;font-size:11px">الزبون</span><b style="display:block;margin-top:5px;font-size:18px">${esc(order.client||"—")}</b>${order.company?`<small style="display:block;margin-top:4px">${esc(order.company)}</small>`:""}${order.phone?`<small style="display:block;margin-top:4px">${esc(order.phone)}</small>`:""}</div><div style="padding:12px;border:1px solid #e4e8ef;border-radius:12px;background:#f7f9fc"><span style="display:block;color:#98a2b3;font-size:11px">طريقة الأداء</span><b style="display:block;margin-top:5px;font-size:18px;color:#173f78">${order.paymentType?paymentTypeLabel(order.paymentType):"—"}</b></div></div><div style="font-size:18px;font-weight:900;color:#173f78;margin:16px 0 8px">تفاصيل المنتوجات</div><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#173f78;color:#fff"><th style="padding:11px;text-align:left">المنتوج</th><th style="padding:11px">العلب</th><th style="padding:11px">قطع/علبة</th><th style="padding:11px">مجموع القطع</th><th style="padding:11px">الثمن</th><th style="padding:11px">المجموع</th></tr></thead><tbody>${rows||`<tr><td colspan="6" style="padding:14px;text-align:center;color:#98a2b3">ما كاين حتى منتوج</td></tr>`}</tbody></table><div style="margin-top:16px;padding:14px;border:2px solid #173f78;border-radius:14px;background:#f7f9fc"><div style="display:flex;justify-content:space-between;gap:10px;font-size:15px;color:#667085"><span>المجموع الأصلي</span><strong style="color:#667085">${money(originalOrderTotal)} درهم</strong></div>${hasReturns?`<div style="display:flex;justify-content:space-between;gap:10px;margin-top:7px;color:#087443;font-size:14px;font-weight:900"><span>ناقص الإرجاعات</span><strong style="color:#087443">−${money(returnsTotal)} درهم</strong></div>`:""}<div style="display:flex;justify-content:space-between;gap:10px;margin-top:7px;padding-top:7px;border-top:1px solid #d8dee8;font-size:18px"><span>Total payé بعد الإرجاعات</span><strong style="color:#173f78">${money(total)} درهم</strong></div>${hasVisibleChanges?`<div style="display:flex;justify-content:space-between;gap:10px;margin-top:7px;color:#667085;font-size:12px"><span>الإجمالي قبل تغييرات الأثمنة</span><span style="text-decoration:line-through">${money(Number.isFinite(baseTotal)?baseTotal:total-priceAdjustmentTotal)} درهم</span></div>`:""}${installmentSummaryHtml}<div style="display:flex;justify-content:space-between;gap:10px;margin-top:7px;color:#b42318;font-size:14px;font-weight:900"><span>الباقي</span><span>${money(Math.max(0,total-paid))} درهم</span></div></div>${paymentSectionHtml}${changeSectionHtml}${returnsSectionHtml}${discountSectionHtml}${dueNoticeHtml}<div style="margin-top:20px;padding:13px;border-top:2px solid #d9b866;text-align:center;font-size:17px;font-weight:900;color:#173f78">المرجو تحقق من المعلومات.</div></div>`;
  document.body.appendChild(root);const canvas=await html2canvas(root,{scale:2,backgroundColor:"#f5f7fb",useCORS:true,logging:false});const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.94));if(!blob)throw new Error("order image blob unavailable");const name=`3D-PEINTURES-bon-${String(order.client||"Client").replace(/[^a-zA-Z0-9À-ÿ_-]+/g,"-").slice(0,32)}-${Date.now()}.jpg`;root.remove();return {blob,name};
 }catch(error){console.error("Order image error",error);return null}
}
async function shareOrderPDF(order){
 recalculateOrderPaymentState(order);
 const result=await createOrderImage(order);
 if(!result){toast("تعذر إنشاء صورة Bon de commande");return}
 const file=new File([result.blob],result.name,{type:"image/jpeg"});
 if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){try{await navigator.share({files:[file],text:"المرجو تحقق من المعلومات."});toast("تم تجهيز صورة Bon de commande للزبون");return}catch(error){if(error?.name==="AbortError")return}}
 downloadBlob(result.blob,result.name);const url=URL.createObjectURL(result.blob);window.open(url,"_blank");setTimeout(()=>URL.revokeObjectURL(url),60000);toast("تحلات صورة Bon de commande؛ قدر تشاركها مع الزبون");
}
async function saveOrder(e){
 e.preventDefault();
 const x=orderCartSummary();
 const client=$("orderClient").value.trim();
 if(!client){toast("دخل اسم الكليان");return}
 const clientObj=clients.find(c=>String(c.name||"").trim().toLowerCase()===client.toLowerCase())||{};
 const orderDate=new Date();
 const selectedTermValue=String($("orderPaymentTerm").value||"15");
 const isCodTerm=selectedTermValue==="cod";
 const isTestTerm=selectedTermValue==="test_1m";
 const selectedTerm=isCodTerm?0:(isTestTerm?0.0006944444444444445:([15,30].includes(Number(selectedTermValue))?Number(selectedTermValue):15));
 const fallbackTermNote=isCodTerm?"إستخلاص عند الإستلام / Paiement à la livraison":isTestTerm?"تجربة دقيقة واحدة / Test 1 minute":`مدة الاستخلاص: ${selectedTerm} يوماً / Durée de règlement : ${selectedTerm} jours`;
 const order={
   id:makeId(),orderCode:"",date:orderDate.toISOString(),client,
   company:clientObj.company||clientObj.societe||"",
   ice:clientObj.ice||"",paymentHolder:"",paymentNumber:"",paymentType:paymentTypeValue($("orderPaymentType")?.value||"cash"),phone:clientObj.phone||"",
   total:x.total,baseTotal:x.total,paid:0,due:x.total,profit:x.profit,
   paymentTermDays:isCodTerm||isTestTerm?0:selectedTerm,paymentTermMode:isCodTerm?"cod":(isTestTerm?"test_1m":"days"),paymentTermMinutes:isTestTerm?1:null,dueDate:isCodTerm?"":new Date(orderDate.getTime()+selectedTerm*86400000).toISOString(),
   status:"unpaid",payments:[],discounts:[],returns:[],note:fallbackTermNote,
   items:cart.map(row=>{
     const p=products.find(x=>x.id===row.id)||{};
       const boxes=Number(row.qty)||0, units=Number(p.qty)||0;
       const promo=promoForBoxes(p,boxes);
       const unitPrice=unitPriceForQuantity(p,promo.paidUnits);
       return {
         id:row.id, qty:boxes,
         name:p.name||"",
         units,
         paidUnits:promo.paidUnits,
         freeUnits:promo.freeUnits,
         deliveredUnits:promo.deliveredUnits,
         promotion:promo.freeUnits>0?"10 + 1 Gratuit":"",
         unitPrice,
         lineTotal:unitPrice*promo.paidUnits
       };
   })
 };
 orders.unshift(order);
 localStorage.setItem("3d_peintures_orders_v1",JSON.stringify(orders));
 renderSalesForecast();
 cart=[];saveCart();closeOrderModal();
 toast("تسجلت الكوموند — جاري تجهيز Bon de commande PDF…");
 await shareOrderPDF(order);
}
let activePaymentOrderId="";
function getPaymentHistory(order){
 const history=Array.isArray(order?.payments)?order.payments.filter(p=>Number(p?.amount)>0):[];
 if(history.length)return history;
 const legacy=Number(order?.paid)||0;
 if(legacy>0)return [{id:"legacy",amount:legacy,date:order.updatedAt||order.date,legacy:true}];
 return [];
}
function paymentTotal(order){return getPaymentHistory(order).reduce((sum,p)=>sum+(Number(p.amount)||0),0)}
function getDiscountHistory(order){return Array.isArray(order?.discounts)?order.discounts.filter(item=>Number(item?.amount)>0):[]}
function discountTotal(order){return getDiscountHistory(order).reduce((sum,item)=>sum+(Number(item.amount)||0),0)}
function getReturnHistory(order){return Array.isArray(order?.returns)?order.returns.filter(item=>Number(item?.quantity)>0&&Number(item?.amount)>0):[]}
function returnTotal(order){return getReturnHistory(order).reduce((sum,item)=>sum+(Number(item.amount)||0),0)}
function returnItemMatches(order,item,returnRow){const id=String(returnRow?.productId||"").trim(),code=String(returnRow?.productCode||"").trim().toLowerCase(),name=String(returnRow?.productName||"").trim().toLowerCase(),product=products.find(p=>String(p.id)===String(item?.id))||{},itemCode=String(item?.code||item?._code||productCode(product)||"").trim().toLowerCase(),itemName=String(item?.name||product?.name||"").trim().toLowerCase();return (id&&String(item?.id||"")===id)||(code&&itemCode===code)||(name&&itemName===name)}
function returnOrderItem(order,code){const query=String(code||"").trim().toLowerCase();if(!query)return null;const items=Array.isArray(order?.items)?order.items:[];return items.map(item=>{const product=products.find(p=>String(p.id)===String(item.id))||{};return {...item,_product:product,_code:String(item.code||productCode(product)||"").trim()}}).find(item=>item._code.toLowerCase()===query)||null}
function returnUnitPrice(order,item){const changes=getPriceChangeHistory(order).filter(change=>returnItemMatches(order,item,{productId:item.id,productCode:item._code,productName:item.name}));const latest=changes[changes.length-1];return Math.max(0,Number(latest?.newPrice??item.unitPrice??item._product?.price??0)||0)}
function returnedQuantityForItem(order,item){return getReturnHistory(order).filter(row=>returnItemMatches(order,item,row)).reduce((sum,row)=>sum+(Number(row.quantity)||0),0)}
function priceChangeOrderItem(order,change){const items=Array.isArray(order?.items)?order.items:[],id=String(change?.productId||""),code=String(change?.productCode||"").trim().toLowerCase(),name=String(change?.productName||"").trim().toLowerCase();return items.find(item=>id&&String(item.id||"")===id)||items.find(item=>code&&String(item.code||"").trim().toLowerCase()===code)||items.find(item=>name&&String(item.name||"").trim().toLowerCase()===name)||null}
function priceChangeQuantity(order,change){const stored=Number(change?.quantity??change?.paidUnits);if(Number.isFinite(stored)&&stored>0)return stored;const item=priceChangeOrderItem(order,change);if(!item)return 1;return Math.max(1,Number(item.paidUnits??item.units??item.quantity??item.qty??item.boxes??1)||1)}
function priceChangeUnitDifference(change){const value=Number(change?.difference);if(Number.isFinite(value))return value;return (Number(change?.newPrice)||0)-(Number(change?.oldPrice)||0)}
function priceChangeAdjustment(order,change){const stored=Number(change?.adjustment);if(Number.isFinite(stored))return stored;return priceChangeUnitDifference(change)*priceChangeQuantity(order,change)}
function priceChangeAdjustmentTotal(order){return getPriceChangeHistory(order).reduce((sum,change)=>sum+priceChangeAdjustment(order,change),0)}
function syncOrderTotalWithPriceChanges(order){const current=Number(order?.total)||0,storedBase=Number(order?.baseTotal);if(!Number.isFinite(storedBase))order.baseTotal=current;const base=Number(order.baseTotal)||0,adjustment=priceChangeAdjustmentTotal(order),discount=discountTotal(order),returns=returnTotal(order);order.total=Math.max(0,base+adjustment-discount-returns);return {baseTotal:base,adjustment,discount,returns,total:order.total}}
function recalculateOrderPaymentState(order){
 syncOrderTotalWithPriceChanges(order);
 const paid=paymentTotal(order);
 order.paid=paid;
 order.due=Math.max(0,Number(order.total||0)-paid);
 order.status=order.due<=0.000001?"paid":paid>0?"partial":"unpaid";
 return {paid:order.paid,due:order.due};
}
function formatPaymentDate(value){
 const d=new Date(value); if(Number.isNaN(d.getTime()))return "—";
 return `${d.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"})} · ${d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}`;
}
let paymentReturnLastCode="";
function paymentReturnEntry(){const order=orders.find(o=>String(o.id)===String(activePaymentOrderId)),code=String($("paymentReturnCode")?.value||"").trim(),item=order?returnOrderItem(order,code):null,qty=Math.floor(Number($("paymentReturnQty")?.value||0)||0),ordered=item?Math.max(0,Number(item.paidUnits??(Number(item.qty)||0)*(Number(item.units)||0))||0):0,already=item?returnedQuantityForItem(order,item):0,available=Math.max(0,ordered-already),autoUnitPrice=item?returnUnitPrice(order,item):0,rawPrice=String($("paymentReturnPrice")?.value||"").trim(),unitPrice=item&&rawPrice!==""?Number(rawPrice.replace(",",".")):autoUnitPrice,amount=item&&qty>0&&Number.isFinite(unitPrice)?Number((qty*unitPrice).toFixed(2)):0;return {order,code,item,qty,ordered,already,available,autoUnitPrice,unitPrice,amount,hasCode:code!=="",priceValid:Number.isFinite(unitPrice)&&unitPrice>0}}
function updatePaymentReturnPreview(){let data=paymentReturnEntry(),preview=$("paymentReturnPreview"),total=$("paymentReturnTotal"),totalInput=$("paymentReturnTotalInput"),priceInput=$("paymentReturnPrice");if(data.code!==paymentReturnLastCode){paymentReturnLastCode=data.code;if(data.item&&priceInput)priceInput.value=Number(data.autoUnitPrice).toFixed(2);if(!data.hasCode&&priceInput)priceInput.value="";data=paymentReturnEntry()}if(total)total.textContent=data.amount>0?`−${money(data.amount)} درهم`:`0,00 درهم`;if(totalInput)totalInput.value=data.amount>0?`${money(data.amount)} درهم`:"0,00 درهم";if(preview){if(!data.hasCode)preview.textContent="بدا كتب كود المنتوج باش يطلع الاسم الكامل والثمن.";else if(!data.item)preview.textContent="هاد الكود ما كاينش فمنتوجات هاد الكوموند.";else preview.innerHTML=`<div class="payment-return-preview-product"><b>${esc(data.item.name||data.item._product?.name||"منتوج")}</b><small>Code: ${esc(data.item._code)} · الثمن: ${money(data.unitPrice)} درهم / قطعة</small><small>القطع المطلوبة: ${data.ordered} · سبق إرجاع: ${data.already} · المتبقي للإرجاع: ${data.available}</small><strong>الحساب: ${data.qty||0} × ${money(data.unitPrice)} درهم = −${money(data.amount)} درهم</strong></div>`}updatePaymentPreview()}
function updatePaymentPreview(){
 const order=orders.find(o=>String(o.id)===String(activePaymentOrderId)); if(!order)return;
 const pendingAdjustment=paymentPriceChangeRows().reduce((sum,row)=>sum+(Number(row.adjustment)||0),0),enteredDiscount=Math.max(0,Number(String($("paymentDiscount")?.value||0).replace(",","."))||0),pendingReturn=paymentReturnEntry(),enteredReturn=pendingReturn.item&&pendingReturn.qty>0&&pendingReturn.qty<=pendingReturn.available?pendingReturn.amount:0,previewTotal=Math.max(0,Number(order.total||0)+pendingAdjustment-enteredDiscount-enteredReturn),before=Math.max(0,previewTotal-paymentTotal(order));
 const entered=Math.max(0,Number(String($("paymentAmount")?.value||0).replace(",","."))||0);
 const accepted=Math.min(entered,before);
 $("paymentBeforeDue").textContent=money(before)+" درهم";
 $("paymentAfterTotal").textContent=money(paymentTotal(order)+accepted)+" درهم";
 $("paymentAfterDue").textContent=money(Math.max(0,before-accepted))+" درهم";
}
function paymentOrderProducts(){const order=orders.find(o=>String(o.id)===String(activePaymentOrderId)),seen=new Map();(Array.isArray(order?.items)?order.items:[]).forEach(item=>{const itemId=String(item.id||""),itemCode=String(item.code||"").trim().toLowerCase(),itemName=String(item.name||"").trim().toLowerCase(),product=products.find(p=>String(p.id)===itemId)||products.find(p=>itemCode&&String(productCode(p)||"").trim().toLowerCase()===itemCode)||products.find(p=>itemName&&String(p.name||"").trim().toLowerCase()===itemName);if(product&&!seen.has(String(product.id)))seen.set(String(product.id),{product,orderedPrice:Number(item.unitPrice??priceTiersFor(product)[0].price)||0})});return [...seen.values()]}
function paymentPriceChangeRows(){return [...document.querySelectorAll("#paymentPriceChanges .payment-price-change-row")].map(row=>{const productId=row.querySelector("[data-payment-price-change-product]")?.value||"",product=products.find(p=>String(p.id)===String(productId)),oldValue=String(row.querySelector("[data-payment-price-change-old]")?.value||"").trim(),newValue=String(row.querySelector("[data-payment-price-change-new]")?.value||"").trim(),oldPrice=Number(oldValue.replace(",",".")),newPrice=Number(newValue.replace(",",".")),productName=product?.name||row.querySelector("[data-payment-price-change-product]")?.selectedOptions?.[0]?.textContent||"منتوج",productCodeValue=productCode(product)||"",quantity=priceChangeQuantity(orders.find(o=>String(o.id)===String(activePaymentOrderId)),{productId,productName,productCode:productCodeValue}),difference=newPrice-oldPrice;return {productId,product,productName,productCode:productCodeValue,oldPrice,newPrice,difference,quantity,adjustment:difference*quantity,oldValue,newValue}}).filter(row=>row.product&&row.oldValue!==""&&row.newValue!==""&&Number.isFinite(row.oldPrice)&&Number.isFinite(row.newPrice)&&row.oldPrice>=0&&row.newPrice>=0)}
function updatePaymentPriceChangeTotal(){const rows=paymentPriceChangeRows(),total=rows.reduce((sum,row)=>sum+Math.abs(Number(row.adjustment)||0),0);if($("paymentPriceChangeTotal"))$("paymentPriceChangeTotal").textContent=`${money(total)} درهم`;updatePaymentPreview();return rows}
function addPaymentPriceChangeRow(values={}){const box=$("paymentPriceChanges"),entries=paymentOrderProducts();if(!box)return;if(!entries.length){box.innerHTML=`<div class="payment-price-empty">ما كاين حتى منتوج مسجل فهاد الكوموند.</div>`;return}box.querySelector(".payment-price-empty")?.remove();$("addPaymentPriceChange")?.removeAttribute("disabled");const selected=entries.find(entry=>String(entry.product.id)===String(values.productId))||entries[0],product=selected.product,current=Number(values.oldPrice??selected.orderedPrice??priceTiersFor(product)[0].price)||0,row=document.createElement("div");row.className="payment-price-change-row";row.innerHTML=`<div class="payment-price-change-product"><label>المنتوج المطلوب فالكوموند<select data-payment-price-change-product>${entries.map(entry=>{const p=entry.product;return `<option value="${esc(p.id)}" ${String(p.id)===String(product.id)?"selected":""}>${esc(p.name||"منتوج")}${productCode(p)?` · ${esc(productCode(p))}`:""}</option>`}).join("")}</select></label><button type="button" class="remove-price-change-btn" data-payment-price-change-remove aria-label="حذف تغيير الثمن">×</button></div><div class="payment-price-change-values"><label>الثمن القديم<input type="number" min="0" step="0.01" value="${current}" data-payment-price-change-old></label><label>الثمن الجديد<input type="number" min="0" step="0.01" value="${values.newPrice??""}" data-payment-price-change-new placeholder="مثلاً: 28"></label></div>`;box.appendChild(row);row.querySelector("[data-payment-price-change-remove]").onclick=()=>{row.remove();updatePaymentPriceChangeTotal()};row.querySelector("[data-payment-price-change-product]").onchange=e=>{const entry=entries.find(item=>String(item.product.id)===String(e.target.value));if(entry)row.querySelector("[data-payment-price-change-old]").value=entry.orderedPrice||priceTiersFor(entry.product)[0].price;updatePaymentPriceChangeTotal()};row.querySelectorAll("input").forEach(input=>input.oninput=updatePaymentPriceChangeTotal);updatePaymentPriceChangeTotal()}
function clearPaymentPriceChanges(){const box=$("paymentPriceChanges"),button=$("addPaymentPriceChange"),entries=paymentOrderProducts();if(box)box.innerHTML=entries.length?"":`<div class="payment-price-empty">زيد تغيير ثمن، وغادي يبان غير المنتوج اللي موجود فالكوموند.</div>`;if(button)button.disabled=!entries.length;updatePaymentPriceChangeTotal()}
function syncPaymentOnlyMode(){const only=!!$("paymentOnlyPriceToggle")?.checked,amountInput=$("paymentAmount"),label=$("paymentAmountLabel"),hint=$("paymentOnlyHint");if(amountInput){amountInput.disabled=only;amountInput.required=!only;if(only)amountInput.value=""}if(label){label.classList.toggle("price-only-active",only);label.hidden=only}if(hint)hint.hidden=!only;updatePaymentPreview()}
function paymentCustomerSummary(order,amount){
 const total=Number(order.total||0);
 const before=Math.max(0,total-paymentTotal(order));
 const accepted=Math.min(Math.max(0,Number(amount)||0),before);
 const due=Math.max(0,before-accepted);
 const state=deadlineState(order);
 const dueDate=state.termKey==="cod"?"عند الاستلام":(state.dueDate?state.dueDate.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"}):"—");
 return {total,before,accepted,due,dueDate};
}
function buildPaymentCustomerMessage(order,amount){
 const data=paymentCustomerSummary(order,amount);
 return [`ملخص أداء القسط`,`الزبون: ${order.client||"—"}`,`الإجمالي للبون: ${money(data.total)} درهم`,`تاريخ آخر أجل للاستخلاص: ${data.dueDate}`,`مبلغ القسط: ${money(data.accepted)} درهم`,`الباقي بعد الأداء: ${money(data.due)} درهم`,`شكراً لكم.`].join("\n");
}
async function sharePaymentSummaryWithCustomer(){
 const orderId=activePaymentOrderId,order=orders.find(o=>String(o.id)===String(orderId));
 if(!order){toast("ما كايناش عملية قسط أو تغيير ثمن باش تتصيفط");return}
 const history=getPaymentHistory(order),changes=getPriceChangeHistory(order),discounts=getDiscountHistory(order),returns=getReturnHistory(order);
 if(!history.length&&!changes.length&&!discounts.length&&!returns.length){toast("ما كاين لا قسط لا تخفيض لا إرجاع لا تغيير ثمن باش تتوجد الصورة");return}
 const latestPayment=history[history.length-1],amount=Number(latestPayment?.amount)||0,before=Math.max(0,Number(order.total||0)-paymentTotal(order));
 return sharePaymentOperationImage({orderId:order.id,amount,beforeDue:before,afterDue:before-amount,totalPaidAfter:paymentTotal(order),priceChanges:changes,discounts,returns,priceOnly:!amount&&!discounts.length&&!returns.length,operationProvided:true,operationChanges:changes,operationDiscountProvided:discounts.length>0,operationReturnProvided:returns.length>0});
}
async function sharePaymentOperationImage(context={}){
 const orderId=context.orderId??activePaymentOrderId,order=orders.find(o=>String(o.id)===String(orderId));if(!order)return;
 recalculateOrderPaymentState(order);

 const onlySection=String(context.onlySection||"").trim(),priceChanges=Array.isArray(context.priceChanges)?context.priceChanges:getPriceChangeHistory(order),paymentHistory=getPaymentHistory(order),discountHistory=Array.isArray(context.discounts)?context.discounts:getDiscountHistory(order),returnHistory=Array.isArray(context.returns)?context.returns:getReturnHistory(order),contextDiscount=Number(context.discount)||0;
 const visiblePayments=paymentHistory,visiblePriceChanges=onlySection==="priceChanges"?priceChanges:onlySection?[]:priceChanges,visibleDiscounts=onlySection==="discounts"?discountHistory:onlySection?[]:discountHistory,visibleReturns=onlySection?[]:returnHistory;
 const amount=Number.isFinite(Number(context.amount))?Number(context.amount):(onlySection==="payments"?(Number(paymentHistory[paymentHistory.length-1]?.amount)||0):Number(String($("paymentAmount")?.value||"").replace(",",".")));
 if(context.operationProvided===true&&!((Number.isFinite(amount)&&amount>0)||(onlySection==="payments"&&paymentHistory.length)||(Array.isArray(context.operationChanges)&&context.operationChanges.length)||(context.operationDiscountProvided===true)||(contextDiscount>0)||(context.operationReturnProvided===true)||returnHistory.length)){toast("ما كاين حتى عملية محفوظة باش تتوجد الصورة");return}
 const before=Number.isFinite(Number(context.beforeDue))?Math.max(0,Number(context.beforeDue)):Math.max(0,Number(order.total||0)-paymentTotal(order));
 if(!Number.isFinite(amount)||amount<0){alert("دخل مبلغ القسط صحيح.");$("paymentAmount")?.focus();return}
 if(amount<=0&&!priceChanges.length&&!discountHistory.length&&!returnHistory.length&&!contextDiscount){alert("دخل مبلغ القسط أو التخفيض أو الإرجاع أو زيد تغيير فالثمن.");return}
 if(!onlySection&&amount>before+0.000001){alert(`المبلغ أكبر من الباقي: ${money(before)} درهم`);return}
 const accepted=onlySection==="payments"?amount:Math.min(amount,before),afterDue=onlySection==="payments"?Math.max(0,Number(order.total||0)-paymentTotal(order)):(Number.isFinite(Number(context.afterDue))?Math.max(0,Number(context.afterDue)):Math.max(0,before-accepted)),totalPaidForImage=onlySection==="payments"?paymentTotal(order):(Number.isFinite(Number(context.totalPaidAfter))?Number(context.totalPaidAfter):paymentTotal(order)+accepted),adjustedTotal=Number(order.total)||0,returnTotalForImage=visibleReturns.reduce((sum,item)=>sum+(Number(item.amount)||0),0),hasPaymentOperation=onlySection==="payments"?paymentHistory.length:amount>0,hasPriceOperation=visiblePriceChanges.length>0,hasReturnOperation=visibleReturns.length>0,operationTitle=onlySection==="payments"?"سجل جميع الأقساط":onlySection==="priceChanges"?"سجل تغييرات الأثمنة":onlySection==="discounts"?"سجل جميع Remise / التخفيضات":hasPaymentOperation&&hasPriceOperation?"ملخص القسط وتغيير الثمن":hasPaymentOperation&&hasReturnOperation?"ملخص القسط والإرجاع":hasPaymentOperation?"ملخص عملية الأداء":hasPriceOperation&&hasReturnOperation?"ملخص تغيير الثمن والإرجاع":hasPriceOperation?"ملخص تغيير الأثمنة":hasReturnOperation?"ملخص الإرجاعات":"ملخص التخفيض",currentAmountLabel=onlySection==="payments"?"آخر قسط":hasPaymentOperation?"القسط الحالي":hasPriceOperation?"تغيير الثمن فقط":hasReturnOperation?"الإرجاعات / Retours":"Remise / تخفيض",now=new Date(),date=now.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"}),time=now.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
 const root=document.createElement("div");root.dir="ltr";root.style.cssText="position:fixed;left:-10000px;top:0;width:760px;min-height:400px;background:#f5f7fb;color:#172033;padding:28px;font-family:Arial,'Noto Naskh Arabic',sans-serif;box-sizing:border-box;z-index:999999;visibility:visible;opacity:1;direction:ltr;text-align:left";
 const deadline=deadlineState(order),isCodTerm=deadline.termKey==="cod",dueDateText=deadline.dueDate?deadline.dueDate.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"}):"—",isFullyPaid=afterDue<=0.000001,dueNoticeHtml=isFullyPaid?`<div style="margin-top:18px;padding:14px 16px;border:3px solid #17824b;border-radius:13px;background:#ecfdf3;color:#087443;text-align:center;font-size:22px;font-weight:950">✓ خالص بالكامل</div>`:isCodTerm?`<div style="margin-top:18px;padding:14px 16px;border:3px solid #b42318;border-radius:13px;background:#fff1f0;color:#b42318;text-align:center;font-size:20px;font-weight:900">طريقة الاستخلاص: عند الاستلام</div>`:`<div style="margin-top:18px;padding:14px 16px;border:3px solid #b42318;border-radius:13px;background:#fff1f0;color:#b42318;text-align:center;font-size:20px;font-weight:900">آخر أجل للاستخلاص: ${dueDateText}</div>`;
 const discountTotalForImage=visibleDiscounts.reduce((sum,item)=>sum+(Number(item.amount)||0),0),hasDiscountOperation=visibleDiscounts.length>0||contextDiscount>0;
 const priceChangesTotal=priceChanges.reduce((sum,change)=>sum+Math.abs(priceChangeAdjustment(order,change)),0),paymentHistoryHtml=visiblePayments.length?visiblePayments.map((payment,index)=>`<div style="display:flex;justify-content:space-between;gap:8px;padding:9px 10px;border:1px solid #c7cbd1;border-radius:10px;background:#f1f3f5;margin-top:7px"><span><b style="color:#4b5563">قسط رقم ${index+1}</b><small style="display:block;color:#6b7280;margin-top:3px">${formatPaymentDate(payment.date)}</small></span><strong style="color:#4b5563">${money(payment.amount)} درهم</strong></div>`).join(""):`<div style="padding:10px;color:#98a2b3;text-align:center">مازال ما تسجل حتى قسط</div>`,changesHtml=visiblePriceChanges.length?visiblePriceChanges.map(change=>{const difference=priceChangeUnitDifference(change),quantity=priceChangeQuantity(order,change),adjustment=priceChangeAdjustment(order,change);return `<div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;padding:13px 14px;border:1px solid #c4b5fd;border-radius:12px;background:#f5f3ff;margin-top:8px"><div><b style="display:block;font-size:15px;color:#4c1d95">${esc(change.productName)}${change.productCode?` · ${change.productCode}`:""}</b><span style="display:block;margin-top:5px;color:#6b7280;font-size:12px">الثمن القديم: ${money(change.oldPrice)} درهم · الثمن الجديد: ${money(change.newPrice)} درهم · الكمية: ${quantity}</span><span style="display:block;margin-top:4px;color:#6941c6;font-size:12px;font-weight:800">أثر التغيير على الكوموند: ${adjustment>0?"+":"−"}${money(Math.abs(adjustment))} درهم</span></div><strong style="font-size:16px;color:#6941c6;direction:ltr">${adjustment>0?"+":"−"}${money(Math.abs(adjustment))} درهم</strong></div>`}).join(""):"<div style=\"padding:13px;border:1px dashed #d8dee8;border-radius:12px;background:#fff;color:#98a2b3;text-align:center;font-size:12px\">ما تسجل حتى تغيير فالثمن مع هاد القسط.</div>";
 const paymentSectionHtml=hasPaymentOperation?`<div style="font-size:17px;font-weight:900;color:#4b5563;margin:18px 0 8px">سجل الأقساط السابقة</div><div style="padding:10px;border:2px solid #9ca3af;border-radius:12px;background:#eef0f2">${paymentHistoryHtml}</div>`:"";
 const changesSectionHtml=hasPriceOperation?`<div style="font-size:17px;font-weight:900;color:#6941c6;margin:18px 0 8px">تغيير أثمنة المنتوجات <span style="font-size:13px;color:#8b7bb5">(${money(priceChangesTotal)} درهم)</span></div>${changesHtml}`:"";
 const returnsSectionHtml=hasReturnOperation?`<div style="font-size:17px;font-weight:900;color:#b54708;margin:18px 0 8px">الإرجاعات / Retours <span style="font-size:13px;color:#8a4b08">(−${money(returnTotalForImage)} درهم)</span></div>${visibleReturns.map(item=>`<div style="display:flex;justify-content:space-between;gap:8px;padding:9px 10px;border:1px solid #f2b56b;border-radius:10px;background:#fff4e5;margin-top:7px"><span><b style="color:#b54708">${esc(item.productName||"منتوج")}${item.productCode?` · ${esc(item.productCode)}`:""}</b><small style="display:block;color:#8a4b08;margin-top:3px;direction:ltr;text-align:left">الإرجاع: ${Number(item.quantity)||0} قطعة × ${money(item.unitPrice||0)} درهم = ${money(item.amount||0)} درهم · ${formatPaymentDate(item.date)}</small></span><strong style="color:#b54708">−${money(item.amount)} درهم</strong></div>`).join("")}`:"";
 const discountsSectionHtml=hasDiscountOperation?`<div style="font-size:17px;font-weight:900;color:#087443;margin:18px 0 8px">Remise / تخفيضات <span style="font-size:13px;color:#157347">(${money(discountTotalForImage)} درهم)</span></div>${visibleDiscounts.map((item,index)=>`<div style="display:flex;justify-content:space-between;gap:8px;padding:9px 10px;border:1px solid #9bd5b2;border-radius:10px;background:#ecfdf3;margin-top:7px"><span><b style="color:#087443">تخفيض رقم ${index+1}</b><small style="display:block;color:#157347;margin-top:3px">${formatPaymentDate(item.date)}</small></span><strong style="color:#087443">−${money(item.amount)} درهم</strong></div>`).join("")}`:"";
 root.innerHTML=`<div style="background:#06152f;color:#fff;border-radius:18px 18px 0 0;padding:20px 22px;border-bottom:4px solid #d9b866"><div style="font-size:15px;letter-spacing:3px;color:#f5d77a;font-weight:900">3D PEINTURES</div><div style="font-size:26px;font-weight:900;margin-top:8px">${operationTitle}</div><div style="margin-top:5px;color:#d4dbea;font-size:12px;direction:ltr;text-align:left">${date} · ${time}</div></div><div style="background:#fff;border-radius:0 0 18px 18px;padding:22px"><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px"><div style="padding:13px;border:1px solid #e4e8ef;border-radius:12px;background:#f7f9fc"><span style="display:block;color:#98a2b3;font-size:11px">الزبون</span><b style="display:block;margin-top:5px;font-size:17px">${esc(order.client||"Client")}</b></div><div style="padding:13px;border:1px solid #e4e8ef;border-radius:12px;background:#f7f9fc"><span style="display:block;color:#98a2b3;font-size:11px">كود الطلبية</span><b style="display:block;margin-top:5px;font-size:17px;direction:ltr">${esc(order.orderCode||"")}</b></div></div><div style="border:2px solid #173f78;border-radius:14px;padding:16px;margin-bottom:14px"><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;text-align:center"><div><span style="display:block;color:#667085;font-size:11px">الإجمالي الجديد</span><b style="display:block;margin-top:5px;color:#173f78;font-size:19px">${money(adjustedTotal)} درهم</b></div><div><span style="display:block;color:#667085;font-size:11px">${currentAmountLabel}</span><b style="display:block;margin-top:5px;color:#173f78;font-size:19px">${hasPaymentOperation?`${money(accepted)} درهم`:hasDiscountOperation?`${money(discountTotalForImage)} درهم`:hasReturnOperation?`${money(returnTotalForImage)} درهم`:"—"}</b></div><div><span style="display:block;color:#667085;font-size:11px">مجموع الأقساط</span><b style="display:block;margin-top:5px;color:#173f78;font-size:19px">${money(totalPaidForImage)} درهم</b></div><div><span style="display:block;color:#667085;font-size:11px">الباقي</span><b style="display:block;margin-top:5px;color:#b42318;font-size:19px">${money(afterDue)} درهم</b></div></div></div>${paymentSectionHtml}${changesSectionHtml}${returnsSectionHtml}${discountsSectionHtml}${dueNoticeHtml}<div style="margin-top:18px;padding-top:12px;border-top:1px solid #e4e8ef;text-align:center;color:#667085;font-size:11px;line-height:1.6">جميع المعلومات السابقة والجديدة ظاهرة في هذه الصورة.<br><b style="color:#173f78">المرجو تحقق من المعلومات.</b><br><b style="color:#173f78">3D PEINTURES</b></div></div>`;
 document.body.appendChild(root);
 try{if(!window.html2canvas)throw new Error("html2canvas unavailable");const canvas=await html2canvas(root,{scale:2,backgroundColor:"#f5f7fb",useCORS:true,logging:false});const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.94));if(!blob)throw new Error("image blob unavailable");const name=`3D-PEINTURES-operation-${String(order.client||"client").replace(/[^a-zA-Z0-9À-ÿ_-]+/g,"-").slice(0,32)}-${Date.now()}.jpg`,file=new File([blob],name,{type:"image/jpeg"});
  if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){await navigator.share({files:[file],text:"المرجو تحقق من المعلومات."});toast("تم تجهيز الصورة للمشاركة مع الزبون");return}
  downloadBlob(blob,name);const url=URL.createObjectURL(blob);window.open(url,"_blank");setTimeout(()=>URL.revokeObjectURL(url),60000);toast("تحلات صورة العملية؛ قدر تشاركها مع الزبون");
 }catch(err){console.error(err);toast("تعذر إنشاء صورة العملية؛ جرب ملخص النص")}finally{root.remove()}
}
function updatePaymentResendButtons(order){
 const states={payments:getPaymentHistory(order).length>0,priceChanges:getPriceChangeHistory(order).length>0,discounts:getDiscountHistory(order).length>0};
 [["resendAllPaymentsBtn","payments"],["resendPriceChangesBtn","priceChanges"],["resendDiscountsBtn","discounts"]].forEach(([id,key])=>{const button=$(id);if(button){button.disabled=!states[key];button.title=states[key]?"إعادة إرسال الصورة للزبون":"مازال ما تسجل حتى عملية من هاد النوع"}});
}
async function resendOperationImage(section){
 const order=orders.find(o=>String(o.id)===String(activePaymentOrderId));if(!order){toast("اختار الكوموند أولاً");return}
 const payments=getPaymentHistory(order),priceChanges=getPriceChangeHistory(order),discounts=getDiscountHistory(order);
 if(section==="payments"&&!payments.length){toast("مازال ما تسجل حتى قسط");return}
 if(section==="priceChanges"&&!priceChanges.length){toast("مازال ما تسجل حتى تغيير فالثمن");return}
 if(section==="discounts"&&!discounts.length){toast("مازال ما تسجل حتى Remise");return}
 return sharePaymentOperationImage({orderId:order.id,onlySection:section,amount:section==="payments"?(Number(payments[payments.length-1]?.amount)||0):0,priceChanges:section==="priceChanges"?priceChanges:[],discounts:section==="discounts"?discounts:[],returns:[],operationProvided:true,operationChanges:section==="priceChanges"?priceChanges:[],operationDiscountProvided:section==="discounts",operationReturnProvided:false});
}
function openPaymentModal(orderId){
 const order=orders.find(o=>String(o.id)===String(orderId)); if(!order)return;
 recalculateOrderPaymentState(order);
 const remaining=Math.max(0,Number(order.total||0)-paymentTotal(order));
  activePaymentOrderId=order.id;
  updatePaymentResendButtons(order);
  clearPaymentPriceChanges();
  if($("paymentOnlyPriceToggle"))$("paymentOnlyPriceToggle").checked=remaining<=0;
  syncPaymentOnlyMode();
  $("paymentContext").textContent=`${order.client||"Client"} · Total ${money(order.total)} درهم`;
 $("paymentNow").textContent=formatPaymentDate(new Date());
 const paymentOrderCode=$("paymentOrderCode");
 if(paymentOrderCode)paymentOrderCode.value=String(order.orderCode||"");
  $("paymentAmount").value="";
  $("paymentAmount").max=String(remaining);
  if($("paymentDiscount"))$("paymentDiscount").value="";
  if($("paymentReturnCode"))$("paymentReturnCode").value="";
  if($("paymentReturnQty"))$("paymentReturnQty").value="1";
  if($("paymentReturnPrice"))$("paymentReturnPrice").value="";
  if($("paymentReturnTotalInput"))$("paymentReturnTotalInput").value="0,00 درهم";
  paymentReturnLastCode="";
 updatePaymentReturnPreview();
 $("paymentModal").classList.add("show");
 setTimeout(()=>$("paymentAmount")?.focus(),80);
}
 function closePaymentModal(){activePaymentOrderId="";clearPaymentPriceChanges();if($("paymentOnlyPriceToggle"))$("paymentOnlyPriceToggle").checked=false;if($("paymentDiscount"))$("paymentDiscount").value="";if($("paymentReturnCode"))$("paymentReturnCode").value="";if($("paymentReturnQty"))$("paymentReturnQty").value="1";if($("paymentReturnPrice"))$("paymentReturnPrice").value="";if($("paymentReturnTotalInput"))$("paymentReturnTotalInput").value="0,00 درهم";paymentReturnLastCode="";syncPaymentOnlyMode();$("paymentModal").classList.remove("show")}
function addPayment(orderId){openPaymentModal(orderId)}
async function savePaymentForm(e){
 e.preventDefault();
 const order=orders.find(o=>String(o.id)===String(activePaymentOrderId));if(!order)return;
 const rawAmount=String($("paymentAmount")?.value||"").trim(),hasAmount=rawAmount!=="",amount=hasAmount?Number(rawAmount.replace(",",".")):0;
 const rawDiscount=String($("paymentDiscount")?.value||"").trim(),hasDiscount=rawDiscount!=="",discount=hasDiscount?Number(rawDiscount.replace(",",".")):0;
 const returnData=paymentReturnEntry(),hasReturn=returnData.hasCode;
 const onlyPrice=!!$("paymentOnlyPriceToggle")?.checked;
 const priceChangeRowCount=document.querySelectorAll("#paymentPriceChanges .payment-price-change-row").length,priceChanges=paymentPriceChangeRows(),changedPriceChanges=priceChanges.filter(change=>Math.abs(change.difference)>0.000001),pendingAdjustment=changedPriceChanges.reduce((sum,change)=>sum+(Number(change.adjustment)||0),0),beforeOperationDue=Math.max(0,Number(order.total||0)+pendingAdjustment-paymentTotal(order)),remaining=Math.max(0,beforeOperationDue-(hasDiscount?discount:0)-(hasReturn&&returnData.item&&returnData.qty<=returnData.available?returnData.amount:0));
 if(!hasAmount&&!changedPriceChanges.length&&!hasDiscount&&!hasReturn){alert("دخل مبلغ القسط أو التخفيض أو الإرجاع أو زيد تغيير فالثمن.");return}
 if(hasAmount&&(!Number.isFinite(amount)||amount<=0)){alert("دخل مبلغ قسط صحيح.");return}
 if(hasDiscount&&(!Number.isFinite(discount)||discount<=0)){alert("دخل قيمة تخفيض صحيحة.");return}
 if(hasReturn&&!returnData.item){alert("دخل كود منتوج موجود فهاد الكوموند.");return}
 if(hasReturn&&(!Number.isFinite(returnData.qty)||returnData.qty<1||returnData.qty>returnData.available||!Number.isFinite(returnData.unitPrice)||returnData.unitPrice<=0)){alert(`عدد القطع خاصو يكون بين 1 و ${returnData.available}.`);return}
 if(hasDiscount&&discount>beforeOperationDue+0.000001){alert(`التخفيض أكبر من الباقي: ${money(beforeOperationDue)} درهم`);return}
 if(hasAmount&&amount>remaining+0.000001){alert(`المبلغ أكبر من الباقي: ${money(remaining)} درهم`);return}
 if(priceChanges.length!==priceChangeRowCount){alert("كمل الثمن الجديد فكل تغيير أثمنة أو حدف السطر الناقص.");return}
 const paymentDate=new Date().toISOString();
 const newOrderCode=String($("paymentOrderCode")?.value||"").trim();
 order.orderCode=newOrderCode;
 if(hasAmount){if(!Array.isArray(order.payments)){order.payments=[];const legacy=Number(order.paid)||0;if(legacy>0)order.payments.push({id:"legacy",amount:legacy,date:order.updatedAt||order.date,legacy:true})}order.payments.push({id:makeId(),amount,date:paymentDate,type:order.paymentType||"cheque"})}
 if(hasDiscount){if(!Array.isArray(order.discounts))order.discounts=[];order.discounts.push({id:makeId(),amount:discount,date:paymentDate})}
 if(hasReturn){if(!Array.isArray(order.returns))order.returns=[];order.returns.push({id:makeId(),date:paymentDate,productId:returnData.item.id||"",productCode:returnData.item._code,productName:returnData.item.name||returnData.item._product?.name||"منتوج",quantity:returnData.qty,unitPrice:returnData.unitPrice,amount:returnData.amount})}
 if(changedPriceChanges.length){if(!Array.isArray(order.priceChanges))order.priceChanges=[];changedPriceChanges.forEach(change=>order.priceChanges.push({id:makeId(),date:paymentDate,productId:change.productId,productName:change.productName,productCode:change.productCode,oldPrice:change.oldPrice,newPrice:change.newPrice,difference:change.difference,quantity:change.quantity,adjustment:change.adjustment}))}
 recalculateOrderPaymentState(order);order.updatedAt=paymentDate;localStorage.setItem("3d_peintures_orders_v1",JSON.stringify(orders));
 const orderId=order.id,afterDue=Math.max(0,remaining-(hasAmount?amount:0)),totalPaidAfter=paymentTotal(order),imageContext={orderId,amount:hasAmount?amount:0,discount:hasDiscount?discount:0,beforeDue:beforeOperationDue,afterDue,totalPaidAfter,priceChanges:getPriceChangeHistory(order),discounts:getDiscountHistory(order),returns:getReturnHistory(order),priceOnly:onlyPrice||(!hasAmount&&!hasDiscount&&!hasReturn),operationProvided:true,operationChanges:changedPriceChanges,operationDiscountProvided:hasDiscount,operationReturnProvided:hasReturn};
 closePaymentModal();renderOrders();if($("collectionsModal")?.classList.contains("show"))renderCollections();if($("orderDetailModal")?.classList.contains("show"))openOrderDetail(orderId);
 toast(hasAmount?(order.due<=0.000001?"الكوموند تخلصات كاملة":"تسجل القسط وتوجدات صورة الإرسال"):hasDiscount?"تسجل التخفيض وتوجدات صورة الإرسال":hasReturn?"تسجل الإرجاع وتوجدات صورة الإرسال":"تسجل تغيير الثمن وتوجدات صورة الإرسال");
 await sharePaymentOperationImage(imageContext);
}
function ensureOrderDeadline(order){
 const mode=String(order?.paymentTermMode||"");
 const isCodTerm=mode==="cod";
 const isTestTerm=mode==="test_1m";
 const term=isCodTerm||isTestTerm?0:(Number(order?.paymentTermDays)===30?30:15);
 const durationMs=isTestTerm?Math.max(1,Number(order?.paymentTermMinutes)||1)*60000:term*86400000;
 const base=new Date(order?.date||Date.now());
 if(!isCodTerm&&(!order.dueDate||Number.isNaN(new Date(order.dueDate).getTime())))order.dueDate=new Date(base.getTime()+durationMs).toISOString();
 if(isCodTerm)order.dueDate="";
 order.paymentTermDays=term;
 if(isTestTerm){order.paymentTermMode="test_1m";order.paymentTermMinutes=Math.max(1,Number(order?.paymentTermMinutes)||1)}
 else if(isCodTerm){order.paymentTermMode="cod";order.paymentTermMinutes=null}
 else {order.paymentTermMode="days";order.paymentTermMinutes=null}
 return order;
}
function deadlineState(order){
 ensureOrderDeadline(order);
 const isCodTerm=order.paymentTermMode==="cod";
 const isTestTerm=order.paymentTermMode==="test_1m";
 const dueDate=isCodTerm?null:new Date(order.dueDate);
 const due=paymentTotal(order);
 const remaining=Math.max(0,Number(order.total||0)-due);
 const ms=dueDate?dueDate.getTime()-Date.now():0;
 return {dueDate,remaining,daysLeft:isCodTerm?0:Math.ceil(ms/86400000),minutesLeft:isCodTerm?0:Math.ceil(ms/60000),overdue:!isCodTerm&&ms<0&&remaining>0,term:isCodTerm?"عند الاستلام":(isTestTerm?"تجريبي":order.paymentTermDays),termKey:isCodTerm?"cod":(isTestTerm?"test_1m":"days")};
}
function deadlineText(state){
 const date=state.dueDate?state.dueDate.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"}):"—";
 if(state.termKey==="cod")return "إستخلاص عند الإستلام / Paiement à la livraison";
 if(state.overdue)return state.termKey==="test_1m"?`انتهت مدة التجربة في ${date}`:`انتهت مدة الاستخلاص في ${date}`;
 if(state.termKey==="test_1m")return `تجربة · الاستحقاق بعد ${Math.max(1,state.minutesLeft)} دقيقة`;
 if(state.daysLeft<=0)return `تاريخ الاستحقاق اليوم · ${date}`;
 return `أجل ${state.term} يوم / ${state.term} jours · الاستحقاق ${date}`;
}
function collectionTerms(order,state=deadlineState(order)){
 const date=state.dueDate?state.dueDate.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"}):"—";
 if(state.termKey==="cod")return {redText:"إستخلاص عند الإستلام / Paiement à la livraison",dateText:"تاريخ الاستخلاص: عند الاستلام / Date de règlement : à la livraison"};
 if(state.termKey==="test_1m")return {redText:"مدة الاستخلاص: تجربة دقيقة واحدة / Durée de règlement : test 1 minute",dateText:`تاريخ الاستخلاص: ${date} / Date de règlement : ${date}`};
 return {redText:`مدة الاستخلاص: ${state.term} يوماً / Durée de règlement : ${state.term} jours`,dateText:`تاريخ الاستخلاص: ${date} / Date de règlement : ${date}`};
}
function overdueReminderRows(){
 return orders.map(order=>{recalculateOrderPaymentState(order);const state=deadlineState(order);return {order,state,due:Math.max(0,Number(order.total||0)-paymentTotal(order))};}).filter(row=>row.due>0&&row.state.overdue).sort((a,b)=>new Date(a.state.dueDate)-new Date(b.state.dueDate));
}
function dueReminderTotal(rows){return rows.reduce((sum,row)=>sum+row.due,0)}
function buildDueReminderText(rows,total){
 const now=new Date();
 const date=now.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"});
 const lines=[
  "رسالة من مسؤول الحسابات بالشركة — MESSAGE DU RESPONSABLE COMPTABLE",
  `التاريخ / Date : ${date}`,
  "",
  "زبناؤنا الكرام،",
  `هذا تذكير صادر عن مسؤول الحسابات بالشركة بخصوص مجموع المبالغ المتبقية في الكوموندات التي تجاوزت آخر أجل للاستخلاص، وقيمته ${money(total)} درهم. المرجو تسوية المبلغ خلال الزيارة القادمة. ستجدون أسفله كشفاً دقيقاً لكل كوموند ولكل دفعة مسجلة.`,
  "",
  "Chers clients,",
  `Ce message est un rappel envoyé par le responsable comptable de la société concernant les soldes des commandes ayant dépassé leur date limite de règlement, pour un montant total de ${money(total)} درهم. Nous vous remercions de régulariser ce montant lors de notre prochaine visite. Vous trouverez ci-dessous le détail précis de chaque commande et de chaque paiement enregistré.`,
  "",
  "━━━━━━━━━━━━━━━━━━━━━━━━",
  "تفاصيل الكوموند والدفعات / DÉTAILS DES COMMANDES ET PAIEMENTS",
  "━━━━━━━━━━━━━━━━━━━━━━━━"
 ];
 rows.forEach((row,index)=>{
  const order=row.order||{};
  recalculateOrderPaymentState(order);
  const dueOrder=Math.max(0,Number(order.total||0)-paymentTotal(order));
  const expiredDate=row.state.dueDate.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"});
  lines.push("",`الزبون / Client : ${order.client||"Client"}`);
  lines.push(`الباقي / Reste à payer : ${money(dueOrder)} درهم`);
  lines.push(`تاريخ انتهاء أجل الاستحقاق / Date d'échéance expirée : ${expiredDate}`);
 });
  lines.push("","━━━━━━━━━━━━━━━━━━━━━━━━",`المجموع النهائي المتبقي / TOTAL GÉNÉRAL À RÉGLER : ${money(total)} درهم`,"━━━━━━━━━━━━━━━━━━━━━━━━","","هذا تذكير من مسؤول الحسابات بالشركة، وشكراً لتعاونكم.","Ce message est un rappel du responsable comptable de la société. Merci pour votre collaboration.","","مسؤول الحسابات بالشركة / Le responsable comptable de la société","3D PEINTURES");
 return lines.join("\n");
}
async function createDueReminderPDF(rows=overdueReminderRows()){
 try{
  if(!rows.length){toast("لا توجد كوموندات تجاوزت أجل الاستخلاص");return null}
  if(!window.html2canvas||!window.jspdf)throw new Error("PDF libraries unavailable");
  const total=dueReminderTotal(rows), message=buildDueReminderText(rows,total), now=new Date();
  const date=now.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"});
  let logoB64="";
  try{
   const r=await fetch("https://www.dropbox.com/scl/fi/g6bef6j1a3gtse98o9ktp/Picsart_26-08-12_00-00-35-616.png?rlkey=z5wm1262vccogra8t9n71stei&st=5lq7g02n&raw=1");
   const blob=await r.blob();
   logoB64=await new Promise(resolve=>{const fr=new FileReader();fr.onload=e=>resolve(e.target.result);fr.onerror=()=>resolve("");fr.readAsDataURL(blob)});
  }catch(err){console.warn("Logo reminder load failed",err)}
  const root=document.createElement("div");
  root.dir="ltr";
  root.style.cssText="position:fixed;left:-10000px;top:0;width:760px;background:#fff;color:#172033;padding:42px;font-family:Arial,'Noto Naskh Arabic',sans-serif;z-index:-1;box-sizing:border-box";
  const detailRows=rows.map(row=>{
   const expiredDate=row.state.dueDate.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"});
   const due=Math.max(0,Number(row.order.total||0)-paymentTotal(row.order));
   return `<tr><td style="padding:9px;border-bottom:1px solid #eadfc2;text-align:left;vertical-align:top"><b style="font-size:12px;color:#d00000">${esc(row.order.client||"Client")}</b></td><td style="padding:9px;border-bottom:1px solid #eadfc2;text-align:right;vertical-align:top;color:#d00000;font-size:12px;font-weight:400">الباقي / Reste à payer : ${money(due)} درهم<br>تاريخ انتهاء أجل الاستحقاق / Date d'échéance expirée : ${expiredDate}</td></tr>`;
  }).join("");
  const watermark=logoB64?`<div style="position:absolute;top:55%;left:50%;transform:translate(-50%,-50%);width:560px;opacity:.08;z-index:0"><img src="${logoB64}" style="width:100%;height:auto"></div>`:"";
  root.innerHTML=`${watermark}<div style="position:relative;z-index:1">
   <div style="border-bottom:4px solid #12386f;padding-bottom:18px;margin-bottom:24px;display:flex;justify-content:space-between;gap:20px;align-items:flex-start">
    <div><div style="font-size:16px;letter-spacing:4px;color:#b58a2a;font-weight:700">3D PEINTURES</div><div style="font-size:30px;font-weight:900;margin-top:6px">RAPPEL DE RÈGLEMENT</div><div style="font-size:14px;color:#667085;margin-top:7px">${date}</div></div>
    <div style="text-align:right;direction:rtl;font-size:14px;color:#667085;line-height:1.65"><b style="color:#12386f;font-size:18px">رسالة من مسؤول الحسابات</b><br>مسؤول الحسابات بالشركة</div>
   </div>
   <div style="border:1px solid #dfe3e8;border-radius:14px;padding:20px;background:#fffdf7;margin-bottom:22px;line-height:1.7">
    <div style="direction:rtl;text-align:right;font-size:17px;font-weight:700">زبناؤنا الكرام،</div>
    <div style="direction:rtl;text-align:right;margin-top:7px;font-size:15px">هذا تذكير صادر عن مسؤول الحسابات بالشركة بخصوص مجموع المبالغ المتبقية التي تجاوزت آخر أجل للاستخلاص، وقيمتها <b style="color:#b42318">${money(total)} درهم</b>. المرجو تسوية المبلغ خلال الزيارة القادمة.</div>
    <div style="border-top:1px solid #eadfc2;margin:15px 0"></div>
    <div style="font-size:17px;font-weight:700">Chers clients,</div>
    <div style="margin-top:7px;font-size:15px">Ce message est un rappel envoyé par le responsable comptable de la société concernant le total des soldes ayant dépassé leur date limite de règlement, soit <b style="color:#b42318">${money(total)} درهم</b>. Nous vous remercions de régulariser ce montant lors de notre prochaine visite.</div>
   </div>
   <div style="font-size:17px;font-weight:900;color:#12386f;margin-bottom:9px">DÉTAILS DES SOLDES · تفاصيل المبالغ المتبقية</div>
   <table style="width:100%;border-collapse:collapse;font-size:13px;direction:ltr"><thead><tr style="background:#12386f;color:#fff"><th style="padding:9px;text-align:left">Client / الزبون</th><th style="padding:9px;text-align:right">الباقي وتاريخ انتهاء الأجل / Reste et échéance expirée</th></tr></thead><tbody>${detailRows}</tbody></table>
   <div style="margin:24px 0 0 auto;width:330px;border:2px solid #b58a2a;border-radius:14px;padding:16px;background:#fffdf7"><div style="font-size:14px;color:#667085">TOTAL À RÉGLER · مجموع الباقي</div><div style="font-size:28px;font-weight:900;color:#b42318;margin-top:7px;text-align:right">${money(total)} درهم</div></div>
   <div style="margin-top:28px;text-align:center;color:#667085;font-size:13px;line-height:1.6">هذا تذكير من مسؤول الحسابات بالشركة.<br>Ce message est un rappel du responsable comptable de la société.</div>
   <div style="margin-top:18px;text-align:center;font-weight:900;color:#12386f;font-size:15px">مسؤول الحسابات بالشركة · Le responsable comptable de la société</div>
  </div>`;
  document.body.appendChild(root);
  const canvas=await html2canvas(root,{scale:2,backgroundColor:"#ffffff",useCORS:true,logging:false});
  const {jsPDF}=window.jspdf;
  const pdf=new jsPDF({orientation:"p",unit:"mm",format:"a4"});
  const pageW=210,pageH=297,margin=8,imgW=pageW-margin*2,imgH=canvas.height*imgW/canvas.width,pagePx=Math.floor(canvas.width*(pageH-margin*2)/imgH);
  let yPx=0,page=0;
  while(yPx<canvas.height){const sliceH=Math.min(pagePx,canvas.height-yPx);const slice=document.createElement("canvas");slice.width=canvas.width;slice.height=sliceH;slice.getContext("2d").drawImage(canvas,0,yPx,canvas.width,sliceH,0,0,canvas.width,sliceH);if(page>0)pdf.addPage();pdf.addImage(slice.toDataURL("image/jpeg",.92),"JPEG",margin,margin,imgW,sliceH*imgW/canvas.width);yPx+=sliceH;page++}
  return {blob:pdf.output("blob"),name:pdfFileName("Rappel",null,now),message,total,count:rows.length};
 }catch(err){console.error(err);toast("تعذر إنشاء ملف PDF للتذكير");return null}
 finally{const root=document.querySelector('body > div[style*="left: -10000px"]');if(root)root.remove()}
}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000)}
async function shareDueReminderPDF(){
 const rows=overdueReminderRows();if(!rows.length){toast("لا توجد كوموندات تجاوزت أجل الاستخلاص");return}
 const waWindow=window.open("about:blank","_blank");
 const result=await createDueReminderPDF(rows);if(!result){waWindow?.close();return}
 const file=new File([result.blob],result.name,{type:"application/pdf"});
 const whatsappText=`${result.message}\n\nPDF : ${result.name}`;
 try{
  if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({title:"Rappel de règlement — 3D PEINTURES",text:result.message,files:[file]});waWindow?.close();toast("تم تجهيز PDF وفتحت نافذة المشاركة");return}
 }catch(err){console.warn("Native share cancelled or unavailable",err)}
 downloadBlob(result.blob,result.name);
 const url=`https://wa.me/?text=${encodeURIComponent(whatsappText)}`;
 if(waWindow&&!waWindow.closed)waWindow.location.href=url;else window.open(url,"_blank");
 toast("تم تحميل PDF وفتح واتساب برسالة التذكير");
}
function renderDueAlerts(){
 const bar=$("dueAlertBar"); if(!bar)return;
  const alerts=orders.map(order=>({order,state:deadlineState(order)})).filter(x=>x.state.termKey!=="cod"&&x.state.remaining>0&&(x.state.overdue||x.state.daysLeft<=3)).sort((a,b)=>Number(b.state.overdue)-Number(a.state.overdue)||a.state.daysLeft-b.state.daysLeft);
 if(!alerts.length){bar.hidden=true;bar.className="due-alert-bar";bar.innerHTML="";return}
 const expired=alerts.some(x=>x.state.overdue);
 const first=alerts[0];
 const overdueRows=expired?overdueReminderRows():[];
 const overdueTotal=dueReminderTotal(overdueRows);
 bar.hidden=false;
 bar.className=`due-alert-bar ${expired?"expired":"warning"}`;
 bar.innerHTML=`<div><strong>${expired?"تنبيه: انتهت مدة استخلاص بون":"تذكير باقتراب موعد الاستخلاص"}</strong><small>${expired?`${overdueRows.length} بون(ات) تجاوزت الأجل · مجموع الباقي ${money(overdueTotal)} درهم`: `${alerts.length} بون(ات) قريبة من تاريخ الاستحقاق`} · ${esc(first.order.client||"Client")} · ${deadlineText(first.state)}</small></div><div class="due-alert-actions"><button type="button" data-due-open>فتح الأرشيف</button>${expired?`<button type="button" class="due-reminder-btn" data-due-reminder>PDF + WhatsApp · ${money(overdueTotal)} درهم</button>`:""}</div>`;
 bar.querySelector("[data-due-open]")?.addEventListener("click",openOrdersModal);
 bar.querySelector("[data-due-reminder]")?.addEventListener("click",e=>{e.stopPropagation();shareDueReminderPDF()});
}
function renderOrders(){
 renderSalesForecast();
 const q=($("orderSearch").value||"").trim().toLowerCase();
 let sales=0,paid=0,due=0;
 orders.forEach(o=>{const state=recalculateOrderPaymentState(o);sales+=Number(o.total)||0;paid+=state.paid;due+=state.due});
 $("statSales").textContent=money(sales)+" درهم";
 $("statPaid").textContent=money(paid)+" درهم";
 $("statDue").textContent=money(due)+" درهم";
 const list=orders.filter(o=>!q||String(o.client||"").toLowerCase().includes(q));
 $("ordersEmpty").style.display=list.length?"none":"block";
 $("ordersList").innerHTML=list.map(o=>{
   const d=new Date(o.date);
   const date=d.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"});
   const time=d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
   const total=Number(o.total)||0;
   const state=recalculateOrderPaymentState(o);
   const paid=state.paid;
   const due=state.due;
   const status=due<=0.000001?"مخلصة كاملة":paid>0?"مخلصة جزئياً":"غير مخلصة";
   const statusClass=due<=0.000001?"paid":paid>0?"partial":"unpaid";
   const deadline=deadlineState(o);
   const rowClass=deadline.overdue&&due>0?`${statusClass} overdue`:statusClass;
   return `<div class="order-row ${rowClass}" data-order-open="${esc(o.id)}" tabindex="0" role="button">
     <div class="order-main">
       <div class="order-client">${esc(o.client)}</div>
       <small>${date} · ${time}</small>
       <div class="order-status ${statusClass}">${status}</div>
       ${o.note?`<p>${esc(o.note)}</p>`:""}
     </div>
     <div class="order-money">
       <b>${money(total)} درهم</b>
       <span>خلص: ${money(paid)} درهم</span>
       <span class="${due>0?"due":""}">باقي: ${money(due)} درهم</span>
        ${due<=0?`<span class="paid-label">✓ مخلصة</span>`:""}
       ${getPaymentHistory(o).length?`<small class="order-installment-summary">${getPaymentHistory(o).length} قسط · مجموع الأقساط ${money(paid)} درهم</small>`:""}
       ${due>0?`<span class="deadline-chip ${deadline.overdue?"expired":""}">⏱ ${deadlineText(deadline)}</span>`:`<span class="deadline-chip paid">✓ تم الاستخلاص</span>`}
       <button class="archive-send-btn" data-order-send="${o.id}" type="button">إرسال الكوموند</button>
     </div>
     <button class="order-delete" data-order-delete="${o.id}" title="حذف">×</button>
   </div>`;
 }).join("");
 
 document.querySelectorAll("[data-order-send]").forEach(b=>b.onclick=async(e)=>{e.stopPropagation();b.disabled=true;b.textContent="جاري التجهيز...";try{const order=orders.find(o=>String(o.id)===String(b.dataset.orderSend));if(order)await shareOrderPDF(order)}finally{b.disabled=false;b.textContent="إرسال الكوموند"}});
 document.querySelectorAll("[data-order-delete]").forEach(b=>b.onclick=(e)=>{
   e.stopPropagation();
   if(confirm("حذف هاد الطلب من الأرشيف؟")){orders=orders.filter(o=>o.id!==b.dataset.orderDelete);localStorage.setItem("3d_peintures_orders_v1",JSON.stringify(orders));renderOrders();if($("collectionsModal")?.classList.contains("show"))renderCollections();toast("تم حذف الطلب")}
 });
 document.querySelectorAll("[data-order-open]").forEach(b=>{
   b.onclick=()=>openOrderDetail(b.dataset.orderOpen);
   b.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openOrderDetail(b.dataset.orderOpen)}};
    });
   autoArchiveSnapshot();renderOrdersAutoArchiveHistory();updateAutoArchiveLabels();
   renderDueAlerts();
 }
 function openOrdersModal(){renderOrders();$("ordersModal").classList.add("show")}
function closeOrdersModal(){$("ordersModal").classList.remove("show")}

/* ===== Collections tracker ===== */
function collectionCycleStart(){
 let value=localStorage.getItem(COLLECTIONS_CYCLE_KEY);
 if(!value){value="1970-01-01T00:00:00.000Z";localStorage.setItem(COLLECTIONS_CYCLE_KEY,value)}
 return value;
}
function collectionHistory(){
 try{const value=JSON.parse(localStorage.getItem(COLLECTIONS_HISTORY_KEY)||"[]");return Array.isArray(value)?value:[]}catch(err){return []}
}
function collectionDateLabel(value){
 const d=new Date(value);if(Number.isNaN(d.getTime()))return "—";
 return d.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"});
}
function getPriceChangeHistory(order){const raw=Array.isArray(order?.priceChanges)?order.priceChanges.filter(change=>Number.isFinite(Number(change?.newPrice))&&Number.isFinite(Number(change?.oldPrice))):[],groups=new Map();raw.forEach(change=>{const key=String(change.productId||change.productCode||change.productName||"منتوج").trim().toLowerCase(),existing=groups.get(key);if(!existing){groups.set(key,{...change})}else{const oldPrice=Number(existing.oldPrice)||0,newPrice=Number(change.newPrice)||0,quantity=priceChangeQuantity(order,change),difference=newPrice-oldPrice;groups.set(key,{...existing,...change,oldPrice,newPrice,difference,quantity,adjustment:difference*quantity,date:change.date||existing.date})}});return [...groups.values()]}
function collectionTrackerRows(startAt=collectionCycleStart()){
 const startMs=new Date(startAt).getTime(),rows=[];
 orders.forEach(order=>{
  const client=String(order.client||"Client").trim()||"Client";
  getPaymentHistory(order).forEach(payment=>{
   const date=payment.date||order.date,paymentMs=new Date(date).getTime(),amount=Math.max(0,Number(payment.amount)||0);
   if(amount>0&&paymentMs>=startMs)rows.push({kind:"installment",client,amount,date,orderId:order.id});
  });
  getPriceChangeHistory(order).forEach(change=>{
   const date=change.date||order.updatedAt||order.date,changeMs=new Date(date).getTime(),oldPrice=Math.max(0,Number(change.oldPrice)||0),newPrice=Math.max(0,Number(change.newPrice)||0),difference=priceChangeUnitDifference(change),adjustment=priceChangeAdjustment(order,change),quantity=priceChangeQuantity(order,change);
   if(Math.abs(adjustment)>0.000001&&changeMs>=startMs)rows.push({kind:"price-change",client,amount:Math.abs(adjustment),difference,adjustment,quantity,oldPrice,newPrice,productName:change.productName||"منتوج",productCode:change.productCode||"",date,orderId:order.id});
  });
 });
 return rows.sort((a,b)=>new Date(b.date)-new Date(a.date));
}
function collectionTotals(rows){
 const installmentRows=rows.filter(row=>row.kind==="installment"),priceChangeRows=rows.filter(row=>row.kind==="price-change");
 const installmentsTotal=installmentRows.reduce((sum,row)=>sum+(Number(row.amount)||0),0),priceChangesTotal=priceChangeRows.reduce((sum,row)=>sum+(Number(row.amount)||0),0);
 return {installmentRows,priceChangeRows,installmentsTotal,priceChangesTotal};
}
function renderCollectionsHistory(){
 const list=$("collectionsHistory"),empty=$("collectionsHistoryEmpty");if(!list||!empty)return;
 const history=collectionHistory().sort((a,b)=>new Date(b.closedAt)-new Date(a.closedAt));
 empty.style.display=history.length?"none":"block";
 list.innerHTML=history.map(item=>{const installmentsTotal=Number(item.installmentsTotal)||0,priceChangesTotal=Number(item.priceChangesTotal)||0;return `<div class="collection-history-row">
   <div class="collection-history-date"><b>دورة مؤرشفة</b><small>${collectionDateLabel(item.from)} — ${collectionDateLabel(item.to||item.closedAt)}</small></div>
   <div class="collection-history-metrics"><span>الأقساط<strong>${money(installmentsTotal)} درهم</strong></span><span>تغييرات الأثمنة<strong>${money(priceChangesTotal)} درهم</strong></span></div>
 </div>`}).join("");
}
function renderCollections(){
 const rows=collectionTrackerRows(),totals=collectionTotals(rows),groups=new Map();
 $("collectionsCycleDate").textContent=collectionDateLabel(collectionCycleStart());
 $("collectionsInstallmentsTotal").textContent=`${money(totals.installmentsTotal)} درهم`;
 $("collectionsPriceChangesTotal").textContent=`${money(totals.priceChangesTotal)} درهم`;
 $("collectionsInstallmentsCount").textContent=`${totals.installmentRows.length} قسط`;
 $("collectionsPriceChangesCount").textContent=`${totals.priceChangeRows.length} تغيير`;
 rows.forEach(row=>{const key=normalizeClientSearch(row.client)||"client",group=groups.get(key)||{client:row.client,rows:[],installments:0,priceChanges:0};group.rows.push(row);if(row.kind==="installment")group.installments+=Number(row.amount)||0;else group.priceChanges+=Number(row.amount)||0;groups.set(key,group)});
 const list=$("collectionsList"),empty=$("collectionsEmpty");
 if(list&&empty){empty.style.display=groups.size?"none":"block";list.innerHTML=[...groups.values()].map(group=>`<section class="collection-client-card"><div class="collection-client-head"><div><b>${esc(group.client)}</b><small>${group.rows.length} عملية مسجلة</small></div><div class="collection-client-totals"><span>الأقساط<strong>${money(group.installments)} درهم</strong></span><span>تغيير الأثمنة<strong>${money(group.priceChanges)} درهم</strong></span></div></div><div class="collection-client-rows">${group.rows.map(row=>row.kind==="installment"?`<div class="collection-item installment"><span class="collection-kind installment">قسط</span><div class="collection-main"><b>${esc(group.client)}</b><small>${formatPaymentDate(row.date)}</small></div><strong>${money(row.amount)} درهم</strong></div>`:`<div class="collection-item price-change"><span class="collection-kind price-change">ثمن</span><div class="collection-main"><b>${esc(row.productName)}${row.productCode?` · ${esc(row.productCode)}`:""}</b><small>${formatPaymentDate(row.date)} · ${money(row.oldPrice)} → ${money(row.newPrice)} درهم</small></div><strong>${row.difference>0?"+":"−"}${money(Math.abs(row.difference))} درهم</strong></div>`).join("")}</div></section>`).join("")}
 renderCollectionsHistory();
 autoArchiveSnapshot();renderCollectionsAutoArchiveHistory();updateAutoArchiveLabels();
}
function resetCollections(){
 const startAt=collectionCycleStart(),rows=collectionTrackerRows(startAt),totals=collectionTotals(rows);
 if(!rows.length){toast("ما كاين حتى استخلاص في الدورة الحالية باش تصفرها");return}
 if(!confirm("واش بغيتي تصفر الدورة الحالية؟ غادي تبقى محفوظة في السجل القديم بلا أسماء الزبناء."))return;
 const closedAt=new Date().toISOString(),history=collectionHistory();
 history.unshift({id:makeId(),from:startAt,to:closedAt,closedAt,installmentsTotal:totals.installmentsTotal,priceChangesTotal:totals.priceChangesTotal,installmentsCount:totals.installmentRows.length,priceChangesCount:totals.priceChangeRows.length});
 localStorage.setItem(COLLECTIONS_HISTORY_KEY,JSON.stringify(history.slice(0,100)));
 localStorage.setItem(COLLECTIONS_CYCLE_KEY,closedAt);
 renderCollections();
 toast("تصفات الدورة وبقى السجل القديم محفوظ");
}
function openCollections(){
 $("actionMenu").classList.remove("show");
 $("collectionsModal").classList.add("show");
 renderCollections();
}
function closeCollections(){$("collectionsModal").classList.remove("show")}

/* ===== Dashboard commercial ===== */
let topProductsChart=null;
let peakHoursChart=null;
let financialChart=null;
function dashboardMonthLabel(key){
 const [year,month]=String(key||currentMonthKey()).split("-").map(Number);
 if(!year||!month)return key||"";
 return new Date(year,month-1,1).toLocaleDateString("fr-FR",{month:"long",year:"numeric"});
}
function dashboardOrdersForMonth(selectedMonth){
 return orders.filter(order=>monthKey(order.date)===selectedMonth).map(order=>{recalculateOrderPaymentState(order);return order});
}
function dashboardDestroyCharts(){
 if(topProductsChart){topProductsChart.destroy();topProductsChart=null}
 if(peakHoursChart){peakHoursChart.destroy();peakHoursChart=null}
 if(financialChart){financialChart.destroy();financialChart=null}
}
function renderDashboard(){
 const monthInput=$("dashboardMonth");
 if(!monthInput)return;
 if(!monthInput.value)monthInput.value=currentMonthKey();
 const selectedMonth=monthInput.value;
 const selectedOrders=dashboardOrdersForMonth(selectedMonth);
 const productMap=new Map(),clientMap=new Map(),cityMap=new Map();
 const hours=Array.from({length:24},()=>0);
 let sales=0,cost=0,paid=0,due=0,unitsSold=0,freeUnits=0,paidOrders=0,dueOrders=0;
 selectedOrders.forEach(order=>{
   const state=recalculateOrderPaymentState(order);
   const orderTotal=Number(order.total)||0;
   sales+=orderTotal;paid+=Number(state.paid)||0;due+=Number(state.due)||0;
   if(Number(state.due)<=0.000001)paidOrders++;else dueOrders++;
   const clientName=String(order.client||"زبون بدون اسم").trim()||"زبون بدون اسم";
   const clientRecord=clientMap.get(clientName)||{name:clientName,orders:0,sales:0,paid:0,due:0};
   clientRecord.orders++;clientRecord.sales+=orderTotal;clientRecord.paid+=Number(state.paid)||0;clientRecord.due+=Number(state.due)||0;clientMap.set(clientName,clientRecord);
   const clientObj=clients.find(c=>String(c.name||"").trim().toLowerCase()===clientName.toLowerCase());
   const city=String(clientObj?.city||clientObj?.ville||"بدون مدينة").trim()||"بدون مدينة";
   const cityRecord=cityMap.get(city)||{city,orders:0,sales:0,paid:0,due:0};
   cityRecord.orders++;cityRecord.sales+=orderTotal;cityRecord.paid+=Number(state.paid)||0;cityRecord.due+=Number(state.due)||0;cityMap.set(city,cityRecord);
   const date=new Date(order.date);
   if(!Number.isNaN(date.getTime()))hours[date.getHours()]++;
   (order.items||[]).forEach(row=>{
     const product=products.find(p=>String(p.id)===String(row.id));
     const key=String(row.id||row.code||row.name||"unknown");
     const units=orderItemUnits(row),free=Number(row.freeUnits)||0;
     const line=Number(row.lineTotal ?? ((Number(row.unitPrice ?? product?.price)||0)*units))||0;
     const costLine=(Number(row.costPrice ?? product?.costPrice)||0)*units;
     unitsSold+=units;freeUnits+=free;cost+=costLine;
     const item=productMap.get(key)||{name:row.name||product?.name||"Produit",units:0,sales:0,cost:0};
     item.units+=units;item.sales+=line;item.cost+=costLine;productMap.set(key,item);
   });
 });
 const profit=sales-cost,margin=sales?profit/sales*100:0;
 const topProducts=[...productMap.values()].sort((a,b)=>b.units-a.units||b.sales-a.sales).slice(0,8);
 const topClients=[...clientMap.values()].sort((a,b)=>b.sales-a.sales).slice(0,6);
 const topCities=[...cityMap.values()].sort((a,b)=>b.sales-a.sales).slice(0,6);
 const peakCount=Math.max(...hours,0),peakIndexes=hours.reduce((acc,value,index)=>value===peakCount&&value>0?acc.concat(index):acc,[]);
 const peakText=peakIndexes.length?peakIndexes.map(h=>`${String(h).padStart(2,"0")}:00`).join(" · "):"—";
 const setText=(id,value)=>{const node=$(id);if(node)node.textContent=value};
 setText("dashboardOrdersCount",String(selectedOrders.length));setText("dashboardSalesTotal",`${money(sales)} درهم`);setText("dashboardTopProduct",topProducts[0]?.name||"—");setText("dashboardPeakHour",peakText);
 setText("dashboardCostTotal",`${money(cost)} درهم`);setText("dashboardProfitTotal",`${money(profit)} درهم`);setText("dashboardPaidTotal",`${money(paid)} درهم`);setText("dashboardDueTotal",`${money(due)} درهم`);setText("dashboardUnitsTotal",`${unitsSold} قطعة`);setText("dashboardClientsTotal",String(clientMap.size));setText("dashboardCitiesTotal",String(cityMap.size));setText("dashboardMarginTotal",`${margin.toFixed(1)}%`);setText("dashboardPaidOrders",String(paidOrders));setText("dashboardDueOrders",String(dueOrders));setText("dashboardFreeUnits",`${freeUnits} قطعة`);
 const renderRankRows=(items,type)=>items.length?items.map((item,index)=>{const main=type==="product"?`${item.units} قطعة`:type==="client"?`${item.orders} طلب`:`${item.orders} طلب`;const name=type==="city"?item.city:item.name;return `<div class="dashboard-rank-row"><span class="dashboard-rank-index">${index+1}</span><div><b>${esc(name)}</b><small>${main} · مخلص ${money(item.paid)} درهم · باقي ${money(item.due)} درهم</small></div><strong>${money(item.sales)} درهم</strong></div>`}).join(""):"<div class=\"dashboard-table-empty\">ما كايناش معطيات فهاد الشهر.</div>";
 const productList=$("dashboardProductsList"),clientList=$("dashboardClientsList"),cityList=$("dashboardCitiesList");if(productList)productList.innerHTML=renderRankRows(topProducts,"product");if(clientList)clientList.innerHTML=renderRankRows(topClients,"client");if(cityList)cityList.innerHTML=renderRankRows(topCities,"city");
 const topEmpty=$("topProductsEmpty"),peakEmpty=$("peakHoursEmpty"),financialEmpty=$("financialEmpty");
 if(topEmpty)topEmpty.style.display=topProducts.length?"none":"block";if(peakEmpty)peakEmpty.style.display=peakCount>0?"none":"block";
 const monthKeys=[...new Set(orders.map(order=>monthKey(order.date)).filter(Boolean))].sort().slice(-6);
 const monthly=monthKeys.map(key=>{const monthOrders=dashboardOrdersForMonth(key);let monthSales=0,monthPaid=0,monthDue=0;monthOrders.forEach(order=>{const state=recalculateOrderPaymentState(order);monthSales+=Number(order.total)||0;monthPaid+=Number(state.paid)||0;monthDue+=Number(state.due)||0});return {key,sales:monthSales,paid:monthPaid,due:monthDue}});
 if(financialEmpty)financialEmpty.style.display=monthly.length?"none":"block";
 dashboardDestroyCharts();
 if(typeof Chart==="undefined")return;
 const gold="#f5d477",goldSoft="rgba(245,212,119,.78)",grid="rgba(255,255,255,.10)",text="#dbe5f5";
 if(topProducts.length){const canvas=$("topProductsChart");if(canvas)topProductsChart=new Chart(canvas,{type:"bar",data:{labels:topProducts.map(item=>item.name.length>18?item.name.slice(0,18)+"…":item.name),datasets:[{label:"الوحدات",data:topProducts.map(item=>item.units),backgroundColor:topProducts.map((_,i)=>i===0?gold:goldSoft),borderColor:gold,borderWidth:1,borderRadius:7,barThickness:18}]},options:{indexAxis:"y",responsive:true,maintainAspectRatio:false,animation:{duration:450},plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.raw} قطعة`}}},scales:{x:{beginAtZero:true,ticks:{color:text,precision:0},grid:{color:grid}},y:{ticks:{color:text,font:{size:11}},grid:{display:false}}}}})}
 if(peakCount>0){const canvas=$("peakHoursChart");if(canvas)peakHoursChart=new Chart(canvas,{type:"line",data:{labels:hours.map((_,i)=>`${String(i).padStart(2,"0")}h`),datasets:[{label:"الطلبات",data:hours,borderColor:gold,backgroundColor:"rgba(245,212,119,.16)",pointBackgroundColor:gold,pointBorderColor:"#06152f",pointRadius:3,pointHoverRadius:5,borderWidth:2,tension:.35,fill:true}]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:450},plugins:{legend:{display:false}},scales:{x:{ticks:{color:text,maxRotation:0,autoSkip:true,maxTicksLimit:12},grid:{color:grid}},y:{beginAtZero:true,ticks:{color:text,precision:0},grid:{color:grid}}}}})}
 if(monthly.length){const canvas=$("financialChart");if(canvas)financialChart=new Chart(canvas,{type:"line",data:{labels:monthly.map(item=>dashboardMonthLabel(item.key)),datasets:[{label:"المبيعات",data:monthly.map(item=>item.sales),borderColor:gold,backgroundColor:"rgba(245,212,119,.15)",fill:true,tension:.3},{label:"الخلاص",data:monthly.map(item=>item.paid),borderColor:"#7ee2a8",backgroundColor:"rgba(126,226,168,.08)",fill:false,tension:.3},{label:"الباقي",data:monthly.map(item=>item.due),borderColor:"#ff8d85",backgroundColor:"rgba(255,141,133,.08)",fill:false,tension:.3}]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:450},plugins:{legend:{display:true,labels:{color:text,font:{size:10}}}},scales:{x:{ticks:{color:text,maxRotation:0,autoSkip:true,maxTicksLimit:6},grid:{color:grid}},y:{beginAtZero:true,ticks:{color:text,callback:value=>`${money(value)} درهم`,color:text},grid:{color:grid}}}}})}
}
function openDashboard(){
 $("actionMenu").classList.remove("show");
 $("dashboardModal").classList.add("show");
 requestAnimationFrame(renderDashboard);
}
function closeDashboard(){$("dashboardModal").classList.remove("show");dashboardDestroyCharts()}

function orderItemsForDisplay(order){
 return (order.items||[]).map(row=>{
   const p=products.find(x=>x.id===row.id)||{};
   const boxes=Number(row.qty)||0;
   const units=Number(row.units ?? p.qty)||0;
   const unitPrice=Number(row.unitPrice ?? p.price)||0;
   const name=row.name || p.name || "Produit";
   const paidUnits=Number(row.paidUnits ?? (units*boxes)) || 0;
   const freeUnits=Number(row.freeUnits ?? (hasPromo10Plus1(p)?Math.floor(paidUnits/10):0)) || 0;
   const lineTotal=Number(row.lineTotal ?? (unitPrice*paidUnits)) || 0;
   const returnedUnits=returnedQuantityForItem(order,row);
   return {name,boxes,units,paidUnits,totalPieces:paidUnits,freeUnits,deliveredUnits:paidUnits+freeUnits,returnedUnits,unitPrice,lineTotal,promotion:freeUnits>0?"10 + 1 Gratuit":""};
 });
}
function openOrderDetail(orderId){
 const o=orders.find(x=>String(x.id)===String(orderId));
 if(!o)return;
 // Hide the archive underneath while the order details are displayed.
 const archive=$("ordersModal");
 if(archive) archive.classList.remove("show");
 const d=new Date(o.date);
 const date=d.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"});
 const time=d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
 recalculateOrderPaymentState(o);
 const total=Number(o.total)||0;
 const payments=getPaymentHistory(o);
 const priceChanges=getPriceChangeHistory(o);
 const discounts=getDiscountHistory(o),discountsTotal=discounts.reduce((sum,item)=>sum+(Number(item.amount)||0),0);
 const paid=paymentTotal(o);
 const due=Math.max(0,total-paid);
 const items=orderItemsForDisplay(o);
 const priceChangesTotal=priceChanges.reduce((sum,change)=>sum+Math.abs(priceChangeAdjustment(o,change)),0);
 const priceChangesHtml=priceChanges.length?`<div class="detail-price-changes"><div class="detail-price-changes-head"><span>تغييرات أثمنة المنتوجات</span><strong>${money(priceChangesTotal)} درهم</strong></div><div class="price-change-list">${priceChanges.map(change=>{const oldPrice=Number(change.oldPrice)||0,newPrice=Number(change.newPrice)||0,difference=priceChangeUnitDifference(change),quantity=priceChangeQuantity(o,change),adjustment=priceChangeAdjustment(o,change);return `<div class="price-change-row"><span class="price-change-index">↕</span><div><b>${esc(change.productName||"منتوج")}${change.productCode?` · ${esc(change.productCode)}`:""}</b><small>${formatPaymentDate(change.date)} · الثمن: ${money(oldPrice)} → ${money(newPrice)} درهم · الكمية: ${quantity} · أثر العملية: ${adjustment>0?"+":"−"}${money(Math.abs(adjustment))} درهم</small></div><strong class="${adjustment>0?"price-up":"price-down"}">${adjustment>0?"+":"−"}${money(Math.abs(adjustment))} درهم</strong></div>`}).join("")}</div></div>`:"";
 const discountsHtml=discounts.length?`<div class="detail-discounts"><div class="detail-discounts-head"><span>Remise / تخفيض</span><strong>−${money(discountsTotal)} درهم</strong></div><div class="discount-list">${discounts.map((item,index)=>`<div class="discount-row"><span class="discount-index">${index+1}</span><div><b>تخفيض رقم ${index+1}</b><small>${formatPaymentDate(item.date)}</small></div><strong>−${money(item.amount)} درهم</strong></div>`).join("")}</div></div>`:"";
 const returns=getReturnHistory(o),returnsTotal=returnTotal(o),originalOrderTotal=Number.isFinite(Number(o.baseTotal))?Number(o.baseTotal):Math.max(0,total-priceChangeAdjustmentTotal(o)+discountsTotal+returnsTotal),returnsHtml=returns.length?`<div class="detail-returns"><div class="detail-returns-head"><span>الإرجاعات / Retours</span><strong>−${money(returnsTotal)} درهم</strong></div><div class="return-list">${returns.map((item,index)=>`<div class="return-row"><span class="return-index">↩</span><div><b>${esc(item.productName||"منتوج")}${item.productCode?` · ${esc(item.productCode)}`:""}</b><small class="return-calc-line">${Number(item.quantity)||0} قطعة × ${money(item.unitPrice||0)} درهم = ${money(item.amount||0)} درهم · ${formatPaymentDate(item.date)}</small></div><strong>−${money(item.amount)} درهم</strong></div>`).join("")}</div></div>`:"";
 $("orderDetailTitle").textContent="Commande de "+(o.client||"Client");
 $("orderDetailBody").innerHTML=`
   <div class="detail-client">
     <div><span>Client</span><strong>${esc(o.client||"—")}</strong></div>
     ${o.company?`<div><span>Société</span><strong>${esc(o.company)}</strong></div>`:""}
     ${o.ice?`<div><span>ICE</span><strong>${esc(o.ice)}</strong></div>`:""}
     ${o.phone?`<div><span>WhatsApp</span><strong>${esc(o.phone)}</strong></div>`:""}
     <div><span>Date</span><strong>${date} · ${time}</strong></div>
   </div>
   <div class="detail-order-code-editor"><label><span>رقم البون / N. Bon Commande</span><input id="detailOrderCodeInput" type="text" value="${esc(o.orderCode||"")}" placeholder="مثلاً: 202326" autocomplete="off" dir="ltr"></label><button id="saveDetailOrderCode" type="button">حفظ رقم البون</button><small>منين تحفظ الرقم غادي يبان فصورة Bon de commande وصورة العملية.</small></div>
   <div class="detail-products">
     <div class="detail-products-head"><span>Produit</span><span>Boîtes</span><span>Pièces/boîte</span><span>Total pièces</span><span>Prix</span><span>Total</span></div>
     ${items.length?items.map(it=>`
       <div class="detail-product-row">
         <strong>${esc(it.name)}${it.freeUnits>0?`<small class="detail-promo-note">🎁 +${it.freeUnits} gratuit · livré ${it.deliveredUnits}</small>`:""}${it.returnedUnits>0?`<small class="detail-return-note">↩ مرتجع: ${it.returnedUnits} قطعة</small>`:""}</strong>
         <span>${it.boxes}</span>
         <span>${it.units}</span>
         <span>${it.totalPieces}</span>
         <span>${money(it.unitPrice)} درهم</span>
         <b>${money(it.lineTotal)} درهم</b>
       </div>`).join(""):`<div class="detail-empty">Aucun produit enregistré dans cette commande.</div>`}
   </div>
   <div class="detail-total"><span>Total Payé</span><strong>${money(total)} درهم</strong></div>
   <div class="detail-total-breakdown"><div><span>المجموع الأصلي</span><strong>${money(originalOrderTotal)} درهم</strong></div>${returns.length?`<div class="return-total-line"><span>ناقص الإرجاعات</span><strong>−${money(returnsTotal)} درهم</strong></div>`:""}<div><span>المجموع الجديد بعد الإرجاعات</span><strong>${money(total)} درهم</strong></div></div>
   <div class="detail-payment"><span>Déjà encaissé</span><strong>${money(paid)} درهم</strong><span>Reste</span><strong>${money(due)} درهم</strong></div>
   <div class="detail-installments">
     <div class="detail-installments-head"><span>سجل الأقساط</span><strong>مجموع الأقساط: ${money(paid)} درهم</strong></div>
     <div class="installment-list">${payments.length?payments.map((p,index)=>`<div class="installment-row"><span class="installment-index">${index+1}</span><div><b>قسط رقم ${index+1}</b><small class="installment-date">${formatPaymentDate(p.date)}</small></div><strong class="installment-amount">${money(p.amount)} درهم</strong></div>`).join(""):`<div class="installment-empty">لم يتم تسجيل أي قسط بعد.</div>`}</div>
     ${returnsHtml}
     ${discountsHtml}
     ${priceChangesHtml}
   </div>
   <button class="customer-btn full" id="detailResendOrderImageBtn" type="button">🖼️ إعادة إرسال الصورة للزبون</button>
   ${due>0?`<button class="gold-btn full" id="detailPaymentBtn" type="button">💰 إدخال ثمن القسط / أداء</button>`:`<button class="paid-order-btn full" type="button" disabled aria-label="البون خالص">✓ البون خالص</button>`}
 `;
 $("orderDetailModal").classList.add("show");
 const saveOrderCodeBtn=$("saveDetailOrderCode"),orderCodeInput=$("detailOrderCodeInput");
 if(saveOrderCodeBtn)saveOrderCodeBtn.onclick=()=>{const value=String(orderCodeInput?.value||"").trim();o.orderCode=value;localStorage.setItem("3d_peintures_orders_v1",JSON.stringify(orders));renderOrders();openOrderDetail(o.id);toast(value?"تحفظ رقم البون وغادي يبان فالصورتين":"تحيد رقم البون")};
 if(orderCodeInput)orderCodeInput.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();saveOrderCodeBtn?.click()}};
 const resendImageBtn=$("detailResendOrderImageBtn");
 if(resendImageBtn) resendImageBtn.onclick=()=>shareOrderPDF(o);
 const payBtn=$("detailPaymentBtn");
 if(payBtn) payBtn.onclick=()=>{addPayment(o.id);openOrderDetail(o.id)};
}
function closeOrderDetail(){
 $("orderDetailModal").classList.remove("show");
 const archive=$("ordersModal");
 if(archive) archive.classList.add("show");
}


/* form */
function readPriceTiersFromForm(){
 const tiers=[];let expectedMin=1,closed=false;
 for(let index=1;index<=6;index++){
  const minRaw=String($("tierMin"+index)?.value||"").trim(),maxRaw=String($("tierMax"+index)?.value||"").trim(),priceRaw=String($("tierPrice"+index)?.value||"").trim();
  if(!minRaw&&!maxRaw&&!priceRaw){if(closed)continue;break}
  if(closed){toast("لا يمكن إضافة مستوى بعد فترة مفتوحة النهاية");return null}
  const minQty=Math.floor(Number(minRaw)),maxQty=maxRaw?Math.floor(Number(maxRaw)):null,price=Number(priceRaw);
  if(!Number.isFinite(minQty)||minQty<1||!Number.isFinite(price)||price<0||(maxQty!=null&&(!Number.isFinite(maxQty)||maxQty<minQty))){toast(`راجع المستوى ${index}: أدخل الفترة والثمن بشكل صحيح`);return null}
  if(minQty!==expectedMin){toast(`الفترة ${index} يجب أن تبدأ من ${expectedMin} قطعة حتى لا تكون هناك فجوة`);return null}
  tiers.push({minQty,maxQty,price:Number(price.toFixed(2))});
  if(maxQty==null)closed=true; else expectedMin=maxQty+1;
 }
 if(!tiers.length||tiers[0].minQty!==1){toast("المستوى الأول يجب أن يبدأ من قطعة واحدة");return null}
 return tiers;
}
function fillPriceTierFields(p){
 const tiers=p?priceTiersFor(p):[];
 for(let index=1;index<=6;index++){
  const tier=tiers[index-1];
  $("tierMin"+index).value=tier?.minQty??"";
  $("tierMax"+index).value=tier?.maxQty??"";
  $("tierPrice"+index).value=tier?.price??"";
 }
}
function openForm(p=null){
 $("formModal").classList.add("show");$("modalTitle").textContent=p?"Modifier le produit":"Nouveau produit";
  $("editId").value=p?.id||"";$("name").value=p?.name||"";$("productCode").value=productCode(p);$("qty").value=p?.qty??"";
 fillPriceTierFields(p);
 $("category").value=p?canonicalCategory(p.category):canonicalCategory(active);$("availability").value=p?.availability==="unavailable"?"unavailable":"available";$("description").value=p?.description||"";selectedImage=p?.image||"";
 $("promo10Plus1").checked=hasPromo10Plus1(p);
 if(selectedImage){$("preview").src=selectedImage;$("photoPicker").classList.add("has-image")}else{$("preview").src="";$("photoPicker").classList.remove("has-image")}
}
function closeForm(){$("formModal").classList.remove("show")}
$("closeForm").onclick=closeForm;
$("formModal").onclick=e=>{if(e.target===$("formModal"))closeForm()};
$("imageInput").onchange=async e=>{
 const f=e.target.files[0];if(!f)return;
 try{selectedImage=await compressImage(f);$("preview").src=selectedImage;$("photoPicker").classList.add("has-image")}
 catch(err){toast("Impossible de charger cette image")}
};
$("productForm").onsubmit=async e=>{
 e.preventDefault();
 const id=$("editId").value||makeId();
 const i=products.findIndex(p=>p.id===id);
 const old=i>=0?products[i]:null;
 const keepCategory=old?canonicalCategory(old.category||active):canonicalCategory($("category").value||active);
  const code=normalizeProductCode($("productCode").value);
  if(!code){toast("دخل كود المنتوج مثل D402 أو W202");return;}
  const duplicate=products.find(p=>p.id!==id&&productCode(p)===code);
  if(duplicate){toast("هاد الكود مستعمل من طرف منتوج آخر");return;}
  const priceTiers=readPriceTiersFromForm();
  if(!priceTiers)return;
  const data={id,name:$("name").value.trim(),code,price:priceTiers[0].price,priceTiers,costPrice:old?.costPrice??0,qty:Number($("qty").value),category:keepCategory,availability:$("availability").value,description:$("description").value.trim(),image:selectedImage,promo10Plus1:$("promo10Plus1").checked};
 if(i>=0) products[i]=data; else products.unshift(data);
 if(!save()){
   await compactProductsImages();
   if(!save()){ if(i>=0) products[i]=old; else products=products.filter(p=>p.id!==id); return; }
 }
 selectedProductId=id;active=keepCategory;closeForm();render();toast(i>=0?"Produit modifié":"Produit ajouté");e.target.reset();selectedImage="";
};

/* viewer */
function updateViewerBoxTotal(p){
 const units=Number(p?.qty||1);
 const paidUnits=units*viewerBoxQty;
 const unitPrice=unitPriceForQuantity(p,paidUnits);
 const total=unitPrice*paidUnits;
 $("viewerBoxQty").textContent=viewerBoxQty;
 $("viewerBoxTotal").textContent=`${money(total)} درهم`;
 $("viewerBoxUnits").textContent=`${paidUnits} unité${paidUnits!==1?"s":""}`;
 $("viewerPrice2").textContent=`${money(unitPrice)} درهم`;
}

function getViewerIndex(){ return products.findIndex(x=>x.id===selectedProductId); }
function updateViewerNavigation(){ const i=getViewerIndex(), total=products.length; const prev=$("viewerPrev"), next=$("viewerNext"), counter=$("viewerCounter"); if(!prev||!next)return; prev.disabled=total<=1 || i<=0; next.disabled=total<=1 || i<0 || i>=total-1; prev.classList.toggle("is-disabled",prev.disabled); next.classList.toggle("is-disabled",next.disabled); if(counter) counter.textContent=i>=0 ? `${i+1} / ${total}` : ""; }
function navigateViewer(direction){ const i=getViewerIndex(), n=i+direction; if(i<0 || n<0 || n>=products.length)return; view(products[n].id); }

function view(id){
 const p=products.find(x=>x.id===id);if(!p)return;
 selectedProductId=id;
 viewerBoxQty=1;
 updateViewerBoxTotal(p);
 const available=isAvailable(p);
  $("viewerImage").src=p.image||"";
  $("viewerName").textContent=p.name;
  $("viewerCode").textContent=productCode(p)?`Code produit : ${productCode(p)}`:"";
  $("viewerCategory").textContent=p.category;
 const badge=$("viewerPromoBadge"); if(badge) badge.style.display=hasPromo10Plus1(p)?"block":"none";
 $("viewerDescription").textContent=available?(p.description||"Produit disponible"):unavailableText();
 $("viewerPrice2").textContent=`${money(unitPriceForQuantity(p,Number(p.qty)||1))} درهم`;
 $("viewerStock").textContent=p.qty;
 $("stockText").textContent="unités par boîte";

 

 const status=$("viewerAvailable");
 if(status){
   status.textContent=available?"● DISPONIBLE":"● NON DISPONIBLE";
   status.classList.toggle("unavailable",!available);
 }

 const unavailableOverlay=$("viewerUnavailable");
 unavailableOverlay.classList.toggle("show",!available);

 $("viewerCart").style.display=available?"":"none";
 $("viewerCart").onclick=(e)=>{
   e.preventDefault();
   e.stopPropagation();
   if(viewerBoxQty<=0)return;
   addToCart(p.id, viewerBoxQty);
   $("viewer").classList.remove("show");
   return false;
 };
 updateViewerNavigation();
 $("viewer").classList.add("show");
}
$("viewerPrev").onclick=()=>navigateViewer(-1);
$("viewerNext").onclick=()=>navigateViewer(1);
document.addEventListener("keydown",e=>{if(!$('viewer').classList.contains('show'))return;if(e.key==='ArrowLeft')navigateViewer(-1);if(e.key==='ArrowRight')navigateViewer(1);if(e.key==='Escape')$('viewer').classList.remove('show')});
$("viewerMinus").onclick=()=>{
 if(viewerBoxQty>0){viewerBoxQty--; const p=products.find(x=>x.id===selectedProductId); if(p){updateViewerBoxTotal(p); $("viewerCart").disabled=viewerBoxQty<=0;}}
};
$("viewerPlus").onclick=()=>{
 viewerBoxQty++; const p=products.find(x=>x.id===selectedProductId); if(p){updateViewerBoxTotal(p); $("viewerCart").disabled=false;}
};
$("closeViewer").onclick=()=>$("viewer").classList.remove("show");
$("viewer").onclick=e=>{if(e.target===$("viewer"))$("viewer").classList.remove("show")};
$("cartBtn").onclick=openCart;
$("closeCart").onclick=closeCart;
$("cartOverlay").onclick=closeCart;
$("clearCart").onclick=()=>{cart=[];saveCart();toast("Panier vidé")};

$("sendOrderSave").onclick=openOrderModal;
$("closeOrder").onclick=closeOrderModal;
$("orderModal").onclick=e=>{if(e.target===$("orderModal"))closeOrderModal()};
$("orderForm").onsubmit=saveOrder;
$("closeOrders").onclick=closeOrdersModal;
$("closeCollections").onclick=closeCollections;
$("collectionsModal").onclick=e=>{if(e.target===$("collectionsModal"))closeCollections()};
$("refreshCollections").onclick=renderCollections;
$("resetCollections").onclick=resetCollections;
$("closeOrderDetail").onclick=closeOrderDetail;
$("orderDetailModal").onclick=e=>{if(e.target===$("orderDetailModal"))closeOrderDetail()};
$("ordersModal").onclick=e=>{if(e.target===$("ordersModal"))closeOrdersModal()};
$("closeDashboard").onclick=closeDashboard;
$("dashboardModal").onclick=e=>{if(e.target===$("dashboardModal"))closeDashboard()};
$("dashboardMonth").onchange=renderDashboard;
$("orderSearch").oninput=renderOrders;
$("closePaymentModal").onclick=closePaymentModal;
$("paymentModal").onclick=e=>{if(e.target===$("paymentModal"))closePaymentModal()};
$("paymentForm").onsubmit=savePaymentForm;
$("resendAllPaymentsBtn").onclick=()=>resendOperationImage("payments");
$("resendPriceChangesBtn").onclick=()=>resendOperationImage("priceChanges");
$("resendDiscountsBtn").onclick=()=>resendOperationImage("discounts");
$("paymentAmount").oninput=updatePaymentPreview;
$("paymentDiscount").oninput=updatePaymentPreview;
$("paymentReturnCode").oninput=updatePaymentReturnPreview;
$("paymentReturnQty").oninput=updatePaymentReturnPreview;
$("paymentReturnPrice").oninput=updatePaymentReturnPreview;
$("paymentOnlyPriceToggle").onchange=syncPaymentOnlyMode;
$("addPaymentPriceChange").onclick=()=>addPaymentPriceChangeRow();

// حفظ أرشيف الطلبيات يدويًا
const saveOrdersArchiveNowBtn=$("saveOrdersArchiveNow");
if(saveOrdersArchiveNowBtn) saveOrdersArchiveNowBtn.onclick=()=>{
 const currentOrders=Array.isArray(orders)?orders:[];
 if(!currentOrders.length){toast("ما كاين حتى طلبية باش تحفظها");return;}
 const archive=storageJson(ORDERS_AUTO_ARCHIVE_KEY,[]);
 let sales=0,paid=0,due=0;
 currentOrders.forEach(order=>{
  const state=recalculateOrderPaymentState(order);
  sales+=Number(order.total)||0;
  paid+=Number(state.paid)||0;
  due+=Number(state.due)||0;
 });
 const now=Date.now();
 archive.unshift({id:makeId(),createdAtMs:now,createdAt:new Date(now).toISOString(),count:currentOrders.length,sales,paid,due,orders:JSON.parse(JSON.stringify(currentOrders))});
 saveStorageJson(ORDERS_AUTO_ARCHIVE_KEY,archive.slice(0,30));
 renderOrdersAutoArchiveHistory();updateAutoArchiveLabels();
 toast(`تم حفظ أرشيف ${currentOrders.length} طلبية`);
};

// حفظ أرشيف المستخلاصات يدويًا
const saveCollectionsArchiveNowBtn=$("saveCollectionsArchiveNow");
if(saveCollectionsArchiveNowBtn) saveCollectionsArchiveNowBtn.onclick=()=>{
 const start=collectionCycleStart(),rows=collectionTrackerRows(start),totals=collectionTotals(rows);
 if(!rows.length){toast("ما كاين حتى استخلاص باش تحفظو");return;}
 const archive=storageJson(COLLECTIONS_AUTO_ARCHIVE_KEY,[]),now=Date.now();
 archive.unshift({id:makeId(),createdAtMs:now,createdAt:new Date(now).toISOString(),rows:JSON.parse(JSON.stringify(rows)),orderDetails:collectionArchiveOrderDetails(),installmentsTotal:Number(totals.installmentsTotal)||0,priceChangesTotal:Number(totals.priceChangesTotal)||0});
 saveStorageJson(COLLECTIONS_AUTO_ARCHIVE_KEY,archive.slice(0,30));
 renderCollectionsAutoArchiveHistory();updateAutoArchiveLabels();
 toast(`تم حفظ أرشيف ${rows.length} عملية`);
};

document.querySelectorAll('input[name="orderPaymentTermChoice"],input[name="orderPaymentTypeChoice"]').forEach(input=>input.addEventListener("change",syncOrderChoiceCards));
$("orderClient").oninput=event=>renderClientSuggestions(event.target.value);
$("orderClient").onfocus=event=>{if(event.target.value.trim())renderClientSuggestions(event.target.value)};
$("orderClient").onkeydown=handleClientSuggestionKeys;
$("orderClient").onblur=()=>setTimeout(hideClientSuggestions,140);
document.addEventListener("pointerdown",event=>{if(!event.target.closest(".client-autocomplete"))hideClientSuggestions()});
$("closeClientModal").onclick=closeClientModal;
$("clientModal").onclick=e=>{if(e.target===$("clientModal"))closeClientModal()};
$("clientForm").onsubmit=saveClientForm;
$("menuClientsDirectory").onclick=()=>{$("actionMenu").classList.remove("show");openClientsDirectory()};
$("closeClientsDirectory").onclick=closeClientsDirectory;
$("closeReturns").onclick=closeReturnsPage;
$("closeCompanyInvoices").onclick=closeCompanyInvoices;
$("priceChangesArchiveModal").onclick=e=>{if(e.target===$("priceChangesArchiveModal"))closePriceChangesArchive()};
$("discountsArchiveModal").onclick=e=>{if(e.target===$("discountsArchiveModal"))closeDiscountsArchive()};
$("closePriceChangesArchive").onclick=closePriceChangesArchive;
$("closeDiscountsArchive").onclick=closeDiscountsArchive;
$("priceChangesArchiveSearch").oninput=renderPriceChangesArchivePage;
$("clearPriceChangesArchiveSearch").onclick=()=>{$("priceChangesArchiveSearch").value="";renderPriceChangesArchivePage();$("priceChangesArchiveSearch").focus()};
$("discountsArchiveSearch").oninput=renderDiscountsArchivePage;
$("clearDiscountsArchiveSearch").onclick=()=>{$("discountsArchiveSearch").value="";renderDiscountsArchivePage();$("discountsArchiveSearch").focus()};
$("companyInvoicesModal").onclick=e=>{if(e.target===$("companyInvoicesModal"))closeCompanyInvoices()};
$("companyInvoiceForm").onsubmit=saveCompanyInvoiceForm;
$("companyInvoiceClientSearch").oninput=event=>{$("clearCompanyInvoiceClientSearch").style.display=event.target.value?"block":"none";renderCompanyInvoiceClientResults(event.target.value)};
$("companyInvoiceClientSearch").onfocus=event=>{if(event.target.value.trim()&&!companyInvoiceSelectedClientId)renderCompanyInvoiceClientResults(event.target.value)};
$("clearCompanyInvoiceClientSearch").onclick=()=>{clearCompanyInvoiceClient();$("companyInvoiceClientSearch").focus()};
$("companyInvoiceOrderId").onchange=event=>{companyInvoiceSelectedOrderId=event.target.value||"";renderCompanyInvoiceOrderPreview()};
$("companyInvoiceArchiveSearch").oninput=renderCompanyInvoices;
$("clearCompanyInvoiceArchiveSearch").onclick=()=>{$("companyInvoiceArchiveSearch").value="";renderCompanyInvoices();$("companyInvoiceArchiveSearch").focus()};
$("returnsModal").onclick=e=>{if(e.target===$("returnsModal"))closeReturnsPage()};
$("returnsSearch").oninput=renderReturnsPage;
$("clearReturnsSearch").onclick=()=>{$("returnsSearch").value="";renderReturnsPage();$("returnsSearch").focus()};
$("refreshReturns").onclick=renderReturnsPage;
$("clientsDirectoryModal").onclick=e=>{if(e.target===$("clientsDirectoryModal"))closeClientsDirectory()};
$("clientsDirectorySearch").oninput=()=>{$("clearClientsDirectorySearch").style.display=$("clientsDirectorySearch").value?"block":"none";renderClientsDirectory()};
$("clearClientsDirectorySearch").onclick=()=>{$("clientsDirectorySearch").value="";$("clearClientsDirectorySearch").style.display="none";renderClientsDirectory();$("clientsDirectorySearch").focus()};
$("clientStatsToggle").onclick=toggleClientStats;
$("clientStatsMonth").onchange=renderClientStats;
$("salesForecastToggle").onclick=toggleSalesForecast;
$("salesForecastMonth").onchange=renderSalesForecast;
$("exportSalesForecastExcel").onclick=exportSalesForecastToExcel;
$("clientStatsSearch").oninput=renderClientStats;
$("exportStatsExcel").onclick=exportClientStatsToExcel;
$("productSearch").oninput=()=>{render();$("clearProductSearch").style.display=$("productSearch").value?"block":"none"};
$("clearProductSearch").onclick=()=>{$("productSearch").value="";$("clearProductSearch").style.display="none";render();$("productSearch").focus()};

function openHeaderSearch(){const panel=$("headerSearchPanel"),button=$("headerSearchToggle");if(!panel||!button)return;panel.classList.add("show");panel.setAttribute("aria-hidden","false");button.classList.add("is-open");button.setAttribute("aria-expanded","true");setTimeout(()=>{$("productSearch")?.focus()},60)}
function closeHeaderSearch(){const panel=$("headerSearchPanel"),button=$("headerSearchToggle");if(!panel||!button)return;panel.classList.remove("show");panel.setAttribute("aria-hidden","true");button.classList.remove("is-open");button.setAttribute("aria-expanded","false")}
$("headerSearchToggle").onclick=e=>{e.stopPropagation();const panel=$("headerSearchPanel");panel?.classList.contains("show")?closeHeaderSearch():openHeaderSearch()};
document.addEventListener("click",e=>{const panel=$("headerSearchPanel"),button=$("headerSearchToggle");if(panel?.classList.contains("show")&&!panel.contains(e.target)&&e.target!==button)closeHeaderSearch()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&$("headerSearchPanel")?.classList.contains("show"))closeHeaderSearch()});

 initProductCarousel();
 initProductFocus();
 renderCart();
 render();
 renderDueAlerts();
  setInterval(renderDueAlerts,5000);
  setInterval(autoArchiveSnapshot,60*60*1000);

/* ===== SLIDER — auto only, no arrows, no dots, no zoom ===== */
(function(){
  const wrap  = document.getElementById('sliderWrap');
  const track = document.getElementById('sliderTrack');
  if(!track || !wrap) return;
  const slides = Array.from(track.querySelectorAll('.slide'));
  const total = slides.length;
  if(total === 0) return;
  let current = 0;

  function goTo(n){
    const prev = current;
    current = (n + total) % total;
    if(prev === current) return;
    slides[prev].classList.remove('active');
    slides[prev].classList.add('prev');
    setTimeout(()=> slides[prev].classList.remove('prev'), 900);
    slides[current].classList.add('active');
  }

  slides[0].classList.add('active');
  setInterval(()=> goTo(current + 1), 4000);
})();


// Splash Screen محذوف من Commercial: الواجهة تفتح مباشرة بعد تسجيل الدخول.

// ربط الواجهة التجارية مباشرة بمنتجات رئيس المخزن في Supabase.
let liveStockMap=new Map();
async function syncStockProductsIntoCatalog(){
  try{
    const cfg=window.STOCK_CONFIG||{};
    if(!window.supabase||!cfg.url||!cfg.anonKey)return;
    const client=window.supabase.createClient(cfg.url,cfg.anonKey);
    let {data:rows,error}=await client.from('stock_products').select('id,product_name,product_code,category,pieces_per_box,total_pieces,minimum_stock,image_url,updated_at').order('product_name');
    if(error){
      console.warn('Full stock product sync unavailable, using public status:',error);
      const fallback=await client.rpc('get_public_stock_status');
      if(fallback.error)throw fallback.error;
      rows=fallback.data||[];
    }
    rows=Array.isArray(rows)?rows:[];
    liveStockMap=new Map(rows.map(row=>[String(row.product_code||'').trim().toLowerCase(),row]));
    const byCode=new Map(products.map(product=>[String(productCode(product)||product.code||'').trim().toLowerCase(),product]));
    rows.forEach(row=>{
      const code=String(row.product_code||'').trim();
      const key=code.toLowerCase();
      if(!key)return;
      const name=String(row.product_name||'').trim()||'منتوج جديد';
      const rawCategory=String(row.category||'').trim();
      const category=canonicalCategory(rawCategory);
      let product=byCode.get(key);
      if(!product){
        product={id:'stock_'+String(row.id||code),name,code,price:0,priceTiers:[{minQty:1,maxQty:null,price:0}],costPrice:0,qty:Number(row.total_pieces)||0,category,availability:'available',description:'',image:row.image_url||'',promo10Plus1:false,stockManaged:true};
        products.push(product);
        byCode.set(key,product);
      }else{
        product.stockManaged=true;
        if(name)product.name=name;
        if(rawCategory)product.category=category;
        if(row.image_url)product.image=row.image_url;
        product.qty=Number(row.total_pieces)||0;
      }
      product.stockProductId=row.id||'';
      product.stockUpdatedAt=row.updated_at||'';
      product.stockMinimum=Number(row.minimum_stock)||0;
      product.availability=(Number(row.total_pieces)||0)>Number(row.minimum_stock||0)?'available':'unavailable';
    });
    render();
  }catch(error){console.warn('Stock product sync unavailable',error);}
}
function refreshCommercialStock(){return syncStockProductsIntoCatalog()}
function commercialAvailability(product){
  const row=liveStockMap.get(String(product?.code||'').trim().toLowerCase());
  if(!row)return product?.availability||'متوفر';
  return Number(row.total_pieces||0)>Number(row.minimum_stock||0)?'متوفر':'غير متوفر حاليا';
}

function paymentScheduleData(order,state=deadlineState(order)){
 const history=getPaymentHistory(order);
 const totalOrder=Math.max(0,Number(order?.total)||0);
 const paidOrder=paymentTotal(order);
 const dueOrder=Math.max(0,totalOrder-paidOrder);
 const isCredit=state.termKey==="days"&&[15,30].includes(Number(order?.paymentTermDays));
 return {history,totalOrder,paidOrder,dueOrder,isCredit,isTest:state.termKey==="test_1m"};
}
function paymentScheduleText(order,state=deadlineState(order)){
 const data=paymentScheduleData(order,state);
 if(data.isTest)return `تجربة دقيقة واحدة / Test 1 minute\nالباقي / Reste à payer : ${money(data.dueOrder)} درهم`;
 if(!data.isCredit)return "إستخلاص عند الإستلام / Paiement à la livraison";
 const lines=data.history.length?data.history.map((payment,index)=>`${index+1}. ${formatPaymentDate(payment.date)} — ${money(payment.amount)} درهم`):["لم تسجل أي دفعة / Aucun paiement enregistré"];
 return ["تواريخ الدفعات / Dates des paiements",...lines,`الباقي / Reste à payer : ${money(data.dueOrder)} درهم`].join("\n");
}
function paymentScheduleHtml(order,state=deadlineState(order),style="card"){
 const data=paymentScheduleData(order,state);
 const summary=`<div style="font-size:13px;font-weight:400;color:#d00000;line-height:1.55;text-align:left"><div>مجموع البون / Total commande : ${money(data.totalOrder)} درهم</div><div>عدد الأقساط / Nombre des acomptes : ${data.history.length}</div><div>مجموع الأقساط / Total des acomptes : ${money(data.paidOrder)} درهم</div><div>المجموع ناقص الأقساط / Total - acomptes : ${money(data.dueOrder)} درهم</div></div>`;
 const remainder=`<div style="margin-top:10px;padding-top:9px;border-top:2px solid #e8a0a0;text-align:center;font-weight:900;font-size:25px;color:#d00000">الباقي / Reste à payer : ${money(data.dueOrder)} درهم</div>`;
 if(data.isTest)return `<div style="border:3px solid #d00000;border-radius:12px;padding:14px 18px;background:#fff5f5;color:#d00000;line-height:1.45"><div style="text-align:center;font-size:13px;font-weight:400;margin-bottom:7px">تجربة دقيقة واحدة / Test 1 minute</div>${summary}${remainder}</div>`;
  if(!data.isCredit)return `<div style="text-align:center;font-weight:800;color:#d00000;font-size:16px;line-height:1.25;border:2px solid #d00000;border-radius:9px;padding:9px 12px;background:#fff5f5">إستخلاص عند الإستلام / Paiement à la livraison</div>`;
 const rows=data.history.length?data.history.map((payment,index)=>`<div style="display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid #f1dada;color:#d00000;font-size:13px;font-weight:400"><span>${index+1}. ${esc(formatPaymentDate(payment.date))}</span><span>${money(payment.amount)} درهم</span></div>`).join(""):`<div style="color:#d00000;font-size:13px;font-weight:400">لم تسجل أي دفعة / Aucun paiement enregistré</div>`;
 return `<div style="border:3px solid #d00000;border-radius:12px;padding:14px 18px;background:#fff5f5;color:#d00000;line-height:1.45"><div style="text-align:center;font-size:13px;font-weight:400;margin-bottom:7px">تواريخ الدفعات / Dates des paiements</div>${summary}<div style="margin-top:7px;font-size:13px;color:#d00000;font-weight:400">${rows}</div>${remainder}</div>`;
}



// مزامنة المنتجات عند فتح Commercial ثم التحقق من التحديثات دورياً.
syncStockProductsIntoCatalog();
setInterval(()=>syncStockProductsIntoCatalog(),30000);
