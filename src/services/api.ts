import { client } from '../lib/supabase';
import type { Batch, Household, Inventory, Medicine, ShoppingItem, Usage, ImportRow } from '../types';

function check(error: {message:string}|null) { if (error) throw new Error(error.message); }
export async function getHouseholds():Promise<Household[]> { const {data,error}=await client().from('households').select('*').order('created_at');check(error);return data ?? []; }
export async function createHousehold(name:string):Promise<string> {const {data,error}=await client().rpc('create_household',{p_name:name});check(error);return data as string;}
export async function getMembers(householdId:string) {const {data,error}=await client().from('household_members').select('household_id,user_id,role').eq('household_id',householdId);check(error);const ids=(data??[]).map(m=>m.user_id);if(!ids.length)return [];const {data:profiles,error:profileError}=await client().from('profiles').select('id,display_name').in('id',ids);check(profileError);return (data??[]).map(m=>({...m,profiles:profiles?.find(p=>p.id===m.user_id)??null}));}
export async function createInvite(householdId:string) {const {data,error}=await client().rpc('create_household_invite',{p_household_id:householdId});check(error);return data as string;}
export async function acceptInvite(code:string) {const {data,error}=await client().rpc('accept_household_invite',{p_token:code.trim()});check(error);return data as string;}
export async function removeMember(householdId:string,userId:string) {const {error}=await client().rpc('remove_household_member',{p_household_id:householdId,p_user_id:userId});check(error);}
export async function getInventory(householdId:string):Promise<Inventory[]> {
  const [{data:meds,error:me},{data:batches,error:be}]=await Promise.all([client().from('medicines').select('*').eq('household_id',householdId).order('name'),client().from('inventory_batches').select('*').eq('household_id',householdId)]);check(me);check(be);
  return ((meds??[]) as Medicine[]).map(m=>{const bs=((batches??[]) as Batch[]).filter(b=>b.medicine_id===m.id);return {...m,batches:bs,total:bs.reduce((n,b)=>n+Number(b.quantity),0),nextExpiry:bs.filter(b=>b.quantity>0&&b.expires_on).map(b=>b.expires_on!).sort()[0]??null};});
}
export type MedicineInput={name:string;dosage:string|null;form:string|null;inn:string|null;categories:string[];indications:string[];instructions:string|null;contraindications:string|null;needs_review:boolean;review_note:string|null;favorite:boolean};
export type BatchInput={quantity:number;quantity_unknown?:boolean;unit:string;expires_on:string|null;expiry_precision:string|null;storage_location:string|null;notes:string|null};
export async function saveMedicine(householdId:string,userId:string,input:MedicineInput,batch:BatchInput,id?:string,batchId?:string) {
  const payload={...input,household_id:householdId,created_by:userId};
  let medicineId=id;
  if(id){const {error}=await client().from('medicines').update(input).eq('id',id).eq('household_id',householdId);check(error);} else {const {data,error}=await client().from('medicines').insert(payload).select('id').single();check(error);medicineId=data!.id;}
  if(batchId){const {error}=await client().from('inventory_batches').update(batch).eq('id',batchId).eq('household_id',householdId);check(error);} else {const {error}=await client().from('inventory_batches').insert({...batch,household_id:householdId,medicine_id:medicineId,initial_quantity:batch.quantity,created_by:userId});check(error);}
  return medicineId!;
}
export async function addBatch(householdId:string,medicineId:string,userId:string,batch:BatchInput) {const {error}=await client().from('inventory_batches').insert({...batch,household_id:householdId,medicine_id:medicineId,initial_quantity:batch.quantity,created_by:userId});check(error);}
export async function deleteMedicine(m:Medicine) {if(m.photo_path) await client().storage.from('medicine-images').remove([m.photo_path]);const {error}=await client().from('medicines').delete().eq('id',m.id).eq('household_id',m.household_id);check(error);}
export async function useMedicine(householdId:string,batchId:string,quantity:number,note:string,requestId=crypto.randomUUID()) {const {data,error}=await client().rpc('use_medicine',{p_household_id:householdId,p_batch_id:batchId,p_quantity:quantity,p_note:note,p_request_id:requestId});check(error);return data as string;}
export async function getUsage(householdId:string):Promise<Usage[]> {const {data,error}=await client().from('usage_logs').select('*').eq('household_id',householdId).order('used_at',{ascending:false}).limit(1000);check(error);return data??[];}
export async function getShopping(householdId:string):Promise<ShoppingItem[]> {const {data,error}=await client().from('shopping_items').select('*').eq('household_id',householdId).order('created_at',{ascending:false});check(error);return data??[];}
export async function addShopping(householdId:string,title:string,medicineId:string|null) {const {data:{user}}=await client().auth.getUser();const {error}=await client().from('shopping_items').insert({household_id:householdId,title,medicine_id:medicineId,added_by:user!.id,status:'needed'});check(error);}
export async function setShoppingStatus(id:string,status:ShoppingItem['status']) {const {error}=await client().from('shopping_items').update({status}).eq('id',id);check(error);}
export async function compressPhoto(file:File):Promise<Blob> {
  const url=URL.createObjectURL(file);
  try {
    const image=await new Promise<HTMLImageElement>((resolve,reject)=>{const element=new Image();element.onload=()=>resolve(element);element.onerror=()=>reject(new Error('Не удалось открыть фото'));element.src=url;});
    const scale=Math.min(1,1280/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);
    const context=canvas.getContext('2d');if(!context)throw new Error('Не удалось обработать фото');
    context.drawImage(image,0,0,canvas.width,canvas.height);
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Не удалось обработать фото')),'image/jpeg',.8));
    if(blob.size>3*1024*1024)throw new Error('Фото слишком большое');
    return blob;
  } finally {URL.revokeObjectURL(url);}
}
export async function uploadPhoto(m:Medicine,file:File) {
  const blob=await compressPhoto(file);
  const path=`${m.household_id}/${m.id}/${crypto.randomUUID()}.jpg`;const {error}=await client().storage.from('medicine-images').upload(path,blob,{contentType:'image/jpeg'});check(error);
  const {error:updateError}=await client().from('medicines').update({photo_path:path}).eq('id',m.id);if(updateError){await client().storage.from('medicine-images').remove([path]);check(updateError);}if(m.photo_path)await client().storage.from('medicine-images').remove([m.photo_path]);
}
export async function photoUrl(path:string) {const {data,error}=await client().storage.from('medicine-images').createSignedUrl(path,3600);check(error);return data!.signedUrl;}
export async function importRows(householdId:string,rows:ImportRow[]) {const {data,error}=await client().rpc('import_inventory',{p_household_id:householdId,p_rows:rows});check(error);return data as number;}
export async function analyzeSymptoms(householdId:string,symptoms:string) {const {data,error}=await client().functions.invoke('analyze-symptoms',{body:{householdId,symptoms}});check(error);return data as {summary:string;urgent:boolean;urgentMessage?:string;relevantMedicines:{medicineId:string;reason:string;warnings:string[]}[];generalAdvice:string[];disclaimer:string};}
