// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderRichText, markdownToText } from "./richText";
import { htmlToMarkdown } from "./htmlToMarkdown";

describe("renderRichText — Markdown features", () => {
  it("renders bold and italic", () => {
    const html = renderRichText("This is **bold** and *italic*.");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  it("renders bulleted lists", () => {
    const html = renderRichText("- one\n- two\n- three");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<li>three</li>");
  });

  it("renders numbered lists", () => {
    const html = renderRichText("1. first\n2. second");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>first</li>");
  });

  it("renders headings, blockquotes and code", () => {
    expect(renderRichText("## Title")).toContain("<h2>Title</h2>");
    expect(renderRichText("> quoted")).toContain("<blockquote>");
    expect(renderRichText("`code`")).toContain("<code>code</code>");
    expect(renderRichText("```\nblock\n```")).toContain("<pre>");
  });

  it("keeps inline <u> underline", () => {
    expect(renderRichText("<u>under</u>")).toContain("<u>under</u>");
  });

  it("renders a Markdown link with a safe target/rel", () => {
    const html = renderRichText("[site](https://example.com)");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("noopener");
  });

  it("auto-links bare URLs (linkify)", () => {
    const html = renderRichText("see https://example.com for details");
    expect(html).toContain('href="https://example.com"');
  });
});

describe("renderRichText — the #495 wall-of-text fix", () => {
  it("preserves newlines from pasted plain text as <br>", () => {
    const pasted = "Line one\nLine two\nLine three";
    const html = renderRichText(pasted);
    expect((html.match(/<br\s*\/?>/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("Line one");
    expect(html).toContain("Line three");
  });

  it("separates blank-line-delimited blocks into paragraphs", () => {
    const html = renderRichText("Para one.\n\nPara two.");
    expect((html.match(/<p>/g) || []).length).toBe(2);
  });
});

describe("renderRichText — legacy HTML passthrough", () => {
  it("renders migrated multi-paragraph HTML", () => {
    const html = renderRichText("<p>Hello</p><p>World</p>");
    expect(html).toContain("Hello");
    expect(html).toContain("World");
  });

  it("keeps inline formatting tags from legacy content", () => {
    const html = renderRichText("Text with <b>bold</b> and <i>italic</i>");
    expect(html).toContain("<b>bold</b>");
    expect(html).toContain("<i>italic</i>");
  });

  it("does NOT re-parse Markdown inside migrated HTML wrappers", () => {
    // A blank line inside a <div> used to make markdown-it treat "# Not a heading"
    // as an actual heading. Stored HTML must render verbatim.
    const html = renderRichText("<div>\n\n# Not a heading\n</div>");
    expect(html).not.toContain("<h1>");
    expect(html).toContain("# Not a heading");
  });

  it("does NOT turn indented legacy HTML into an escaped code block", () => {
    const html = renderRichText("    <p>Indented paragraph from migration</p>");
    expect(html).toContain("Indented paragraph from migration");
    expect(html).not.toContain("<pre>");
    expect(html).not.toContain("&lt;p&gt;");
  });

  it("still renders app-authored Markdown (no HTML tags) normally", () => {
    expect(renderRichText("## Title\n\nsome text")).toContain("<h2>Title</h2>");
    expect(renderRichText("- a\n- b")).toContain("<li>a</li>");
  });
});

describe("renderRichText — sanitization (XSS)", () => {
  it("strips <script> tags", () => {
    const html = renderRichText('<script>alert("xss")</script>hello');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert");
  });

  it("removes event-handler attributes", () => {
    const html = renderRichText('<img src="x" onerror="alert(1)">');
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("alert(1)");
  });

  it("neutralizes javascript: URLs", () => {
    // Markdown link form: markdown-it refuses to emit an href for javascript:,
    // so it never becomes a clickable link.
    const mdForm = renderRichText("[click](javascript:alert(1))");
    expect(mdForm).not.toContain('href="javascript:');
    expect(mdForm).not.toContain("<a ");
    // Raw HTML form: DOMPurify strips the dangerous href entirely.
    const htmlForm = renderRichText('<a href="javascript:alert(1)">click</a>');
    expect(htmlForm).not.toContain("javascript:");
  });

  it("strips inline event handlers on anchors", () => {
    const html = renderRichText('<a href="https://ok.com" onclick="steal()">x</a>');
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("steal");
  });

  it("drops <iframe> and other dangerous embeds", () => {
    const html = renderRichText('<iframe src="https://evil.com"></iframe>');
    expect(html).not.toContain("<iframe");
  });
});

describe("renderRichText — edge cases", () => {
  it("returns empty string for empty/nullish input", () => {
    expect(renderRichText("")).toBe("");
    expect(renderRichText(null)).toBe("");
    expect(renderRichText(undefined)).toBe("");
  });
});

describe("markdownToText", () => {
  it("strips emphasis markers", () => {
    expect(markdownToText("This is **bold** and *italic*")).toBe("This is bold and italic");
  });

  it("reduces links to their text", () => {
    expect(markdownToText("See [the docs](https://example.com)")).toBe("See the docs");
  });

  it("removes list markers", () => {
    expect(markdownToText("- one\n- two")).toContain("one");
    expect(markdownToText("- one\n- two")).not.toContain("- ");
  });

  it("strips HTML tags from legacy content", () => {
    expect(markdownToText("<p>Hello <b>there</b></p>")).toContain("Hello there");
  });

  it("returns empty string for nullish input", () => {
    expect(markdownToText("")).toBe("");
    expect(markdownToText(null)).toBe("");
  });

  it("preserves prose angle brackets (not real tags)", () => {
    expect(markdownToText("The value 5 < x and y > 3 held true")).toContain("5 < x and y > 3");
    expect(markdownToText("Use List<String> and Map<K,V> types")).toContain("List<String>");
    expect(markdownToText("Contact <admin@example.com> for help")).toContain("<admin@example.com>");
  });

  it("preserves snake_case identifiers", () => {
    expect(markdownToText("Set the snake_case_var flag")).toContain("snake_case_var");
  });

  it("still strips standalone underscore italics", () => {
    expect(markdownToText("This is _emphasized_ text")).toBe("This is emphasized text");
  });
});

describe("htmlToMarkdown — paste conversion", () => {
  it("converts a bulleted list", () => {
    const md = htmlToMarkdown("<ul><li>a</li><li>b</li></ul>");
    // turndown pads the marker (e.g. "-   a"); assert it's a bullet + survives round-trip.
    expect(md).toMatch(/^-\s+a/m);
    expect(md).toMatch(/^-\s+b/m);
    const rendered = renderRichText(md);
    expect(rendered).toContain("<li>a</li>");
    expect(rendered).toContain("<li>b</li>");
  });

  it("converts bold and links", () => {
    expect(htmlToMarkdown("<strong>hi</strong>")).toContain("**hi**");
    expect(htmlToMarkdown('<a href="https://e.com">link</a>')).toContain("[link](https://e.com)");
  });

  it("converts headings", () => {
    expect(htmlToMarkdown("<h2>Title</h2>")).toContain("## Title");
  });

  it("drops <style>/<script> noise from web-page copies", () => {
    const md = htmlToMarkdown("<style>.x{color:red}</style><p>Real content</p>");
    expect(md).toContain("Real content");
    expect(md).not.toContain("color:red");
  });

  it("returns empty string for empty input", () => {
    expect(htmlToMarkdown("")).toBe("");
    expect(htmlToMarkdown("   ")).toBe("");
  });

  it("round-trips a pasted snippet into readable rendered HTML", () => {
    const pastedHtml = "<h3>Steps</h3><ul><li>Open console</li><li>Click Export</li></ul>";
    const md = htmlToMarkdown(pastedHtml);
    const rendered = renderRichText(md);
    expect(rendered).toContain("Steps");
    expect(rendered).toContain("<li>Open console</li>");
    expect(rendered).toContain("<ul>");
  });
});
