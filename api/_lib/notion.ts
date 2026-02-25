// ── Notion Read-Only API Client ────────────────────────
//
// Hard guard: throws on any write operation.
// Only permits:
//   GET  /v1/pages/{id}
//   GET  /v1/blocks/{id}/children
//   POST /v1/databases/{id}/query      (read-only in Notion API)
//   POST /v1/search                    (read-only in Notion API)

const NOTION_BASE = "https://api.notion.com";

// ── Write-endpoint patterns (blocked) ──────────────────

const WRITE_PATTERNS = [
  { method: "POST", pattern: /^\/v1\/pages\/?$/ },               // create page
  { method: "PATCH", pattern: /^\/v1\/pages\// },                 // update page
  { method: "PATCH", pattern: /^\/v1\/blocks\// },                // update / append blocks
  { method: "DELETE", pattern: /^\/v1\/blocks\// },               // delete block
  { method: "POST", pattern: /^\/v1\/comments\/?$/ },             // create comment
];

function isWriteCall(method: string, path: string): boolean {
  const upper = method.toUpperCase();
  // PATCH and DELETE are always write operations
  if (upper === "PATCH" || upper === "DELETE") return true;

  for (const wp of WRITE_PATTERNS) {
    if (upper === wp.method && wp.pattern.test(path)) return true;
  }
  return false;
}

// ── Core fetcher ───────────────────────────────────────

interface NotionFetchOptions {
  method?: string;
  body?: unknown;
  params?: Record<string, string | number>;
}

export async function notionFetch(path: string, options: NotionFetchOptions = {}): Promise<unknown> {
  const method = (options.method ?? "GET").toUpperCase();

  // ── HARD GUARD ─────────────────────────────────────
  if (isWriteCall(method, path)) {
    throw new Error(`BLOCKED: Write operation attempted — ${method} ${path}. This API is read-only.`);
  }

  const token = process.env.NOTION_TOKEN;
  const version = process.env.NOTION_VERSION ?? "2022-06-28";

  if (!token) {
    throw new Error("Server misconfiguration: NOTION_TOKEN not set");
  }

  // Build URL with optional query params
  const url = new URL(path, NOTION_BASE);
  if (options.params) {
    for (const [k, v] of Object.entries(options.params)) {
      url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Notion-Version": version,
    "Content-Type": "application/json",
  };

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion API error ${res.status}: ${text}`);
  }

  return res.json();
}

// ── High-level read operations ─────────────────────────

export async function retrievePage(pageId: string): Promise<Record<string, unknown>> {
  return notionFetch(`/v1/pages/${pageId}`) as Promise<Record<string, unknown>>;
}

interface BlockChildrenResponse {
  results: Record<string, unknown>[];
  has_more: boolean;
  next_cursor: string | null;
}

export async function retrieveBlockChildren(
  blockId: string,
  pageSize = 100
): Promise<BlockChildrenResponse> {
  return notionFetch(`/v1/blocks/${blockId}/children`, {
    params: { page_size: pageSize },
  }) as Promise<BlockChildrenResponse>;
}

export async function queryDatabase(
  databaseId: string,
  query: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const dbPageLimit = parseInt(process.env.DB_PAGE_LIMIT ?? "50", 10);
  return notionFetch(`/v1/databases/${databaseId}/query`, {
    method: "POST",
    body: { page_size: dbPageLimit, ...query },
  }) as Promise<Record<string, unknown>>;
}

// ── Recursive block fetcher ────────────────────────────

export interface FlatBlock {
  id: string;
  type: string;
  depth: number;
  data: Record<string, unknown>;
}

export async function fetchPageBlocks(pageId: string): Promise<FlatBlock[]> {
  const maxDepth = parseInt(process.env.MAX_DEPTH ?? "2", 10);
  const maxBlocks = parseInt(process.env.MAX_BLOCKS ?? "400", 10);
  const result: FlatBlock[] = [];

  async function recurse(parentId: string, depth: number) {
    if (depth > maxDepth || result.length >= maxBlocks) return;

    const resp = await retrieveBlockChildren(parentId);
    for (const block of resp.results) {
      if (result.length >= maxBlocks) break;

      const b = block as Record<string, unknown>;
      result.push({
        id: b.id as string,
        type: b.type as string,
        depth,
        data: b,
      });

      if (b.has_children && depth < maxDepth) {
        await recurse(b.id as string, depth + 1);
      }
    }
  }

  await recurse(pageId, 0);
  return result;
}
