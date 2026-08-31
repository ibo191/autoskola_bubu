import lighthouse from 'lighthouse';
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const paths=process.argv.slice(2).length?process.argv.slice(2):['/','/cenik','/strizkov'];
if(paths.some(path=>!/^\/[a-z0-9/-]*$/.test(path)))throw new Error('Only local paths may be audited');
await mkdir('tmp/lighthouse',{recursive:true});
const chrome=await chromium.launch({headless:true,args:['--remote-debugging-port=9225']});
try{
  for(const path of paths){
    const result=await lighthouse('http://127.0.0.1:4322'+path,{port:9225,output:['html','json'],logLevel:'error',onlyCategories:['performance','accessibility','best-practices','seo']});
    if(!result)throw new Error('Lighthouse returned no result');
    const name=path==='/'?'home':path.slice(1).replaceAll('/','-');
    await writeFile(`tmp/lighthouse/${name}.html`,result.report[0]);
    await writeFile(`tmp/lighthouse/${name}.json`,result.report[1]);
    console.log(JSON.stringify({path,scores:Object.fromEntries(Object.entries(result.lhr.categories).map(([key,value])=>[key,Math.round(value.score*100)])),lcp:result.lhr.audits['largest-contentful-paint'].numericValue,cls:result.lhr.audits['cumulative-layout-shift'].numericValue}));
  }
}finally{await chrome.close();}
