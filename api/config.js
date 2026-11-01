// Public configuration for the browser: Supabase URL + publishable key (safe to expose; access is governed by RLS),
// whether the AI key is set, and the one-time seed sheet path. The OpenAI key itself is never returned.
const FALLBACK_SUPABASE_URL = 'https://pugkpvtdcnpwrvmtbamz.supabase.co';
const FALLBACK_SUPABASE_KEY = 'sb_publishable_L2K-AZ_HcSnXliZ4bsPA2g_Cl_qMBqo';
export function openAiKey() {
  const e = process.env;
  const direct = e.open_ai_sudeep_key || e.OPEN_AI_SUDEEP_KEY || e['-open_ai_sudeep_key'] || e.OPENAI_API_KEY;
  if (direct) return direct;
  const k = Object.keys(e).find(n => /open_?ai.*sudeep/i.test(n));
  return k ? e[k] : '';
}
export default function handler(req, res) {
  const e = process.env;
  const supabaseUrl = e.SUPABASE_URL || e.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL;
  const supabaseKey = e.SUPABASE_PUBLISHABLE_KEY || e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || e.SUPABASE_ANON_KEY || e.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_KEY;
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ supabaseUrl, supabaseKey, ai: !!openAiKey(), model: e.OPENAI_MODEL || 'gpt-4.1', seedSheet: e.OT_SEED_SHEET || '/seed/sheet-7f3k9q2m.xlsx' });
}
