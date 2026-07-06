import { afterEach, describe, it, expect } from "vitest";
import { visibleCdw, mapToCdw, isEditableCdwStatus, CDWBrief, CDW_STATUSES } from "./types";
import { validateCdw, validateBrief, briefToFormState, buildCdwPayload } from "./validation";
import { canCreateCdw, canEditCdw } from "./access";
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

describe("isEditableCdwStatus", () => {
  it("only Draft and Changes Requested briefs are editable", () => {
    expect(isEditableCdwStatus("Draft")).toBe(true);
    expect(isEditableCdwStatus("Changes Requested")).toBe(true);
  });
  it("a brief in (or past) approval is frozen — status and attribution can't ride on rewritten content", () => {
    expect(isEditableCdwStatus("Pending Approval")).toBe(false);
    expect(isEditableCdwStatus("Approved")).toBe(false);
    expect(isEditableCdwStatus("Denied")).toBe(false);
  });
  it("covers every status (a new status must be classified here explicitly)", () => {
    const editable = CDW_STATUSES.filter(isEditableCdwStatus);
    expect(editable).toEqual(["Draft", "Changes Requested"]);
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

describe("canCreateCdw / canEditCdw (access)", () => {
  const GROUP = "marketing-group-id";
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_CDW_REQUESTERS_GROUP_ID;
  });

  it("admins can always create", () => {
    expect(canCreateCdw(perms({ role: "admin" }))).toBe(true);
  });
  it("with no requesters group set, any signed-in user can create (but not anonymous)", () => {
    expect(canCreateCdw(perms({ role: "user" }))).toBe(true);
    expect(canCreateCdw(perms({ role: "support" }))).toBe(true);
    expect(canCreateCdw(null)).toBe(false);
  });
  it("with a requesters group set, only its members can create (admins still can)", () => {
    process.env.NEXT_PUBLIC_CDW_REQUESTERS_GROUP_ID = GROUP;
    expect(canCreateCdw(perms({ role: "user", groupMemberships: [GROUP] }))).toBe(true);
    expect(canCreateCdw(perms({ role: "user", groupMemberships: ["other"] }))).toBe(false);
    // a staff member NOT in the group no longer qualifies once the group gates it
    expect(canCreateCdw(perms({ role: "support", groupMemberships: [] }))).toBe(false);
    expect(canCreateCdw(perms({ role: "admin", groupMemberships: [] }))).toBe(true);
  });

  it("canEditCdw: owner (creator/requester) or admin only", () => {
    const owned = { createdByEmail: "pm@x.com", requesterEmail: "pm@x.com" };
    expect(canEditCdw(owned, perms({ email: "pm@x.com" }))).toBe(true);
    expect(canEditCdw(owned, perms({ email: "other@x.com" }))).toBe(false);
    expect(canEditCdw(owned, perms({ role: "admin", email: "gm@x.com" }))).toBe(true);
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

describe("buildCdwPayload (create omits empties; edit nulls them so columns clear)", () => {
  const values = { title: "Promo", quickTake: "Make a flyer", campaign: "  " };
  const persons = {
    projectManager: { displayName: "PM", email: "pm@x.com" },
    finalRecipient: null,
  };

  it("create mode: only writes filled fields and present persons", () => {
    const p = buildCdwPayload(values, persons, false);
    expect(p).toEqual({
      title: "Promo",
      quickTake: "Make a flyer",
      projectManagerName: "PM",
      projectManagerEmail: "pm@x.com",
    });
    // Emptied/absent keys are omitted entirely, not written as blanks.
    expect("campaign" in p).toBe(false);
    expect("finalRecipientEmail" in p).toBe(false);
  });

  it("edit mode: emptied fields and removed persons are written as null (clears the column)", () => {
    const p = buildCdwPayload(values, persons, true);
    expect(p.title).toBe("Promo");
    expect(p.campaign).toBeNull();
    expect(p.deadline).toBeNull();
    expect(p.finalRecipientName).toBeNull();
    expect(p.finalRecipientEmail).toBeNull();
    // A person who is still set is written normally.
    expect(p.projectManagerEmail).toBe("pm@x.com");
  });

  it("never includes requester or workflow fields (set at creation / by the approval path)", () => {
    const p = buildCdwPayload(values, persons, true);
    expect("requesterEmail" in p).toBe(false);
    expect("status" in p).toBe(false);
    expect("approvedByName" in p).toBe(false);
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
