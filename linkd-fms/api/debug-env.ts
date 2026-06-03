import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    has_SUPABASE_URL: !!process.env.SUPABASE_URL,
    has_SUPABASE_ANON_KEY: !!process.env.SUPABASE_ANON_KEY,
    has_SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    has_VITE_SUPABASE_URL: !!process.env.VITE_SUPABASE_URL,
    has_VITE_SUPABASE_ANON_KEY: !!process.env.VITE_SUPABASE_ANON_KEY,
    node_version: process.version,
    timestamp: new Date().toISOString(),
  });
}
