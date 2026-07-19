import { prisma } from "../lib/prisma.js";
import { parseResortSettings, type ResortSettings } from "@concierge/shared";

export interface ResortWithSettings {
  id: string;
  name: string;
  settings: ResortSettings;
}

export const resortRepo = {
  async findById(id: string): Promise<ResortWithSettings | null> {
    const resort = await prisma.resort.findUnique({ where: { id } });
    if (!resort) return null;
    return { id: resort.id, name: resort.name, settings: parseResortSettings(resort.settings) };
  },

  async listAll(): Promise<ResortWithSettings[]> {
    const resorts = await prisma.resort.findMany({ orderBy: { name: "asc" } });
    return resorts.map((r) => ({
      id: r.id,
      name: r.name,
      settings: parseResortSettings(r.settings),
    }));
  },

  /** Kill switch financeiro (painel): merge no JSONB preservando o resto. */
  async setFinancialKillSwitch(id: string, enabled: boolean): Promise<ResortWithSettings> {
    const resort = await prisma.resort.findUnique({ where: { id }, select: { settings: true } });
    const current = (resort?.settings ?? {}) as Record<string, unknown>;
    const updated = await prisma.resort.update({
      where: { id },
      data: { settings: { ...current, financialKillSwitch: enabled } },
    });
    return { id: updated.id, name: updated.name, settings: parseResortSettings(updated.settings) };
  },
};

export type ResortRepo = typeof resortRepo;
