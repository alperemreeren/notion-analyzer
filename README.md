# Notion Analyzer Gateway

A minimal read-only HTTPS API on Vercel that reads Notion pages/databases, normalizes content into compact JSON, and returns an analysis payload for a project assistant.

> **Read-Only**: This API never writes, updates, or deletes anything in Notion.

## Endpoints

| Method | Path       | Auth     | Description                               |
| ------ | ---------- | -------- | ----------------------------------------- |
| GET    | `/health`  | None     | Health check → `{ ok: true }`             |
| POST   | `/analyze` | Bearer   | Read & analyze Notion content             |

## Setup

### 1. Create a Notion Integration

1. Go to [Notion Integrations](https://www.notion.so/my-integrations)
2. Create a new **internal integration**
3. Set capabilities to **Read content** only (no write/update/delete)
4. Copy the **Internal Integration Token**
5. Share the relevant Notion pages/databases with the integration

### 2. Environment Variables

| Variable          | Required | Description                                      |
| ----------------- | -------- | ------------------------------------------------ |
| `GATEWAY_API_KEY` | ✅       | Secret API key for Bearer authentication         |
| `NOTION_TOKEN`    | ✅       | Notion Internal Integration Token (read-only)    |
| `NOTION_VERSION`  | ❌       | Notion API version (default: `2022-06-28`)       |
| `MAX_BLOCKS`      | ❌       | Max blocks to fetch per page (default: `400`)    |
| `MAX_DEPTH`       | ❌       | Max recursion depth for blocks (default: `2`)    |
| `DB_PAGE_LIMIT`   | ❌       | Max items per database query (default: `50`)     |

### 3. Deploy to Vercel

```bash
cd notion-analyzer
npm install
npx vercel --prod
```

Set environment variables in Vercel Dashboard → Settings → Environment Variables.

### 4. Update OpenAPI Spec

After deploying, update `openapi.yaml` → `servers.url` with your deployed URL:

```yaml
servers:
  - url: https://your-actual-domain.vercel.app
```

## Usage Examples

### Health Check

```bash
curl https://YOUR_VERCEL_DOMAIN/health
# → {"ok":true}
```

### Analyze a Notion Page

```bash
curl -X POST https://YOUR_VERCEL_DOMAIN/analyze \
  -H "Authorization: Bearer $GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "targets": [
      { "type": "page", "id": "YOUR_PAGE_ID" }
    ],
    "mode": "project",
    "focus": ["tasks", "risks"]
  }'
```

### Analyze a Notion Database

```bash
curl -X POST https://YOUR_VERCEL_DOMAIN/analyze \
  -H "Authorization: Bearer $GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "targets": [
      { "type": "database", "id": "YOUR_DB_ID", "query": { "page_size": 50 } }
    ],
    "mode": "project",
    "focus": ["sprint", "tasks", "risks", "next_actions"]
  }'
```

## ChatGPT Actions

Import `openapi.yaml` as a ChatGPT Action schema. Set:
- **Authentication**: API Key → Bearer → `GATEWAY_API_KEY`
- **Server URL**: Your deployed Vercel domain

## Project Structure

```
notion-analyzer/
  api/
    analyze.ts        # POST /analyze endpoint
    health.ts         # GET /health endpoint
    _lib/
      auth.ts         # Bearer token authentication
      notion.ts       # Read-only Notion API client
      normalize.ts    # Content normalization
      validate.ts     # Request validation + write guard
      text.ts         # Block → plain text conversion
  openapi.yaml        # OpenAPI 3.1.0 spec for ChatGPT Actions
  package.json
  tsconfig.json
  vercel.json
  README.md
```
