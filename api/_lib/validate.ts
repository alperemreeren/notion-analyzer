// ── Types ──────────────────────────────────────────────

export interface PageTarget {
  type: "page";
  id: string;
}

export interface DatabaseTarget {
  type: "database";
  id: string;
  query?: Record<string, unknown>;
}

export type Target = PageTarget | DatabaseTarget;

export interface AnalyzeRequest {
  targets: Target[];
  mode?: "project" | "generic";
  instructions?: string;
  focus?: string[];
}

// ── Write-guard keywords ───────────────────────────────

const WRITE_KEYWORDS = ["commit", "create", "update", "delete", "append", "write", "remove", "insert"];

// ── Validation ─────────────────────────────────────────

export function validateRequest(body: unknown): { ok: true; data: AnalyzeRequest } | { ok: false; message: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "Request body must be a JSON object" };
  }

  const b = body as Record<string, unknown>;

  // ── Check for write-like behaviour ───────────────────
  const bodyStr = JSON.stringify(b).toLowerCase();
  for (const keyword of WRITE_KEYWORDS) {
    if (bodyStr.includes(`"${keyword}"`)) {
      return { ok: false, message: `Write operation rejected: request contains forbidden keyword "${keyword}". This API is read-only.` };
    }
  }

  // ── Validate targets ────────────────────────────────
  if (!Array.isArray(b.targets) || b.targets.length === 0) {
    return { ok: false, message: '"targets" must be a non-empty array' };
  }

  for (let i = 0; i < b.targets.length; i++) {
    const t = b.targets[i] as Record<string, unknown>;
    if (!t || typeof t !== "object") {
      return { ok: false, message: `targets[${i}] must be an object` };
    }
    if (t.type !== "page" && t.type !== "database") {
      return { ok: false, message: `targets[${i}].type must be "page" or "database"` };
    }
    if (!t.id || typeof t.id !== "string") {
      return { ok: false, message: `targets[${i}].id must be a non-empty string` };
    }
  }

  // ── Validate optional fields ─────────────────────────
  if (b.mode !== undefined && b.mode !== "project" && b.mode !== "generic") {
    return { ok: false, message: '"mode" must be "project" or "generic"' };
  }

  if (b.instructions !== undefined && typeof b.instructions !== "string") {
    return { ok: false, message: '"instructions" must be a string' };
  }

  if (b.focus !== undefined) {
    if (!Array.isArray(b.focus) || !b.focus.every((f: unknown) => typeof f === "string")) {
      return { ok: false, message: '"focus" must be an array of strings' };
    }
  }

  return {
    ok: true,
    data: {
      targets: b.targets as Target[],
      mode: (b.mode as AnalyzeRequest["mode"]) ?? "project",
      instructions: b.instructions as string | undefined,
      focus: b.focus as string[] | undefined,
    },
  };
}
