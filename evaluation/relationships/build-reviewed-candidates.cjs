#!/usr/bin/env node
const fs=require('node:fs');const path=require('node:path');
const dir=__dirname;
const specs=[
 {file:'takryu-p91',a:'김씨',b:'초봉이',label:'태수를 두고 질투',key:'jealousy',summary:'김씨는 태수를 두고 초봉이를 질투한다.',start:'초봉이란 말에 김씨는',end:'질투는 피어올랐던 것이다.',assertion:'fact'},
 {file:'takryu-p129',a:'형보',b:'초봉이',label:'일방적으로 탐냄',key:'possessive_desire',summary:'형보는 초봉이를 일방적으로 탐낸다.',start:'시방 형보가 초봉이를 탐내는 품은',end:'훨씬 더했다.',assertion:'fact'},
 {file:'austen-jealousy',a:'Miss Bingley',b:'Elizabeth',label:'질투',key:'jealousy',summary:'Miss Bingley는 Elizabeth를 질투한다.',start:'Miss Bingley saw,',end:'getting rid of Elizabeth.',assertion:'fact'},
 {file:'austen-negated-envy',a:'Kitty',b:'Miss Lucas',label:'부러워하지 않음',key:'envy',summary:'Kitty는 Miss Lucas를 부러워하지 않는다.',start:'Kitty',end:'to spread at Meryton.',assertion:'negated'},
 {file:'austen-negated-envy',a:'Lydia',b:'Miss Lucas',label:'부러워하지 않음',key:'envy',summary:'Lydia는 Miss Lucas를 부러워하지 않는다.',start:'Kitty',end:'to spread at Meryton.',assertion:'negated'},
 {file:'austen-belief-attribution',a:'Miss Bingley',b:'Elizabeth',label:'질투한다는 생각',key:'jealousy',summary:'Elizabeth는 Miss Bingley의 자신에 대한 반감이 질투에서 비롯되었다고 여긴다.',start:'Convinced as Elizabeth',end:'the acquaintance would now be renewed.',assertion:'belief',attribution:'Elizabeth'},
];
const grouped=new Map();
for(const spec of specs){
 const input=JSON.parse(fs.readFileSync(path.join(dir,'model-inputs',spec.file+'.json'),'utf8'));
 const page=input.pages[0],start=page.content.indexOf(spec.start),end=page.content.indexOf(spec.end,start)+spec.end.length;
 if(start<0||end<start)throw Error('Anchor not found: '+spec.file);
 const evidence={source_page:page.page_no,quote:page.content.slice(start,end),start_char:start,end_char:end};
 const candidate={character_a:spec.a,character_b:spec.b,label:spec.label,established_page:page.page_no,rationale:spec.assertion==='fact'?'독립 평가자가 제공 원문 서술에서 주체와 대상을 확인했다.':spec.assertion==='negated'?'원문이 감정을 명시적으로 부정하므로 긍정 관계로 승격하지 않는다.':'이 문장은 Elizabeth의 믿음을 서술한다. 인용 밖 소설 지식으로 사실 판정을 보강하지 않는다.',evidence,assertion_status:spec.assertion,change_type:'establishment',semantics:{version:2,direction:'a_to_b',kind:'emotion',relation_key:spec.key,summary:spec.summary,assertion_status:spec.assertion,...(spec.attribution?{attribution:spec.attribution}:{}),temporal_scope:'ongoing',state:'active',evidence}};
 if(!grouped.has(spec.file))grouped.set(spec.file,{id:spec.file,input_path:'model-inputs/'+spec.file+'.json',source:input.source,scope:'Evaluator-authored candidate for a targeted source assertion, NOT live model output and NOT full excerpt extraction. No production approval or DB mutation is implied.',relationships:[]});
 grouped.get(spec.file).relationships.push(candidate);
}
const result={authored_by:'Independent relationship evaluator',basis:'Original text independently read before implementation. Exact source anchors computed, no product writes or model calls.',cases:[...grouped.values()]};
fs.writeFileSync(path.join(dir,'reviewed-source-candidates.json'),JSON.stringify(result,null,2)+'\n');
console.log('Wrote',specs.length,'source-grounded human candidates across',grouped.size,'source inputs.');
