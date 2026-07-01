// Shared HTML shell for notification emails sent from the SPA (the modules'
// in-app decision paths). One home for escapeHtml + the branded wrapper so each
// module doesn't re-implement them — and so the APP_URL fallback can't diverge
// again (cdwEmail used to default to the raw *.azurestaticapps.net host while
// everything else defaulted to https://tickets.spsvent.net).
//
// Deliberately NOT shared with the Azure Functions' template lib
// (azure-functions/lib/*EmailTemplates): the Functions bundle is standalone.

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://tickets.spsvent.net";

export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (c) => map[c]);
}

// The branded email wrapper: header (headline + subtitle), content area, footer.
// `bodyHtml` is trusted markup — callers escape user text with escapeHtml.
export function emailShell(headline: string, bodyHtml: string, subtitle = "SkyPark Help Desk"): string {
  return `<!DOCTYPE html><html><head><style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #1e3a5f; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
    .info { background: white; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #e5e7eb; }
    .label { font-weight: 600; color: #374151; }
    .btn { display: inline-block; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; background: #1e3a5f; color: white; }
    .actions { text-align: center; margin: 24px 0; }
    .footer { text-align: center; padding: 16px; color: #6b7280; font-size: 14px; border-top: 1px solid #e5e7eb; }
  </style></head><body><div class="container">
    <div class="header"><h1 style="margin:0;font-size:24px;">${escapeHtml(headline)}</h1>
      <p style="margin:8px 0 0 0;opacity:0.9;">${escapeHtml(subtitle)}</p></div>
    <div class="content">${bodyHtml}</div>
    <div class="footer"><p>This is an automated message from SkyPark Help Desk.</p></div>
  </div></body></html>`;
}
