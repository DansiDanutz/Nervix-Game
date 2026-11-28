import test from "node:test";
import assert from "node:assert/strict";
import {
  PRIVACY_HINT,
  appendTurn,
  assistantName,
  confirmPayload,
  confirmedText,
  houseTarget,
  supportRequest,
  pendingProposal,
  proposalLabel,
  workspaceFor,
  type HouseView,
} from "./talkToMerchantModel.ts";
import type { AgentReply, House } from "../net/api/types.ts";

const door = { id: "bld_test", propertyId: "prop_test", owner: "u", label: "Test Builder", position: [0, 0, 0] as [number, number, number], colour: "#000", trim: "#fff" };

const house = (over: Partial<House> = {}): House => ({
  propertyId: "prop_test",
  ownerId: "usr_owner",
  merchantId: "mer_test",
  merchantName: "Test Builder",
  merchantVerified: true,
  ownerName: "Owner",
  appUrl: null,
  listings: [],
  profile: { welcome: null, decor: {}, display: {}, websiteUrl: null, updatedAt: null },
  ...over,
});

const reply = (over: Partial<AgentReply> = {}): AgentReply => ({ text: "hi", citations: [], actions: [], ...over });

test("houseTarget binds only to a house place, by its property id", () => {
  assert.equal(houseTarget({ kind: "plaza" }), null);
  assert.equal(houseTarget({ kind: "venue", id: "openpoker" }), null);
  assert.deepEqual(houseTarget({ kind: "house", door, from: "plaza" }), { propertyId: "prop_test", label: "Test Builder" });
});

test("assistantName uses the server's merchant name, falling back to the door label", () => {
  assert.equal(assistantName(house(), "Door"), "Test Builder's assistant");
  assert.equal(assistantName(house({ merchantName: null }), "Door"), "Door's assistant");
  assert.equal(assistantName(null, "Door"), "Door's assistant");
});

test("the privacy hint states who can read the conversation", () => {
  assert.match(PRIVACY_HINT, /private to you and the merchant's assistant/i);
  assert.match(PRIVACY_HINT, /not shared with other players/i);
  assert.doesNotMatch(PRIVACY_HINT, /end-to-end|encrypted|nobody/i);
  // A confirmed support request leaves the chat: the merchant receives it.
  assert.match(PRIVACY_HINT, /support requests you confirm are sent to the merchant/i);
});

test("workspaceFor shows the merchant workspace only to a verified owner, per the server", () => {
  const view = (h: House | null, canEdit: boolean): HouseView => ({ house: h, canEdit });
  assert.deepEqual(workspaceFor(view(house(), true)), { merchantId: "mer_test", propertyId: "prop_test" });
  assert.equal(workspaceFor(view(house(), false)), null, "visitor");
  assert.equal(workspaceFor(view(house({ merchantVerified: false }), true)), null, "unverified merchant");
  assert.equal(workspaceFor(view(house({ merchantId: null }), true)), null, "no merchant record");
  assert.equal(workspaceFor(view(null, true)), null, "house not loaded");
  assert.equal(workspaceFor(null), null);
});

test("pendingProposal takes a server-built proposal with an id, never a denied or id-less one", () => {
  const proposal = { proposalId: "prp_1", tool: "request_support", args: { message: "help" }, confirmationRequired: true, acknowledged: false };
  assert.deepEqual(pendingProposal(reply({ actions: [proposal] })), proposal);
  assert.equal(pendingProposal(reply({ actions: [{ ...proposal, proposalId: undefined }] })), null);
  assert.equal(pendingProposal(reply({ actions: [{ ...proposal, confirmationRequired: false }] })), null);
  assert.equal(pendingProposal(reply({ actions: [proposal], denied: "request_support" })), null);
  assert.equal(pendingProposal(reply()), null);
});

test("confirmPayload sends the proposal id (S3 contract) and does not mutate the proposal", () => {
  const proposal = Object.freeze({ proposalId: "prp_1", tool: "create_checkout", args: Object.freeze({}), confirmationRequired: true, acknowledged: false });
  const body = confirmPayload(proposal);
  assert.equal(body.proposalId, "prp_1");
  assert.equal(body.acknowledged, true);
  assert.equal(proposal.acknowledged, false);
});

test("checkout proposals are labelled demo-only with no real payment", () => {
  const checkout = { proposalId: "p", tool: "create_checkout", args: { cart: { totalMinor: 1250, currency: "EUR", lines: [{}, {}] } }, confirmationRequired: true, acknowledged: false };
  const label = proposalLabel(checkout);
  assert.match(label, /demo/i);
  assert.match(label, /no real payment/i);
  assert.match(label, /12\.50 EUR/);
  assert.match(proposalLabel({ ...checkout, tool: "request_support", args: {} }), /support request/i);
});

test("confirmedText never shows a payment link and says a checkout was demo-only", () => {
  const text = confirmedText("create_checkout", { order: { id: "ord_1" }, checkout: { url: "https://pay.example/x" } });
  assert.match(text, /demo/i);
  assert.match(text, /no payment was taken/i);
  assert.doesNotMatch(text, /https?:/);
  assert.match(confirmedText("request_support", { support: { id: "sup_1" } }), /merchant/i);
});

test("appendTurn returns a new transcript", () => {
  const before = Object.freeze([{ role: "player" as const, text: "a" }]);
  const after = appendTurn(before, "agent", "b");
  assert.equal(before.length, 1);
  assert.deepEqual(after, [{ role: "player", text: "a" }, { role: "agent", text: "b" }]);
});

test("supportRequest asks the server for a request_support proposal carrying the player's text", () => {
  const req = supportRequest("  my order never arrived  ");
  assert.deepEqual(req, { tool: "request_support", args: { message: "my order never arrived" } });
  assert.ok(Object.isFrozen(req));
  assert.equal(supportRequest("   "), null);
});
