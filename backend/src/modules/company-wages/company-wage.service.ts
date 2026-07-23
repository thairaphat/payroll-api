import { Prisma } from "@prisma/client";
import { prisma } from "../../db";
import type { AuthUser } from "../../middlewares/auth.middleware";
import {
  CompanyWageError,
  parseCompanyId,
  toSchemaReadyError,
  validateCreateInput,
  validatePatchInput,
} from "./company-wage.policy";
import type {
  CompanyWageConfig,
  CompanyWageInput,
  CompanyWageListRow,
  CompanyWagePatch,
} from "./company-wage.types";

type QueryClient = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;
type TransactionRunner = Pick<typeof prisma, "$transaction">;

export async function withCompanyWageTransaction<T>(
  database: TransactionRunner,
  mutation: (tx: Prisma.TransactionClient) => Promise<T>
) {
  return database.$transaction(mutation);
}

function decimal(value: Prisma.Decimal | null) {
  return value == null ? null : value.toFixed();
}

export function serializeCompanyWage(row: CompanyWageConfig) {
  return {
    id: row.id.toString(),
    companyId: row.company_id,
    dailyWage: decimal(row.daily_wage),
    workHoursPerDay: decimal(row.work_hours_per_day),
    ot1Multiplier: decimal(row.ot1_multiplier),
    ot15Multiplier: decimal(row.ot15_multiplier),
    ot2Multiplier: decimal(row.ot2_multiplier),
    ot3Multiplier: decimal(row.ot3_multiplier),
    isActive: Boolean(row.is_active),
    createdBy: row.created_by?.toString() ?? null,
    updatedBy: row.updated_by?.toString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function serializeListRow(row: CompanyWageListRow) {
  return {
    companyId: row.company_id,
    companyName: row.company_name,
    wageConfig:
      row.id == null
        ? null
        : serializeCompanyWage({
            id: row.id,
            company_id: row.company_id,
            daily_wage: row.daily_wage!,
            work_hours_per_day: row.work_hours_per_day!,
            ot1_multiplier: row.ot1_multiplier!,
            ot15_multiplier: row.ot15_multiplier!,
            ot2_multiplier: row.ot2_multiplier!,
            ot3_multiplier: row.ot3_multiplier!,
            is_active: Boolean(row.is_active),
            created_by: row.created_by,
            updated_by: row.updated_by,
            created_at: row.created_at!,
            updated_at: row.updated_at!,
          }),
  };
}

async function companyOrThrow(db: QueryClient, companyId: number, lock = false) {
  const suffix = lock ? Prisma.sql` FOR UPDATE` : Prisma.empty;
  const rows = await db.$queryRaw<Array<{ id: number; company_name: string }>>(
    Prisma.sql`SELECT id, company_name FROM companies WHERE id = ${companyId}${suffix}`
  );
  const company = rows[0];
  if (!company) {
    throw new CompanyWageError(
      "COMPANY_NOT_FOUND",
      `Company ID ${companyId} was not found`,
      404
    );
  }
  return company;
}

async function configByCompany(
  db: QueryClient,
  companyId: number,
  lock = false
): Promise<CompanyWageConfig | null> {
  const suffix = lock ? Prisma.sql` FOR UPDATE` : Prisma.empty;
  const rows = await db.$queryRaw<CompanyWageConfig[]>(
    Prisma.sql`SELECT
      id, company_id, daily_wage, work_hours_per_day,
      ot1_multiplier, ot15_multiplier, ot2_multiplier, ot3_multiplier,
      is_active, created_by, updated_by, created_at, updated_at
    FROM payroll_company_wage_configs
    WHERE company_id = ${companyId}${suffix}`
  );
  return rows[0] ?? null;
}

function safeAuditValue(config: CompanyWageConfig | null) {
  return config ? serializeCompanyWage(config) : null;
}

async function writeMutationAudit(
  tx: Prisma.TransactionClient,
  action:
    | "COMPANY_WAGE_CREATED"
    | "COMPANY_WAGE_UPDATED"
    | "COMPANY_WAGE_ACTIVATED"
    | "COMPANY_WAGE_DEACTIVATED",
  actor: AuthUser,
  targetCompanyId: number,
  wageConfigId: bigint,
  requestId: string,
  before: CompanyWageConfig | null,
  after: CompanyWageConfig
) {
  await tx.payroll_audit_logs.create({
    data: {
      action,
      actor_user_id: actor.id ? Number(actor.id) : null,
      actor_username: actor.username ?? null,
      actor_role: actor.role,
      entity_type: "company_wage",
      entity_scope: { targetCompanyId, requestId },
      metadata: {
        actorUserId: actor.id ?? null,
        actorRole: actor.role,
        targetCompanyId,
        wageConfigId: wageConfigId.toString(),
        requestId,
        before: safeAuditValue(before),
        after: safeAuditValue(after),
        timestamp: new Date().toISOString(),
      } as any,
    },
  });
}

function translate(error: unknown): never {
  if (error instanceof CompanyWageError) throw error;
  return toSchemaReadyError(error);
}

export async function listCompanyWages(db: QueryClient = prisma) {
  try {
    const rows = await db.$queryRaw<CompanyWageListRow[]>`
      SELECT
        c.id AS company_id,
        c.company_name,
        w.id,
        w.daily_wage,
        w.work_hours_per_day,
        w.ot1_multiplier,
        w.ot15_multiplier,
        w.ot2_multiplier,
        w.ot3_multiplier,
        w.is_active,
        w.created_by,
        w.updated_by,
        w.created_at,
        w.updated_at
      FROM companies c
      LEFT JOIN payroll_company_wage_configs w ON w.company_id = c.id
      ORDER BY c.id ASC
    `;
    return rows.map(serializeListRow);
  } catch (error) {
    return translate(error);
  }
}

export async function getCompanyWage(
  companyIdValue: unknown,
  db: QueryClient = prisma
) {
  const companyId = parseCompanyId(companyIdValue);
  try {
    const company = await companyOrThrow(db, companyId);
    const wageConfig = await configByCompany(db, companyId);
    return {
      companyId,
      companyName: company.company_name,
      wageConfig: wageConfig ? serializeCompanyWage(wageConfig) : null,
    };
  } catch (error) {
    return translate(error);
  }
}

export async function createCompanyWage(
  companyIdValue: unknown,
  body: CompanyWageInput,
  actor: AuthUser,
  requestId: string,
  database: TransactionRunner = prisma
) {
  const companyId = parseCompanyId(companyIdValue);
  const input = validateCreateInput(body);
  try {
    return await withCompanyWageTransaction(database, async (tx) => {
      await companyOrThrow(tx, companyId, true);
      if (await configByCompany(tx, companyId, true)) {
        throw new CompanyWageError(
          "COMPANY_WAGE_ALREADY_EXISTS",
          `Company ID ${companyId} already has a wage configuration`,
          409
        );
      }

      await tx.$executeRaw`
        INSERT INTO payroll_company_wage_configs (
          company_id, daily_wage, work_hours_per_day,
          ot1_multiplier, ot15_multiplier, ot2_multiplier, ot3_multiplier,
          is_active, created_by, updated_by
        ) VALUES (
          ${companyId}, ${input.dailyWage}, ${input.workHoursPerDay},
          ${input.ot1Multiplier}, ${input.ot15Multiplier},
          ${input.ot2Multiplier}, ${input.ot3Multiplier},
          ${input.isActive}, ${actor.id ? BigInt(actor.id) : null},
          ${actor.id ? BigInt(actor.id) : null}
        )
      `;
      const created = await configByCompany(tx, companyId, true);
      if (!created) throw new Error("Created company wage could not be loaded");
      await writeMutationAudit(
        tx,
        "COMPANY_WAGE_CREATED",
        actor,
        companyId,
        created.id,
        requestId,
        null,
        created
      );
      return serializeCompanyWage(created);
    });
  } catch (error) {
    return translate(error);
  }
}

export async function updateCompanyWage(
  companyIdValue: unknown,
  body: CompanyWagePatch,
  actor: AuthUser,
  requestId: string,
  database: TransactionRunner = prisma
) {
  const companyId = parseCompanyId(companyIdValue);
  const input = validatePatchInput(body);
  try {
    return await withCompanyWageTransaction(database, async (tx) => {
      await companyOrThrow(tx, companyId, true);
      const before = await configByCompany(tx, companyId, true);
      if (!before) {
        throw new CompanyWageError(
          "COMPANY_WAGE_NOT_FOUND",
          `Company ID ${companyId} does not have a wage configuration`,
          404
        );
      }

      const assignments: Prisma.Sql[] = [];
      if (input.dailyWage !== undefined)
        assignments.push(Prisma.sql`daily_wage = ${input.dailyWage}`);
      if (input.workHoursPerDay !== undefined)
        assignments.push(
          Prisma.sql`work_hours_per_day = ${input.workHoursPerDay}`
        );
      if (input.ot1Multiplier !== undefined)
        assignments.push(Prisma.sql`ot1_multiplier = ${input.ot1Multiplier}`);
      if (input.ot15Multiplier !== undefined)
        assignments.push(Prisma.sql`ot15_multiplier = ${input.ot15Multiplier}`);
      if (input.ot2Multiplier !== undefined)
        assignments.push(Prisma.sql`ot2_multiplier = ${input.ot2Multiplier}`);
      if (input.ot3Multiplier !== undefined)
        assignments.push(Prisma.sql`ot3_multiplier = ${input.ot3Multiplier}`);
      if (input.isActive !== undefined)
        assignments.push(Prisma.sql`is_active = ${input.isActive}`);
      assignments.push(
        Prisma.sql`updated_by = ${actor.id ? BigInt(actor.id) : null}`
      );

      await tx.$executeRaw(
        Prisma.sql`UPDATE payroll_company_wage_configs
          SET ${Prisma.join(assignments, ", ")}
          WHERE company_id = ${companyId}`
      );
      const after = await configByCompany(tx, companyId, true);
      if (!after) throw new Error("Updated company wage could not be loaded");

      const action =
        !Boolean(before.is_active) && Boolean(after.is_active)
          ? "COMPANY_WAGE_ACTIVATED"
          : Boolean(before.is_active) && !Boolean(after.is_active)
            ? "COMPANY_WAGE_DEACTIVATED"
            : "COMPANY_WAGE_UPDATED";
      await writeMutationAudit(
        tx,
        action,
        actor,
        companyId,
        after.id,
        requestId,
        before,
        after
      );
      return serializeCompanyWage(after);
    });
  } catch (error) {
    return translate(error);
  }
}
