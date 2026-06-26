import { describe, it, expect } from "vitest";
import { visibleCdw, mapToCdw, CDWBrief } from "./types";
import { validateCdw, validateBrief, briefToFormState } from "./validation";
import type { UserPermissions } from "@/types/rbac";

function brief(overrides: Partial<CDWBrief> = {}): CDWBrief {
  return {
    id: "1",
    title: "Campaign X",
    status: "Draft",
    requesterName: "PM",
    requesterEmail: "pm@x.com",
    created: "2026-06-26T00:00:00Z",
    modified: "2026-06-26T00:00:00Z",
    createdByEmail: "pm@x.com",
    createdByName: "PM",
    ...overrides,
  };
}

function perms(p: Partial<UserPermissions>): UserPermissions {
  return {
    role: "user",
    email: "",
    displayName: "",
    groupMemberships: [],
    editableDepartments: [],
    subtypeRestrictions: [],
    canDelete: false,
    canEditAllFields: false,
    canSeeAllTickets: false,
    canEditOtherDepartment: false,
    isPurchaser: false,
    isInventory: false,
    visibilityKeywordMatch: false,
    ...p,
  };
}

describe("visibleCdw", () => {
  it("an approved brief is public (visible even without permissions)", () => {
    expect(visibleCdw(brief({ status: "Approved" }), null)).toBe(true);
  });
  it("a draft is hidden from anonymous/unknown users", () => {
    expect(visibleCdw(brief({ status: "Draft" }), null)).toBe(false);
  });
  it("admins (the approvers) see non-public briefs", () => {
    expect(visibleCdw(brief({ status: "Pending Approval" }), perms({ role: "admin", email: "gm@x.com" }))).toBe(true);
  });
  it("the creator/requester sees their own draft", () => {
    expect(visibleCdw(brief({ status: "Draft" }), perms({ email: "pm@x.com" }))).toBe(true);
  });
  it("the named PM sees a non-public brief", () => {
    const b = brief({ status: "Pending Approval", projectManagerEmail: "lead@x.com" });
    expect(visibleCdw(b, perms({ email: "lead@x.com" }))).toBe(true);
  });
  it("an unrelated user cannot see a non-public brief", () => {
    expect(visibleCdw(brief({ status: "Pending Approval" }), perms({ email: "someone@x.com" }))).toBe(false);
  });
});

describe("validateCdw", () => {
  const complete = {
    values: { title: "Promo", deadline: "2026-07-01", quickTake: "Make a flyer" },
    persons: {
      projectManager: { displayName: "PM", email: "pm@x.com" },
      finalRecipient: { displayName: "Designer", email: "d@x.com" },
    },
  };

  it("requires a Project Name", () => {
    expect(validateCdw({}, {}, false)).toMatch(/Project Name/);
  });
  it("a draft only needs a Project Name", () => {
    expect(validateCdw({ title: "Promo" }, {}, false)).toBeNull();
  });
  it("submit requires every required field (e.g. Quick Take)", () => {
    const { values, persons } = complete;
    expect(validateCdw({ ...values, quickTake: "" }, persons, true)).toMatch(/Quick Take/);
  });
  it("submit requires the final recipient (a person field)", () => {
    const { values } = complete;
    expect(validateCdw(values, { projectManager: complete.persons.projectManager, finalRecipient: null }, true))
      .toMatch(/final/i);
  });
  it("passes when every required field is present", () => {
    expect(validateCdw(complete.values, complete.persons, true)).toBeNull();
  });
});

describe("briefToFormState + validateBrief (edit path)", () => {
  const full = brief({
    title: "Promo",
    deadline: "2026-07-01",
    quickTake: "Make a flyer",
    projectManagerName: "PM",
    projectManagerEmail: "pm@x.com",
    finalRecipientName: "Designer",
    finalRecipientEmail: "d@x.com",
  });

  it("hydrates form values + person pickers from a brief", () => {
    const { values, persons } = briefToFormState(full);
    expect(values.title).toBe("Promo");
    expect(values.quickTake).toBe("Make a flyer");
    expect(persons.projectManager).toEqual({ displayName: "PM", email: "pm@x.com" });
    expect(persons.finalRecipient).toEqual({ displayName: "Designer", email: "d@x.com" });
  });

  it("a complete brief passes the submit validator", () => {
    expect(validateBrief(full)).toBeNull();
  });

  it("an incomplete brief (e.g. no final recipient) is rejected before submit", () => {
    expect(validateBrief(brief({ title: "Promo", deadline: "2026-07-01", quickTake: "x", projectManagerEmail: "pm@x.com", projectManagerName: "PM" })))
      .toMatch(/final/i);
  });
});

describe("mapToCdw", () => {
  it("maps SharePoint fields to a CDWBrief", () => {
    const item = {
      id: "42",
      fields: {
        Title: "Campaign X",
        CdwStatus: "Pending Approval",
        Deadline: "2026-07-01",
        QuickTake: "Quick description",
        FinalRecipientName: "Designer",
        FinalRecipientEmail: "d@x.com",
        RequesterEmail: "pm@x.com",
      },
      createdDateTime: "2026-06-26T00:00:00Z",
      lastModifiedDateTime: "2026-06-26T00:00:00Z",
      createdBy: { user: { id: "u1", displayName: "PM", email: "pm@x.com" } },
    };
    const b = mapToCdw(item);
    expect(b.id).toBe("42");
    expect(b.status).toBe("Pending Approval");
    expect(b.deadline).toBe("2026-07-01");
    expect(b.finalRecipientEmail).toBe("d@x.com");
    expect(b.requesterEmail).toBe("pm@x.com");
  });
});
