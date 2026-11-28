/** The built-in side panels, registered in their original menu order. */
import type { ReactNode } from "react";
import { AuthPanel } from "../ui/AuthPanel";
import { CheckoutPanel } from "../ui/CheckoutPanel";
import { AdsPanel } from "../ui/AdsPanel";
import { AdminPanel } from "../ui/AdminPanel";
import { createRegistry, register } from "./registry";
import { avatarPanel } from "./avatarPanel";
import type { PanelContext, PanelFeature, PanelRegistry } from "./panelContext";

const MenuButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button type="button" className="app__account" onClick={onClick}>{label}</button>
);

const account: PanelFeature = {
  id: "account", slot: "side", order: 10,
  render: ({ isOpen, setOpen, session, onSignedIn }: PanelContext) => (
    <>
      {isOpen("account") && <AuthPanel onSignedIn={(s) => { onSignedIn(s); setOpen("account", false); }} />}
      {!isOpen("account") && session && (
        <MenuButton label={session.verified ? `Verified: ${session.displayName}` : "Sign in with email"} onClick={() => setOpen("account", true)} />
      )}
    </>
  ),
};

const orders: PanelFeature = {
  id: "orders", slot: "side", order: 30,
  render: ({ isOpen, setOpen, session }) => (
    <>
      {session && !isOpen("orders") && <MenuButton label="Orders" onClick={() => setOpen("orders", true)} />}
      {isOpen("orders") && session && <CheckoutPanel userId={session.userId} />}
    </>
  ),
};

const guide: PanelFeature = {
  id: "guide", slot: "side", order: 40,
  render: ({ entered, showGuide, openGuide }) => entered && !showGuide && <MenuButton label="District guide (G)" onClick={openGuide} />,
};

const ads: PanelFeature = {
  id: "ads", slot: "side", order: 50,
  render: ({ isOpen, setOpen, session }) => (
    <>
      {!isOpen("ads") && session && <MenuButton label="Advertising" onClick={() => setOpen("ads", true)} />}
      {isOpen("ads") && session && <AdsPanel merchantId="mer_1" />}
    </>
  ),
};

const admin: PanelFeature = {
  id: "admin", slot: "side", order: 60,
  render: ({ session }) => session?.role === "admin" && <AdminPanel userId={session.userId} />,
};

/**
 * Talk to the merchant and the owner's workspace (CT2) are house panels: see
 * features/interiorPanels.tsx and ui/InteriorPanelHost.tsx (the side column is
 * hidden inside houses). Milestones add a panel with one more `register` here (the lead holds the shell token). */
export const sidePanels: PanelRegistry = [account, orders, guide, ads, admin, avatarPanel].reduce(register, createRegistry<PanelContext, ReactNode>());
