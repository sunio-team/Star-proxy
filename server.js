const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawn}=require('child_process');
const PORT=+process.env.PORT||3000,PP=8443,USER=process.env.ADMIN_USER||'admin',PASS=process.env.ADMIN_PASS||'admin';
const DIR=process.env.DATA_DIR||path.join(__dirname,'data'),FILE=path.join(DIR,'state.json'),PD=path.join(__dirname,'proxy');
fs.mkdirSync(DIR,{recursive:true});
let S={host:process.env.PROXY_HOST||'',port:process.env.PROXY_PORT||'',domain:'www.google.com',proxies:[]};
try{S={...S,...JSON.parse(fs.readFileSync(FILE))}}catch{}
const save=()=>fs.writeFileSync(FILE,JSON.stringify(S));
const live=p=>p.enabled&&(!p.expires||p.expires>Date.now());
let child=null,last='';
function sync(){
  const act=S.proxies.filter(live),sig=JSON.stringify([act.map(p=>[p.id,p.secret]),S.domain]);
  if(sig===last&&(child||!act.length))return;
  last=sig;
  if(child){child.removeAllListeners('exit');child.kill();child=null}
  if(!act.length)return;
  fs.writeFileSync(path.join(PD,'config.py'),`PORT=${PP}\nUSERS={${act.map(p=>`"${p.id}":"${p.secret}"`)}}\nMODES={"classic":False,"secure":False,"tls":True}\nTLS_DOMAIN=${JSON.stringify(S.domain)}\n`);
  child=spawn('python3',['mtprotoproxy.py','config.py'],{cwd:PD,stdio:'inherit'});
  child.on('exit',()=>{child=null;last='';setTimeout(sync,3000)});
}
setInterval(sync,60000);sync();

const sessions=new Set();
const q=p=>`server=${S.host}&port=${S.port}&secret=ee${p.secret}${Buffer.from(S.domain).toString('hex')}`;
const view=()=>({host:S.host,port:S.port,domain:S.domain,running:!!child,proxies:S.proxies.map(p=>({id:p.id,name:p.name,enabled:p.enabled,expires:p.expires,created:p.created,active:live(p),link:`tg://proxy?${q(p)}`,web:`https://t.me/proxy?${q(p)}`}))});
const body=r=>new Promise(res=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d||'{}'))}catch{res({})}})});
const json=(r,c,o,h={})=>{r.writeHead(c,{'Content-Type':'application/json',...h});r.end(JSON.stringify(o))};
const MIME={'.html':'text/html; charset=utf-8','.svg':'image/svg+xml'};

http.createServer(async(req,res)=>{
  const u=req.url.split('?')[0];
  if(!u.startsWith('/api/')){
    const f=u==='/'?'index.html':u.slice(1);
    const fp=path.join(__dirname,'public',path.normalize(f).replace(/^(\.\.[\/\\])+/,''));
    return fs.readFile(fp,(e,d)=>{if(e){res.writeHead(404);return res.end()}res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});res.end(d)});
  }
  if(u==='/api/login'&&req.method==='POST'){
    const b=await body(req);
    if(b.user===USER&&b.pass===PASS){const t=crypto.randomBytes(24).toString('hex');sessions.add(t);return json(res,200,{ok:1},{'Set-Cookie':`sp=${t}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`})}
    return json(res,401,{error:'bad'});
  }
  const tok=(req.headers.cookie||'').match(/sp=([a-f0-9]+)/);
  if(!tok||!sessions.has(tok[1]))return json(res,401,{error:'auth'});
  if(u==='/api/logout'){sessions.delete(tok[1]);return json(res,200,{ok:1})}
  if(u==='/api/state')return json(res,200,view());
  if(u==='/api/settings'&&req.method==='POST'){
    const b=await body(req);
    S.host=String(b.host||'').trim();S.port=String(b.port||'').trim();
    S.domain=String(b.domain||'www.google.com').toLowerCase().replace(/[^a-z0-9.-]/g,'')||'www.google.com';
    save();sync();return json(res,200,view());
  }
  if(u==='/api/proxies'&&req.method==='POST'){
    const b=await body(req),d=+b.days;
    S.proxies.push({id:crypto.randomBytes(4).toString('hex'),name:String(b.name||'proxy').slice(0,40),secret:crypto.randomBytes(16).toString('hex'),enabled:true,created:Date.now(),expires:d>0?Date.now()+d*864e5:0});
    save();sync();return json(res,200,view());
  }
  const m=u.match(/^\/api\/proxies\/([a-f0-9]+)(\/toggle)?$/);
  if(m){
    const p=S.proxies.find(x=>x.id===m[1]);
    if(!p)return json(res,404,{error:'nf'});
    if(m[2])p.enabled=!p.enabled;else S.proxies=S.proxies.filter(x=>x!==p);
    save();sync();return json(res,200,view());
  }
  json(res,404,{error:'nf'});
}).listen(PORT,'0.0.0.0',()=>console.log('Star Proxy panel on',PORT));
