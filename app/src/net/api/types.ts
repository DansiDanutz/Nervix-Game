/** Wire types shared by the API client modules. */

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

export interface AdminMerchant {
  id: string;
  name: string;
  businessType: string;
  suspended: boolean;
}

export interface AuditEvent {
  id: number;
  actorId: string;
  action: string;
  subject: string;
  createdAt: string;
}

export interface HouseProfile {
  welcome: string | null;
  decor: { theme?: "salon" | "workshop" | "gallery" | "cafe"; accent?: string; banner?: boolean };
  display: { featuredListingIds?: string[]; showApp?: boolean };
  websiteUrl: string | null;
  updatedAt: string | null;
}

export interface House {
  propertyId: string;
  ownerId: string;
  merchantId: string | null;
  merchantName: string | null;
  merchantVerified: boolean;
  ownerName: string;
  appUrl: string | null;
  listings: { id: string; name: string; priceMinor: number; currency: string }[];
  profile: HouseProfile;
}

export interface Builder {
  id: string;
  name: string;
  appUrl: string | null;
  offerings: { id: string; name: string; priceMinor: number; currency: string; appUrl: string | null }[];
}

export interface Placement {
  id: string;
  district: string;
  kind: string;
  priceMinor: number;
  currency: string;
}

export interface Campaign {
  id: string;
  merchantId: string;
  placementId: string;
  priceMinor: number;
  currency: string;
  state: string;
  startsAt: string;
  endsAt: string;
  creative?: { text?: string; colour?: string };
}

export interface OrderSummary {
  id: string;
  state: string;
  totalMinor: number;
  currency: string;
  fulfillment?: string;
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
