/**
 * API client. The browser talks to the demo server; no credentials are stored
 * here and no authoritative amount is ever taken from the client.
 */

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8787";

export interface Session {
  userId: string;
  displayName: string;
  role: string;
  demo: boolean;
  verified?: boolean;
}

export interface Property {
  id: string;
  ownerId: string;
  slotId: string;
  district: string;
  template: string;
  address: string;
  published: boolean;
}

export interface CatalogItem {
  sku: string;
  name: string;
  unitAmountMinor: number;
  currency: string;
  fulfillment: string;
}

export interface AgentAction {
  tool: string;
  args: Record<string, unknown>;
  confirmationRequired: boolean;
  acknowledged: boolean;
}

export interface QuestProgress {
  questId: string;
  stepIndex: number;
  seals: string[];
  completed: boolean;
}

export interface AgentReply {
  text: string;
  citations: { id: string; kind: string; uri: string | null }[];
  actions: AgentAction[];
  denied?: string;
  history?: { role: string; content: string }[];
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return (await res.json()) as T;
}

export const api = {
  health: () => call<{ ok: boolean; demo: boolean }>("/health"),
  authSignup: (email: string, displayName: string) =>
    call<{ userId: string; devCode: string; verified: boolean }>("/auth/signup", { email, displayName }),
  authLogin: (email: string) => call<{ userId: string; devCode: string }>("/auth/login", { email }),
  authVerify: (email: string, code: string) => call<Session & { verified: boolean }>("/auth/verify", { email, code }),
  session: (userId?: string) => call<Session>("/session", { userId }),
  provision: (userId: string, businessType = "merchant") =>
    call<{ property: Property; created: boolean }>("/merchants/provision", { userId, businessType }),
  catalog: () => call<{ items: CatalogItem[] }>("/catalog"),
  message: (propertyId: string, message: string, tool?: string, args?: Record<string, unknown>) =>
    call<AgentReply>(`/agent/${propertyId}/message`, { message, tool, args }),
  progress: (userId: string) => call<{ progress: QuestProgress }>(`/progress?userId=${encodeURIComponent(userId)}`),
  collectSeal: (userId: string, seal: string) =>
    call<{ progress: QuestProgress }>("/progress", { userId, seal }),
  advance: (userId: string, step: string) =>
    call<{ progress: QuestProgress }>("/progress", { userId, step }),
  merchantProducts: (merchantId: string) => call<{ items: CatalogItem[] }>(`/merchants/${merchantId}/products`),
  addProduct: (merchantId: string, product: Omit<CatalogItem, "active">) =>
    call<{ product: CatalogItem }>(`/merchants/${merchantId}/products`, product),
  updateAgent: (merchantId: string, propertyId: string, config: Record<string, unknown>) =>
    call<{ config: Record<string, unknown> }>(`/merchants/${merchantId}/agent`, { propertyId, ...config }),
  updateAppearance: (merchantId: string, propertyId: string, appearance: Record<string, string>) =>
    call<{ appearance: Record<string, string> }>(`/merchants/${merchantId}/appearance`, { propertyId, ...appearance }),
  confirm: (propertyId: string, action: AgentAction) =>
    call<{ result: unknown }>(`/agent/${propertyId}/confirm`, { action }),
};