import { describe, expect, it } from "bun:test";
import { Prisma } from "@prisma/client";
import {
  CompanyWageError,
  validateCreateInput,
  validatePatchInput,
} from "../modules/company-wages/company-wage.policy";
import {
  createCompanyWage,
  listCompanyWages,
  serializeCompanyWage,
} from "../modules/company-wages/company-wage.service";
import {
  applyWageToRow,
  deriveSnapshotOt1Income,
} from "../modules/payroll/payroll.service";
import {
  getActiveWageConfig,
  WageConfigError,
  type WageConfig,
} from "../services/wage-config.service";

function wage(overrides: Partial<WageConfig> = {}): WageConfig {
  return {
    id: 1n,
    company_id: 39,
    daily_wage: new Prisma.Decimal("400.25"),
    work_hours_per_day: new Prisma.Decimal("8"),
    ot1_multiplier: new Prisma.Decimal("1"),
    ot15_multiplier: new Prisma.Decimal("1.5"),
    ot2_multiplier: new Prisma.Decimal("2"),
    ot3_multiplier: new Prisma.Decimal("3"),
    is_active: true,
    ...overrides,
  };
}

describe("company wage validation and decimal API", () => {
  it("accepts positive decimal strings and applies defaults", () => {
    const parsed = validateCreateInput({ dailyWage: "400.25" });
    expect(parsed.dailyWage.toFixed()).toBe("400.25");
    expect(parsed.workHoursPerDay.toFixed()).toBe("8");
    expect(parsed.ot15Multiplier.toFixed()).toBe("1.5");
    expect(parsed.isActive).toBe(true);
  });

  it("rejects invalid daily wage, work hours, and multipliers", () => {
    expect(() => validateCreateInput({ dailyWage: "0" })).toThrow(CompanyWageError);
    expect(() =>
      validateCreateInput({ dailyWage: "400", workHoursPerDay: "25" })
    ).toThrow("Work hours per day is outside the allowed range");
    expect(() => validatePatchInput({ ot2Multiplier: "-2" })).toThrow(
      "OT 2 multiplier must be a positive decimal"
    );
  });

  it("serializes Decimal and BigInt without losing precision", () => {
    const serialized = serializeCompanyWage({
      ...wage(),
      created_by: 7n,
      updated_by: null,
      created_at: new Date("2026-01-01T00:00:00Z"),
      updated_at: new Date("2026-01-02T00:00:00Z"),
    });
    expect(serialized.dailyWage).toBe("400.25");
    expect(serialized.id).toBe("1");
    expect(serialized.createdBy).toBe("7");
  });
});

describe("company-scoped payroll wage lookup", () => {
  it("queries the requested company and returns its active row", async () => {
    const values: unknown[] = [];
    const db = {
      $queryRaw: async (_strings: TemplateStringsArray, ...parameters: unknown[]) => {
        values.push(...parameters);
        return [wage()];
      },
    };
    const result = await getActiveWageConfig(39, db as any);
    expect(result.company_id).toBe(39);
    expect(values).toContain(39);
  });

  it("fails closed without a company row and never returns a fallback", async () => {
    const db = { $queryRaw: async () => [] };
    await expect(getActiveWageConfig(39, db as any)).rejects.toMatchObject({
      code: "COMPANY_WAGE_NOT_CONFIGURED",
      status: 422,
    });
  });

  it("maps missing table or column errors to WAGE_SCHEMA_NOT_READY", async () => {
    const db = {
      $queryRaw: async () => {
        throw { code: "P2010", meta: { code: "1146" } };
      },
    };
    await expect(getActiveWageConfig(39, db as any)).rejects.toMatchObject({
      code: "WAGE_SCHEMA_NOT_READY",
      status: 503,
    } satisfies Partial<WageConfigError>);
  });
});

describe("payroll calculation", () => {
  it("uses company daily wage and configured OT1/OT1.5/OT2 multipliers", () => {
    const result = applyWageToRow(
      { work_days: 2, total_ot1: 1, total_ot15: 2, total_ot2: 3 },
      wage({ daily_wage: new Prisma.Decimal("400") })
    );
    expect(result.base_income).toBe(800);
    expect(result.ot1_income).toBe(50);
    expect(result.ot15_income).toBe(150);
    expect(result.ot2_income).toBe(300);
    expect(result.gross_income).toBe(1300);
  });

  it("does not expose a fabricated OT3 attendance input", async () => {
    const fieldEntry = await Bun.file(
      new URL(
        "../../../frontend/src/pages/FieldAttendanceEntry.tsx",
        import.meta.url
      )
    ).text();
    expect(fieldEntry).not.toContain('{ label: "OT 3"');
    expect(fieldEntry).toContain('{ label: "OT 2", field: "ot2" }');
  });

  it("preserves OT1 income when reading the existing snapshot shape", () => {
    expect(
      deriveSnapshotOt1Income({
        gross_income: 1300,
        base_income: 800,
        ot15_income: 150,
        ot2_income: 300,
      })
    ).toBe(50);
  });
});

