import { describe, it, expect } from "vitest";
import {
  collectParticipants,
  parseParticipantEmails,
  serializeParticipantEmails,
  staffSubset,
} from "./participants";

describe("parse/serialize", () => {
  it("parses delimited strings, trims, drops blanks", () => {
    expect(parseParticipantEmails("a@x.com; b@x.com ,, c@x.com")).toEqual([
      "a@x.com", "b@x.com", "c@x.com",
    ]);
    expect(parseParticipantEmails(undefined)).toEqual([]);
    expect(parseParticipantEmails("")).toEqual([]);
  });

  it("serializes with a consistent delimiter", () => {
    expect(serializeParticipantEmails(["a@x.com", "b@x.com"])).toBe("a@x.com; b@x.com");
  });
});

describe("collectParticipants", () => {
  it("unions all sources, lowercases, dedupes, excludes the actor", () => {
    const result = collectParticipants(
      {
        requesterEmail: "Req@X.com",
        assigneeEmail: "assignee@x.com",
        approverEmail: "gm@x.com",
        approvalRequesterEmail: "asker@x.com",
        manualEmails: ["vendor@x.com", "req@x.com"],
        commenterEmails: ["tom@x.com", "assignee@x.com"],
      },
      "gm@x.com"
    );
    expect(result.sort()).toEqual(
      ["asker@x.com", "assignee@x.com", "req@x.com", "tom@x.com", "vendor@x.com"].sort()
    );
    expect(result).not.toContain("gm@x.com");
  });

  it("handles missing fields gracefully", () => {
    expect(collectParticipants({ requesterEmail: "a@x.com" }, undefined)).toEqual(["a@x.com"]);
    expect(collectParticipants({}, "a@x.com")).toEqual([]);
  });
});

describe("staffSubset", () => {
  it("keeps only emails present in the staff set (case-insensitive)", () => {
    const staff = ["assignee@x.com", "GM@x.com"];
    expect(staffSubset(["req@x.com", "assignee@x.com", "gm@x.com"], staff).sort()).toEqual(
      ["assignee@x.com", "gm@x.com"].sort()
    );
  });
});
