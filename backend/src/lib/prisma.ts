import { PrismaClient } from "@prisma/client";

// Single shared Prisma client instance (avoids exhausting DB
// connections across hot-reloads in dev).
export const prisma = new PrismaClient();