// Side-effect: garante o .env da raiz carregado antes do PrismaClient
// (necessário fora do server.ts — ex.: vitest e scripts).
import "../config/env.js";
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
