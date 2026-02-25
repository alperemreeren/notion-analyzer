import type { VercelRequest } from "@vercel/node";

/**
 * Authenticate the request using Bearer token.
 * Compares against the GATEWAY_API_KEY environment variable.
 */
export function authenticate(req: VercelRequest): { ok: true } | { ok: false; status: number; message: string } {
  const key = process.env.GATEWAY_API_KEY;
  if (!key) {
    return { ok: false, status: 500, message: "Server misconfiguration: GATEWAY_API_KEY not set" };
  }

  const authHeader = req.headers["authorization"];
  if (!authHeader || typeof authHeader !== "string") {
    return { ok: false, status: 401, message: "Missing Authorization header" };
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { ok: false, status: 401, message: "Invalid Authorization header format. Expected: Bearer <token>" };
  }

  const token = match[1];
  if (token !== key) {
    return { ok: false, status: 401, message: "Invalid API key" };
  }

  return { ok: true };
}
