import type { Call } from "./http";
import type { Campaign, Placement } from "./types";

export const adsEndpoints = (call: Call) => ({
  placements: () => call<{ placements: Placement[] }>("/placements"),
  campaigns: () => call<{ campaigns: Campaign[] }>("/campaigns"),
  createCampaign: (input: Record<string, unknown>) => call<{ campaign: Campaign }>("/campaigns", input),
  campaignAction: (id: string, action: string) => call<{ campaign: Campaign }>(`/campaigns/${id}/${action}`, {}),
});
