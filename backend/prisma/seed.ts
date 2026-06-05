import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("FATAL: DATABASE_URL not set");
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
  { name: "admin",       label: "Administrator" },
  { name: "hr",          label: "HR Staff" },
  { name: "accounting",  label: "Accounting" },
  { name: "field_staff", label: "Field Staff" },
  { name: "viewer",      label: "Viewer" },
];

const TEST_USERS = [
  {
    username:  "admindynamic",
    email:     "admindynamic@payroll.local",
    full_name: "Admin Dynamic",
    password:  "123456",
    role_name: "admin",
    company_id: 2,
  },
];

async function main() {
  console.log("🌱 Seeding payroll_roles...");

  const roleMap = new Map<string, number>();

  for (const r of ROLES) {
    const existing = await prisma.payroll_roles.findFirst({ where: { name: r.name } });
    if (existing) {
      roleMap.set(r.name, existing.id);
      console.log(`  ✓ Role already exists: ${r.name} (id=${existing.id})`);
    } else {
      const created = await prisma.payroll_roles.create({
        data: { name: r.name, label: r.label, permissions: {} },
      });
      roleMap.set(r.name, created.id);
      console.log(`  + Created role: ${r.name} (id=${created.id})`);
    }
  }

  console.log("\n🌱 Seeding payroll_users...");

  for (const u of TEST_USERS) {
    const roleId = roleMap.get(u.role_name);
    if (!roleId) {
      console.warn(`  ! Skipping ${u.username}: role "${u.role_name}" not found`);
      continue;
    }

    const existing = await prisma.payroll_users.findFirst({
      where: { OR: [{ username: u.username }, { email: u.email }] },
    });

    if (existing) {
      console.log(`  ✓ User already exists: ${u.username} (id=${existing.id})`);
      continue;
    }

    const password_hash = await bcrypt.hash(u.password, 10);

    const created = await prisma.payroll_users.create({
      data: {
        username:      u.username,
        email:         u.email,
        full_name:     u.full_name,
        password_hash,
        role_id:       roleId,
        company_id:    u.company_id,
        is_active:     true,
      },
    });

    console.log(`  + Created user: ${u.username} (id=${created.id})`);
  }

  console.log("\n✅ Seed complete.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
