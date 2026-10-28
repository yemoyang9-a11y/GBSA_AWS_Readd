import React from 'react';
import {createRoot} from 'react-dom/client';
import RelationshipTab from '../../../frontend/src/components/Ssabi/RelationshipTab';
import '../../../frontend/src/assets/styles/index.css';
import type {GraphResponse,GraphEdge} from '../../../frontend/src/types';
const proof=(source_page:number,quote:string)=>({source_page,quote,start_char:0,end_char:quote.length});
const edge=(id:string,a:string,b:string,page:number,label:string,key:string,summary:string,quote:string,kind:'emotion'|'action',event=false):GraphEdge=>({id,source:a,target:b,label,established_page:page,semantics:{version:2,direction:'b_to_a',kind,relation_key:key,summary,assertion_status:'fact',temporal_scope:event?'event':'ongoing',state:'active',evidence:proof(page,quote)}});
const edges=[
 edge('kim-jealousy','chobong','kim',91,'질투','jealousy','김씨는 태수를 두고 초봉이를 질투한다.','초봉이란 말에 김씨는 도무지 전에 없던 일로 별안간 강짜가 나고, 나되 사뭇 앞이 캄캄하고 몸이 떨려 어쩔 줄을 몰랐다.','emotion'),
 edge('kim-matchmaking','chobong','kim',106,'혼인 주선','matchmaking','김씨는 초봉이의 혼인을 주선한다.','김씨는 초봉이의 혼담을 제시했다.','action',true),
 edge('hyeongbo-desire','chobong','hyeongbo',129,'탐냄','possessive_desire','장형보는 초봉이를 일방적으로 탐낸다.','시방 형보가 초봉이를 탐내는 품은 태수가 초봉이한테 반한 것보다 훨씬 더했다.','emotion'),
];
const graph:GraphResponse={nodes:[
 {id:'chobong',name:'초봉이',first_appearance_page:6,aliases:[]},
 {id:'kim',name:'김씨',first_appearance_page:16,aliases:[]},
 {id:'hyeongbo',name:'장형보',first_appearance_page:4,aliases:['늦게 확인된 평가 별칭'],alias_details:[{alias:'늦게 확인된 평가 별칭',first_appearance_page:120}]},
],edges,history:edges,applied_cutoff:129};
const dataset=new URLSearchParams(window.location.search).get('dataset');
const allowed=['takryu-p91','takryu-p129','austen-jealousy','austen-negated-envy','austen-belief-attribution'];
function App(){
 const [actual,setActual]=React.useState<GraphResponse|null>(null);
 React.useEffect(()=>{if(dataset&&allowed.includes(dataset))fetch(`/@fs/workspace/relationship-validation/source-flow/${dataset}.graph.json`).then(r=>{if(!r.ok)throw Error('Graph fixture unavailable');return r.json();}).then(setActual);},[]);
 const selected=dataset?actual:graph;
 return <main style={{maxWidth:600,margin:'0 auto',padding:'16px',background:'#faf8f4',minHeight:'100vh'}}><p style={{fontSize:12,marginBottom:12}}>{dataset?`독립 평가 · ${dataset} · 사람이 원문에서 작성한 후보 → 제품 파이프라인 → 로컬 PostgreSQL → 실제 UI. 모델 산출/운영 DB가 아님.`:'독립 평가 화면 · 실제 제품 컴포넌트에 평가용 응답 주입 · DB 연결 없음. 중매 인용/늦은 별칭은 UI 검사 전용 창작 값.'}</p><RelationshipTab graph={selected} failed={false} totalPages={dataset?.startsWith('austen')?1:411}/></main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
