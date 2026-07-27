import { kvReady, kvGet, kvDel, kvSetEx, kvSAdd, kvSMembers, kvExpire, kvLPush, kvLTrim, kvLRange } from './_kv.js';
import { slotType, totalQuestions, difficultyDecision, buildAnalyzerPrompt, buildPlannerPrompt, buildQuestionPrompt, buildAnswerEvalPrompt, buildReportPrompt, reconcileReport, extractJSON } from './interview-engine.js';
import { rateLimit, clientIP, sanitizeText } from './_ratelimit.js';

// Reliable feedback alert — Telegram (replaces the unreliable CallMeBot). Plain text = no escaping needed.
async function sendTelegram(text){
  var tok=process.env.TELEGRAM_BOT_TOKEN||"",chat=process.env.TELEGRAM_CHAT_ID||"";
  if(!tok||!chat)return false;
  try{var r=await fetch("https://api.telegram.org/bot"+tok+"/sendMessage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:chat,text:text,disable_web_page_preview:true})});return r.ok}
  catch(e){return false}
}
function pickKey(env){if(!env)return null;var k=env.split(",").map(function(k){return k.trim()}).filter(Boolean);return k.length?k[Math.floor(Math.random()*k.length)]:null}
// Random unlock code (no ambiguous chars: no O/0/I/1). e.g. genCode(6) -> "7K4M2P".
function genCode(n){var c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",s="";for(var i=0;i<(n||6);i++)s+=c[Math.floor(Math.random()*c.length)];return s}
// Admin auth — FAILS CLOSED. With no ADMIN_KEY configured nobody gets admin access
// (no hardcoded fallback). Constant-time compare so the key can't be timing-probed.
function adminOk(k){
  // Trim both sides: env values often carry a trailing newline (e.g. when piped in
  // via the CLI), which would silently fail the length check and lock out the admin.
  var want=String(process.env.ADMIN_KEY||"").trim();
  if(!want||!k)return false;
  var a=String(k).trim(),b=want;
  if(a.length!==b.length)return false;
  var diff=0;for(var i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}

// Exact question-slot plan per round (Phase 1 structured interview).
function slotFor(tier,qn){
  if(tier==="r2"){
    if(qn<=5)return{instr:"a DEEP TECHNICAL question about ONE specific technology from the resume (e.g. AWS, Docker, Kubernetes, Terraform, Linux, Jenkins, Git, Monitoring, CI/CD)"};
    if(qn<=15)return{instr:"a real-world PRODUCTION SCENARIO question ('What would you do if...' about an incident, outage, scaling, or deployment problem)"};
    if(qn<=20)return{instr:"a hands-on TROUBLESHOOTING question (something is broken/failing — how do you diagnose and fix it step by step)"};
    return{instr:"a RESUME DEEP-DIVE question drilling into a specific project, decision, or achievement listed on the resume"};
  }
  if(tier==="r3"){
    if(qn<=10)return{coding:true,instr:"a CODING / hands-on problem — ask the candidate to WRITE code or config (debug an issue, fix a CI/CD pipeline, write a Dockerfile, Terraform, Bash, Python, YAML, or a Kubernetes manifest)"};
    if(qn<=20)return{instr:"a CROSS-DOMAIN scenario combining TWO technologies (e.g. AWS+Kubernetes, Jenkins+Docker, Terraform+VPC, Monitoring+Incident, IAM+Security)"};
    if(qn<=25)return{instr:"a SYSTEM DESIGN question (design, scale, or architect a system relevant to the role)"};
    return{instr:"an HR question (salary expectations, leadership, handling conflict, client handling, or career goals)"};
  }
  if(qn<=1)return{instr:"an INTRODUCTION — greet warmly and ask 'Tell me about yourself and walk me through your resume'"};
  if(qn===2)return{instr:"a DEEP TECHNICAL question about one specific technology from the resume (no code writing)"};
  if(qn===3)return{instr:"a production SCENARIO question ('What would you do if...', no code)"};
  if(qn===4)return{instr:"a DEEP-DIVE SCENARIO question on a DIFFERENT area than the previous one (no code)"};
  return{coding:true,instr:"a CODING problem — ask the candidate to write a function/script"};
}
// Store an asked question's text so the same resume never gets it again (30-day memory).
async function storeAsked(rh,tier,raw){
  if(!kvReady()||!rh||!raw)return;
  try{var t=String(raw).replace(/```json/g,"").replace(/```/g,"");var m=t.match(/"question"\s*:\s*"((?:[^"\\]|\\.)*)"/);if(!m)return;
    var q=m[1].slice(0,160);if(!q||/INTERVIEW_COMPLETE/i.test(q))return;
    var key="asked:"+rh+":"+tier;await kvSAdd(key,q);await kvExpire(key,30*24*3600);}catch(e){}
}
function getProviders(){var p=[],k;k=pickKey(process.env.GROQ_API_KEY);if(k)p.push({name:"groq",url:"https://api.groq.com/openai/v1/chat/completions",key:k,model:"llama-3.3-70b-versatile"});k=pickKey(process.env.GEMINI_API_KEY);if(k)p.push({name:"gemini",url:"https://generativelanguage.googleapis.com/v1beta",key:k,model:"gemini-2.5-flash",format:"gemini"});k=pickKey(process.env.OPENROUTER_API_KEY);if(k)p.push({name:"openrouter",url:"https://openrouter.ai/api/v1/chat/completions",key:k,model:"meta-llama/llama-3.3-70b-instruct:free"});return p}
async function callAIStream(prov,msgs,onChunk){
  var h={"Content-Type":"application/json","Authorization":"Bearer "+prov.key};
  if(prov.name==="openrouter"){h["HTTP-Referer"]="https://zapkitt.com";h["X-Title"]="ZapKitt"}
  var r=await fetch(prov.url,{method:"POST",headers:h,body:JSON.stringify({model:prov.model,messages:msgs,max_tokens:1500,temperature:0.7,stream:true})});
  if(!r.ok||!r.body||!r.body.getReader)throw new Error(prov.name+" "+r.status);
  var reader=r.body.getReader(),dec=new TextDecoder(),buf="",got=false;
  for(;;){var rd=await reader.read();if(rd.done)break;buf+=dec.decode(rd.value,{stream:true});
    var lines=buf.split("\n");buf=lines.pop();
    for(var i=0;i<lines.length;i++){var line=lines[i].trim();if(line.indexOf("data:")!==0)continue;var pl=line.slice(5).trim();if(!pl||pl==="[DONE]")continue;
      try{var j=JSON.parse(pl);var dc=j.choices&&j.choices[0]&&j.choices[0].delta&&j.choices[0].delta.content;if(dc){got=true;onChunk(dc)}}catch(e){}}}
  if(!got)throw new Error(prov.name+" empty stream");
  return true}
async function callAI(prov,msgs,maxTok){maxTok=maxTok||1500;if(prov.format==="gemini"){var gm=msgs.filter(function(m){return m.role!=="system"}).map(function(m){return{role:m.role==="assistant"?"model":"user",parts:[{text:m.content}]}});var sys=msgs.find(function(m){return m.role==="system"});var body={contents:gm,generationConfig:{maxOutputTokens:maxTok,temperature:0.7}};if(sys)body.systemInstruction={parts:[{text:sys.content}]};var r=await fetch(prov.url+"/models/"+prov.model+":generateContent?key="+prov.key,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});if(!r.ok)throw new Error("Gemini "+r.status);var d=await r.json();return d.candidates[0].content.parts[0].text}else{var h={"Content-Type":"application/json","Authorization":"Bearer "+prov.key};if(prov.name==="openrouter"){h["HTTP-Referer"]="https://zapkitt.com";h["X-Title"]="ZapKitt"}var r2=await fetch(prov.url,{method:"POST",headers:h,body:JSON.stringify({model:prov.model,messages:msgs,max_tokens:maxTok,temperature:0.7})});if(!r2.ok)throw new Error(prov.name+" "+r2.status);var d2=await r2.json();return d2.choices[0].message.content}}

export default async function handler(req,res){
  const origins=["https://zapkitt.com","https://www.zapkitt.com"];const o=req.headers.origin||"";
  res.setHeader("Access-Control-Allow-Origin",origins.includes(o)?o:origins[0]);
  res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");res.setHeader("Access-Control-Allow-Headers","Content-Type");
  if(req.method==="OPTIONS")return res.status(200).end();
  if(req.method!=="POST")return res.status(405).json({error:"POST only"});
  try{
    var b=req.body;
    
    // IP-based free trial (1/day) — exclude dev IP
    var userIP = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.connection.remoteAddress || '';
    userIP = userIP.split(',')[0].trim();
    var DEV_IPS = ['192.168.29.187']; // Dev IPs excluded from limit // Add your IP to exclude
    
    if(b.action==='checkLimit'){
      if(DEV_IPS.includes(userIP))return res.status(200).json({limited:false,dev:true});
      var today=new Date().toISOString().split('T')[0];
      var fp=(b.fp||'').replace(/[^a-zA-Z0-9]/g,'').slice(0,24); // browser fingerprint (optional, from client)
      var key='used:'+today+':'+userIP.replace(/[^a-zA-Z0-9]/g,'')+(fp?':'+fp:'');
      if(kvReady()){try{var uv=await kvGet(key);return res.status(200).json({limited:!!uv,ip:userIP.substring(0,8)+'...'})}catch(e){}}
      if(!global._zkUsage)global._zkUsage={};
      return res.status(200).json({limited:!!global._zkUsage[key],ip:userIP.substring(0,8)+'...'});
    }

    if(b.action==='recordUsage'){
      var today2=new Date().toISOString().split('T')[0];
      var fp2=(b.fp||'').replace(/[^a-zA-Z0-9]/g,'').slice(0,24);
      var key2='used:'+today2+':'+userIP.replace(/[^a-zA-Z0-9]/g,'')+(fp2?':'+fp2:'');
      if(kvReady()){try{await kvSetEx(key2,2*24*3600,'1');return res.status(200).json({recorded:true})}catch(e){}}
      if(!global._zkUsage)global._zkUsage={};
      global._zkUsage[key2]=true;
      Object.keys(global._zkUsage).forEach(function(k){if(k.indexOf(today2)<0)delete global._zkUsage[k]});
      return res.status(200).json({recorded:true});
    }
    
    if(b.action==='feedback'){
      var fbData={time:new Date().toISOString(),source:(b.source||b.tool||'AI Mock Interview'),rating:b.rating||0,text:b.text||'',name:b.name||'',phone:b.phone||'',email:b.email||'',role:b.role||'',company:b.company||'',score:b.score||0};
      console.log('=== INTERVIEW FEEDBACK ===');
      console.log('Name: '+(fbData.name||'Anonymous'));
      console.log('Phone: '+(fbData.phone||'Not provided'));
      console.log('Rating: '+fbData.rating+'/5');
      console.log('Role: '+fbData.role+' | Company: '+fbData.company);
      console.log('Interview Score: '+fbData.score+'%');
      console.log('Feedback: '+(fbData.text||'No text'));
      console.log('=========================');
      
      if(!global._zkFeedback)global._zkFeedback=[];
      global._zkFeedback.push(fbData);
      
      // Persist to Upstash so feedback survives serverless cold starts (admin dashboard reads this).
      if(kvReady()){try{await kvLPush('zk_feedback',JSON.stringify(fbData));await kvLTrim('zk_feedback',0,499)}catch(e){}}

      // Instant alert via Telegram (reliable — replaces CallMeBot).
      var tgMsg='ZapKitt Feedback\n'+
        'Source: '+fbData.source+'\n'+
        'Name: '+(fbData.name||'Anonymous')+'\n'+
        'Phone: '+(fbData.phone||'Not provided')+'\n'+
        (fbData.email?'Email: '+fbData.email+'\n':'')+
        'Rating: '+fbData.rating+'/5\n'+
        (fbData.role?'Role: '+fbData.role+' | Company: '+(fbData.company||'Any')+'\n':'')+
        (fbData.score?'Score: '+fbData.score+'%\n':'')+
        'Message: '+(fbData.text||'No text')+'\n'+
        new Date(fbData.time).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'});
      await sendTelegram(tgMsg);

      // Email notification backup (Web3Forms)
      if(process.env.WEB3FORMS_KEY){
        try{
          await fetch('https://api.web3forms.com/submit',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
              access_key:process.env.WEB3FORMS_KEY,
              subject:'ZapKitt Feedback - Rating '+fbData.rating+'/5',
              from_name:'ZapKitt Bot',
              message:'Rating: '+fbData.rating+'/5\nRole: '+fbData.role+'\nCompany: '+fbData.company+'\nScore: '+fbData.score+'%\nFeedback: '+(fbData.text||'None')
            })
          });
        }catch(emailErr){console.log('Email failed:',emailErr.message)}
      }
      
      return res.status(200).json({saved:true});
    }
    
    // Admin endpoint — prefer persistent Upstash list, fall back to in-memory.
    // Admin auth: fail CLOSED — if ADMIN_KEY is not configured, no admin access at all.
    if(b.action==='adminFeedback'&&adminOk(b.key)){
      if(kvReady()){try{var raw=await kvLRange('zk_feedback',0,499);var list=raw.map(function(x){try{return JSON.parse(x)}catch(e){return null}}).filter(Boolean);return res.status(200).json({feedback:list,count:list.length,store:'upstash'})}catch(e){}}
      return res.status(200).json({feedback:global._zkFeedback||[],count:(global._zkFeedback||[]).length,store:'memory'});
    }
    
    // Verify a Ko-fi payment and consume it (one-time) to unlock a paid round.
    // Admin: generate a FRESH single-use unlock code (from the secret /admin page).
    // Stored in Upstash, consumed on redeem — no fixed pool to manage or run out.
    if(b.action==="adminGenCode"){
      if(!adminOk(b.key))return res.status(403).json({error:"Invalid admin key"});
      if(!kvReady())return res.status(500).json({error:"Upstash not configured — set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN."});
      var gTier=b.tier==="r3"?"r3":"r2";
      var newCode=gTier.toUpperCase()+"-"+genCode(6);
      try{await kvSetEx("unlock:"+gTier+":"+newCode,30*24*3600,"1");return res.status(200).json({success:true,tier:gTier,code:newCode})}
      catch(e){return res.status(500).json({error:"Could not store code: "+e.message})}
    }

    if(b.action==="verifyUnlock"){
      var entered=String(b.email||"").trim();
      var vEmail=entered.toLowerCase();
      var vTier=b.tier==="r3"?"r3":"r2";
      // (1) Dev/test master key — unlocks any tier without paying. Remove env after testing.
      if(process.env.TEST_UNLOCK_KEY&&entered===process.env.TEST_UNLOCK_KEY)return res.status(200).json({unlocked:true,tier:vTier,test:true});
      // (1b) Admin-generated single-use code — valid in Upstash until redeemed, then deleted (consumed).
      //      A KV OUTAGE must not look like a bad code: a paying user would be told their
      //      code is wrong with no way forward. Surface it as an infrastructure error instead.
      if(entered&&kvReady()){
        try{
          var gk="unlock:"+vTier+":"+entered;
          var gv=await kvGet(gk);
          // Tombstone instead of delete: keeps a record so a second attempt gets a
          // clear "already used" instead of a confusing "code not recognised".
          if(gv==="used")return res.status(200).json({unlocked:false,error:"This code has already been used — each code works only once. Message us on WhatsApp and we'll send you a new one."});
          if(gv){await kvSetEx(gk,180*24*3600,"used");return res.status(200).json({unlocked:true,tier:vTier,generated:true})}
        }catch(kvErr){
          console.error("verifyUnlock KV error:",kvErr.message);
          return res.status(503).json({unlocked:false,error:"We couldn't verify your code right now (temporary issue on our side). Your payment is safe — please retry in a minute, or message us on WhatsApp and we'll unlock it manually."});
        }
      }
      // (2) Manual WhatsApp unlock codes. Env UNLOCK_CODES="r2:AB12CD,r3:EF34GH,r2:JK56LM".
      //     After a UPI payment you verify the screenshot on WhatsApp, then send the user one
      //     code for their tier. Tier is enforced (an r2 code can't unlock r3).
      //     SINGLE-USE: if Upstash is configured, each code redeems ONCE (leak-proof).
      //     Without Upstash it degrades to reusable membership (still works).
      if(entered&&process.env.UNLOCK_CODES){
        var okCodes=process.env.UNLOCK_CODES.split(",").map(function(x){return x.trim()});
        if(okCodes.indexOf(vTier+":"+entered)>=0){
          if(kvReady()){
            try{
              var usedKey="usedcode:"+vTier+":"+entered;
              var alreadyUsed=await kvGet(usedKey);
              if(alreadyUsed)return res.status(200).json({unlocked:false,error:"This code has already been used. Each code works once — please contact us on WhatsApp for a new one."});
              await kvSetEx(usedKey,180*24*3600,"1"); // mark redeemed (180-day record)
            }catch(e){ /* Upstash hiccup: never block a paying user — allow through */ }
          }
          return res.status(200).json({unlocked:true,tier:vTier,manual:true});
        }
      }
      // (3) Ko-fi auto path (optional — needs Upstash + KOFI_VERIFICATION_TOKEN).
      // Nothing above matched. Distinguish "typed nothing" from "code we don't know",
      // otherwise a paying user with a bad code is told to "enter your code" they just entered.
      if(!entered)return res.status(400).json({unlocked:false,error:"Enter your unlock code (from WhatsApp) or the email you paid with on Ko-fi."});
      if(vEmail.indexOf("@")<1)return res.status(200).json({unlocked:false,error:"That code wasn't recognised. Please double-check it, or message us on WhatsApp and we'll sort it out."});
      if(!kvReady())return res.status(200).json({unlocked:false,error:"That code wasn't recognised. Please enter the exact unlock code we sent you on WhatsApp."});
      try{
        var vKey="kofi:"+vEmail+":"+vTier;
        var vVal=await kvGet(vKey);
        if(!vVal)return res.status(200).json({unlocked:false,error:"No matching payment found yet. It can take up to a minute after paying — please wait and retry."});
        await kvDel(vKey); // consume: one payment = one round
        return res.status(200).json({unlocked:true,tier:vTier});
      }catch(ue){return res.status(200).json({unlocked:false,error:"Could not verify right now. Please retry."})}
    }

    // Rate limit the AI-heavy paths. The cheap actions (checkLimit, feedback,
    // verifyUnlock, adminGenCode) have already returned above.
    var ivRl=await rateLimit("interview:"+userIP,30,60); // interviews are chatty: 30/min
    if(!ivRl.ok)return res.status(429).json({error:"Too many requests. Please wait a moment and continue."});
    // Sanitise the free-text the client sends into prompts (resume/JD/answers).
    if(b.resume)b.resume=sanitizeText(b.resume,12000);
    if(b.answer)b.answer=sanitizeText(b.answer,6000);
    if(b.transcript)b.transcript=sanitizeText(b.transcript,20000);

    var providers=getProviders();
    if(!providers.length)return res.status(500).json({error:"No AI provider configured. Set GROQ_API_KEY (free at console.groq.com) or GEMINI_API_KEY in .env.local (and in Vercel for production), then restart the dev server."});

    // ============================================================
    // Interview Engine v2 — multi-prompt pipeline (additive; the old
    // 'ask'/'evaluate' actions still work untouched). State is held by
    // the client and sent each call, so this works with NO database.
    // ============================================================
    async function callAIJson(pr,maxTok){
      var errs=[];
      for(var i=0;i<providers.length;i++){
        try{var raw=await callAI(providers[i],[{role:"system",content:pr.system},{role:"user",content:pr.user}],maxTok||1200);
          return {data:extractJSON(raw),model:providers[i].name};}
        catch(e){errs.push(providers[i].name+": "+e.message);}
      }
      throw new Error(errs.join(" | ")||"all providers failed");
    }

    // Step 1+2: Resume Analyzer -> Interview Planner (run once at interview start).
    if(b.action==="v2_analyze"){
      var aTier=b.tier==="r2"?"r2":(b.tier==="r3"?"r3":"free");
      try{
        var an=await callAIJson(buildAnalyzerPrompt(b.resume||"",b.role||"",b.experience||""),1500);
        var pl=await callAIJson(buildPlannerPrompt(an.data,aTier,b.role||"",b.company||"",b.experience||""),1500);
        return res.status(200).json({success:true,analysis:an.data,plan:pl.data,tier:aTier,total:totalQuestions(aTier),level:(an.data&&an.data.seniority)||"intermediate"});
      }catch(e){return res.status(500).json({error:"Analyze failed: "+e.message});}
    }

    // Step 3/7: Question Generator (one question; no-repeat + adaptive difficulty).
    if(b.action==="v2_question"){
      var qTier=b.tier==="r2"?"r2":(b.tier==="r3"?"r3":"free");
      var qn=parseInt(b.qn)||1;
      var ctx={tier:qTier,qn:qn,type:b.followup?(b.type||slotType(qTier,qn)):slotType(qTier,qn),
        level:b.level||"intermediate",role:b.role||"",company:b.company||"",resume:b.resume||"",
        analysis:b.analysis||{},askedQuestions:Array.isArray(b.askedQuestions)?b.askedQuestions:[],
        weak:Array.isArray(b.weak)?b.weak:[],pending:Array.isArray(b.pending)?b.pending:[],
        followup:!!b.followup,lastAnswer:b.lastAnswer||""};
      try{var q=await callAIJson(buildQuestionPrompt(ctx),1000);return res.status(200).json({success:true,data:q.data});}
      catch(e){return res.status(500).json({error:"Question failed: "+e.message});}
    }

    // Step 5+6: Answer Evaluator (0-10) + DETERMINISTIC Difficulty Manager decision.
    if(b.action==="v2_evaluate_answer"){
      try{
        var ev=await callAIJson(buildAnswerEvalPrompt(b.question||"",b.answer||"",b.role||""),1200);
        var s10=(ev.data&&isFinite(Number(ev.data.score)))?Number(ev.data.score):0;
        var next=difficultyDecision(b.level||"intermediate",s10*10); // eval score is 0-10 -> 0-100
        return res.status(200).json({success:true,evaluation:ev.data,next:next});
      }catch(e){return res.status(500).json({error:"Evaluate answer failed: "+e.message});}
    }

    // Step 8+9: Final Report (aggregate + 30-day learning plan).
    if(b.action==="v2_report"){
      var rqas=Array.isArray(b.qas)?b.qas.filter(function(x){return x&&x.q}):[];
      try{var rep=await callAIJson(buildReportPrompt({role:b.role||"",company:b.company||""},rqas),6000);
        // The model judges; the arithmetic is ours. See reconcileReport.
        return res.status(200).json({success:true,data:reconcileReport(rep.data,rqas)});}
      catch(e){return res.status(500).json({error:"Report failed: "+e.message});}
    }

    if(b.action==="evaluate"){
      // Prefer the structured Q&A pairs (exact question + exact answer) — no reconstruction, no missed questions.
      var qas=Array.isArray(b.qas)?b.qas.filter(function(x){return x&&x.q}):[];
      var evalRole=b.role||"the role",evalCo=b.company?" at "+b.company:"";
      var evalSys="You are a strict senior interviewer"+evalCo+" evaluating a candidate for "+evalRole+".\n\n";
      if(qas.length){
        evalSys+="You MUST evaluate EXACTLY these "+qas.length+" question-answer pairs, in order. Do not skip, merge, or invent any.\n\n";
        for(var qi=0;qi<qas.length;qi++){
          var aTxt=(qas[qi].a&&String(qas[qi].a).trim())?qas[qi].a:"[No answer given]";
          evalSys+="Q"+(qi+1)+": "+qas[qi].q+"\nCANDIDATE ANSWER "+(qi+1)+": "+aTxt+"\n\n";
        }
      }else{
        evalSys+="INTERVIEW TRANSCRIPT:\n"+(b.transcript||"")+"\n\n";
      }
      evalSys+='Return ONLY valid JSON with the "questions" array containing EXACTLY '+(qas.length||5)+' objects, one per question above, in the same order:\n';
      evalSys+='{"overall_score":78,"overall_verdict":"Strong Hire/Hire/Lean Hire/No Hire","categories":{"technical":70,"production_thinking":68,"problem_solving":72,"communication":80,"resume_knowledge":65,"confidence":70},"questions":[{"q":"the exact question","answer":"the candidate\'s exact answer (verbatim, or [No answer given])","score":7,"mistakes":"specifically what was missing or wrong; if no answer, say so","ideal_answer":"the exact, correct answer a strong candidate would give","how_to_improve":"one concrete, actionable tip"}],"strong_areas":["..."],"weak_areas":["..."],"practice_topics":["..."],"hiring_readiness":"Ready/Needs Work/Not Ready"}\n';
      evalSys+="SCORING RULES: Score each answer 0-10 honestly against what the question actually asked. [No answer given] or empty/irrelevant answers MUST score 0-1. Vague answers 2-4. Solid answers 6-8. Excellent, specific, metric-backed answers 9-10. Never inflate.\n";
      evalSys+="Judge each category (0-100) honestly and independently. Do NOT compute overall_score yourself — set it to 0. The server computes it from your category scores using fixed weights (technical 35%, production_thinking 20%, problem_solving 15%, communication 10%, resume_knowledge 10%, confidence 10%) and derives the verdict band from it.\n";
      evalSys+="IDEAL ANSWER RULES: For coding questions, ideal_answer MUST include complete working code. For technical/scenario questions, give the concrete correct answer with specific tools, commands, and architecture — like a real senior engineer. Keep each ideal_answer focused, not padded.";
      var evalMsgs=[{role:"system",content:evalSys},{role:"user",content:"Evaluate now. Output ONLY the JSON object, nothing else."}];
      var evalErr="";
      for(var i=0;i<providers.length;i++){try{var t=await callAI(providers[i],evalMsgs,6000);t=t.replace(/```json/g,"").replace(/```/g,"").trim();var j1=t.indexOf("{"),j2=t.lastIndexOf("}");if(j1>=0&&j2>j1)t=t.substring(j1,j2+1);var parsed;try{parsed=JSON.parse(t)}catch(pe){
          // Try to fix common JSON issues (control chars, trailing commas)
          t=t.replace(/[\x00-\x1f]/g,' ').replace(/,\s*}/g,'}').replace(/,\s*]/g,']');
          try{parsed=JSON.parse(t)}catch(pe2){continue}}
        // Safety net: if the model returned fewer question objects than asked, backfill from the exact pairs so nothing is missed.
        if(qas.length){if(!Array.isArray(parsed.questions))parsed.questions=[];
          for(var qk=0;qk<qas.length;qk++){if(!parsed.questions[qk])parsed.questions[qk]={q:qas[qk].q,answer:qas[qk].a||"[No answer given]",score:0,mistakes:"Not evaluated",ideal_answer:"",how_to_improve:""};
            else{if(!parsed.questions[qk].q)parsed.questions[qk].q=qas[qk].q;if(parsed.questions[qk].answer===undefined)parsed.questions[qk].answer=qas[qk].a||"";}}
          parsed.questions=parsed.questions.slice(0,qas.length);}
        // Recompute the headline score from the categories rather than trusting
        // the model's arithmetic, and derive the verdict band from it.
        return res.status(200).json({success:true,data:reconcileReport(parsed,qas)})}catch(e){evalErr=e.message;continue}}
      return res.status(500).json({error:"Evaluation failed"+(evalErr?": "+evalErr:". Please try again.")});
    }

    var resume=b.resume||"",role=b.role||"Software Engineer",company=b.company||"",difficulty=b.difficulty||"intermediate";
    var questionNum=b.questionNum||1,totalQs=b.totalQs||5,transcript=b.transcript||"";
    var companyLine=company?"You are a warm, experienced human interviewer at "+company+".":"You are a warm, experienced human interviewer at a top MNC.";
    var diffLine={fresher:"fresher (0-2 yrs)",intermediate:"mid-level (2-5 yrs)",senior:"senior (5+ yrs)"}[difficulty]||"mid-level";

    var sys=companyLine+" Role: "+role+". Level: "+diffLine+".\n\nRESUME:\n"+resume+"\n\n";
    if(transcript)sys+="INTERVIEW SO FAR:\n"+transcript+"\n\n";

    var tier=b.tier==="r2"?"r2":(b.tier==="r3"?"r3":"free");
    var resumeHash=(b.resumeHash||"").replace(/[^a-z0-9]/gi,"").slice(0,32);
    var slot=slotFor(tier,questionNum);
    var roundName={free:"Free Screening (5 questions)",r2:"Round 2 — Technical + Scenario (25 questions)",r3:"Round 3 — Coding + Cross-Scenario + HR (30 questions)"}[tier];

    // Cross-session de-dup: fetch questions already asked to THIS resume in THIS round.
    var askedList=[];
    if(kvReady()&&resumeHash){try{askedList=await kvSMembers("asked:"+resumeHash+":"+tier)}catch(e){}}

    var allowFollowup=!!b.allowFollowup;
    var nextSlot=slotFor(tier,questionNum+1);

    sys+="ROUND: "+roundName+".\n\n";
    // Adaptive difficulty (v2): the client raises/keeps this level from per-answer scores.
    if(b.level)sys+="CURRENT DIFFICULTY LEVEL: "+b.level+" — calibrate this question's depth to that level (beginner = fundamentals, intermediate = applied, senior = trade-offs, architect = system design, expert = deep edge cases & production scale).\n";
    if(Array.isArray(b.weakTopics)&&b.weakTopics.length)sys+="The candidate has been weaker on: "+b.weakTopics.slice(-6).join(", ")+" — you may probe one of these areas more deeply (without repeating an exact earlier question).\n";
    sys+="\n";
    if(allowFollowup){
      sys+="YOU HAVE A CHOICE this turn. Read the candidate's last answer carefully like a real interviewer:\n";
      sys+='- If it was incomplete, vague, or they mentioned something specific worth digging into, ask ONE natural FOLLOW-UP on the SAME topic that references what they actually said. Set "followup":true and "type":"normal".\n';
      sys+='- If their answer was already clear and complete, briefly appreciate it, then ask the NEXT question which MUST be: '+nextSlot.instr+'. Set "followup":false and "type":"'+(nextSlot.coding?"coding":"normal")+'".\n\n';
    }else{
      sys+="This question (Q"+questionNum+" of "+totalQs+") MUST be: "+slot.instr+".\n";
      sys+='Set "followup":false and "type":"'+(slot.coding?"coding":"normal")+'".\n\n';
    }
    sys+="Base every question strictly on the resume, the job description, the candidate's experience, and "+(company||"a top MNC")+"'s engineering standards.\n";
    if(askedList&&askedList.length){
      sys+="\nALREADY ASKED to this candidate before — do NOT repeat any of these or a close variant; choose a different sub-topic:\n";
      askedList.slice(-40).forEach(function(x){sys+="- "+x+"\n"});
    }
    sys+="\nVARIETY (session seed "+(b.seed||0)+"): fresh session — avoid the most obvious/textbook phrasing; go one level deeper so repeated attempts never get identical questions.\n\n";
    sys+="INTERVIEWER STYLE — behave like a real, warm human recruiter (NOT a form):\n";
    sys+="1. In 'response', react naturally and SPECIFICALLY to what the candidate just said — reference a real detail from their answer (e.g. 'Got it — so at Infosys you owned the Selenium framework.'). If the resume shows their name, use their first name occasionally ('Thanks, Anil.'). Human touches like 'Take your time.' or 'That's a solid point.' are welcome. 1-2 sentences, warm. NO scoring.\n";
    sys+="2. Keep the question concise and conversational — spoken English, not a written exam.\n";
    sys+="3. NEVER repeat a topic already in the transcript or the ALREADY ASKED list.\n";
    sys+="4. If the answer is '[No Answer - Timeout]' or empty, gently say 'No problem, let's move on.' and continue (do NOT follow up).\n";
    sys+='5. Respond ONLY with JSON: {"response":"natural human reaction referencing their answer","question":"your question","type":"normal","followup":false}\n';

    var msgs=[{role:"system",content:sys}];
    if(questionNum===1){
      if(tier==="free")msgs.push({role:"user",content:"Start the interview warmly. Ask Q1 — invite them to tell you about themselves and walk through their resume. type normal, followup false. JSON only."});
      else msgs.push({role:"user",content:"Start this "+(tier==="r3"?"elite":"advanced")+" round. Ask Q1 following the pattern above. followup false. JSON only."});
    }
    else{msgs.push({role:"user",content:"The candidate just answered: \""+b.answer+"\"\n\nRespond as instructed — react to their ACTUAL answer, then "+(allowFollowup?"decide follow-up vs next question":"ask the required question")+". JSON only."})}

    // Streaming path — stream raw JSON tokens so the client can speak the acknowledgement early.
    if(b.stream){
      res.setHeader("Content-Type","text/plain; charset=utf-8");
      res.setHeader("Cache-Control","no-cache, no-transform");
      res.setHeader("X-Accel-Buffering","no");
      var sProvs=providers.filter(function(p){return p.format!=="gemini"});
      for(var si=0;si<sProvs.length;si++){var started={v:false},acc="";
        try{await callAIStream(sProvs[si],msgs,function(chunk){started.v=true;acc+=chunk;res.write(chunk)});await storeAsked(resumeHash,tier,acc);return res.end()}
        catch(e){if(started.v){await storeAsked(resumeHash,tier,acc);return res.end()}}}
      // No streamable provider produced output before writing — fall back to a full non-stream response.
      for(var fi=0;fi<providers.length;fi++){try{var full=await callAI(providers[fi],msgs);await storeAsked(resumeHash,tier,full);res.write(full);return res.end()}catch(e){}}
      res.write('{"response":"","question":"Could you walk me through a challenging problem you recently solved?"}');
      return res.end();
    }

    var askErr="";
    for(var pi=0;pi<providers.length;pi++){try{var text=await callAI(providers[pi],msgs);await storeAsked(resumeHash,tier,text);text=text.replace(/```json/g,"").replace(/```/g,"").trim();var j1=text.indexOf("{"),j2=text.lastIndexOf("}");if(j1>=0&&j2>j1)text=text.substring(j1,j2+1);return res.status(200).json({success:true,data:JSON.parse(text)})}catch(e){askErr=e.message;continue}}
    return res.status(500).json({error:"All providers failed"+(askErr?": "+askErr:"")});
  }catch(e){return res.status(500).json({error:e.message})}
}
