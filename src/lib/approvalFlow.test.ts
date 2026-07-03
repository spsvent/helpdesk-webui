import { describe, it, expect } from "vitest";
import { shouldClearApprovalOnConversion } from "./approvalFlow";

describe("shouldClearApprovalOnConversion", () => {
  it("clears an awaiting Pending approval when converting Request → Problem", () => {
    expect(shouldClearApprovalOnConversion("Request", "Problem", "Pending")).toBe(true);
  });

  it("clears an awaiting Changes Requested approval when converting Request → Problem", () => {
    expect(shouldClearApprovalOnConversion("Request", "Problem", "Changes Requested")).toBe(true);
  });

  it("leaves a terminal Approved record intact on conversion", () => {
    expect(shouldClearApprovalOnConversion("Request", "Problem", "Approved")).toBe(false);
  });

  it("leaves a terminal Denied record intact on conversion", () => {
    expect(shouldClearApprovalOnConversion("Request", "Problem", "Denied")).toBe(false);
  });

  it("does nothing when there is no approval (None)", () => {
    expect(shouldClearApprovalOnConversion("Request", "Problem", "None")).toBe(false);
  });

  it("does nothing when the category is not actually changing", () => {
    expect(shouldClearApprovalOnConversion("Request", "Request", "Pending")).toBe(false);
  });

  it("only acts on the Request → Problem direction, not Problem → Request", () => {
    expect(shouldClearApprovalOnConversion("Problem", "Request", "Pending")).toBe(false);
  });
});
