// ── Content Normalization ──────────────────────────────
//
// Assembles Notion data into compact snapshot structures.

import { retrievePage, fetchPageBlocks, queryDatabase } from "./notion.js";
import { blockToText, richTextToPlain } from "./text.js";
import type { DatabaseTarget } from "./validate.js";

const MAX_CONTENT_CHARS = 20_000;

// ── Types ──────────────────────────────────────────────

export interface NormalizedTarget {
  target: { type: string; id: string };
  title: string;
  properties: Record<string, unknown>;
  content_text: string;
  blocks_count: number;
  items?: NormalizedDatabaseItem[];
}

export interface NormalizedDatabaseItem {
  id: string;
  title: string;
  properties: Record<string, unknown>;
  properties_raw: Record<string, unknown>;
}

// ── Page normalization ─────────────────────────────────

function extractPageTitle(page: Record<string, unknown>): string {
  const props = page.properties as Record<string, unknown> | undefined;
  if (!props) return "Untitled";

  // Try common title property names
  for (const key of ["title", "Title", "Name", "name"]) {
    const prop = props[key] as Record<string, unknown> | undefined;
    if (prop?.type === "title") {
      const titleArr = prop.title as Array<{ plain_text?: string }> | undefined;
      if (titleArr && titleArr.length > 0) {
        return titleArr.map((t) => t.plain_text ?? "").join("");
      }
    }
  }

  // Fallback: scan all properties for a title type
  for (const val of Object.values(props)) {
    const prop = val as Record<string, unknown>;
    if (prop?.type === "title") {
      const titleArr = prop.title as Array<{ plain_text?: string }> | undefined;
      if (titleArr && titleArr.length > 0) {
        return titleArr.map((t) => t.plain_text ?? "").join("");
      }
    }
  }

  return "Untitled";
}

function extractSimpleProperties(props: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(props)) {
    const prop = val as Record<string, unknown>;
    const type = prop.type as string;

    switch (type) {
      case "title":
        result[key] = richTextToPlain(prop.title as Array<{ type: string; plain_text?: string }> | undefined);
        break;
      case "rich_text":
        result[key] = richTextToPlain(prop.rich_text as Array<{ type: string; plain_text?: string }> | undefined);
        break;
      case "number":
        result[key] = prop.number;
        break;
      case "select":
        result[key] = (prop.select as Record<string, unknown> | null)?.name ?? null;
        break;
      case "multi_select":
        result[key] = ((prop.multi_select as Array<{ name: string }>) ?? []).map((s) => s.name);
        break;
      case "status":
        result[key] = (prop.status as Record<string, unknown> | null)?.name ?? null;
        break;
      case "date": {
        const d = prop.date as Record<string, unknown> | null;
        result[key] = d ? { start: d.start, end: d.end ?? null } : null;
        break;
      }
      case "checkbox":
        result[key] = prop.checkbox;
        break;
      case "url":
        result[key] = prop.url;
        break;
      case "email":
        result[key] = prop.email;
        break;
      case "phone_number":
        result[key] = prop.phone_number;
        break;
      case "people":
        result[key] = ((prop.people as Array<{ name?: string }>) ?? []).map((p) => p.name ?? "Unknown");
        break;
      case "relation":
        result[key] = ((prop.relation as Array<{ id: string }>) ?? []).map((r) => r.id);
        break;
      case "formula": {
        const f = prop.formula as Record<string, unknown>;
        result[key] = f?.[f?.type as string] ?? null;
        break;
      }
      case "rollup": {
        const r = prop.rollup as Record<string, unknown>;
        result[key] = r?.[r?.type as string] ?? null;
        break;
      }
      case "created_time":
        result[key] = prop.created_time;
        break;
      case "last_edited_time":
        result[key] = prop.last_edited_time;
        break;
      case "created_by":
        result[key] = (prop.created_by as Record<string, unknown>)?.name ?? null;
        break;
      case "last_edited_by":
        result[key] = (prop.last_edited_by as Record<string, unknown>)?.name ?? null;
        break;
      default:
        result[key] = `[${type}]`;
    }
  }

  return result;
}

export async function normalizePageTarget(pageId: string): Promise<NormalizedTarget> {
  const page = await retrievePage(pageId);
  const blocks = await fetchPageBlocks(pageId);

  const title = extractPageTitle(page);
  const properties = extractSimpleProperties((page.properties as Record<string, unknown>) ?? {});

  // Build content text from blocks
  let contentText = blocks
    .map((b) => blockToText(b.data, b.depth))
    .filter((line) => line.length > 0)
    .join("\n");

  // Truncate
  if (contentText.length > MAX_CONTENT_CHARS) {
    contentText = contentText.slice(0, MAX_CONTENT_CHARS) + "\n... [truncated]";
  }

  return {
    target: { type: "page", id: pageId },
    title,
    properties,
    content_text: contentText,
    blocks_count: blocks.length,
  };
}

// ── Database normalization ─────────────────────────────

export async function normalizeDatabaseTarget(target: DatabaseTarget): Promise<NormalizedTarget> {
  const response = await queryDatabase(target.id, target.query ?? {});
  const results = (response.results ?? []) as Array<Record<string, unknown>>;

  const items: NormalizedDatabaseItem[] = results.map((item) => {
    const props = (item.properties as Record<string, unknown>) ?? {};
    return {
      id: item.id as string,
      title: extractPageTitle(item),
      properties: extractSimpleProperties(props),
      properties_raw: props,
    };
  });

  // Build summary text
  let contentText = items
    .map((item, i) => {
      const propLines = Object.entries(item.properties)
        .map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)
        .join("\n");
      return `${i + 1}. ${item.title}\n${propLines}`;
    })
    .join("\n\n");

  if (contentText.length > MAX_CONTENT_CHARS) {
    contentText = contentText.slice(0, MAX_CONTENT_CHARS) + "\n... [truncated]";
  }

  return {
    target: { type: "database", id: target.id },
    title: `Database (${items.length} items)`,
    properties: {},
    content_text: contentText,
    blocks_count: 0,
    items,
  };
}
