import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';

async function main() {
  const origin=process.env.MARKET_ORIGIN??'http://localhost:8789';
  const configuredOrigin=process.env.MARKET_EXPECTED_ORIGIN??'http://127.0.0.1:8787';
  const account=privateKeyToAccount(generatePrivateKey());
  const request=(path:string,body?:unknown,cookie?:string)=>fetch(origin+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Origin:configuredOrigin,...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
  const anonymous=await request('/api/jobs');
  if(anonymous.status!==401)throw new Error('Private jobs are not protected');
  const nonce=await request('/api/auth/nonce',{wallet:account.address});
  if(!nonce.ok)throw new Error('Challenge failed');
  const challenge=await nonce.json() as {nonce:string;message:string};
  const signature=await account.signMessage({message:challenge.message});
  const login=await request('/api/auth/verify',{nonce:challenge.nonce,signature});
  if(!login.ok)throw new Error('Login failed');
  const cookie=login.headers.get('set-cookie');
  if(!cookie||!cookie.includes('HttpOnly')||!cookie.includes('Secure')||!cookie.includes('SameSite=Strict'))throw new Error('Cookie flags missing');
  const jobs=await request('/api/jobs',undefined,cookie);
  if(!jobs.ok||jobs.headers.get('cache-control')!=='no-store')throw new Error('Jobs response failed');
  if((await jobs.json() as {jobs:unknown[]}).jobs.length!==0)throw new Error('Unexpected jobs');
  const replay=await request('/api/auth/verify',{nonce:challenge.nonce,signature});
  if(replay.status!==401)throw new Error('Replay accepted');
  const wrongOrigin=await fetch(origin+'/api/auth/logout',{method:'POST',headers:{Origin:'https://attacker.test',Cookie:cookie,'Content-Type':'application/json'},body:'{}'});
  if(wrongOrigin.status!==403)throw new Error('Cross-origin write accepted');
  await request('/api/auth/logout',{},cookie);
  const after=await request('/api/jobs',undefined,cookie);
  if(after.status!==401)throw new Error('Logout failed');
  console.log(JSON.stringify({origin,anonymousDenied:true,siweLogin:true,secureCookie:true,emptyPrivateJobs:true,replayDenied:true,csrfDenied:true,logout:true}));
}

main().catch(error=>{console.error(error instanceof Error?error.message:'Smoke failed');process.exitCode=1;});
