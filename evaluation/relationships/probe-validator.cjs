#!/usr/bin/env node
/* Independent black-box candidate injection. Does NOT measure live model extraction. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
require(path.join(root, 'backend/node_modules/ts-node')).register({project:path.join(root,'backend/tsconfig.json'),transpileOnly:true});
const {validateGroundedChapter} = require(path.join(root,'backend/src/batch/pipeline/grounding.ts'));
const oracle = JSON.parse(fs.readFileSync(path.join(__dirname,'oracle.json'),'utf8'));
const labels = {jealousy:'질투',possessive_desire:'탐냄',romantic_affection:'연정',romantic_partners:'연인',trust:'신뢰',hostility:'미움',marriage:'혼인',contempt:'경멸',friendship:'친구'};
const results = [];
for(const fixture of oracle.cases.filter(c=>c.candidate_semantics)) {
  const {subject,object,kind} = fixture.candidate_semantics;
  const page = fixture.pages[0];
  const evidence = {source_page:page.page_no,quote:page.content,start_char:0,end_char:page.content.length};
  const label=labels[kind]||kind;
  const candidate = {character_a:subject,character_b:object,label,established_page:page.page_no,
    assertion_status:'fact',change_type:'establishment',rationale:`Candidate assertion: ${subject} → ${object} (${label}); independent oracle may reject it.`,evidence,
    semantics:{version:2,direction:'a_to_b',kind:['marriage','friendship','romantic_partners'].includes(kind)?'social':'emotion',relation_key:kind,
      summary:`${subject}은(는) ${object}에게 ${label}의 관계 또는 감정을 가진다.`,assertion_status:'fact',temporal_scope:'ongoing',state:'active',evidence}};
  const output = validateGroundedChapter({characters:[],relationships:[candidate]},fixture.pages.map(p=>({...p,book_id:fixture.id})),{requireRelationshipSemantics:true});
  const accepted = output.relationships.length>0;
  const expectAccept=fixture.expected_decision==='accept';
  results.push({id:fixture.id,provenance:fixture.provenance,holdout:!!fixture.holdout,expected:expectAccept?'accept':'hold-unqualified-fact',observed:accepted?'accept':'hold',pass:accepted===expectAccept,oracle:fixture.oracle,reasons:output.review.map(r=>r.reason)});
}
const result={mode:'candidate-injection-only',completed_at:new Date().toISOString(),counts:{total:results.length,passed:results.filter(r=>r.pass).length,false_accepts:results.filter(r=>!r.pass&&r.observed==='accept').length,false_holds:results.filter(r=>!r.pass&&r.observed==='hold').length},results};
const dest=process.argv[2];if(dest)fs.writeFileSync(dest,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
process.exitCode=results.every(r=>r.pass)?0:1;
