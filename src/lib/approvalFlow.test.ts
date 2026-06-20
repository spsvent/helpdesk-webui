import { describe, it, expect } from "vitest";
import {
  shouldClearApprovalOnConversion,
  isProblemConversionBlocked,
} from "./approvalFlow";

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

describe("isProblemConversionBlocked", () => {
  it("blocks converting a purchase request to a Problem", () => {
    expect(isProblemConversionBlocked({ isPurchaseRequest: true }, "Problem")).toBe(true);
  });

  it("allows converting a non-purchase Request to a Problem", () => {
    expect(isProblemConversionBlocked({ isPurchaseRequest: false }, "Problem")).toBe(false);
  });

  it("treats an undefined isPurchaseRequest as not a purchase request", () => {
    expect(isProblemConversionBlocked({}, "Problem")).toBe(false);
  });

  it("does not block a purchase request that stays a Request", () => {
    expect(isProblemConversionBlocked({ isPurchaseRequest: true }, "Request")).toBe(false);
  });
});
