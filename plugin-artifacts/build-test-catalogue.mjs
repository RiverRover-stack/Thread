import fs from 'node:fs';
let count=0;
const sections=[];
for(const file of fs.readdirSync('tests').filter(f=>f.endsWith('.test.ts')).sort()){
  const source=fs.readFileSync('tests/'+file,'utf8');
  const names=[...source.matchAll(/^test\("([^"]+)"/gm)].map(m=>m[1]);
  count+=names.length;
  sections.push('\n### '+file+' ('+names.length+')\n\n'+names.map(n=>'- '+n).join('\n')+'\n');
}
if(count!==82)throw Error('Unexpected catalogue count: '+count);
fs.appendFileSync('DEPLOYMENT_RESULTS.md',sections.join(''));
console.log('Report includes all '+count+' automated test names.');
