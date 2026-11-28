import type { ReactNode } from "react";
import type { Session } from "../net/api";
import type { Feature, Registry } from "./registry";

/** What a registered panel can read and do. PanelHost adds the open/closed state. */
export interface ShellContext {
  session: Session | null;
  propertyId: string | null;
  entered: boolean;
  showGuide: boolean;
  openGuide: () => void;
  onSignedIn: (session: Session & { verified: boolean }) => void;
}

export interface PanelContext extends ShellContext {
  isOpen: (id: string) => boolean;
  setOpen: (id: string, open: boolean) => void;
}

export type PanelFeature = Feature<PanelContext, ReactNode>;
export type PanelRegistry = Registry<PanelContext, ReactNode>;
