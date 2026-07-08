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
    var b=req.body,providers=getProviders();
    if(!providers.length)return res.status(500).json({error:"No AI provider"});

    if(b.action==="evaluate"){
      var evalSys="You are an expert interview evaluator. Analyze this interview transcript.\n\nTRANSCRIPT:\n"+b.transcript+"\n\n";
      evalSys+='Respond ONLY in JSON:\n{"overall_score":78,"overall_verdict":"Pass/Fail/Strong Hire","categories":{"technical":70,"communication":80,"confidence":65,"star_format":50,"problem_solving":75},"questions":[{"q":"question","answer":"candidate answer","score":7,"mistakes":"what went wrong specifically","ideal_answer":"the EXACT technical answer a strong candidate would give - include specific tools, commands, architecture details, code snippets where relevant","how_to_improve":"actionable tip"}],"strong_areas":["area1"],"weak_areas":["area1"],"practice_topics":["topic1"],"hiring_readiness":"Ready/Needs Work/Not Ready"}\n';
      evalSys+="IMPORTANT: For coding questions, ideal_answer MUST include actual working code. For other questions, ideal_answer must be DETAILED and TECHNICAL - like a real senior engineer would answer. Include specific tool names, commands, architecture patterns, code examples.";
      var evalMsgs=[{role:"system",content:evalSys},{role:"user",content:"Evaluate this interview. JSON only."}];
      for(var i=0;i<providers.length;i++){try{var t=await callAI(providers[i],evalMsgs);t=t.replace(/```json/g,"").replace(/```/g,"").trim();var j1=t.indexOf("{"),j2=t.lastIndexOf("}");if(j1>=0&&j2>j1)t=t.substring(j1,j2+1);return res.status(200).json({success:true,data:JSON.parse(t)})}catch(e){continue}}
      return res.status(500).json({error:"Eval failed"});
    }

    var resume=b.resume||"",role=b.role||"Software Engineer",company=b.company||"",difficulty=b.difficulty||"intermediate";
    var questionNum=b.questionNum||1,totalQs=b.totalQs||5,transcript=b.transcript||"";
    var companyLine=company?"You are a "+company+" interviewer.":"You are a professional MNC interviewer.";
    var diffLine={fresher:"fresher (0-2 yrs)",intermediate:"mid-level (2-5 yrs)",senior:"senior (5+ yrs)"}[difficulty]||"mid-level";

    var sys=companyLine+" Role: "+role+". Level: "+diffLine+".\n\nRESUME:\n"+resume+"\n\n";
    if(transcript)sys+="INTERVIEW SO FAR:\n"+transcript+"\n\n";

    sys+="STRICT QUESTION PATTERNS:\n\n";
    sys+="=== ROUND 1 (FREE - 5 Questions) ===\n";
    sys+="Q1: INTRODUCTION - 'Hi, Good morning! I am your AI Interview Assistant. Please introduce yourself and walk me through your experience.'\n";
    sys+="Q2: TECHNICAL DEEP DIVE - Pick ONE specific technology from resume (NOT the most obvious one). Ask a deep, unique question that real interviewers at top MNCs ask. Cover: cloud services, containers, IaC, monitoring, security, databases, or programming.\n";
    sys+="Q3: SCENARIO - Real-world production scenario. 'Your Kubernetes cluster is experiencing OOM kills at 3am...' or 'A Terraform apply destroyed production resources...' Make it realistic and specific to their experience.\n";
    sys+="Q4: SCENARIO - Different real-time challenge. 'Your CI/CD pipeline is taking 45 minutes. How would you optimize it?' or 'A security vulnerability was found in production. Walk me through your incident response.' MUST be different topic than Q3.\n";
    sys+="Q5: CODING (MANDATORY) - Give a specific coding problem. 'Write a shell script that...' or 'Write a Python function to...' or 'Write a Terraform module for...' Based on resume stack. Candidate will write actual code.\n\n";
    sys+="=== ROUND 2 (PAID Rs.9/$2 - 25 Questions) ===\n";
    sys+="Real-time scenario + technical, based on resume/JD, company standards, experience level:\n";
    sys+="Q6-Q10: Advanced technical questions (each on DIFFERENT technology from resume)\n";
    sys+="Q11-Q15: Real-time production scenarios (deployments, outages, scaling)\n";
    sys+="Q16-Q20: Architecture and system design (HLD/LLD based on experience)\n";
    sys+="Q21-Q25: Advanced troubleshooting and cross-technology integration\n\n";
    sys+="=== ROUND 3 (PAID Rs.29/$5 - 25 Questions) ===\n";
    sys+="Q26-Q35: CODING questions (10) - actual programming problems, scripts, automation\n";
    sys+="Q36-Q45: SCENARIO questions (10) - complex multi-system failure scenarios\n";
    sys+="Q46-Q50: HR questions (5) - leadership, conflict, career goals, salary negotiation\n\n";

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
