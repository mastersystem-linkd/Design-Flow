import type { VercelRequest, VercelResponse } from "@vercel/node";

function mask(val: string | undefined): string {
  if (!val) return "MISSING";
  if (val.length <= 8) return val.slice(0, 2) + "***";
  return val.slice(0, 6) + "..." + val.slice(-4);
}

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const keys = [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
  ];

  const result: Record<string, string> = {};
  for (const k of keys) {
    result[k] = mask(process.env[k]);
  }

  const allEnvKeys = Object.keys(process.env)
    .filter((k) => k.includes("SUPA") || k.includes("VITE"))
    .sort();

  res.status(200).json({
    env_vars: result,
    supabase_related_keys: allEnvKeys,
    node_version: process.version,
    timestamp: new Date().toISOString(),
  });
}
