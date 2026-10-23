#!/usr/bin/env node
const {chromium,expect}=require('../../frontend/node_modules/@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const output=path.join(__dirname,'results');
async function main(){
 const browser=await chromium.launch({headless:true,executablePath:process.env.SSABI_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox']});
 const results=[];
 try{for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
  const page=await browser.newPage({viewport:{width,height}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.SSABI_EVAL_UI_URL||'http://127.0.0.1:5186');
  await expect(page.locator('[data-edge-id="kim-jealousy"]')).toHaveCount(1);
  const cards=page.getByRole('region',{name:'인물',exact:true});
  await cards.getByRole('button',{name:'초봉이',exact:true}).click();
  await expect(page.locator('[data-relationship-id]')).toHaveCount(3);
  const jealousy=page.locator('[data-relationship-id="kim-jealousy"]');
  await expect(jealousy).toContainText('김씨 → 초봉이');
  await expect(jealousy).toContainText('김씨는 태수를 두고 초봉이를 질투한다.');
  await jealousy.locator('summary').click();
  await expect(jealousy.locator('blockquote')).toBeVisible();
  await expect(page.locator('[data-relationship-id="hyeongbo-desire"]')).toContainText('장형보 → 초봉이');
  await expect(page.locator('[data-edge-id="hyeongbo-desire"]')).toHaveAttribute('marker-start',/relationship-arrow/);
  await expect(page.locator('[data-edge-id="hyeongbo-desire"]')).not.toHaveAttribute('marker-end',/./);
  const paths=await page.locator('[data-edge-id="kim-jealousy"],[data-edge-id="kim-matchmaking"]').evaluateAll(es=>es.map(e=>e.getAttribute('d')));
  expect(new Set(paths).size).toBe(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:path.join(output,`ui-${name}-current.png`),fullPage:true});
  const slider=page.getByLabel('시점 되감기');
  await slider.focus();await slider.press('Home');
  for(let i=0;i<3;i++)await slider.press('ArrowRight');
  await expect(page.getByText('91페이지 시점',{exact:true})).toBeVisible();
  await expect(page.locator('[data-relationship-id]')).toHaveCount(1);
  await expect(page.locator('[data-relationship-id="kim-jealousy"]')).toBeVisible();
  await expect(page.locator('[data-edge-id="kim-matchmaking"]')).toHaveCount(0);
  await expect(page.locator('[data-edge-id="hyeongbo-desire"]')).toHaveCount(0);
  await expect(page.getByText('늦게 확인된 평가 별칭',{exact:true})).toHaveCount(0);
  await page.screenshot({path:path.join(output,`ui-${name}-rewind91.png`),fullPage:true});
  await slider.press('End');
  await expect(page.locator('[data-relationship-id]')).toHaveCount(3);
  await expect(page.getByText('늦게 확인된 평가 별칭',{exact:true})).toBeVisible();
  expect(errors).toEqual([]);
  results.push({viewport:name,width,height,passed:true,checks:['correct textual subject/object from reverse stored slots','b_to_a SVG arrow at start','parallel relations have distinct curve paths','coexisting jealousy/matchmaking','readable source disclosure','rewind removes future relation and quote','rewind restores positive relation at its page','dated alias hidden before disclosure and restored after','no horizontal document overflow','no browser runtime errors'],limitation:'Actual product UI component, independently injected graph fixture; no deployed DB/API, no physical mobile/Safari.'});
  await page.close();
 }}finally{await browser.close();}
 fs.writeFileSync(path.join(output,'ui-results.json'),JSON.stringify({results},null,2)+'\n');
 console.log(JSON.stringify({results},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
