export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    const { prompt, system, max_tokens } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt required' });

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: system || 'You are a helpful writing assistant. Provide clear, professional output.' },
          { role: 'user', content: prompt }
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
