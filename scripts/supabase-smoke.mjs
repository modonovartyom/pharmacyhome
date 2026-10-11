import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const required=['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','TEST_EMAIL_A','TEST_PASSWORD_A','TEST_EMAIL_B','TEST_PASSWORD_B'];
for(const name of required)if(!process.env[name])throw new Error(`Missing ${name}`);
const url=process.env.VITE_SUPABASE_URL,key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const a=createClient(url,key,{auth:{persistSession:false}}),b=createClient(url,key,{auth:{persistSession:false}});
const value=(result)=>{if(result.error)throw result.error;return result.data};
const aUser=value(await a.auth.signInWithPassword({email:process.env.TEST_EMAIL_A,password:process.env.TEST_PASSWORD_A})).user;
const bUser=value(await b.auth.signInWithPassword({email:process.env.TEST_EMAIL_B,password:process.env.TEST_PASSWORD_B})).user;
let householdId,medicineId,batchId,photoPath;
try{
 householdId=value(await a.rpc('create_household',{p_name:`Smoke ${crypto.randomUUID().slice(0,8)}`}));
 const medicine=value(await a.from('medicines').insert({household_id:householdId,name:'Тестовая позиция',created_by:aUser.id}).select('id').single());medicineId=medicine.id;
 const batch=value(await a.from('inventory_batches').insert({household_id:householdId,medicine_id:medicineId,initial_quantity:2,quantity:2,unit:'шт.',created_by:aUser.id}).select('id').single());batchId=batch.id;
 assert.equal(value(await b.from('medicines').select('id').eq('id',medicineId)).length,0,'outsider read must be blocked');
 const deniedImage=await b.storage.from('medicine-images').createSignedUrl(`${householdId}/${medicineId}/missing.png`,60);assert.ok(deniedImage.error,'outsider Storage access must be blocked');
 const invite=value(await a.rpc('create_household_invite',{p_household_id:householdId}));assert.equal(value(await b.rpc('accept_household_invite',{p_token:invite})),householdId);
 assert.equal(value(await b.from('medicines').select('id').eq('id',medicineId)).length,1,'member must read shared card');
 const escalation=value(await b.from('household_members').update({role:'owner'}).eq('household_id',householdId).eq('user_id',bUser.id).select('role'));assert.equal(escalation.length,0,'member role escalation must be blocked');
 value(await b.from('medicines').update({name:'Изменено участником'}).eq('id',medicineId));
 assert.equal(value(await a.from('medicines').select('name').eq('id',medicineId).single()).name,'Изменено участником');
 const requestId=crypto.randomUUID();const first=value(await a.rpc('use_medicine',{p_household_id:householdId,p_batch_id:batchId,p_quantity:1,p_note:'smoke',p_request_id:requestId}));const second=value(await a.rpc('use_medicine',{p_household_id:householdId,p_batch_id:batchId,p_quantity:1,p_note:'smoke',p_request_id:requestId}));assert.equal(first,second,'duplicate request must reuse usage log');
 assert.equal(Number(value(await a.from('inventory_batches').select('quantity').eq('id',batchId).single()).quantity),1,'stock must decrement once');
 photoPath=`${householdId}/${medicineId}/${crypto.randomUUID()}.png`;
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64');
 value(await a.storage.from('medicine-images').upload(photoPath,png,{contentType:'image/png'}));
 assert.ok(value(await b.storage.from('medicine-images').createSignedUrl(photoPath,60)).signedUrl,'member must read shared photo');
 value(await b.storage.from('medicine-images').remove([photoPath]));photoPath=null;
 value(await a.rpc('remove_household_member',{p_household_id:householdId,p_user_id:bUser.id}));
 assert.equal(value(await b.from('medicines').select('id').eq('id',medicineId)).length,0,'removed member must lose access');
 console.log('Supabase CRUD, RLS, invite, atomic use and Storage smoke test passed');
}finally{
 if(photoPath)await a.storage.from('medicine-images').remove([photoPath]);
 if(householdId){const result=await a.from('households').delete().eq('id',householdId);if(result.error)console.error('Cleanup failed:',result.error.message)}
}
