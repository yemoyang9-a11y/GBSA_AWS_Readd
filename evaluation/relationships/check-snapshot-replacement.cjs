#!/usr/bin/env node
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');require(path.join(root,'backend/node_modules/ts-node')).register({project:path.join(root,'backend/tsconfig.json'),transpileOnly:true});
const {PGlite}=require('@electric-sql/pglite');const {registerBook,registerGeneratedContent,replaceRelationshipSnapshot}=require(path.join(root,'backend/src/batch/pipeline/register'));
const {sealResolvedOutput}=require(path.join(root,'backend/src/batch/pipeline/grounding'));
async function main(){const db=new PGlite();const checks=[];try{
 const base=fs.readFileSync(path.join(root,'backend/migrations/001_content_store.sql'),'utf8').replace(/^CREATE EXTENSION IF NOT EXISTS vector;.*$/m,'').replace(/^\s*embedding vector\(1024\),.*$/m,'').replace(/^CREATE INDEX IF NOT EXISTS ix_pages_embedding.*$/m,'');await db.exec(base);
 for(const n of ['003_review_completeness.sql','006_relationship_semantics.sql'])await db.exec(fs.readFileSync(path.join(root,'backend/migrations',n),'utf8'));
 const bid='snapshot-fixture',quote='은우는 새봄을 신뢰했다.';const pages=[{book_id:bid,page_no:1,content:quote},{book_id:bid,page_no:2,content:'은우와 새봄은 산책했다.'}];
 const chapters=[1,2].map(n=>({id:`chapter-${n}`,book_id:bid,chapter_no:n,title:`창작 평가 ${n}`,start_page:n,end_page:n}));
 const proof={source_page:1,quote,start_char:0,end_char:quote.length};
 const semantic={version:2,direction:'a_to_b',kind:'emotion',relation_key:'trust',summary:'은우는 새봄을 신뢰한다.',assertion_status:'fact',temporal_scope:'ongoing',state:'active',evidence:proof};
 const data={book_id:bid,chapter_summaries:chapters.map(c=>({chapter_no:c.chapter_no,title:c.title,summary:'창작 평가'})),characters:[{id:'eun',name:'은우',first_appearance_page:1,aliases:[{alias:'은',type:'name',first_appearance_page:1}],notes:[{id:'note',note:'기존 교정 노트',source_page:1}]},{id:'sae',name:'새봄',first_appearance_page:1,aliases:[],notes:[]}],relationships:[{id:'old-legacy',character_a_id:'eun',character_b_id:'sae',label:'신뢰',established_page:1}],terms:[],events:[],background_and_intro:{background:'창작',intro:'독립 평가'}};
 await registerBook(db,{book_id:bid,title:'독립 스냅샷 평가',author:'fixture'},chapters,pages);await registerGeneratedContent(db,data);
 await db.query("UPDATE books SET ssabi_ready=true,publish_status='published' WHERE book_id=$1",[bid]);
 await db.query("INSERT INTO review_records(id,book_id,target_type,target_id,reviewer) VALUES('relation-review',$1,'relationship','old-legacy','fixture'),('character-review',$1,'character','eun','fixture')",[bid]);
 const baseNext={...data,provenance:{relationship_coverage:{complete:true,source_page_count:2,chapter_nos:[1,2]}},relationships:[{id:'new-semantic',character_a_id:'eun',character_b_id:'sae',label:'신뢰한다',established_page:1,semantics:semantic}]};
 const snapshot=async()=>({books:(await db.query('SELECT book_id,ssabi_ready,publish_status FROM books ORDER BY book_id')).rows,relationships:(await db.query('SELECT * FROM relationships ORDER BY id')).rows});const attempt=async(label,delta,sealingPages=pages)=>{const next=sealResolvedOutput({...baseNext,...delta},sealingPages);const before=await snapshot();await db.exec('BEGIN');let rejected=false,error='';try{await replaceRelationshipSnapshot(db,next);}catch(e){rejected=true;error=e.message;}let unchanged=false;try{unchanged=JSON.stringify(await snapshot())===JSON.stringify(before);}catch{}await db.exec('ROLLBACK');checks.push({label,passed:rejected&&unchanged,unchanged_before_rollback:unchanged,error});};
 await attempt('Partial coverage refused',{provenance:{relationship_coverage:{complete:false,source_page_count:2,chapter_nos:[1,2]}}});
 await attempt('Missing chapter refused',{provenance:{relationship_coverage:{complete:true,source_page_count:2,chapter_nos:[1]}},chapter_summaries:baseNext.chapter_summaries.slice(0,1)});
 await attempt('Changed source refused',{},[{...pages[0],content:'바뀐 원문'},pages[1]]);
 await attempt('Unmapped endpoints refused',{relationships:[{...baseNext.relationships[0],character_b_id:'missing'}]});
 const before={chars:(await db.query('SELECT * FROM characters WHERE book_id=$1 ORDER BY id',[bid])).rows,aliases:(await db.query('SELECT * FROM aliases WHERE book_id=$1',[bid])).rows,notes:(await db.query('SELECT * FROM character_notes WHERE book_id=$1',[bid])).rows};
 await db.exec('BEGIN');const audit=await replaceRelationshipSnapshot(db,sealResolvedOutput(baseNext,pages));await db.exec('COMMIT');
 assert.deepEqual(audit.removed_ids,['old-legacy']);assert.equal((await db.query('SELECT * FROM relationships WHERE book_id=$1',[bid])).rows.length,1);checks.push({label:'Complete source snapshot replaces obsolete legacy row',passed:true});
 assert.equal((await db.query('SELECT ssabi_ready FROM books WHERE book_id=$1',[bid])).rows[0].ssabi_ready,false);const review=(await db.query('SELECT target_type FROM review_records WHERE book_id=$1',[bid])).rows;assert.deepEqual(review,[{target_type:'character'}]);checks.push({label:'Replacement invalidates relation approvals and published readiness only',passed:true});
 assert.deepEqual((await db.query('SELECT * FROM characters WHERE book_id=$1 ORDER BY id',[bid])).rows,before.chars);assert.deepEqual((await db.query('SELECT * FROM aliases WHERE book_id=$1',[bid])).rows,before.aliases);assert.deepEqual((await db.query('SELECT * FROM character_notes WHERE book_id=$1',[bid])).rows,before.notes);checks.push({label:'Existing character IDs, aliases and corrected notes preserved',passed:true});
 await registerBook(db,{book_id:'other-book',title:'다른 책',author:'fixture'},[],[{book_id:'other-book',page_no:1,content:'다른 인물들'}]);
 await db.query("INSERT INTO characters(id,book_id,name,first_appearance_page) VALUES('other-a','other-book','한결',1),('other-b','other-book','하늬',1)");
 await db.query("INSERT INTO relationships(id,book_id,character_a_id,character_b_id,label,established_page) VALUES('foreign-id','other-book','other-a','other-b','친구',1)");
 await db.query("UPDATE books SET ssabi_ready=true,publish_status='published' WHERE book_id=$1",[bid]);
 await attempt('Relationship ID owned by another book refused',{relationships:[{...baseNext.relationships[0],id:'foreign-id'}]});
 const result={status:checks.every(c=>c.passed)?'passed':'failed',engine:'PGlite local PostgreSQL WASM',source:'Independent synthetic two-chapter fixture',remote:false,checks};fs.writeFileSync(path.join(__dirname,'results','snapshot-replacement.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));if(result.status!=='passed')process.exitCode=1;
 }finally{await db.close();}}
main().catch(e=>{console.error(e);process.exitCode=1});
