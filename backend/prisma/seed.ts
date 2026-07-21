import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("FATAL: DATABASE_URL not set");
  process.exit(1);
}

const companyId = Number(process.env.PAYROLL_COMPANY_ID);

if (!Number.isInteger(companyId) || companyId <= 0) {
  console.error("FATAL: PAYROLL_COMPANY_ID is missing or invalid");
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

const ROLES = [
  { name: "admin", label: "Administrator" },
  { name: "hr", label: "HR Staff" },
  { name: "accounting", label: "Accounting" },
  { name: "field_staff", label: "Field Staff" },
  { name: "viewer", label: "Viewer" },
];

const TEST_USERS = [
  {
    username: "admindynamic",
    email: "admindynamic@payroll.local",
    full_name: "Admin Dynamic",
    password: "123456",
    role_name: "admin",
    company_id: 25,
  },
];

async function main() {
  const company = await prisma.companies.findUnique({
    where: { id: companyId },
  });

  if (!company) {
    throw new Error(
      `Company id=${companyId} does not exist in the current database`
    );
  }

  console.log(
    `🏢 Using company: ${company.company_name} (id=${company.id})`
  );

  console.log("🌱 Seeding payroll_roles...");

  const roleMap = new Map<string, number>();

  for (const role of ROLES) {
    const existing = await prisma.payroll_roles.findFirst({
      where: { name: role.name },
    });

    if (existing) {
      roleMap.set(role.name, existing.id);
      console.log(
        `  ✓ Role already exists: ${role.name} (id=${existing.id})`
      );
      continue;
    }

    const created = await prisma.payroll_roles.create({
      data: {
        name: role.name,
        label: role.label,
        permissions: {},
      },
    });

    roleMap.set(role.name, created.id);
    console.log(`  + Created role: ${role.name} (id=${created.id})`);
  }

  console.log("\n🌱 Seeding payroll_users...");

  for (const user of TEST_USERS) {
    const roleId = roleMap.get(user.role_name);

    if (!roleId) {
      throw new Error(`Role "${user.role_name}" was not found`);
    }

    const passwordHash = await bcrypt.hash(user.password, 10);

    const existing = await prisma.payroll_users.findFirst({
      where: {
        OR: [
          { username: user.username },
          { email: user.email },
        ],
      },
    });

    if (existing) {
      const updated = await prisma.payroll_users.update({
        where: { id: existing.id },
        data: {
          role_id: roleId,
          company_id: user.company_id,
          full_name: user.full_name,
          password_hash: passwordHash,
          is_active: true,
        },
      });

      console.log(
        `  ↻ Updated user: ${updated.username} (id=${updated.id})`
      );
      continue;
    }

    const created = await prisma.payroll_users.create({
      data: {
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        password_hash: passwordHash,
        role_id: roleId,
        company_id: user.company_id,
        is_active: true,
      },
    });

    console.log(`  + Created user: ${created.username} (id=${created.id})`);
  }

  console.log("\n✅ Seed complete.");
}

main()
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });