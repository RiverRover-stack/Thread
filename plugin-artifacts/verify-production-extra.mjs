import assert from 'node:assert/strict';
import fs from 'node:fs';
const base = 'https://thread-e5b3.onrender.com';
const authorization = 'Basic '+Buffer.from('thread:'+process.env.THREAD_ACCESS_PASSWORD).toString('base64');
async function request(path, options = {}) {
  return fetch(base+path,{...options,headers:{authorization,...options.headers},signal:AbortSignal.timeout(60000)});
}
const ids=['a9f652a8-6d7a-4f7f-948e-1145a62fb795','208bc2d4-1f4b-4580-a8b7-d06393ab8e53','bd33b797-872f-4e8d-a240-b70390433b51'];
for(const id of ids){
  const r=await request('/thoughts/'+id); assert.equal(r.status,200);
  assert.ok((await r.text()).includes(id));
  const index=await request('/api/thoughts/'+id+'/embedding',{method:'POST'});
  assert.equal(index.status,200);assert.equal((await index.json()).reused,true);
}
const first=await request('/api/thoughts/'+ids[0]+'/connection',{method:'POST'});
assert.equal(first.status,200);assert.equal((await first.json()).hasConnection,false);
console.log('Saved synthetic detail pages, persisted/reused embeddings, and first-thought abstention passed.');
if(process.argv.includes('--audio')) {
  const form=new FormData();
  form.set('audio',new File([fs.readFileSync('plugin-artifacts/render-transcription-check.wav')],'demo.wav',{type:'audio/wav'}));
  const r=await request('/api/transcribe',{method:'POST',body:form});
  assert.equal(r.status,200);const result=await r.json();assert.match(result.transcript,/tiny request/i);
  console.log('Deployed ElevenLabs transcription:',result.transcript);
}
