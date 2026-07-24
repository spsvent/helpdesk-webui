// Rich-text pipeline for comments and ticket descriptions.
//
// Comments authored in the app are stored as **Markdown**. Historical/migrated
// comments (and some descriptions) are stored as **HTML**. Both flow through the
// single renderer below, which:
//   1. Runs the content through markdown-it with `html: true`, so Markdown is
//      rendered AND any embedded/legacy HTML is passed through.
//   2. Sanitizes the result with DOMPurify against a conservative allow-list,
//      closing the XSS hole that raw `dangerouslySetInnerHTML` previously left open.
//
// `breaks: true` is what fixes the classic "wall of text" symptom: plain text
// pasted with newlines becomes <br>-separated lines instead of collapsing.
import MarkdownIt from "markdown-it";
import DOMPurify, { type Config } from "dompurify";

const md = new MarkdownIt({
  html: true, // pass through legacy HTML comments and inline tags (e.g. <u>)
  linkify: true, // auto-link bare URLs
  breaks: true, // single newline -> <br> (fixes plain-text wall-of-text)
  typographer: false,
});

// Tags we allow in rendered comment/description bodies. Deliberately covers the
// Markdown feature set the UI exposes (emphasis, lists, links, headings, quotes,
// code, tables) plus the inline tags legacy HTML comments rely on.
const ALLOWED_TAGS = [
  "p", "br", "hr", "span", "div",
  "strong", "b", "em", "i", "u", "s", "strike", "del", "ins", "mark", "sub", "sup", "small",
  "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "blockquote", "pre", "code", "kbd", "samp",
  "a", "img",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td",
];

const ALLOWED_ATTR = [
  "href", "title", "target", "rel",
  "src", "alt", "width", "height",
  "align", "colspan", "rowspan", "start", "type",
];

const SANITIZE_CONFIG: Config = {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  ALLOW_DATA_ATTR: false,
};

// DOMPurify only works where a DOM exists. This is a "use client" render path and
// comment data is fetched client-side, so in practice sanitize always runs in the
// browser; the guard just keeps the static-export build (Node, no `window`) from
// throwing if the module is evaluated during prerender.
let hooksInstalled = false;
function getPurifier(): typeof DOMPurify | null {
  if (typeof window === "undefined") return null;
  if (!hooksInstalled) {
    // Force links to open safely in a new tab and never leak the opener.
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
      if (node.tagName === "A" && node.getAttribute("href")) {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer nofollow");
      }
    });
    hooksInstalled = true;
  }
  return DOMPurify;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

// Legacy/migrated comments and descriptions are stored as HTML, while content
// authored in the app is stored as Markdown. The app's editor only ever emits
// Markdown (plus the occasional inline <u>), so the presence of a structural
// HTML tag is a reliable signal that the body is stored HTML. Such content is
// sanitized as-is — matching its original rendering — instead of being pushed
// through the Markdown block parser, which would otherwise re-wrap bare
// paragraphs after blank lines, escape indented lines into code blocks, etc.
const STORED_HTML_RE =
  /<(?:\/?(?:p|div|br|hr|ul|ol|li|h[1-6]|blockquote|pre|table|thead|tbody|tfoot|tr|td|th|img|a|span|font|b|i|strong|em)\b|!--)/i;

function looksLikeStoredHtml(raw: string): boolean {
  return STORED_HTML_RE.test(raw);
}

/**
 * Render a comment/description body (Markdown or legacy HTML) to sanitized HTML
 * suitable for `dangerouslySetInnerHTML`.
 */
export function renderRichText(raw: string | null | undefined): string {
  if (!raw) return "";
  // Stored HTML is sanitized directly; app-authored Markdown is rendered first.
  const html = looksLikeStoredHtml(raw) ? raw : md.render(raw);
  const purifier = getPurifier();
  if (!purifier) {
    // No DOM (SSR/prerender): fall back to escaped source. Real content renders
    // client-side after auth, so this path never carries user-visible data.
    return escapeHtml(raw);
  }
  return purifier.sanitize(html, SANITIZE_CONFIG);
}

/**
 * Collapse a Markdown/HTML body down to a plain-text preview — used for email
 * bodies and truncated previews so recipients never see raw `**bold**` syntax
 * or leftover HTML tags.
 *
 * The returned string is PLAIN TEXT and may legitimately contain `<`, `>` and
 * `&` (e.g. `List<String>`, `5 < x`, `a & b`). Callers that place it into HTML
 * MUST escape it first (the email helpers do so via `escapeHtml`).
 */
export function markdownToText(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = raw;
  // Turn <br> into a space, then strip only real HTML element tags. A blanket
  // /<[^>]+>/ would delete legitimate prose such as "5 < x", "List<String>", or
  // "<user@example.com>"; the allow-list below leaves those intact.
  s = s.replace(/<br\s*\/?>/gi, " ");
  s = s.replace(
    /<\/?(?:p|div|span|a|b|i|u|s|strong|em|del|ins|mark|sub|sup|small|ul|ol|li|h[1-6]|blockquote|pre|code|kbd|samp|img|font|hr|table|thead|tbody|tfoot|tr|th|td)\b[^>]*>/gi,
    " ",
  );
  // Strip Markdown syntax markers.
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ""); // images
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"); // links -> link text
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, ""); // ATX headings
  s = s.replace(/^\s{0,3}>+\s?/gm, ""); // blockquote markers
  s = s.replace(/^\s*[-*+]\s+/gm, ""); // bullet markers
  s = s.replace(/^\s*\d+[.)]\s+/gm, ""); // ordered markers
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, "$1"); // bold **
  s = s.replace(/__([^_\n]+?)__/g, "$1"); // bold __
  s = s.replace(/\*([^*\n]+?)\*/g, "$1"); // italic *
  // Underscore italics only at word boundaries, so snake_case identifiers survive.
  s = s.replace(/(^|[^\w])_([^_\n]+?)_(?=[^\w]|$)/g, "$1$2");
  s = s.replace(/`{1,3}([^`]*)`{1,3}/g, "$1"); // inline/code spans
  // Decode the handful of entities markdown-it / legacy content may contain.
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  // Normalize whitespace.
  s = s.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
  return s.trim();
}
