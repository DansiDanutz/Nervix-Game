/**
 * Panels that belong to the house the player is in (CT2). They render in the
 * interior host, outside the side column (which the shell hides inside houses).
 */
import type { ReactNode } from "react";
import { MerchantWorkspace } from "../ui/MerchantWorkspace";
import { TalkToMerchant } from "../ui/TalkToMerchant";
import { createRegistry, register } from "./registry";
import type { PanelContext, PanelFeature, PanelRegistry } from "./panelContext";

/** Only a verified owner, inside their own house, as the server says. */
const merchant: PanelFeature = {
  id: "merchant", slot: "overlay", order: 10,
  render: (ctx) => <MerchantWorkspace ctx={ctx} />,
};

/** Talk to this house's merchant assistant, private per signed-in user (S3). */
const talk: PanelFeature = {
  id: "talk", slot: "overlay", order: 20,
  render: (ctx) => <TalkToMerchant ctx={ctx} />,
};

export const interiorPanels: PanelRegistry = [merchant, talk].reduce(register, createRegistry<PanelContext, ReactNode>());
