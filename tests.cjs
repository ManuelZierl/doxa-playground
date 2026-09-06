'use strict';
const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict'), test=require('node:test');
const html=fs.readFileSync(__dirname+'/index.html','utf8');
const script=html.split('<script>')[1].split('</script>')[0];
class Element {
 constructor(){this.value='';this.children=[];this.listeners={};this.textContent='';this.disabled=false;}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=items;this.textContent='';}
 addEventListener(name,fn){this.listeners[name]=fn;}
 remove(){}
 click(){this.listeners.click?.({target:this});}
}
function start({blocked=false, saved=null}={}){
 const elements=new Map(), memory=new Map(saved ? [['doxa-web-v02',JSON.stringify(saved)]] : []);
 const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
 get('profile').value='minmax';
 const context=vm.createContext({document:{getElementById:get,createElement:()=>new Element(),body:new Element()},localStorage:{setItem(k,v){if(blocked)throw Error('denied');memory.set(k,v);},getItem(k){if(blocked)throw Error('denied');return memory.get(k)||null;}},fetch:async()=>({ok:false}),setTimeout:()=>0,Blob,URL,console});
 vm.runInContext(script,context);return {context,get,memory,run:code=>vm.runInContext(code,context)};
}
const app=start();
const run=app.run;
const evaluate=(data,p='minmax')=>{app.context.data=data;app.context.profileName=p;return run('evaluate(data,profileName)');};
const clone=x=>JSON.parse(JSON.stringify(x));
const examples=clone(run('EXAMPLES'));
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);
for(const p of ['minmax','productmax','netminmax']){
 test(p+': all examples evaluate',()=>{for(const s of examples)assert.ok(evaluate(s.data,p).states.has(s.query));});
 test(p+': shared uncertainty counted once',()=>close(evaluate(examples[4].data,p).states.get('d:x').b,.8));
 test(p+': no premise disbelief copied',()=>close(evaluate(examples[2].data,p).states.get('mortal:alice')?.d||0,0));
 test(p+': independent direct evidence survives',()=>close(evaluate(examples[5].data,p).states.get('c:x').b,.9));
 test(p+': rule polarity preserved',()=>{const s=evaluate(examples[3].data,p).states.get('immortal:alice');close(s.b,.1);close(s.d,.9);});
 test(p+': rule ordering cannot affect result',()=>{const d=clone(examples[4].data); d.rules.reverse();close(evaluate(d,p).states.get('d:x').b,.8);});
 test(p+': conflicts weaken premises in agreed order',()=>{const strengths=[[.8,0],[1,.2],[.8,.6]].map(([b,d])=>evaluate({facts:[{name:'a',b,d}],rules:[{name:'r',premises:['a'],consequence:'c'}]},p).states.get('c').b);assert.ok(strengths[0]>strengths[1]&&strengths[1]>strengths[2]);});
}
test('product and minimum differ on independent weights',()=>{close(evaluate(examples[6].data,'productmax').states.get('b:x').b,.72);close(evaluate(examples[6].data).states.get('b:x').b,.8);});
test('unknown conclusion has no evidence',()=>assert.equal(evaluate(examples[0].data).states.has('unknown'),false));
test('cycles are rejected rather than silently truncated',()=>assert.throws(()=>evaluate({facts:[],rules:[{name:'r',premises:['a'],consequence:'a'}]}),/Zyklus/));
test('invalid weights are rejected',()=>{for(const b of [-1,2,'0.8',NaN])assert.throws(()=>evaluate({facts:[{name:'a',b}],rules:[]}),/Zahlen/);});
test('missing weights default to b=1,d=0',()=>{const s=evaluate({facts:[{name:'a'}],rules:[]}).states.get('a');close(s.b,1);close(s.d,0);});
test('root value conflicts are rejected',()=>assert.throws(()=>evaluate({facts:[{name:'a',root:'same',b:.8},{name:'b',root:'same',b:.7}],rules:[]}),/Ursprung/));
test('late opposing evidence is applied before inference',()=>{const d={facts:[{name:'a',b:1},{name:'seed',b:1}],rules:[{name:'first-in-file',premises:['a'],consequence:'c'},{name:'opposition',premises:['seed'],consequence:'a',b:0,d:.6}]};close(evaluate(d).states.get('c').b,.16);});
test('empty conjunction is valid',()=>close(evaluate({facts:[],rules:[{name:'r',premises:[],consequence:'c',b:.7}]}).states.get('c').b,.7));
test('UI initializes seven selectable examples',()=>{assert.equal(app.get('example').children.length,7);assert.equal(app.get('example').disabled,false);assert.equal(app.get('status').className,'ready');});
test('UI next button and change events update query',()=>{app.get('next').click();assert.equal(app.get('query').value,'mortal:alice');app.get('example').value='4';app.get('example').listeners.change();assert.equal(app.get('query').value,'d:x');assert.equal(app.get('error').textContent,'');});
test('blocked browser storage does not stop startup',()=>{const x=start({blocked:true});assert.equal(x.get('example').children.length,7);assert.equal(x.get('status').className,'ready');});
test('saved experiment is restored before default overwrites it',()=>{const x=start({saved:{data:examples[4].data,query:'d:x',profile:'productmax'}});assert.equal(x.get('query').value,'d:x');assert.equal(x.get('profile').value,'productmax');});
test('scenario strings cannot inject HTML',()=>{assert.ok(!script.includes('.innerHTML'));});
test('script-disabled view has a static diagnosis',()=>assert.match(html,/JavaScript ist noch nicht gestartet/));
test('UI errors clear previous results',()=>{app.get('source').value='not json';app.get('run').click();assert.ok(app.get('error').textContent);assert.equal(app.get('out').children.length,0);});
