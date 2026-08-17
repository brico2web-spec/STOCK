/* 3D PEINTURES · Central Commercial Data Sync
   Stores the existing scoped LocalStorage datasets in Supabase without changing their JSON shapes. */
(function(){
  const cfg=window.STOCK_CONFIG||{};
  const rawScope=sessionStorage.getItem('commercialUserName')||sessionStorage.getItem('commercialUserId')||'guest';
  const scope=String(rawScope).replace(/[^a-zA-Z0-9_-]/g,'_');
  const suffix='__'+scope;
  const baseNames=new Set([
    '3d_peintures_new_cart_v1','3d_peintures_clients_v1','3d_peintures_commercial_prices_v1',
    '3d_peintures_orders_v1','3d_peintures_daily_payment_days',
    '3d_peintures_company_invoices_standalone'
  ]);
  const baseOf=key=>{if(!key)return null;for(const b of baseNames)if(key===b+suffix)return b;const m=key.match(/^3d_peintures_archive_(.+)__[^_].*$/);return m?key.slice(0,key.lastIndexOf('__')):null};
  const exactKey=base=>base+suffix;
  const reloadKey='commercial_cloud_reloaded__'+location.pathname;
  let client=null,readyResolve;
  const ready=new Promise(r=>readyResolve=r);window.commercialCloudReady=ready;
  let applying=false,queue=new Map(),timer=null;
  function json(v){try{return JSON.stringify(JSON.parse(v))}catch(e){return v}}
  function schedule(base,value){if(!client||!base||applying)return;queue.set(base,value);clearTimeout(timer);timer=setTimeout(flush,350)}
  async function flush(){if(!client||!queue.size)return;const session=(await client.auth.getSession()).data?.session;if(!session){queue.clear();return}const rows=[...queue].map(([dataset_key,value])=>({owner_id:session.user.id,dataset_key,payload:JSON.parse(value),updated_at:new Date().toISOString()}));queue.clear();const r=await client.from('commercial_cloud_data').upsert(rows,{onConflict:'owner_id,dataset_key'});if(r.error)console.warn('Central data sync:',r.error.message)}
  function hook(){const original=localStorage.setItem.bind(localStorage);localStorage.setItem=(key,value)=>{original(key,value);schedule(baseOf(key),value)}}
  async function init(){
    if(!window.supabase||!cfg.url||!cfg.anonKey){readyResolve(false);return}
    client=window.supabase.createClient(cfg.url,cfg.anonKey);hook();
    const session=(await client.auth.getSession()).data?.session;if(!session){readyResolve(false);return}
    const result=await client.from('commercial_cloud_data').select('dataset_key,payload,updated_at').eq('owner_id',session.user.id);
    if(result.error){console.warn('Central data table not ready:',result.error.message);readyResolve(false);return}
    const cloud=new Map((result.data||[]).map(r=>[r.dataset_key,r]));let changed=false;
    applying=true;
    for(const [base,row] of cloud){const key=exactKey(base),value=JSON.stringify(row.payload);if(localStorage.getItem(key)!==value){localStorage.setItem(key,value);changed=true}}
    applying=false;
    for(const base of baseNames){const key=exactKey(base),value=localStorage.getItem(key);if(value!==null&&!cloud.has(base))schedule(base,value)}
    for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i),base=baseOf(key);if(base&&localStorage.getItem(key)!==null&&!cloud.has(base))schedule(base,localStorage.getItem(key))}
    if(changed&&!sessionStorage.getItem(reloadKey)){sessionStorage.setItem(reloadKey,'1');setTimeout(()=>location.reload(),80)}else if(sessionStorage.getItem(reloadKey)){sessionStorage.removeItem(reloadKey)}
    readyResolve(true);setTimeout(flush,500);
  }
  window.commercialCloudFlush=flush;init().catch(e=>{console.warn('Central data sync:',e);readyResolve(false)})
})();