describe("company wage transaction boundary", () => {
  it("lists all companies in one query including a null wage config", async () => {
    let calls = 0;
    const db = {
      $queryRaw: async () => {
        calls += 1;
        return [
          {
            company_id: 39,
            company_name: "Example",
            id: null,
            daily_wage: null,
            work_hours_per_day: null,
            ot1_multiplier: null,
            ot15_multiplier: null,
            ot2_multiplier: null,
            ot3_multiplier: null,
            is_active: null,
            created_by: null,
            updated_by: null,
            created_at: null,
            updated_at: null,
          },
        ];
      },
    };
    expect(await listCompanyWages(db as any)).toEqual([
      { companyId: 39, companyName: "Example", wageConfig: null },
    ]);
    expect(calls).toBe(1);
  });

  it("rejects a duplicate company wage before writing", async () => {
    let queryCall = 0;
    let writes = 0;
    const tx = {
      $queryRaw: async () => {
        queryCall += 1;
        return queryCall === 1
          ? [{ id: 39, company_name: "Example" }]
          : [wage()];
      },
      $executeRaw: async () => { writes += 1; },
      payroll_audit_logs: { create: async () => ({}) },
    };
    const database = { $transaction: (operation: (value: any) => unknown) => operation(tx) };
    await expect(
      createCompanyWage(
        39,
        { dailyWage: "400" },
        { id: "1", role: "cyd_admin" },
        "request-1",
        database as any
      )
    ).rejects.toMatchObject({ code: "COMPANY_WAGE_ALREADY_EXISTS", status: 409 });
    expect(writes).toBe(0);
  });

  it("rolls back the simulated mutation when audit persistence fails", async () => {
    const committed = { wageWritten: false };
    let queryCall = 0;
    const database = {
      $transaction: async (operation: (tx: any) => Promise<unknown>) => {
        const pending = { ...committed };
        try {
          const result = await operation({
            $queryRaw: async () => {
              queryCall += 1;
              if (queryCall === 1) return [{ id: 39, company_name: "Example" }];
              if (queryCall === 2) return [];
              return [{
                ...wage(),
                created_by: 1n,
                updated_by: 1n,
                created_at: new Date("2026-01-01T00:00:00Z"),
                updated_at: new Date("2026-01-01T00:00:00Z"),
              }];
            },
            $executeRaw: async () => { pending.wageWritten = true; },
            payroll_audit_logs: {
              create: async () => { throw new Error("audit write failed"); },
            },
          });
          Object.assign(committed, pending);
          return result;
        } catch (error) {
          throw error;
        }
      },
    };

    await expect(
      createCompanyWage(
        39,
        { dailyWage: "400" },
        { id: "1", username: "admincyd", role: "cyd_admin" },
        "request-2",
        database as any
      )
    ).rejects.toThrow("audit write failed");
    expect(committed).toEqual({ wageWritten: false });
  });
});

describe("company wage authorization and audit wiring", () => {
  it("keeps list and mutation management restricted to cyd_admin", async () => {
    const route = await Bun.file(
      new URL("../modules/company-wages/company-wage.route.ts", import.meta.url)
    ).text();
    expect(route).toContain('{ beforeHandle: requireRole(["cyd_admin"]) }');
    expect(route).toContain(
      'requireRole(["cyd_admin", "admin", "accounting"])'
    );
    expect(route.match(/beforeHandle: requireWageMutation/g)?.length).toBe(2);
    expect(route).toContain("FORBIDDEN_WAGE_MUTATION");
    expect(route).not.toContain('"hr"');
    expect(route).not.toContain('"viewer"');
    expect(route).not.toContain('"field_staff"');
  });

  it("records safe mutation audit metadata inside the transaction", async () => {
    const service = await Bun.file(
      new URL("../modules/company-wages/company-wage.service.ts", import.meta.url)
    ).text();
    for (const field of [
      "actorUserId",
      "actorRole",
      "targetCompanyId",
      "wageConfigId",
      "requestId",
      "before",
      "after",
      "timestamp",
    ]) {
      expect(service).toContain(field);
    }
    expect(service).not.toMatch(/password|token|secret/i);
  });
});
