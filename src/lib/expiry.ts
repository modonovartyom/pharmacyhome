export function expiryStatus(date:string|null,days=30):'unknown'|'expired'|'soon'|'valid' {
  if(!date)return 'unknown';const today=new Date();today.setHours(0,0,0,0);const end=new Date(`${date}T00:00:00`);const difference=Math.round((end.getTime()-today.getTime())/86400000);return difference<0?'expired':difference<=days?'soon':'valid';
}
export function formatDate(date:string|null,precision?:string|null) {if(!date)return 'Не указан';if(precision==='год')return date.slice(0,4)+' · год уточнить';return new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'}).format(new Date(`${date}T00:00:00`));}
