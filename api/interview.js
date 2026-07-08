function pickKey(env){if(!env)return null;var k=env.split(",").map(function(k){return k.trim()}).filter(Boolean);return k.length?k[Math.floor(Math.random()*k.length)]:null}
function getProviders(){var p=[],k;k=pickKey(process.env.GROQ_API_KEY);if(k)p.push({name:"groq",url:"https://api.groq.com/openai/v1/chat/completions",key:k,model:"llama-3.3-70b-versatile"});k=pickKey(process.env.GEMINI_API_KEY);if(k)p.push({name:"gemini",url:"https://generativelanguage.googleapis.com/v1beta",key:k,model:"gemini-2.5-flash",format:"gemini"});k=pickKey(process.env.OPENROUTER_API_KEY);if(k)p.push({name:"openrouter",url:"https://openrouter.ai/api/v1/chat/completions",key:k,model:"meta-llama/llama-3.3-70b-instruct:free"});return p}
async function callAI(prov,msgs){if(prov.format==="gemini"){var gm=msgs.filter(function(m){return m.role!=="system"}).map(function(m){return{role:m.role==="assistant"?"model":"user",parts:[{text:m.content}]}});var sys=msgs.find(function(m){return m.role==="system"});var body={contents:gm,generationConfig:{maxOutputTokens:1500,temperature:0.7}};if(sys)body.systemInstruction={parts:[{text:sys.content}]};var r=await fetch(prov.url+"/models/"+prov.model+":generateContent?key="+prov.key,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});if(!r.ok)throw new Error("Gemini "+r.status);var d=await r.json();return d.candidates[0].content.parts[0].text}else{var h={"Content-Type":"application/json","Authorization":"Bearer "+prov.key};if(prov.name==="openrouter"){h["HTTP-Referer"]="https://zapkitt.com";h["X-Title"]="ZapKitt"}var r2=await fetch(prov.url,{method:"POST",headers:h,body:JSON.stringify({model:prov.model,messages:msgs,max_tokens:1500,temperature:0.7})});if(!r2.ok)throw new Error(prov.name+" "+r2.status);var d2=await r2.json();return d2.choices[0].message.content}}

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
    var DEV_IPS = ['YOUR_IP_HERE']; // Add your IP to exclude
    
    if(b.action==='checkLimit'){
      if(DEV_IPS.includes(userIP))return res.status(200).json({limited:false,dev:true});
      var today=new Date().toISOString().split('T')[0];
      var key='usage_'+today+'_'+userIP.replace(/[^a-zA-Z0-9]/g,'');
      // Use global variable for in-memory tracking (resets on cold start)
      if(!global._zkUsage)global._zkUsage={};
      var used=!!global._zkUsage[key];
      return res.status(200).json({limited:used,ip:userIP.substring(0,8)+'...'});
    }
    
    if(b.action==='recordUsage'){
      var today2=new Date().toISOString().split('T')[0];
      var key2='usage_'+today2+'_'+userIP.replace(/[^a-zA-Z0-9]/g,'');
      if(!global._zkUsage)global._zkUsage={};
      global._zkUsage[key2]=true;
      // Clean old entries (keep only today)
      Object.keys(global._zkUsage).forEach(function(k){if(!k.includes(today2))delete global._zkUsage[k]});
      return res.status(200).json({recorded:true});
    }
    
    var providers=getProviders();
    if(!providers.length)return res.status(500).json({error:"No AI provider"});

    if(b.action==="evaluate"){
      var evalSys="You are an expert interview evaluator. Analyze this interview transcript.\n\nTRANSCRIPT:\n"+b.transcript+"\n\n";
      evalSys+='Respond ONLY in JSON:\n{"overall_score":78,"overall_verdict":"Pass/Fail/Strong Hire","categories":{"technical":70,"communication":80,"confidence":65,"star_format":50,"problem_solving":75},"questions":[{"q":"question","answer":"candidate answer","score":7,"mistakes":"what went wrong specifically","ideal_answer":"the EXACT technical answer a strong candidate would give - include specific tools, commands, architecture details, code snippets where relevant","how_to_improve":"actionable tip"}],"strong_areas":["area1"],"weak_areas":["area1"],"practice_topics":["topic1"],"hiring_readiness":"Ready/Needs Work/Not Ready"}\n';
      evalSys+="IMPORTANT: For coding questions, ideal_answer MUST include actual working code. For other questions, ideal_answer must be DETAILED and TECHNICAL - like a real senior engineer would answer. Include specific tool names, commands, architecture patterns, code examples.";
      var evalMsgs=[{role:"system",content:evalSys},{role:"user",content:"Evaluate this interview. JSON only."}];
      for(var i=0;i<providers.length;i++){try{var t=await callAI(providers[i],evalMsgs);t=t.replace(/```json/g,"").replace(/```/g,"").trim();var j1=t.indexOf("{"),j2=t.lastIndexOf("}");if(j1>=0&&j2>j1)t=t.substring(j1,j2+1);var parsed;try{parsed=JSON.parse(t)}catch(pe){
          // Try to fix common JSON issues
          t=t.replace(/[\x00-\x1f]/g,' ').replace(/,\s*}/g,'}').replace(/,\s*]/g,']');
          try{parsed=JSON.parse(t)}catch(pe2){continue}}
        return res.status(200).json({success:true,data:parsed})}catch(e){continue}}
      return res.status(500).json({error:"Evaluation failed. Please try again."});
    }

    var resume=b.resume||"",role=b.role||"Software Engineer",company=b.company||"",difficulty=b.difficulty||"intermediate";
    var questionNum=b.questionNum||1,totalQs=b.totalQs||5,transcript=b.transcript||"";
    var companyLine=company?"You are a "+company+" interviewer.":"You are a professional MNC interviewer.";
    var diffLine={fresher:"fresher (0-2 yrs)",intermediate:"mid-level (2-5 yrs)",senior:"senior (5+ yrs)"}[difficulty]||"mid-level";

    var sys=companyLine+" Role: "+role+". Level: "+diffLine+".\n\nRESUME:\n"+resume+"\n\n";
    if(transcript)sys+="INTERVIEW SO FAR:\n"+transcript+"\n\n";

    sys+="STRICT QUESTION PATTERN (5 Questions):\n";
    sys+="Q1: INTRODUCTION - Greet and ask 'Tell me about yourself and walk me through your resume'\n";
    sys+="Q2: TECHNICAL THEORY - Ask about ONE specific technology from resume. Deep conceptual question. NO code writing.\n";
    sys+="Q3: SCENARIO - Production situation. 'What would you do if...' NO code. Example: 'Users report 500 errors after deployment. How do you debug?'\n";
    sys+="Q4: SCENARIO - Behavioral/team situation. 'Tell me about a time when...' NO code. Different topic than Q3.\n";
    sys+="Q5: CODING ONLY - Give ONE coding problem. 'Write a function/script to...' This is the ONLY coding question.\n";
    sys+="CRITICAL: Q3 and Q4 must NOT be coding questions. They are scenario/behavioral ONLY. ONLY Q5 asks for code.\n\n";
    sys+="ABSOLUTE RULES:\n";
    sys+="1. Question "+questionNum+" of "+totalQs+"\n";
    sys+="2. NEVER repeat a question topic. Check transcript - if CI/CD was asked, ask about Kubernetes. If K8s was asked, ask about Terraform. Cover ALL technologies.\n";
    sys+="3. NO feedback/scoring between questions. Brief acknowledge only.\n";
    sys+="4. If answer is '[No Answer - Timeout]', skip silently to next question.\n";
    sys+="5. If questionNum > totalQs, set question to 'INTERVIEW_COMPLETE'.\n";
    sys+='6. Respond ONLY: {"response":"brief acknowledge","question":"your question"}\n';

    var msgs=[{role:"system",content:sys}];
    if(questionNum===1){msgs.push({role:"user",content:"Start. Ask Q1 (Tell me about yourself). JSON only."})}
    else{msgs.push({role:"user",content:"Answer: "+b.answer+"\n\nAcknowledge briefly, ask Q"+questionNum+" following STRICT PATTERN. DIFFERENT technology than previous. JSON only."})}

    for(var pi=0;pi<providers.length;pi++){try{var text=await callAI(providers[pi],msgs);text=text.replace(/```json/g,"").replace(/```/g,"").trim();var j1=text.indexOf("{"),j2=text.lastIndexOf("}");if(j1>=0&&j2>j1)text=text.substring(j1,j2+1);return res.status(200).json({success:true,data:JSON.parse(text)})}catch(e){continue}}
    return res.status(500).json({error:"All providers failed"});
  }catch(e){return res.status(500).json({error:e.message})}
}
