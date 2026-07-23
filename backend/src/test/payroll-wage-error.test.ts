import { describe, expect, it } from "bun:test";
import { companyWageErrorPayload } from "../modules/payroll/payroll.controller";
import { WageConfigError } from "../services/wage-config.service";

describe("payroll wage error response", () => {
  it("returns the stable 422 payload shape with companyId", () => {
    const error = new WageConfigError(
      "COMPANY_WAGE_NOT_CONFIGURED",
      "Active wage configuration is required for company ID 16",
      422
    );
    expect(companyWageErrorPayload(error, 16)).toEqual({
      code: "COMPANY_WAGE_NOT_CONFIGURED",
      message: "Active wage configuration is required for company ID 16",
      companyId: 16,
    });
    expect(error.status).toBe(422);
  });
});
