import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authenticate } from "./_lib/auth.js";
import { validateRequest, type AnalyzeRequest } from "./_lib/validate.js";
import { normalizePageTarget, normalizeDatabaseTarget, type NormalizedTarget } from "./_lib/normalize.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ── CORS preflight ──────────────────────────────────
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // ── Method check ────────────────────────────────────
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed. Use POST." });
  }

  // ── Authentication ──────────────────────────────────
  const auth = authenticate(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.message });
  }

  // ── Validation ──────────────────────────────────────
  const validation = validateRequest(req.body);
  if (!validation.ok) {
    return res.status(400).json({ ok: false, error: validation.message });
  }

  const request: AnalyzeRequest = validation.data;

  // ── Process targets ─────────────────────────────────
  try {
    const normalizedTargets: NormalizedTarget[] = [];

    for (const target of request.targets) {
      if (target.type === "page") {
        const result = await normalizePageTarget(target.id);
        normalizedTargets.push(result);
      } else if (target.type === "database") {
        const result = await normalizeDatabaseTarget(target);
        normalizedTargets.push(result);
      }
    }

    // ── Build analysis ──────────────────────────────────
    const focus = request.focus ?? ["sprint", "tasks", "risks", "next_actions"];
    const analysis = buildAnalysis(normalizedTargets, focus, request.instructions);
    const summary = buildSummary(normalizedTargets, request.mode ?? "project");

    return res.status(200).json({
      ok: true,
      summary,
      analysis,
      notion_snapshot: {
        targets: normalizedTargets,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("analyze error:", message);
    return res.status(500).json({ ok: false, error: message });
  }
}

// ── Analysis builder ───────────────────────────────────

function buildAnalysis(
  targets: NormalizedTarget[],
  focus: string[],
  instructions?: string
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Derive status from content
  const allContent = targets.map((t) => t.content_text).join("\n");
  const allItems = targets.flatMap((t) => t.items ?? []);
  const totalBlocks = targets.reduce((sum, t) => sum + t.blocks_count, 0);

  result.status = `Analyzed ${targets.length} target(s): ${totalBlocks} blocks, ${allItems.length} database items`;

  if (focus.includes("tasks") || focus.includes("sprint")) {
    // Extract to-do items from content
    const todoPattern = /\[[ x]\]\s+(.+)/g;
    const tasks: { task: string; done: boolean }[] = [];
    let match;
    while ((match = todoPattern.exec(allContent)) !== null) {
      tasks.push({
        task: match[1],
        done: match[0].startsWith("[x]"),
      });
    }

    // Also include DB items with status
    const dbTasks = allItems.map((item) => ({
      title: item.title,
      status: item.properties["Status"] ?? item.properties["status"] ?? "unknown",
    }));

    result.tasks_found = tasks.length + dbTasks.length;
    result.tasks_sample = [...tasks.slice(0, 10), ...dbTasks.slice(0, 10)];
  }

  if (focus.includes("risks")) {
    result.risks = [
      "Review the notion_snapshot for full context to identify project risks.",
      `Content includes ${totalBlocks} blocks and ${allItems.length} database items to analyze.`,
    ];
  }

  if (focus.includes("open_questions")) {
    result.open_questions = [
      "See notion_snapshot.targets for full content — use this data to identify open questions.",
    ];
  }

  if (focus.includes("next_actions")) {
    result.next_actions = [
      "Review the tasks and content in notion_snapshot to determine next actions.",
    ];
  }

  result.suggested_updates_for_humans_to_apply = [
    "Analyze the notion_snapshot content to generate specific update suggestions.",
  ];

  if (instructions) {
    result.custom_instructions = instructions;
  }

  return result;
}

// ── Summary builder ────────────────────────────────────

function buildSummary(targets: NormalizedTarget[], mode: string): string {
  const titles = targets.map((t) => t.title).join(", ");
  const totalBlocks = targets.reduce((sum, t) => sum + t.blocks_count, 0);
  const totalItems = targets.reduce((sum, t) => (t.items?.length ?? 0) + sum, 0);

  const parts = [`${mode} analysis of: ${titles}`];
  if (totalBlocks > 0) parts.push(`${totalBlocks} blocks`);
  if (totalItems > 0) parts.push(`${totalItems} database items`);

  return parts.join(" | ");
}
