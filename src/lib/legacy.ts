import type { ImportRow } from '../types';

export function mapLegacyInventory(raw:string):ImportRow[]|null {
 let data:unknown;
 try { data=JSON.parse(raw); } catch { return null; }
 if(!Array.isArray(data)) return null;
 const rows=data.filter((value):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&typeof (value as Record<string,unknown>).name==='string'&&String((value as Record<string,unknown>).name).trim().length>0);
 return rows.map((row,index)=>({
  source_id:100000+index,name:String(row.name).trim(),
  dosage:typeof row.dosage==='string'?row.dosage:null,
  form:typeof row.form==='string'?row.form:null,
  quantity:typeof row.quantity==='number'&&Number.isFinite(row.quantity)&&row.quantity>=0?row.quantity:null,
  unit:typeof row.unit==='string'?row.unit:null,
  expires_on:typeof row.expires_on==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(row.expires_on)?row.expires_on:null,
  expiry_precision:'не указан',storage_location:typeof row.storage_location==='string'?row.storage_location:'',
  source_text:JSON.stringify(row),needs_review:true,source_status:'Не указан',
  review_note:'Перенесено из старого локального списка; проверьте данные'
 }));
}
