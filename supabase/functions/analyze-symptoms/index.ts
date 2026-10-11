import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const redFlags=[/боль в груди|давление в груди/i,/затрудн.*дыхани|не могу дышать|удушье/i,/потер.*сознани|обморок/i,/онемени.*половин|перекос.*лиц|невнятн.*реч/i,/сильн.*кровотеч/i,/суицид|покончить с собой/i];
const limits=new Map<string,{count:number;reset:number}>();

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 const token=req.headers.get('Authorization')?.replace(/^Bearer /,'');
 if(!token)return json({error:'Требуется вход'},401);
 const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_ANON_KEY')!;
 const db=createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}}});
 const {data:{user},error:authError}=await db.auth.getUser(token);
 if(authError||!user)return json({error:'Сессия недействительна'},401);
 const now=Date.now(),limit=limits.get(user.id);
 if(limit&&limit.reset>now&&limit.count>=10)return json({error:'Слишком много запросов. Попробуйте позже.'},429);
 limits.set(user.id,{count:limit&&limit.reset>now?limit.count+1:1,reset:limit&&limit.reset>now?limit.reset:now+60000});
 let body:{householdId?:string;symptoms?:string};try{body=await req.json()}catch{return json({error:'Неверный запрос'},400)}
 const householdId=body.householdId,symptoms=body.symptoms?.trim();
 if(!householdId||!symptoms||symptoms.length<8||symptoms.length>1500)return json({error:'Опишите симптомы от 8 до 1500 символов'},400);
 const {data:member,error:memberError}=await db.from('household_members').select('user_id').eq('household_id',householdId).eq('user_id',user.id).maybeSingle();
 if(memberError||!member)return json({error:'Нет доступа к аптечке'},403);
 if(redFlags.some(pattern=>pattern.test(symptoms)))return json({summary:'Описаны симптомы, при которых нужна срочная оценка врача.',urgent:true,urgentMessage:'Обратитесь за неотложной медицинской помощью или вызовите скорую помощь.',relevantMedicines:[],generalAdvice:['Не откладывайте обращение за помощью.'],disclaimer:'Помощник не заменяет врача и не ставит диагноз.'});
 const [{data:medicines,error:medError},{data:batches,error:batchError}]=await Promise.all([db.from('medicines').select('id,name,inn,dosage,form,indications,contraindications,needs_review').eq('household_id',householdId),db.from('inventory_batches').select('medicine_id,quantity,expires_on').eq('household_id',householdId).gt('quantity',0)]);
 if(medError||batchError)return json({error:'Не удалось загрузить аптечку'},500);
 const today=new Date().toISOString().slice(0,10);
 const available=(medicines||[]).filter(m=>(batches||[]).some(b=>b.medicine_id===m.id&&(!b.expires_on||b.expires_on>=today))).map(m=>({id:m.id,name:m.name,inn:m.inn,dosage:m.dosage,form:m.form,indications:m.indications,contraindications:m.contraindications,needsReview:m.needs_review}));
 const apiKey=Deno.env.get('OPENROUTER_API_KEY');if(!apiKey)return json({error:'ИИ-помощник пока не настроен'},503);
 try{
  const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:Deno.env.get('OPENROUTER_MODEL')||'openai/gpt-4o-mini',temperature:0.2,response_format:{type:'json_object'},messages:[{role:'system',content:'Ты осторожный помощник по домашней аптечке. Верни только JSON: summary строка, urgent boolean, urgentMessage строка опционально, relevantMedicines массив {medicineId,reason,warnings:строки}, generalAdvice массив строк, disclaimer строка. Не ставь диагноз, не назначай дозировки. Упоминай только ID препаратов из списка. Если сведений недостаточно, говори об этом. Для записей needsReview предупреждай сверить упаковку. Не предлагай лекарства без явных показаний.'},{role:'user',content:JSON.stringify({symptoms,availableMedicines:available})}]})});
  if(!response.ok)return json({error:'Сервис помощника временно недоступен'},502);
  const result=await response.json(),raw=result.choices?.[0]?.message?.content;if(typeof raw!=='string')throw Error('Invalid model response');
  const parsed=JSON.parse(raw);if(typeof parsed.summary!=='string'||typeof parsed.urgent!=='boolean'||!Array.isArray(parsed.relevantMedicines)||!Array.isArray(parsed.generalAdvice)||typeof parsed.disclaimer!=='string')throw Error('Invalid schema');
  const ids=new Set(available.map(m=>m.id));const relevantMedicines=parsed.relevantMedicines.filter((m:unknown):m is {medicineId:string;reason:string;warnings:string[]}=>typeof m==='object'&&m!==null&&typeof (m as {medicineId?:unknown}).medicineId==='string'&&ids.has((m as {medicineId:string}).medicineId)&&typeof (m as {reason?:unknown}).reason==='string'&&Array.isArray((m as {warnings?:unknown}).warnings)).slice(0,5).map((m:{medicineId:string;reason:string;warnings:unknown[]})=>({medicineId:m.medicineId,reason:m.reason.slice(0,600),warnings:m.warnings.filter((w):w is string=>typeof w==='string').slice(0,5)}));
  return json({summary:parsed.summary.slice(0,1500),urgent:parsed.urgent,urgentMessage:typeof parsed.urgentMessage==='string'?parsed.urgentMessage.slice(0,500):undefined,relevantMedicines,generalAdvice:parsed.generalAdvice.filter((a:unknown)=>typeof a==='string').slice(0,6),disclaimer:parsed.disclaimer.slice(0,500)});
 }catch{return json({error:'Не удалось получить ответ помощника. Попробуйте позже.'},502)}
});
