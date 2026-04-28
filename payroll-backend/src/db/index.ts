import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const adapter = new PrismaMariaDb({
  host: "localhost",
  port: 3306,
  user: "dev",
  password: "1234",
  database: "chaiyade_dms", // ✅ ใช้ dms
});

export const prisma = new PrismaClient({ adapter });