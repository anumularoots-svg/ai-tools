// ZapKitt AI Mock Interview v3
// NO intermediate scoring. Contextual follow-ups. Report only at end.

function pickKey(env) {
  if (!env) return null;
  var keys = env.split(",").map(function(k){return k.trim()}).filter(Boolean);
  return keys.length ? keys[Math.floor(Math.random()*keys.length)] : null;
}
function getProviders() {
  var p = [], k;
  k = pickKey(process.env.GROQ_API_KEY);
  if (k) p.push({name:"groq",url:"https://api.groq.com/openai/v1/chat/completions",key:k,model:"llama-3.3-70b-versatile"});
  k = pickKey(process.env.GEMINI_API_KEY);
  if (k) p.push({name:"gemini",url:"https://generativelanguage.googleapis.com/v1beta",key:k,model:"gemini-2.5-flash",format:"gemini"});
  k = pickKey(process.env.OPENROUTER_API_KEY);
  if (k) p.push({name:"openrouter",url:"https://openrouter.ai/api/v1/chat/completions",key:k,model:"meta-llama/llama-3.3-70b-instruct:free"});
  return p;
}
async function callAI(prov, msgs) {
  if (prov.format === "gemini") {
    var gm = msgs.filter(function(m){return m.role!=="system"}).map(function(m){return {role:m.role==="assistant"?"model":"user",parts:[{text:m.content}]}});
    var sys = msgs.find(function(m){return m.role==="system"});
    var body = {contents:gm,generationConfig:{maxOutputTokens:1200,temperature:0.7}};
    if (sys) body.systemInstruction = {parts:[{text:sys.content}]};
    var r = await fetch(prov.url+"/models/"+prov.model+":generateContent?key="+prov.key,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    if (!r.ok) throw new Error("Gemini "+r.status);
    var d = await r.json(); return d.candidates[0].content.parts[0].text;
  } else {
    var h = {"Content-Type":"application/json","Authorization":"Bearer "+prov.key};
    if (prov.name==="openrouter"){h["HTTP-Referer"]="https://zapkitt.com";h["X-Title"]="ZapKitt"}
    var r2 = await fetch(prov.url,{method:"POST",headers:h,body:JSON.stringify({model:prov.model,messages:msgs,max_tokens:1200,temperature:0.7})});
    if (!r2.ok) throw new Error(prov.name+" "+r2.status);
    var d2 = await r2.json(); return d2.choices[0].message.content;
  }
}

export default async function handler(req, res) {
  const origins = ["https://zapkitt.com","https://www.zapkitt.com"];
  const o = req.headers.origin||"";
  res.setHeader("Access-Control-Allow-Origin", origins.includes(o)?o:origins[0]);
  res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  if (req.method==="OPTIONS") return res.status(200).end();
  if (req.method!=="POST") return res.status(405).json({error:"POST only"});

  try {
    var b = req.body;
    var providers = getProviders();
    if (!providers.length) return res.status(500).json({error:"No AI provider"});

    var action = b.action; // "ask" or "evaluate"

    if (action === "evaluate") {
      // FINAL EVALUATION - called only after all questions done
      var evalSys = "You are an expert interview evaluator. Analyze the following interview transcript and provide a detailed evaluation.\n\n";
      evalSys += "TRANSCRIPT:\n" + b.transcript + "\n\n";
      evalSys += "Respond ONLY in JSON:\n";
      evalSys += '{"overall_score":78,"overall_verdict":"Pass","categories":{"technical":70,"communication":80,"confidence":65,"star_format":50,"problem_solving":75},"questions":[{"q":"question text","answer":"candidate answer","score":7,"mistakes":"what went wrong","ideal_answer":"perfect answer","how_to_improve":"specific tip"}],"strong_areas":["area1"],"weak_areas":["area1"],"practice_topics":["topic1"],"hiring_readiness":"Ready / Needs Work / Not Ready"}\n';
      evalSys += "Score each question 1-10. Be honest and specific in feedback.";

      var evalMsgs = [{role:"system",content:evalSys},{role:"user",content:"Evaluate this interview. JSON only."}];
      var lastErr = null;
      for (var i=0;i<providers.length;i++){try{var t=await callAI(providers[i],evalMsgs);t=t.replace(/```json/g,"").replace(/```/g,"").trim();var j1=t.indexOf("{"),j2=t.lastIndexOf("}");if(j1>=0&&j2>j1)t=t.substring(j1,j2+1);return res.status(200).json({success:true,data:JSON.parse(t)})}catch(e){lastErr=e;continue}}
      return res.status(500).json({error:"Eval failed: "+(lastErr?lastErr.message:"")});
    }

    // ASK QUESTION - conversational interview
    var resume = b.resume||"";
    var role = b.role||"Software Engineer";
    var company = b.company||"";
    var difficulty = b.difficulty||"intermediate";
    var questionNum = b.questionNum||1;
    var totalQs = b.totalQs||5;
    var transcript = b.transcript||""; // plain text conversation so far

    var companyLine = company?"You are interviewing for "+company+". Match their style.":"";
    var diffLine = {fresher:"fresher (0-2 yrs)",intermediate:"mid-level (2-5 yrs)",senior:"senior (5+ yrs)"}[difficulty]||"mid-level";

    var sys = "You are a professional interviewer conducting a REAL interview for: "+role+". "+companyLine+" Level: "+diffLine+".\n\n";
    sys += "CANDIDATE RESUME:\n"+resume+"\n\n";
    if (transcript) sys += "INTERVIEW SO FAR:\n"+transcript+"\n\n";
    sys += "CRITICAL RULES:\n";
    sys += "1. Ask ONLY ONE question. Question "+questionNum+" of "+totalQs+".\n";
    sys += "2. DO NOT give feedback, score, or tell if answer is right/wrong.\n";
    sys += "3. Just say 'Thank you' or 'Interesting' briefly, then ask the NEXT question.\n";
    sys += "4. Each question MUST be DIFFERENT. Never repeat a question.\n";
    sys += "5. Follow up on what candidate said. Drill deeper into their resume.\n";
    sys += "6. Q1: 'Tell me about yourself'. Q2+: follow-up based on their answer.\n";
    sys += "7. Question flow: Q1 intro → Q2 resume tech → Q3 project scenario → Q4 problem solving → Q5 behavioral.\n";
    sys += "8. Respond ONLY in JSON: {\"response\":\"brief acknowledgment\",\"question\":\"your next question\"}\n";
    sys += "9. For Q1, response is your intro greeting.";

    var msgs = [{role:"system",content:sys},{role:"user",content:questionNum===1?"Start the interview. Ask question 1. JSON only.":"Candidate answered: "+b.answer+"\n\nBriefly acknowledge (DO NOT score/evaluate), then ask question "+questionNum+". JSON only."}];

    var lastErr2 = null;
    for (var pi=0;pi<providers.length;pi++){
      try{
        var text = await callAI(providers[pi],msgs);
        text=text.replace(/```json/g,"").replace(/```/g,"").trim();
        var j1=text.indexOf("{"),j2=text.lastIndexOf("}");
        if(j1>=0&&j2>j1)text=text.substring(j1,j2+1);
        return res.status(200).json({success:true,data:JSON.parse(text)});
      }catch(e){lastErr2=e;continue}
    }
    return res.status(500).json({error:"Failed: "+(lastErr2?lastErr2.message:"")});
  }catch(e){return res.status(500).json({error:e.message})}
}
