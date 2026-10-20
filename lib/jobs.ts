export const provinces = ['Eastern Cape','Free State','Gauteng','KwaZulu-Natal','Limpopo','Mpumalanga','North West','Northern Cape','Western Cape'];
export const categories = ['Hospitality','Retail','Cleaning','Warehouse & logistics','Events','Construction','Other'];
export function distanceKm(a:number,b:number,c:number,d:number) {
 const rad = Math.PI / 180; const x = Math.sin((c-a)*rad/2)**2 + Math.cos(a*rad)*Math.cos(c*rad)*Math.sin((d-b)*rad/2)**2;
 return 6371 * 2 * Math.atan2(Math.sqrt(x),Math.sqrt(Math.max(0,1-x)));
}
export function validLocation(lat:unknown,lon:unknown) {
 return typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon) && lat >= -35 && lat <= -22 && lon >= 16 && lon <= 33;
}
export function eligible(distance:number,workerRadius:number,jobRadius:number) { return distance <= Math.min(workerRadius,jobRadius); }
export function validateJob(b:any) {
 for(const [k,max] of Object.entries({title:100,description:4000,business:120,city:100,contact:200})) {
  if(typeof b[k] !== 'string' || b[k].trim().length < 2 || b[k].length > max) throw new Error(`Please enter a valid ${k}.`);
 }
 if(!provinces.includes(b.province) || !categories.includes(b.category)) throw new Error('Choose a province and category.');
 if(!validLocation(b.latitude,b.longitude)) throw new Error('Set a job location within the supported South African mainland coordinates.');
 if(!Number.isFinite(b.pay) || b.pay <= 0 || b.pay > 1000000) throw new Error('Enter a pay amount greater than zero.');
 if(!['hour','job'].includes(b.payType)) throw new Error('Choose hourly or total job pay.');
 if(!Number.isFinite(b.hours) || b.hours < .25 || b.hours > 24) throw new Error('Hours must be between 0.25 and 24 per shift.');
 if(!Number.isFinite(b.radius) || b.radius < 1 || b.radius > 200) throw new Error('Hiring radius must be 1–200 km.');
 const time = Date.parse(b.start); if(!Number.isFinite(time) || time < Date.now()-60000) throw new Error('Choose a future start date and time.');
 return {...Object.fromEntries(['title','description','business','city','province','category','contact'].map(k=>[k,b[k].trim()])),pay:b.pay,payType:b.payType,hours:b.hours,latitude:b.latitude,longitude:b.longitude,radius:b.radius,start:new Date(time).toISOString()};
}
