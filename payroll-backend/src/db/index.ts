import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

type MariaDbAdapterConfig = Exclude<
  ConstructorParameters<typeof PrismaMariaDb>[0],
  string
>;

const databaseUrl =
  process.env.DATABASE_URL ?? "mysql://dev:1234@127.0.0.1:3306/chaiyade_dms";
const parsedDatabaseUrl = new URL(databaseUrl);

const adapterConfig: MariaDbAdapterConfig = {
  host: parsedDatabaseUrl.hostname || "127.0.0.1",
  port: parsedDatabaseUrl.port ? Number(parsedDatabaseUrl.port) : 3306,
  user: decodeURIComponent(parsedDatabaseUrl.username),
  password: decodeURIComponent(parsedDatabaseUrl.password),
  database: parsedDatabaseUrl.pathname.replace(/^\//, ""),
  connectionLimit: 10,
  connectTimeout: 5000,
  acquireTimeout: 5000,
  allowPublicKeyRetrieval:
    process.env.MARIADB_ALLOW_PUBLIC_KEY_RETRIEVAL !== "false",
};

const adapter = new PrismaMariaDb(adapterConfig, {
  database: adapterConfig.database,
});

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.prisma ??
  new PrismaClient({
    adapter,
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}
