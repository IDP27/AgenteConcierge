import type { ResortSettings } from "@concierge/shared";
import type { LockAdapter } from "./lock-adapter.js";
import { MockLockAdapter } from "./mock-lock-adapter.js";

const mock = new MockLockAdapter();

/**
 * Fábrica por resort: escolhe o adapter conforme settings.lockProvider.
 * Vendors reais (salto/assaabloy) plugam aqui quando integrados; até lá,
 * caem no mock — o fluxo funciona, só não aciona hardware.
 */
export function lockAdapterFor(settings: ResortSettings): LockAdapter {
  switch (settings.lockProvider) {
    // case "salto": return new SaltoAdapter(env...);
    // case "assaabloy": return new AssaAbloyAdapter(env...);
    default:
      return mock;
  }
}

export type { LockAdapter, IssuedKey } from "./lock-adapter.js";
