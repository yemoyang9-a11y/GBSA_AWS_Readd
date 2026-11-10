#!/usr/bin/env node
const {chromium,expect}=require('../../frontend/node_modules/@playwright/test');
const fs=require('node:fs');const path=require('node:path');
async function main(){
 const fixtures=JSON.parse(fs.readFileSync(path.join(__dirname,'reviewed-source-candidates.json'),'utf8')).cases;
 const browser=await chromium.launch({headless:true,executablePath:process.env.SSABI_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox']});
 const results=[];
 try{for(const [viewport,width,height] of [['desktop',1440,1000],['mobile',390,844]])for(const fixture of fixtures){
  const page=await browser.newPage({viewport:{width,height}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:5186/?dataset=${fixture.id}`);
  await expect(page.locator('[data-edge-id]')).toHaveCount(fixture.relationships.length);
  await page.getByRole('region',{name:'인물',exact:true}).getByRole('button',{name:fixture.relationships[0].character_b,exact:true}).click();
  await expect(page.locator('[data-relationship-id]')).toHaveCount(fixture.relationships.length);
  for(const expected of fixture.relationships){
   const card=page.locator('[data-relationship-id]').filter({hasText:expected.semantics.summary});
   await expect(card).toHaveCount(1);await expect(card).toContainText(`${expected.character_a} → ${expected.character_b}`);
   const badge={fact:'서술된 사실',negated:'부정된 관계',belief:'인물의 생각'}[expected.assertion_status];
   await expect(card).toContainText(badge);
   if(expected.assertion_status!=='fact')await expect(card).not.toContainText('서술된 사실');
   if(expected.semantics.attribution)await expect(card).toContainText(`전달·판단 주체: ${expected.semantics.attribution}`);
   await card.locator('summary').click();
   const quote=await card.locator('blockquote').innerText();expect(quote).toBe(expected.evidence.quote);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);expect(errors).toEqual([]);
  const png=`source-flow-${fixture.id}-${viewport}.png`;await page.screenshot({path:path.join(__dirname,'results',png),fullPage:true});
  results.push({id:fixture.id,viewport,passed:true,assertions:fixture.relationships.map(r=>({subject:r.character_a,object:r.character_b,assertion_status:r.assertion_status,exact_source_quote:true})),screenshot:png});await page.close();
 }}finally{await browser.close();}
 const report={mode:'human-source-candidate -> production validation/accumulation/SQL/repository -> product UI; model not exercised',results};
 fs.writeFileSync(path.join(__dirname,'results','source-flow-ui.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
