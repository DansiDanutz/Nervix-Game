/** C9: presence privacy settings as a side-panel feature, for one `register` line in sidePanels.tsx. */
import { PrivacySettings } from "../ui/PrivacySettings";
import type { PanelFeature } from "./panelContext";

const MenuButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button type="button" className="app__account" onClick={onClick}>{label}</button>
);

export const PRIVACY_PANEL_ID = "privacy";

export const privacyPanel: PanelFeature = {
  id: PRIVACY_PANEL_ID, slot: "side", order: 16,
  render: ({ isOpen, setOpen, session }) => (
    <>
      {session && !isOpen(PRIVACY_PANEL_ID) && <MenuButton label="Privacy" onClick={() => setOpen(PRIVACY_PANEL_ID, true)} />}
      {session && isOpen(PRIVACY_PANEL_ID) && (
        <PrivacySettings displayName={session.displayName} onClose={() => setOpen(PRIVACY_PANEL_ID, false)} />
      )}
    </>
  ),
};
