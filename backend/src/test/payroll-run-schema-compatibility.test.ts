import { describe, expect, it } from "bun:test";
import { Prisma } from "@prisma/client";
import {
  PAYROLL_RUN_SCHEMA_NOT_INITIALIZED,
  getPayrollRunSchemaReadiness,
  isPayrollRunSchemaNotInitialized,
  withPayrollRunSchemaFallback,
  withPayrollRunReadinessGate,
} from "../modules/payroll-runs/payroll-run-schema";

const root = new URL("../../", import.meta.url);
const read = (path: string) => Bun.file(new URL(path, root)).text();

function knownError(code: string, table: string) {
  return new Prisma.PrismaClientKnownRequestError("database request failed", {
    code,
    clientVersion: "7.9.0",
    meta: { table },
  });
}

function adapterKnownError(code: string, table: string) {
  return new Prisma.PrismaClientKnownRequestError("database request failed", {
    code,
    clientVersion: "7.9.0",
    meta: {
      modelName: table,
      driverAdapterError: {
        name: "DriverAdapterError",
        cause: {
          kind: "TableDoesNotExist",
          table,
        },
      },
    },
  });
}

describe("pre-migration payroll run compatibility", () => {
  const missingSchemaClient = {
    $queryRaw: (async () => []) as never,
  };

  it("RUN-GATE-001 blocks list before payroll_runs.findMany", async () => {
    let findManyCalls = 0;
    await expect(
      withPayrollRunReadinessGate(
        async () => {
          findManyCalls += 1;
          return [];
        },
        missingSchemaClient
      )
    ).rejects.toMatchObject({
      code: "PAYROLL_RUN_SCHEMA_NOT_INITIALIZED",
      status: 503,
    });
    expect(findManyCalls).toBe(0);
  });

  it("RUN-GATE-002 blocks detail before a Monthly Run lookup", async () => {
    let detailLookupCalls = 0;
    await expect(
      withPayrollRunReadinessGate(
        async () => {
          detailLookupCalls += 1;
          return null;
        },
        missingSchemaClient
      )
    ).rejects.toMatchObject({ status: 503 });
    expect(detailLookupCalls).toBe(0);
  });

  it("RUN-GATE-003 blocks write endpoints before mutation", async () => {
    let mutationCalls = 0;
    await expect(
      withPayrollRunReadinessGate(
        async () => {
          mutationCalls += 1;
          return null;
        },
        missingSchemaClient
      )
    ).rejects.toMatchObject({ status: 503 });
    expect(mutationCalls).toBe(0);
    const route = await read("src/modules/payroll-runs/payroll-run.route.ts");
    const endpointDefinitions = route.slice(route.indexOf("export const payrollRunRoute"));
    expect(endpointDefinitions.match(/guardedScopedAction\(/g)?.length).toBe(14);
  });

  it("RUN-SCHEMA-001 maps a missing payroll-run table to the stable 503 contract", async () => {
    for (const table of [
      "payroll.payroll_runs",
      "`payroll`.`payroll_run_items`",
      "payroll_run_attendance_links",
    ]) {
      expect(isPayrollRunSchemaNotInitialized(knownError("P2021", table))).toBe(
        true
      );
    }
    expect(
      isPayrollRunSchemaNotInitialized(
        adapterKnownError("P2021", "payroll_runs")
      )
    ).toBe(true);
    expect(PAYROLL_RUN_SCHEMA_NOT_INITIALIZED.code).toBe(
      "PAYROLL_RUN_SCHEMA_NOT_INITIALIZED"
    );
    const route = await read("src/modules/payroll-runs/payroll-run.route.ts");
    expect(route).toContain("set.status = 503");
    expect(route).toContain("PAYROLL_RUN_SCHEMA_NOT_INITIALIZED");
  });

  it("RUN-SCHEMA-002 falls back to live payroll once when payroll_runs is absent", async () => {
    let monthlyQueries = 0;
    let liveQueries = 0;
    const rows = await withPayrollRunSchemaFallback(
      async () => {
        monthlyQueries += 1;
        throw knownError("P2021", "payroll_runs");
      },
      async () => {
        liveQueries += 1;
        return [{ employee_code: "EMP001", net_income: "1000.00" }];
      }
    );
    expect(rows).toHaveLength(1);
    expect(monthlyQueries).toBe(1);
    expect(liveQueries).toBe(1);
  });

  it("RUN-SCHEMA-003 does not fall back for P2021 from another table", async () => {
    const error = knownError("P2021", "attendance_records");
    expect(isPayrollRunSchemaNotInitialized(error)).toBe(false);
    await expect(
      withPayrollRunSchemaFallback(
        async () => {
          throw error;
        },
        () => []
      )
    ).rejects.toBe(error);
  });

  it("RUN-GATE-008 does not treat a database timeout as uninitialized schema", async () => {
    const timeout = new Error("database pool timeout");
    expect(isPayrollRunSchemaNotInitialized(timeout)).toBe(false);
    await expect(
      withPayrollRunSchemaFallback(
        async () => {
          throw timeout;
        },
        () => []
      )
    ).rejects.toBe(timeout);
  });

  it("RUN-SCHEMA-005 keeps locked run items when the schema is initialized", async () => {
    let fallbackCalls = 0;
    const locked = [{ employee_code_snapshot: "EMP001", net_income: "900.00" }];
    const result = await withPayrollRunSchemaFallback(
      async () => locked,
      () => {
        fallbackCalls += 1;
        return [];
      }
    );
    expect(result).toEqual(locked);
    expect(fallbackCalls).toBe(0);
  });

  it("RUN-GATE-004 reports readiness without Monthly Run Prisma models", async () => {
    const queries: unknown[] = [];
    const readiness = await getPayrollRunSchemaReadiness({
      $queryRaw: (async (query: unknown) => {
        queries.push(query);
        return [
          { tableName: "payroll_runs" },
          { tableName: "payroll_run_items" },
        ];
      }) as never,
    });
    expect(readiness).toEqual({
      initialized: false,
      missingTables: ["payroll_run_attendance_links"],
    });
    expect(queries).toHaveLength(1);
  });

  it("RUN-GATE-005 declares readiness before the dynamic run route", async () => {
    const route = await read("src/modules/payroll-runs/payroll-run.route.ts");
    expect(route.indexOf('"/readiness"')).toBeLessThan(
      route.indexOf('"/:runId"')
    );
    const readinessStart = route.indexOf('"/readiness"');
    const nextRouteStart = route.indexOf("\n  .get(", readinessStart);
    const readinessBlock = route.slice(
      readinessStart,
      nextRouteStart
    );
    expect(readinessBlock).toContain("getPayrollRunSchemaReadiness()");
    expect(readinessBlock).not.toContain("guardedScopedAction(");
  });

  it("RUN-GATE-009 keeps the legacy payroll success response after fallback", async () => {
    const rows = await withPayrollRunSchemaFallback(
      async () => {
        throw knownError("P2021", "payroll_runs");
      },
      () => [{ employee_code: "EMP001" }]
    );
    const controller = await read("src/modules/payroll/payroll.controller.ts");
    expect(rows).toHaveLength(1);
    expect(controller).toContain("success: true");
    expect(controller).toContain("data,");
  });
});
