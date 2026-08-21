import { describe, it, expect } from "vitest";
import {
  generateNewTicketCard,
  generateStatusChangeCard,
  generatePriorityEscalationCard,
} from "./teamsService";
import type { Ticket } from "@/types/ticket";

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: "606",
    ticketNumber: 606,
    title: "POS terminal 3 won't take card payments",
    description: "Card reader shows 'offline' since open. Cash still works.",
    category: "Problem",
    priority: "Normal",
    status: "New",
    location: "Main Lodge",
    problemType: "Tech",
    problemTypeSub: "IT",
    problemTypeSub2: "Networking",
    requester: { displayName: "Justin Nunn", email: "jnunn@skyparksantasvillage.com" },
    created: "2026-08-20T19:46:00Z",
    modified: "2026-08-20T19:46:00Z",
    createdBy: { displayName: "Justin Nunn", email: "jnunn@skyparksantasvillage.com" },
    approvalStatus: "None",
    ...overrides,
  };
}

/** Flatten every TextBlock string in a card body. */
function cardText(body: { type: string; text?: string }[]): string {
  return body.map((el) => el.text || "").join("\n");
}

describe("generateNewTicketCard", () => {
  it("renders as four flat TextBlocks - no header container or label grids", () => {
    const card = generateNewTicketCard(makeTicket());
    expect(card.body).toHaveLength(4);
    expect(card.body.every((el) => el.type === "TextBlock")).toBe(true);
  });

  it("puts number, priority, category and time on the headline", () => {
    const card = generateNewTicketCard(makeTicket());
    const headline = (card.body[0] as { text: string }).text;
    expect(headline).toContain("**#606**");
    expect(headline).toContain("Normal");
    expect(headline).toContain("Problem");
    expect(headline).toMatch(/Aug 20/);
  });

  it("collapses routing, location and people into one meta line", () => {
    const card = generateNewTicketCard(makeTicket());
    const meta = (card.body[2] as { text: string }).text;
    expect(meta).toContain("Tech > IT > Networking");
    expect(meta).toContain("Main Lodge");
    expect(meta).toContain("Justin Nunn");
    expect(meta).toContain("Unassigned");
  });

  it("shows the assignee instead of the unassigned warning when assigned", () => {
    const card = generateNewTicketCard(
      makeTicket({ assignedTo: { displayName: "Pat Tech", email: "pat@x.com" } })
    );
    const meta = (card.body[2] as { text: string }).text;
    expect(meta).toContain("Pat Tech");
    expect(meta).not.toContain("Unassigned");
  });

  it("includes the due date when one is set", () => {
    const card = generateNewTicketCard(makeTicket({ dueDate: "2026-08-25T00:00:00Z" }));
    expect(cardText(card.body)).toMatch(/Due Aug 2[45]/);
  });

  it("truncates long descriptions", () => {
    const card = generateNewTicketCard(makeTicket({ description: "x".repeat(500) }));
    const desc = (card.body[3] as { text: string }).text;
    expect(desc.length).toBeLessThanOrEqual(281);
    expect(desc.endsWith("…")).toBe(true);
  });

  it("offers open / email / chat actions targeting the requester", () => {
    const card = generateNewTicketCard(makeTicket());
    const titles = card.actions?.map((a) => a.title);
    expect(titles).toEqual(["Open Ticket", "Email", "Chat"]);
    expect(card.actions?.[1].url).toContain("mailto:jnunn@skyparksantasvillage.com");
    expect(card.actions?.[1].url).toContain("Ticket%20%23606");
    expect(card.actions?.[2].url).toContain("teams.microsoft.com/l/chat");
  });

  it("prefers the original requester email on migrated tickets", () => {
    const card = generateNewTicketCard(makeTicket({ originalRequester: "old@vendor.com" }));
    expect(card.actions?.[1].url).toContain("mailto:old@vendor.com");
    expect((card.body[2] as { text: string }).text).toContain("old@vendor.com");
  });

  it("drops the contact actions when no requester email is known", () => {
    const card = generateNewTicketCard(
      makeTicket({ requester: { displayName: "Kiosk", email: "" } })
    );
    expect(card.actions).toHaveLength(1);
  });
});

describe("generateStatusChangeCard", () => {
  it("shows the transition, context and who changed it in three lines", () => {
    const card = generateStatusChangeCard(
      makeTicket({ status: "In Progress" }),
      "New",
      "Jane Doe"
    );
    const headline = (card.body[0] as { text: string }).text;
    expect(headline).toContain("**#606**");
    expect(headline).toContain("New →");
    expect(headline).toContain("In Progress");
    expect((card.body[2] as { text: string }).text).toContain("by Jane Doe");
    expect(card.body).toHaveLength(4);
  });
});

describe("generatePriorityEscalationCard", () => {
  it("flags urgent escalations and keeps the transition on the headline", () => {
    const card = generatePriorityEscalationCard(
      makeTicket({ priority: "Urgent" }),
      "Normal",
      "Jane Doe"
    );
    const headline = (card.body[0] as { text: string }).text;
    expect(headline).toContain("URGENT");
    expect(headline).toContain("Normal →");
    expect(headline).toContain("Urgent");
    expect(card.body).toHaveLength(4);
  });

  it("uses the softer escalated label below urgent", () => {
    const card = generatePriorityEscalationCard(makeTicket({ priority: "High" }), "Low", "Jane");
    expect((card.body[0] as { text: string }).text).toContain("ESCALATED");
  });
});
