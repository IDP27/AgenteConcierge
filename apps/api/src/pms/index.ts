import type { ResortSettings } from "@concierge/shared";
import type { Repos } from "../repositories/index.js";
import type { PmsAdapter } from "./pms-adapter.js";
import { SeedPmsAdapter } from "./seed-pms-adapter.js";
import { OperaAdapter } from "./opera-adapter.js";

/**
 * Fábrica por resort: escolhe a fonte de dados do PMS conforme
 * settings.pmsProvider. OPERA (OWS/OHIP) pluga aqui quando as credenciais
 * existirem; até lá, cai no seed — o fluxo funciona lendo o nosso banco.
 * Mesmo padrão do lockAdapterFor.
 */
export function pmsAdapterFor(settings: ResortSettings, repos: Repos): PmsAdapter {
  switch (settings.pmsProvider) {
    case "opera_ows":
      return new OperaAdapter({ provider: "opera_ows" });
    case "opera_cloud":
      return new OperaAdapter({ provider: "opera_cloud" });
    default:
      return new SeedPmsAdapter(repos);
  }
}

export type {
  PmsAdapter,
  PmsReservation,
  PmsProfile,
  PmsStayRef,
  PmsMaintenanceRef,
} from "./pms-adapter.js";
export { PmsNotConfiguredError } from "./pms-adapter.js";
