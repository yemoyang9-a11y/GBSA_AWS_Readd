#!/usr/bin/env node
/* Isolated local SQL fixture: no DATABASE_URL, no remote calls, no production approvals. */
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');require(path.join(root,'backend/node_modules/ts-node')).register({project:path.join(root,'backend/tsconfig.json'),transpileOnly:true});
const {PGlite}=require('@electric-sql/pglite');
const {registerBook,registerGeneratedContent}=require(path.join(root,'backend/src/batch/pipeline/register'));
const {buildReviewSheetRows,applyReviewJudgments,checkReviewComplete,publishBook,APPLICABLE_CRITERIA}=require(path.join(root,'backend/src/batch/pipeline/review'));
const output=path.join(__dirname,'results','review-boundary.json');
async function main(){const db=new PGlite();const checks=[];try{
 const base=fs.readFileSync(path.join(root,'backend/migrations/001_content_store.sql'),'utf8').replace(/^CREATE EXTENSION IF NOT EXISTS vector;.*$/m,'').replace(/^\s*embedding vector\(1024\),.*$/m,'').replace(/^CREATE INDEX IF NOT EXISTS ix_pages_embedding.*$/m,'');
 await db.exec(base);await db.exec(fs.readFileSync(path.join(root,'backend/migrations/003_review_completeness.sql'),'utf8'));await db.exec(fs.readFileSync(path.join(root,'backend/migrations/006_relationship_semantics.sql'),'utf8'));
 const quote='은우는 새봄을 신뢰했다.';const evidence={source_page:2,quote,start_char:0,end_char:quote.length};
 const data={book_id:'independent-review-boundary',chapter_summaries:[],characters:[{id:'z-eun',name:'은우',first_appearance_page:2,aliases:[],notes:[]},{id:'a-sae',name:'새봄',first_appearance_page:2,aliases:[],notes:[]}],relationships:[{id:'review-relation',character_a_id:'z-eun',character_b_id:'a-sae',label:'신뢰한다',established_page:2,semantics:{version:2,direction:'a_to_b',kind:'emotion',relation_key:'trust',summary:'은우는 새봄을 신뢰한다.',assertion_status:'fact',temporal_scope:'ongoing',state:'active',evidence}}],terms:[],events:[],background_and_intro:{background:'평가용 창작문',intro:'검수 경계 테스트'}};
 await registerBook(db,{book_id:data.book_id,title:'검수 경계 창작 평가',author:'Independent fixture'},[],[{book_id:data.book_id,page_no:2,content:quote}]);await registerGeneratedContent(db,data);
 const fill=sheet=>sheet.map(row=>({...row,criteria:Object.fromEntries(APPLICABLE_CRITERIA[row.target_type].map(c=>[c,true])),corrected_content:null,correction_note:'Local synthetic fixture only',reviewer:'independent-evaluation-fixture'}));
 const first=fill(buildReviewSheetRows(data));await applyReviewJudgments(db,data.book_id,first);await publishBook(db,data.book_id);
 assert.equal((await checkReviewComplete(db,data.book_id)).complete,true);checks.push('Positive: original source-matched reviewed fixture can publish');
 data.relationships[0].label='신뢰를 보임';data.relationships[0].semantics.summary='은우는 새봄에게 신뢰를 보인다.';
 await registerGeneratedContent(db,data);
 const status=(await db.query('SELECT ssabi_ready,publish_status FROM books WHERE book_id=$1',[data.book_id])).rows[0];
 assert.equal(status.ssabi_ready,false);assert.equal(status.publish_status,'review');checks.push('Registration of changed semantics invalidates previously published readiness');
 const report=await checkReviewComplete(db,data.book_id);assert.equal(report.complete,false);assert.ok(report.missing.some(r=>r.target_id==='review-relation'));checks.push('Old approval snapshot does not cover changed label/summary');
 await assert.rejects(()=>applyReviewJudgments(db,data.book_id,first.filter(r=>r.target_type==='relationship')),/changed|stale/i);checks.push('Applying stale semantic review sheet is rejected');
 const denied=await publishBook(db,data.book_id);assert.equal(denied.complete,false);assert.equal((await db.query('SELECT ssabi_ready FROM books WHERE book_id=$1',[data.book_id])).rows[0].ssabi_ready,false);checks.push('Negative: stale review cannot republish');
 await applyReviewJudgments(db,data.book_id,fill(buildReviewSheetRows(data)));await publishBook(db,data.book_id);checks.push('Positive: new exact semantic review can republish');
 await db.exec('BEGIN');const changed=structuredClone(data);changed.relationships[0].semantics.summary='실패 트랜잭션에서만 바뀐 문장';changed.relationships.push({...changed.relationships[0],id:'bad-fk',character_b_id:'missing'});
 await assert.rejects(()=>registerGeneratedContent(db,changed));await db.exec('ROLLBACK');
 const after=(await db.query('SELECT ssabi_ready FROM books WHERE book_id=$1',[data.book_id])).rows[0];assert.equal(after.ssabi_ready,true);
 const rel=(await db.query('SELECT semantics FROM relationships WHERE id=$1',['review-relation'])).rows[0];assert.equal(rel.semantics.summary,data.relationships[0].semantics.summary);checks.push('Rollback preserves both last reviewed content and ready status atomically');
 const result={status:'passed',checks,source:'Independent synthetic fixture',engine:'PGlite local PostgreSQL WASM',real_sql:true,remote:false,model:false};fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
 }finally{await db.close();}}
main().catch(e=>{console.error(e);process.exitCode=1});
