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
      evalSys+="IMPORTANT: ideal_answer must be DETAILED and TECHNICAL - like a real senior engineer would answer. Include specific tool names, commands, architecture patterns, code examples.";
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

    sys+="STRICT QUESTION PATTERN FOR FREE ROUND (5 questions):\n";
    sys+="Q1: COMMON - 'Tell me about yourself and walk me through your resume'\n";
    sys+="Q2: TECHNICAL - Deep question on ONE specific technology from resume. NOT CI/CD. Pick from: cloud (AWS/Azure), containers (Docker/K8s), IaC (Terraform), monitoring (Prometheus/Grafana), security, databases, programming. Ask about a DIFFERENT tech than Q1 discussed.\n";
    sys+="Q3: SCENARIO - Real-world scenario based on their experience. 'Your production Kubernetes cluster has a memory leak...' or 'A deployment failed at 2am...' Make it realistic.\n";
    sys+="Q4: CODING/ARCHITECTURE - Ask them to explain how they would write a script, design a system, or solve a specific technical problem. E.g., 'Write a shell script to...' or 'Design the architecture for...'\n";
    sys+="Q5: BEHAVIORAL (STAR) - 'Tell me about a time when you had to deal with [conflict/deadline/failure]' based on their experience.\n\n";

    sys+="FOR PAID ROUND (Q6-Q25), distribute across ALL resume technologies:\n";
    sys+="Q6-Q10: Advanced technical (each DIFFERENT technology)\n";
    sys+="Q11-Q15: Real-time scenarios covering different tools/services\n";
    sys+="Q16-Q20: System design and architecture\n";
    sys+="Q21-Q25: Coding challenges and problem-solving\n\n";

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
