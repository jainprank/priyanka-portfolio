// Vapi custom voice server. Vapi POSTs { message: { type: "voice-request", text, sampleRate, ... } }
// and expects raw PCM (16-bit, mono, little-endian) at the same sampleRate in the response body.
// This forwards the text to Fish Audio, using your cloned voice model.
//
// Vercel environment variables (set in the project settings, never in this file):
//   FISH_API_KEY   your Fish Audio API key (required)
//   FISH_VOICE_ID  your cloned voice model ID (required)
//   FISH_MODEL     optional; defaults to s2.1-pro (try s2.1-pro-free to test at no cost)
//   VOICE_SECRET   optional; if set, Vapi must send it in the x-voice-secret header

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  const secret = process.env.VOICE_SECRET;
  if (secret && req.headers['x-voice-secret'] !== secret) {
    res.status(401).end();
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const message = (body && body.message) || body || {};
  const text = typeof message.text === 'string' ? message.text.trim() : '';
  const sampleRate = Number(message.sampleRate) || 24000;

  if (!text) {
    res.status(400).json({ error: 'No text to speak' });
    return;
  }
  if (!process.env.FISH_API_KEY || !process.env.FISH_VOICE_ID) {
    res.status(500).json({ error: 'Voice server is not configured' });
    return;
  }

  try {
    const upstream = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.FISH_API_KEY}`,
        'Content-Type': 'application/json',
        'model': process.env.FISH_MODEL || 's2.1-pro'
      },
      body: JSON.stringify({
        text,
        reference_id: process.env.FISH_VOICE_ID,
        format: 'pcm',
        sample_rate: sampleRate,
        latency: 'low'
      })
    });

    if (!upstream.ok) {
      res.status(502).json({ error: 'Fish Audio request failed', status: upstream.status });
      return;
    }

    const audio = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', 'application/octet-stream');
    res.status(200).send(audio);
  } catch (e) {
    res.status(502).json({ error: 'Voice server error' });
  }
}
