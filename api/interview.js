// ZapKitt AI Mock Interview API — Phase 1
// Conversational interviewer: follows up on answers like a real interviewer

function pickKey(env) {
  if (!env) return null;
  var keys = env.split(",").map(function(k){return k.trim()}).filter(Boolean);
  return keys.length ? keys[Math.floor(Math.random()*keys.length)] : null;
}

function getProviders() {
  var p = [], k;
  k = pickKey(process.env.GROQ_API_KEY);
  if (k) p.push({name:"groq",url:"https://api.groq.com/openai/v1/chat/completions",key:k,model:"llama-3.3-70b-versatile",format:"openai"});
  k = pickKey(process.env.GEMINI_API_KEY);
  if (k) p.push({name:"gemini",url:"https://generativelanguage.googleapis.com/v1beta",key:k,model:"gemini-2.5-flash",format:"gemini"});
  k = pickKey(process.env.OPENROUTER_API_KEY);
  if (k) p.push({name:"openrouter",url:"https://openrouter.ai/api/v1/chat/completions",key:k,model:"meta-llama/llama-3.3-70b-instruct:free",format:"openai"});
  return p;
}

async function callAI(prov, msgs) {
  if (prov.format === "gemini") {
    var gm = msgs.filter(function(m){return m.role!=="system"}).map(function(m){return {role:m.role==="assistant"?"model":"user",parts:[{text:m.content}]}});
    var sys = msgs.find(function(m){return m.role==="system"});
    var body = {contents:gm,generationConfig:{maxOutputTokens:1500,temperature:0.75}};
    if (sys) body.systemInstruction = {parts:[{text:sys.content}]};
    var r = await fetch(prov.url+"/models/"+prov.model+":generateContent?key="+prov.key,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    if (!r.ok) throw new Error(r.status);
    var d = await r.json(); return d.candidates[0].content.parts[0].text;
  } else {
    var h = {"Content-Type":"application/json","Authorization":"Bearer "+prov.key};
    if (prov.name==="openrouter"){h["HTTP-Referer"]="https://zapkitt.com";h["X-Title"]="ZapKitt"}
    var r2 = await fetch(prov.url,{method:"POST",headers:h,body:JSON.stringify({model:prov.model,messages:msgs,max_tokens:1500,temperature:0.75})});
    if (!r2.ok) throw new Error(r2.status);
    var d2 = await r2.json(); return d2.choices[0].message.content;
  }
}

module.exports = async function(req, res) {
  if (req.method==="OPTIONS"){res.setHeader("Access-Control-Allow-Origin","*");res.setHeader("Access-Control-Allow-Methods","POST");res.setHeader("Access-Control-Allow-Headers","Content-Type");return res.status(200).end()}
  if (req.method!=="POST") return res.status(405).json({error:"POST only"});

  try {
    var b = req.body;
    var providers = getProviders();
    if (!providers.length) return res.status(500).json({error:"No AI provider"});

    var resume = b.resume||"";
    var role = b.role||"Software Engineer";
    var company = b.company||"";
    var difficulty = b.difficulty||"intermediate";
    var round = b.round||"mixed";
    var questionNum = b.questionNum||1;
    var totalQs = b.totalQs||5;
    var history = b.history||[];
    var action = b.action||"start";

    var companyLine = company ? "You are a "+company+" interviewer. Match "+company+"'s known interview style and culture." : "You are a professional interviewer.";
    var diffLine = {fresher:"Entry-level (0-2 yrs). Ask foundational questions.",intermediate:"Mid-level (2-5 yrs). Mix conceptual and practical.",senior:"Senior (5+ yrs). Ask architecture, leadership, deep technical."}[difficulty]||"";

    var sys = companyLine+"\n";
    sys += "You are conducting a REAL mock interview for: "+role+"\n";
    sys += "Difficulty: "+diffLine+"\n\n";
    sys += "CANDIDATE RESUME:\n"+resume+"\n\n";
    sys += "CRITICAL RULES:\n";
    sys += "1. This is question "+questionNum+" of "+totalQs+".\n";
    sys += "2. BEHAVE LIKE A REAL INTERVIEWER — NOT a quiz bot.\n";
    sys += "3. After the candidate answers, FOLLOW UP on what they said. Dig deeper.\n";
    sys += "   Example flow:\n";
    sys += "   - Q1: 'Tell me about yourself'\n";
    sys += "   - User mentions SAP implementation\n";
    sys += "   - Q2: 'You mentioned SAP. What was the biggest challenge during that implementation?'\n";
    sys += "   - User says data migration\n";
    sys += "   - Q3: 'Which migration approach did you use? Why that one?'\n";
    sys += "   - Q4: 'If the client rejected that approach, what would you do differently?'\n";
    sys += "4. Mix question types naturally: start with 'tell me about yourself', then drill into resume details, then scenarios, then behavioral.\n";
    sys += "5. For question 1, always start with a warm intro and 'Tell me about yourself'.\n";
    sys += "6. EVALUATE every answer (except Q1 start) with detailed scores.\n";
    sys += "7. Show WHY marks were lost — be specific: 'Missing quantified impact', 'No STAR structure', 'Too vague'.\n";
    sys += "8. Show the IDEAL answer — what a perfect candidate would say.\n";
    sys += "9. If questionNum > totalQs, set question to 'INTERVIEW_COMPLETE' and provide overall summary.\n\n";
    sys += "RESPOND ONLY IN THIS JSON (no markdown, no backticks, no extra text):\n";
    sys += '{"question":"your question based on their previous answer","feedback":"detailed feedback on previous answer (empty for Q1)","scores":{"overall":0,"technical":0,"communication":0,"confidence":0,"star":0,"grammar":0},"why_lost":"specific reasons marks were deducted (empty for Q1)","ideal_answer":"what the perfect answer would be (empty for Q1)","tip":"one actionable improvement tip","category":"hr|technical|behavioral|scenario","is_followup":true}\n';
    sys += "Scores are 1-10. For Q1 (action=start), all scores=0, feedback/why_lost/ideal_answer=empty.\n";

    var messages = [{role:"system",content:sys}];

    if (action === "start") {
      messages.push({role:"user",content:"Start the interview. Introduce yourself"+(company?" as a "+company+" interviewer":"")+" and ask the first question. RESPOND ONLY IN JSON."});
    } else {
      // Add full conversation history for context (enables follow-ups)
      for (var i=0;i<history.length;i++) messages.push(history[i]);
      messages.push({role:"user",content:b.answer+"\n\nEvaluate my answer with scores (1-10 each: overall, technical, communication, confidence, star, grammar). Show why I lost marks. Show ideal answer. Then ask a FOLLOW-UP question based on what I just said (question "+questionNum+" of "+totalQs+"). RESPOND ONLY IN JSON."});
    }

    var lastErr = null;
    for (var pi=0;pi<providers.length;pi++) {
      try {
        var text = await callAI(providers[pi], messages);
        text = text.replace(/```json/g,"").replace(/```/g,"").trim();
        var j1=text.indexOf("{"),j2=text.lastIndexOf("}");
        if(j1>=0&&j2>j1) text=text.substring(j1,j2+1);
        var parsed = JSON.parse(text);
        return res.status(200).json({success:true,data:parsed});
      } catch(e){lastErr=e;continue}
    }
    return res.status(500).json({error:"All providers failed: "+(lastErr?lastErr.message:"")});
  } catch(e){return res.status(500).json({error:e.message})}
};
