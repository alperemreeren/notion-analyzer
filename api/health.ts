import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (_req.method === "OPTIONS") {
    return res.status(200).end();
  }

  return res.status(200).json({ ok: true });
}
