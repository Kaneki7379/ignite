import { PrismaClient } from "@prisma/client";
import { MockPrismaClient } from "./mock-db";

type DatabaseClient = PrismaClient | MockPrismaClient;

declare global {
  // eslint-disable-next-line no-var
  var __prismaClient: DatabaseClient | undefined;
}

const shouldUseMock =
  process.env.USE_MOCK_DATABASE === "true" || !process.env.DATABASE_URL;

const createClient = (): DatabaseClient => {
  if (shouldUseMock) {
    return new MockPrismaClient();
  }

  return new PrismaClient();
};

const dbClient = globalThis.__prismaClient ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prismaClient = dbClient;
}

export const db = dbClient;
