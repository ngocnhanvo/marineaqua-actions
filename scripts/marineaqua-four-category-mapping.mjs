import { readFile,mkdir,writeFile } from "node:fs/promises";
const SOURCE="https://marine-aqua.vn";
const DIR="four-category-mapping-evidence";
await mkdir(DIR,{recursive:true});
const inventory=JSON.parse(await readFile("four-category-catalog-evidence/manifest.json","utf8"));
const result={scope:inventory.categoryRoots,assignments:{},rootCounts:[],unassigned:[],terms:[],errors:[],status:"STARTED"};
try {
 const categories=inventory.target.categories||[];
 const bySlug=new Map(categories.map(x=>[x.slug,x]));
 const sourceSet=new Set(inventory.products);
 if(!sourceSet.size||!inventory.archiveMembership||!inventory.details?.length)throw Error("No verified archive and detail inventory");
 if(inventory.details.length!==sourceSet.size)throw Error("Incomplete detail inventory");
 if(inventory.detailErrors?.length)throw Error("Original detail errors");
 if(inventory.target.categoryHttp!==200)throw Error("Destination categories unavailable");
 const slugs=new Set();
 for(const root of inventory.categoryRoots){
  const parent=bySlug.get(root.slug);
  if(!parent?.id||Number(parent.parent||0)!==0)throw Error("Missing or non-root destination category "+root.slug);
  slugs.add(root.slug);
  result.terms.push({slug:root.slug,id:parent.id,parent:0});
  for(const childSlug of root.children){
   const child=bySlug.get(childSlug);
   if(!child?.id||Number(child.parent)!==Number(parent.id))
    throw Error("Wrong or missing destination child taxonomy "+root.slug+"/"+childSlug);
   result.terms.push({slug:childSlug,id:child.id,parent:parent.id});
   slugs.add(childSlug);
  }
  const urls=inventory.archiveMembership[root.slug]||[];
  result.rootCounts.push({slug:root.slug,count:urls.length});
  if(!urls.length)throw Error("Unexpected empty source root "+root.slug);
 }
 for(const [slug,urls] of Object.entries(inventory.archiveMembership)){
  if(!slugs.has(slug))throw Error("Unexpected source category "+slug);
  const term=bySlug.get(slug);
  if(!Array.isArray(urls))throw Error("Malformed category source list "+slug);
  for(const url of urls){
   if(!sourceSet.has(url))throw Error("Unverified product in category "+slug+" "+url);
   if(!result.assignments[url])result.assignments[url]=[];
   if(!result.assignments[url].some(x=>x.id===term.id))
    result.assignments[url].push({id:term.id,slug});
  }
 }
 result.unassigned=[...sourceSet].filter(url=>!result.assignments[url]?.length);
 if(result.unassigned.length)throw Error("Missing taxonomy for "+result.unassigned.length+" products");
 for(const root of inventory.categoryRoots){
  const children=new Set(root.children);
  const actual=new Set(inventory.archiveMembership[root.slug]);
  for(const slug of children)for(const url of inventory.archiveMembership[slug]||[])
   if(!actual.has(url))throw Error("Child source listing product absent from parent "+slug+" "+url);
 }
 result.status="PASS";
 console.log("FOUR_CATEGORY_MAPPING=PASS total="+sourceSet.size+
  " roots="+result.rootCounts.map(x=>x.slug+":"+x.count).join(",")+
  " terms="+result.terms.length);
}catch(e){
 result.status="FAIL";result.errors.push(String(e.stack||e).slice(0,600));
 console.error("FOUR_CATEGORY_MAPPING=FAIL "+result.errors.at(-1));
 process.exitCode=1;
}finally{
 await writeFile(DIR+"/mapping.json",JSON.stringify(result,null,2)+"\n");
}