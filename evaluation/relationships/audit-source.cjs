#!/usr/bin/env node
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
require(path.join(root,'backend/node_modules/ts-node')).register({project:path.join(root,'backend/tsconfig.json'),transpileOnly:true});
const {splitBook}=require(path.join(root,'backend/src/batch/pipeline/split.ts'));
const text=fs.readFileSync(path.join(root,'backend/data/raw/takryu.txt'),'utf8');
const split=splitBook(text,'takryu');
const checks=[
 {id:'takryu-jealousy-direction',needle:'질투는 피어올랐던',expectedPage:91,subject:'김씨',object:'초봉이'},
 {id:'takryu-desire-direction',needle:'시방 형보가 초봉이를 탐내는 품',expectedPage:129,subject:'형보',object:'초봉이'},
 {id:'takryu-negated-jealousy',needle:'김씨처럼 태수를 놓고 초봉이를 질투',expectedPage:167,subject:'행화',object:'초봉이',negated:true},
];
const results=checks.map(c=>({...c,found:split.pages.filter(p=>p.content.includes(c.needle)).map(p=>p.page_no)}));
const report={source_sha256:crypto.createHash('sha256').update(text).digest('hex'),total_pages:split.pages.length,checks:results,pass:results.every(c=>c.found.length===1&&c.found[0]===c.expectedPage)};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(!report.pass)process.exitCode=1;
