import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { CANONICAL_ROLES, type CanonicalRole } from "../src/utils/user-policy";
import {
  findMissingCompanyIds,
  formatSeedUserLog,
  resolveSeedConfiguration,
  shouldHashSeedPassword,
  type SeedUserConfig,
} from "./seed-config";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[seed][failure] DATABASE_URL is not set");
  process.exit(1);
}

const parsed = new URL(databaseUrl);
const adapter = new PrismaMariaDb({
  host: parsed.hostname || "127.0.0.1",
  port: parsed.port ? Number(parsed.port) : 3306,
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
  database: parsed.pathname.replace(/^\//, ""),
  connectionLimit: 5,
});
const prisma = new PrismaClient({ adapter });

const ROLE_LABELS: Record<CanonicalRole, string> = {
  cyd_admin: "CYD Administrator",
  admin: "Administrator",
  hr: "HR Staff",
  accounting: "Accounting",
  field_staff: "Field Staff",
  viewer: "Viewer",
};

async function main() {
  const config = resolveSeedConfiguration(process.env);
  const configuredUsers = [config.cydAdmin, ...config.companyUsers];

  if (config.usedDevelopmentDefaults) {
    console.warn("[seed][warning] Development default credentials are being used.");
    console.warn("Change all passwords before deployment.");
  }

  const companyIds = [...new Set(config.companyUsers.map((user) => user.companyId as number))];
  const companies = await prisma.companies.findMany({
    where: { id: { in: companyIds } },
    select: { id: true },
  });
  const missingCompanyIds = findMissingCompanyIds(companyIds, companies.map((company) => company.id));
  if (missingCompanyIds.length) {
    throw new Error(`Configured company ID not found: ${missingCompanyIds.join(", ")}`);
  }

  const existingUsers = await prisma.payroll_users.findMany({
    where: {
      OR: [
        { username: { in: configuredUsers.map((user) => user.username) } },
        { email: { in: configuredUsers.map((user) => user.email) } },
      ],
    },
    include: { payroll_roles: true },
  });

  const prepared: Array<{
    user: SeedUserConfig;
    existing: (typeof existingUsers)[number] | null;
    passwordHash?: string;
  }> = [];
  for (const user of configuredUsers) {
    const byUsername = existingUsers.find((row) => row.username.toLowerCase() === user.username.toLowerCase());
    const byEmail = existingUsers.find((row) => row.email?.toLowerCase() === user.email.toLowerCase());
    if (byUsername && byEmail && byUsername.id !== byEmail.id) {
      throw new Error(`Username/email conflict for configured user ${user.username}`);
    }
    if (!byUsername && byEmail) {
      throw new Error(`Email conflict for configured user ${user.username}`);
    }
    const existing = byUsername ?? byEmail ?? null;
    if (existing && existing.company_id !== user.companyId) {
      throw new Error(`Company assignment conflict for existing user ${user.username}`);
    }
    if (existing?.payroll_roles.name === "cyd_admin" && user.role !== "cyd_admin") {
      throw new Error(`Company configuration cannot modify a cyd_admin account: ${user.username}`);
    }
    if (!existing && !user.password) {
      throw new Error(`Password is required when creating configured user ${user.username}`);
    }
    if (existing && user.updatePassword && !user.password) {
      throw new Error(`Password is required when updatePassword is enabled for ${user.username}`);
    }
    const shouldHashPassword = shouldHashSeedPassword(Boolean(existing), user);
    prepared.push({
      user,
      existing,
      passwordHash: shouldHashPassword && user.password
        ? await bcrypt.hash(user.password, 12)
        : undefined,
    });
  }

  const roleMap = new Map<CanonicalRole, number>();
  for (const role of CANONICAL_ROLES) {
    const existingRole = await prisma.payroll_roles.findUnique({ where: { name: role }, select: { id: true } });
    const row = await prisma.payroll_roles.upsert({
      where: { name: role },
      update: { label: ROLE_LABELS[role] },
      create: { name: role, label: ROLE_LABELS[role], permissions: {} },
    });
    roleMap.set(role, row.id);
    console.log(`[seed] role=${role} status=${existingRole ? "already exists" : "created"}`);
  }

  await prisma.$transaction(async (tx) => {
    for (const item of prepared) {
      const roleId = roleMap.get(item.user.role);
      if (!roleId) throw new Error(`Role not found: ${item.user.role}`);
      const data = {
        email: item.user.email,
        full_name: item.user.fullName,
        role_id: roleId,
        company_id: item.user.companyId,
        is_active: item.user.isActive,
        ...(item.passwordHash ? { password_hash: item.passwordHash } : {}),
      };

      if (!item.existing) {
        await tx.payroll_users.create({
          data: { ...data, username: item.user.username, password_hash: item.passwordHash! },
        });
        console.log(formatSeedUserLog(item.user, "created"));
        continue;
      }

      const changed =
        item.existing.email !== item.user.email ||
        item.existing.full_name !== item.user.fullName ||
        item.existing.role_id !== roleId ||
        item.existing.company_id !== item.user.companyId ||
        item.existing.is_active !== item.user.isActive ||
        Boolean(item.passwordHash);
      if (!changed) {
        console.log(formatSeedUserLog(item.user, "skipped"));
        continue;
      }
      await tx.payroll_users.update({ where: { id: item.existing.id }, data });
      console.log(formatSeedUserLog(item.user, "updated"));
    }
  });

  console.log(`[seed][success] roles=${CANONICAL_ROLES.length} users=${prepared.length}`);
}

main()
  .catch((error) => {
    console.error("[seed][failure]", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
