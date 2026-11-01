// AI endpoint: forwards to OpenAI Chat Completions (gpt-4.1) with the key stored in Vercel
// (environment variable open_ai_sudeep_key). Used by the AI Assistant (with tools) and PO/SO PDF autofill (JSON mode, PDF file input).
import { openAiKey } from './config.js';
export const config = { maxDuration: 60 };
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: { code: 'method', message: 'Use POST' } }); }
  const key = openAiKey();
  if (!key) return res.status(500).json({ error: { code: 'not_configured', message: 'The OpenAI key is not set in Vercel (expected environment variable open_ai_sudeep_key). Add it and redeploy.' } });
  let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || !Array.isArray(body.messages) || !body.messages.length) return res.status(400).json({ error: { code: 'bad_request', message: 'messages[] is required' } });
  const payload = { model: process.env.OPENAI_MODEL || 'gpt-4.1', messages: body.messages, temperature: typeof body.temperature === 'number' ? body.temperature : 0.2 };
  if (Array.isArray(body.tools) && body.tools.length) { payload.tools = body.tools; payload.tool_choice = 'auto'; }
  if (body.json) payload.response_format = { type: 'json_object' };
  if (body.max_tokens) payload.max_tokens = Math.min(+body.max_tokens || 0, 8000) || undefined;
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const code = r.status === 429 ? 'rate_limited' : r.status === 401 ? 'not_configured' : r.status === 400 ? 'bad_request' : 'unavailable';
      return res.status(r.status === 401 ? 500 : r.status).json({ error: { code, message: (j.error && j.error.message) || ('OpenAI error ' + r.status) } });
    }
    const c = (j.choices || [])[0] || {};
    return res.status(200).json({ message: c.message || { content: '' }, finish_reason: c.finish_reason, model: j.model, usage: j.usage });
  } catch (e) {
    return res.status(502).json({ error: { code: 'unavailable', message: 'Could not reach OpenAI: ' + (e && e.message || e) } });
  }
}
