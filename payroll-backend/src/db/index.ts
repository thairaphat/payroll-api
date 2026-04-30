// import "dotenv/config";
// import { PrismaClient } from "@prisma/client";
// import { PrismaMariaDb } from "@prisma/adapter-mariadb";

// const adapter = new PrismaMariaDb({
//   host: "127.0.0.1",
//   port: 3306,
//   user: "dev",
//   password: "1234",
//   database: "chaiyade_dms",
// });

// export const prisma = new PrismaClient({ adapter });
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const adapter = new PrismaMariaDb({
  host: "127.0.0.1",
  port: 3306,
  user: "dev",
  password: "1234",
  database: "chaiyade_dms",
  connectionLimit: 1,
});

export const prisma = new PrismaClient({
  adapter,
  log: ["error", "warn"],
});