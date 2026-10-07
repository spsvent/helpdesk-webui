import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@microsoft/microsoft-graph-client";
import type { SharePointListItem } from "@/types/ticket";
import { getTickets, getArchivedTickets, invalidateTicketsCache } from "./graphClient";

vi.mock("./teamsAuth", () => ({}));
vi.mock("./authActions", () => ({}));
vi.mock("./appInsights", () => ({ trackEvent: vi.fn() }));

function item(id: string, status = "New", created = new Date().toISOString()): SharePointListItem {
  return {
    id,
    fields: { Title: `Ticket ${id}`, Status: status, Category: "Request", ApprovalStatus: "Pending" },
    createdDateTime: created,
    lastModifiedDateTime: created,
    createdBy: { user: { id: "requester", displayName: "Requester" } },
  };
}

describe("ticket list pagination", () => {
  beforeEach(() => invalidateTicketsCache());

  it("includes active tickets from every page and shares the complete cache with archives", async () => {
    const next = "https://graph.microsoft.com/v1.0/sites/site/lists/tickets/items?$skiptoken=page2";
    const last = "https://graph.microsoft.com/v1.0/sites/site/lists/tickets/items?$skiptoken=page3";
    const get = vi.fn()
      .mockResolvedValueOnce({ value: Array.from({ length: 500 }, (_, i) => item(String(i + 1))), "@odata.nextLink": next })
      .mockResolvedValueOnce({ value: [item("769")], "@odata.nextLink": last })
      .mockResolvedValueOnce({ value: [item("old-active", "New", "2020-01-01"), item("archived", "Closed", "2020-01-01")] });
    const api = vi.fn(() => ({ get }));
    const client = { api } as unknown as Client;

    const active = await getTickets(client);
    expect(active).toHaveLength(502);
    expect(active.map(t => t.id)).toEqual(expect.arrayContaining(["769", "old-active"]));
    expect(api).toHaveBeenNthCalledWith(2, next);
    expect(api).toHaveBeenNthCalledWith(3, last);
    expect((await getArchivedTickets(client)).map(t => t.id)).toEqual(["archived"]);
    expect(get).toHaveBeenCalledTimes(3);
  });

  it("does not cache a partial list when a later page fails", async () => {
    const get = vi.fn()
      .mockResolvedValueOnce({ value: [item("1")], "@odata.nextLink": "https://graph.microsoft.com/v1.0/next" })
      .mockRejectedValueOnce(new Error("Page failed"))
      .mockResolvedValueOnce({ value: [item("1"), item("769")] });
    const client = { api: vi.fn(() => ({ get })) } as unknown as Client;

    await expect(getTickets(client)).rejects.toThrow("Page failed");
    expect((await getTickets(client)).map(t => t.id)).toEqual(["1", "769"]);
    expect(get).toHaveBeenCalledTimes(3);
  });
});
