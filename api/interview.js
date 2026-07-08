// ZapKitt AI Mock Interview API
// Conversational interviewer with follow-up questions

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
    if (!r.ok) throw new Error("Gemini " + r.status);
    var d = await r.json(); return d.candidates[0].content.parts[0].text;
  } else {
    var h = {"Content-Type":"application/json","Authorization":"Bearer "+prov.key};
    if (prov.name==="openrouter"){h["HTTP-Referer"]="https://zapkitt.com";h["X-Title"]="ZapKitt"}
    var r2 = await fetch(prov.url,{method:"POST",headers:h,body:JSON.stringify({model:prov.model,messages:msgs,max_tokens:1500,temperature:0.75})});
    if (!r2.ok) throw new Error(prov.name + " " + r2.status);
    var d2 = await r2.json(); return d2.choices[0].message.content;
  }
}

export default async function handler(req, res) {
  const origins = ["https://zapkitt.com", "https://www.zapkitt.com"];
  const o = req.headers.origin || "";
  res.setHeader("Access-Control-Allow-Origin", origins.includes(o) ? o : origins[0]);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    var b = req.body;
    var providers = getProviders();
    if (!providers.length) return res.status(500).json({error:"No AI provider configured"});

    var resume = b.resume||"";
    var role = b.role||"Software Engineer";
    var company = b.company||"";
    var difficulty = b.difficulty||"intermediate";
    var questionNum = b.questionNum||1;
    var totalQs = b.totalQs||5;
    var history = b.history||[];
    var action = b.action||"start";

    var companyLine = company ? "You are a "+company+" interviewer. Match "+company+"'s interview style." : "You are a professional interviewer.";
    var diffLine = {fresher:"entry-level (0-2 yrs)",intermediate:"mid-level (2-5 yrs)",senior:"senior (5+ yrs)"}[difficulty]||"mid-level";

    var sys = companyLine + " Conducting a real mock interview for: " + role + ". Difficulty: " + diffLine + ".\n\n";
    sys += "RESUME:\n" + resume + "\n\n";
    sys += "RULES:\n";
    sys += "1. Question " + questionNum + " of " + totalQs + ".\n";
    sys += "2. BEHAVE LIKE A REAL INTERVIEWER. Follow up on what the candidate said.\n";
    sys += "3. Example: User mentions SAP → ask about SAP challenges → ask about migration approach → ask what-if scenarios.\n";
    sys += "4. Q1 is always 'Tell me about yourself' with warm intro.\n";
    sys += "5. Evaluate every answer with 6 scores (1-10 each).\n";
    sys += "6. Show WHY marks lost and IDEAL answer.\n";
    sys += "7. If questionNum > totalQs, set question to 'INTERVIEW_COMPLETE'.\n";
    sys += "8. RESPOND ONLY IN JSON:\n";
    sys += '{"question":"...","feedback":"...","scores":{"overall":0,"technical":0,"communication":0,"confidence":0,"star":0,"grammar":0},"why_lost":"...","ideal_answer":"...","tip":"...","is_followup":false}\n';
    sys += "9. For Q1: scores all 0, feedback/why_lost/ideal_answer empty.\n";

    var messages = [{role:"system",content:sys}];
    if (action === "start") {
      messages.push({role:"user",content:"Start interview. Ask question 1. JSON only."});
    } else {
      for (var i=0;i<history.length;i++) messages.push(history[i]);
      messages.push({role:"user",content:b.answer+"\n\nScore my answer (1-10 each: overall,technical,communication,confidence,star,grammar). Show why I lost marks. Show ideal answer. Then ask follow-up question "+questionNum+"/"+totalQs+". JSON only."});
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
    return res.status(500).json({error:"All providers failed: "+(lastErr?lastErr.message:"unknown")});
  } catch(e){return res.status(500).json({error:e.message})}
}
