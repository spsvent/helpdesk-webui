// Convert HTML copied from a web page into Markdown, so pasting a formatted
// snippet into a comment keeps its structure (headings, lists, links, tables,
// emphasis) instead of collapsing into a wall of text.
//
// Used by MarkdownEditor's paste handler: when the clipboard carries `text/html`,
// we run it through this and insert the resulting Markdown. The output is later
// re-rendered AND sanitized by renderRichText, so this step is about fidelity,
// not security.
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

let service: TurndownService | null = null;

function getService(): TurndownService {
  if (service) return service;
  const svc = new TurndownService({
    headingStyle: "atx", // # Heading
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    strongDelimiter: "**",
    linkStyle: "inlined",
  });
  // Tables, strikethrough, task lists.
  svc.use(gfm);
  // Preserve inline tags that have no Markdown equivalent but that our renderer
  // allows — otherwise turndown would flatten them to plain text.
  svc.keep(["u", "ins", "mark", "sub", "sup"]);
  // Drop noise that commonly rides along with web-page copies.
  svc.remove(["style", "script", "head", "title", "meta", "link", "noscript"]);
  service = svc;
  return svc;
}

/**
 * Convert an HTML fragment (e.g. from `clipboardData.getData("text/html")`) to
 * Markdown. Returns an empty string for empty/whitespace input.
 */
export function htmlToMarkdown(html: string): string {
  if (!html || !html.trim()) return "";
  try {
    const md = getService().turndown(html);
    // Turndown can emit long runs of blank lines from block wrappers; collapse.
    return md.replace(/\n{3,}/g, "\n\n").trim();
  } catch {
    return "";
  }
}
