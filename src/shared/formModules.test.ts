import { describe, it, expect } from "vitest";
import { isPublicModuleRoute } from "./formModules";

describe("isPublicModuleRoute", () => {
  it("matches the built-in ticket approve page", () => {
    expect(isPublicModuleRoute("/approve")).toBe(true);
    expect(isPublicModuleRoute("/approve/")).toBe(true);
  });

  it("matches module-contributed approve landings, incl. static-export trailing slash", () => {
    expect(isPublicModuleRoute("/cdw/approve")).toBe(true);
    expect(isPublicModuleRoute("/cdw/approve/")).toBe(true);
    expect(isPublicModuleRoute("/purchase/approve")).toBe(true);
    expect(isPublicModuleRoute("/purchase/approve/")).toBe(true);
  });

  it("is anchored — does not match lookalike or sibling routes", () => {
    expect(isPublicModuleRoute("/approvals")).toBe(false);
    expect(isPublicModuleRoute("/approvexyz")).toBe(false);
    expect(isPublicModuleRoute("/cdw/approvexyz")).toBe(false);
    expect(isPublicModuleRoute("/cdw")).toBe(false);
    expect(isPublicModuleRoute("/purchase/new")).toBe(false);
    expect(isPublicModuleRoute("/")).toBe(false);
  });
});
