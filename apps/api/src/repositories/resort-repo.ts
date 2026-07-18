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
};

export type ResortRepo = typeof resortRepo;
