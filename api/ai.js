// Simple in-memory rate limiter (per IP, resets on cold start)
const rateMap = new Map();
const RATE_LIMIT = 30; // max requests per IP per minute
const RATE_WINDOW = 60 * 1000; // 1 minute

function checkRate(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW) {
    rateMap.set(ip, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT;
}

export default async function handler(req, res) {
  // CORS — restrict to our domain only
  const allowedOrigins = [
    'https://ai-tools-mauve-six.vercel.app',
    'https://fixpilot.tools'
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
    return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
  }

  // Block requests without valid Referer (basic abuse protection)
  const referer = req.headers.referer || req.headers.referrer || '';
  const validReferers = ['ai-tools-mauve-six.vercel.app', 'fixpilot.tools', 'localhost'];
  const isValidReferer = validReferers.some(d => referer.includes(d));
  if (!isValidReferer && origin && !allowedOrigins.includes(origin)) {
    return res.status(403).json({ error: 'Unauthorized origin' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    const { prompt, system, max_tokens } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt required' });

    // Cap prompt length to prevent token abuse
    const safePrompt = typeof prompt === 'string' ? prompt.slice(0, 6000) : String(prompt).slice(0, 6000);
    const safeSystem = system ? String(system).slice(0, 1000) : 'You are a helpful writing assistant. Provide clear, professional output.';

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
        max_tokens: max_tokens || 1024,
        temperature: 0.7
      })
    });

    const data = await response.json();

    if (data.choices && data.choices[0]) {
      return res.status(200).json({
        result: data.choices[0].message.content,
        model: 'llama-3.3-70b'
      });
    } else {
      return res.status(500).json({ error: data.error?.message || 'AI generation failed' });
    }
  } catch (e) {
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
}
