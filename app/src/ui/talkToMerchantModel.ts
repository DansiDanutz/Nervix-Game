/**
 * Pure rules for talking to the merchant inside a house (CT2). No React, no DOM.
 * The house, its merchant and the owner's rights all come from the server;
 * the conversation is private per (property, signed-in user) on the server (S3).
 */
import type { Place } from "../world/place";
import type { AgentAction, AgentReply, House } from "../net/api/types";

/**
 * A server-built proposal. S3 confirms by `proposalId`.
 * Lead: fold `proposalId?: string` into AgentAction in net/api/types.ts (DATA lane).
 */
export type ProposalAction = AgentAction & { readonly proposalId?: string };

export interface Turn {
  readonly role: "player" | "agent";
  readonly text: string;
}

export interface HouseTarget {
  readonly propertyId: string;
  readonly label: string;
}

/** What GET /houses/:propertyId told this viewer. */
export interface HouseView {
  readonly house: House | null;
  readonly canEdit: boolean;
}

export const PRIVACY_HINT =
  "This conversation is private to you and the merchant's assistant. It is not shared with other players. " +
  "Support requests you confirm are sent to the merchant. The assistant's AI model may run with an outside provider.";

const TOOL_CHECKOUT = "create_checkout";
const TOOL_SUPPORT = "request_support";
const MINOR_PER_MAJOR = 100;

/** The house the player stands in, or null outside houses. */
export function houseTarget(place: Place): HouseTarget | null {
  if (place.kind !== "house") return null;
  return Object.freeze({ propertyId: place.door.propertyId, label: place.door.label });
}

export function assistantName(house: House | null, fallbackLabel: string): string {
  return `${house?.merchantName ?? fallbackLabel}'s assistant`;
}

/** The workspace is for the verified owner only, as the server decides (canEdit). */
export function workspaceFor(view: HouseView | null): { merchantId: string; propertyId: string } | null {
  const house = view?.house;
  if (!view?.canEdit || !house?.merchantVerified || !house.merchantId) return null;
  return Object.freeze({ merchantId: house.merchantId, propertyId: house.propertyId });
}

/** The first proposal the server stored and the player can confirm by id. */
export function pendingProposal(reply: AgentReply): ProposalAction | null {
  if (reply.denied) return null;
  const action = (reply.actions as ProposalAction[]).find((a) => a.confirmationRequired && typeof a.proposalId === "string" && a.proposalId);
  return action ?? null;
}

export function confirmPayload(action: ProposalAction): ProposalAction {
  return Object.freeze({ ...action, acknowledged: true });
}

function money(minor: unknown, currency: unknown): string {
  const amount = typeof minor === "number" ? (minor / MINOR_PER_MAJOR).toFixed(2) : "?";
  return `${amount} ${typeof currency === "string" ? currency : ""}`.trim();
}

/** Checkouts are demo-only: the label says so before the player confirms. */
export function proposalLabel(action: ProposalAction): string {
  if (action.tool === TOOL_CHECKOUT) {
    const cart = (action.args.cart ?? {}) as { totalMinor?: unknown; currency?: unknown; lines?: unknown[] };
    const count = Array.isArray(cart.lines) ? cart.lines.length : 0;
    return `Demo checkout, no real payment: ${count} item${count === 1 ? "" : "s"}, ${money(cart.totalMinor, cart.currency)}`;
  }
  if (action.tool === TOOL_SUPPORT) return "Send a support request to the merchant";
  return action.tool.replace(/_/g, " ");
}

/** The caption after a confirmed proposal. Never echoes a payment link. */
export function confirmedText(tool: string, result: unknown): string {
  if (tool === TOOL_CHECKOUT) {
    const id = (result as { order?: { id?: unknown } } | null)?.order?.id;
    return `Demo order${typeof id === "string" ? ` ${id}` : ""} created. This is a demo: no payment was taken.`;
  }
  if (tool === TOOL_SUPPORT) return "Your support request was sent to the merchant.";
  return "Done.";
}

/** What a "Send as support request" asks the server for; the server builds the proposal (S3). */
export function supportRequest(text: string): { readonly tool: string; readonly args: { readonly message: string } } | null {
  const message = text.trim();
  if (!message) return null;
  return Object.freeze({ tool: TOOL_SUPPORT, args: Object.freeze({ message }) });
}

export function appendTurn(turns: readonly Turn[], role: Turn["role"], text: string): readonly Turn[] {
  return Object.freeze([...turns, Object.freeze({ role, text })]);
}
