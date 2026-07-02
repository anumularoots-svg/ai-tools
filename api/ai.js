// ============================================
// ZapKitt AI API — Secured & Production-Ready
// ============================================

// Rate limiter (in-memory, works per serverless instance)
// Note: For high traffic, migrate to Upstash Redis
const rateMap = new Map();
const RATE_LIMIT = 20; // max requests per IP per minute
const RATE_WINDOW = 60 * 1000;
const DAILY_LIMIT = 200; // max requests per IP per day
const dailyMap = new Map();

function checkRate(ip) {
  const now = Date.now();
  
  // Per-minute check
  const entry = rateMap.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW) {
    rateMap.set(ip, { start: now, count: 1 });
  } else {
    entry.count++;
    if (entry.count > RATE_LIMIT) return false;
  }
  
  // Per-day check
  const today = new Date().toDateString();
  const dailyKey = `${ip}_${today}`;
  const daily = dailyMap.get(dailyKey);
  if (!daily) {
    dailyMap.set(dailyKey, 1);
  } else {
    if (daily >= DAILY_LIMIT) return false;
    dailyMap.set(dailyKey, daily + 1);
  }
  
  // Cleanup old daily entries (prevent memory leak)
  if (dailyMap.size > 10000) {
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    for (const [key] of dailyMap) {
      if (key.includes(yesterday)) dailyMap.delete(key);
    }
  }
  
  return true;
}

// Input sanitization — prevent prompt injection
function sanitizeInput(text, maxLen) {
  if (!text || typeof text !== 'string') return '';
  
  // Remove control characters except newlines and tabs
  let clean = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // Remove potential prompt injection patterns
  clean = clean.replace(/\[INST\]|\[\/INST\]|<<SYS>>|<\/SYS>>/gi, '');
  clean = clean.replace(/system:\s*you are/gi, '');
  clean = clean.replace(/ignore previous instructions/gi, '');
  clean = clean.replace(/ignore all instructions/gi, '');
  clean = clean.replace(/disregard.*instructions/gi, '');
  
  // Truncate to max length
  return clean.slice(0, maxLen);
}

export default async function handler(req, res) {
  // CORS — restrict to our domain only
  const allowedOrigins = [
    'https://zapkitt.com',
    'https://www.zapkitt.com'
  ];
  const origin = req.headers.origin || '';
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigins[0]);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Rate limiting
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (!checkRate(clientIp)) {
    return res.status(429).json({ error: 'Too many requests. Please wait and try again.' });
  }

  // Block requests without valid origin/referer
  const referer = req.headers.referer || req.headers.referrer || '';
  const validReferers = ['zapkitt.com', 'localhost'];
  const isValidReferer = validReferers.some(d => referer.includes(d));
  if (!isValidReferer && origin && !allowedOrigins.includes(origin)) {
    return res.status(403).json({ error: 'Unauthorized origin' });
  }

  // Block empty user-agent (likely bots)
  const ua = req.headers['user-agent'] || '';
  if (!ua || ua.length < 10) {
    return res.status(403).json({ error: 'Invalid request' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    const { prompt, system, max_tokens } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt required' });

    // Sanitize inputs
    const safePrompt = sanitizeInput(prompt, 6000);
    const safeSystem = system 
      ? sanitizeInput(system, 1000) 
      : 'You are a helpful writing assistant. Provide clear, professional output.';

    if (safePrompt.length < 3) {
      return res.status(400).json({ error: 'Prompt too short' });
    }

    // Cap max_tokens
    const safeMaxTokens = Math.min(Math.max(parseInt(max_tokens) || 1024, 100), 2048);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: safeSystem },
          { role: 'user', content: safePrompt }
        ],
        max_tokens: safeMaxTokens,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      if (response.status === 429) {
        return res.status(429).json({ error: 'AI service is busy. Please try again in a moment.' });
      }
      return res.status(500).json({ error: errData?.error?.message || 'AI generation failed. Please try again.' });
    }

    const data = await response.json();

    if (data.choices && data.choices[0]) {
      return res.status(200).json({
        result: data.choices[0].message.content,
        model: 'llama-3.3-70b'
      });
    } else {
      return res.status(500).json({ error: 'AI generation failed. Please try again.' });
    }
  } catch (e) {
    console.error('AI API Error:', e.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
