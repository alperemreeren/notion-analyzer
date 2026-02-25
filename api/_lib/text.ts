// ── Block → Plain Text Conversion ──────────────────────
//
// Converts Notion blocks into readable plain-text lines.
// Preserves hierarchy via indentation.

// ── Rich text extraction ───────────────────────────────

interface RichTextItem {
  type: string;
  plain_text?: string;
  text?: { content: string };
}

export function richTextToPlain(richTexts: RichTextItem[] | undefined): string {
  if (!richTexts || !Array.isArray(richTexts)) return "";
  return richTexts.map((rt) => rt.plain_text ?? rt.text?.content ?? "").join("");
}

// ── Single block → text line ───────────────────────────

export function blockToText(block: Record<string, unknown>, depth: number = 0): string {
  const indent = "  ".repeat(depth);
  const type = block.type as string;
  const content = block[type] as Record<string, unknown> | undefined;

  if (!content) return `${indent}[${type}]`;

  const richText = content.rich_text as RichTextItem[] | undefined;
  const text = richTextToPlain(richText);

  switch (type) {
    case "paragraph":
      return text ? `${indent}${text}` : "";

    case "heading_1":
      return `${indent}# ${text}`;

    case "heading_2":
      return `${indent}## ${text}`;

    case "heading_3":
      return `${indent}### ${text}`;

    case "bulleted_list_item":
      return `${indent}• ${text}`;

    case "numbered_list_item":
      return `${indent}1. ${text}`;

    case "to_do": {
      const checked = content.checked ? "x" : " ";
      return `${indent}[${checked}] ${text}`;
    }

    case "toggle":
      return `${indent}▸ ${text}`;

    case "quote":
      return `${indent}> ${text}`;

    case "callout": {
      const icon = content.icon as Record<string, unknown> | undefined;
      const emoji = icon?.type === "emoji" ? (icon.emoji as string) + " " : "";
      return `${indent}${emoji}${text}`;
    }

    case "code": {
      const lang = (content.language as string) ?? "";
      return `${indent}\`\`\`${lang}\n${indent}${text}\n${indent}\`\`\``;
    }

    case "divider":
      return `${indent}---`;

    case "table_row": {
      const cells = content.cells as RichTextItem[][] | undefined;
      if (!cells) return `${indent}[table_row]`;
      return `${indent}| ${cells.map((c) => richTextToPlain(c)).join(" | ")} |`;
    }

    case "child_page":
      return `${indent}📄 ${(content.title as string) ?? "Untitled"}`;

    case "child_database":
      return `${indent}🗃️ ${(content.title as string) ?? "Untitled DB"}`;

    case "image":
    case "video":
    case "file":
    case "pdf":
      return `${indent}[${type}]`;

    case "bookmark": {
      const url = content.url as string | undefined;
      return `${indent}🔗 ${url ?? "[bookmark]"}`;
    }

    case "embed": {
      const url = content.url as string | undefined;
      return `${indent}[embed: ${url ?? "unknown"}]`;
    }

    default:
      return text ? `${indent}${text}` : `${indent}[${type}]`;
  }
}
