/** C5: the appearance picker as a side-panel feature, for one `register` line in sidePanels.tsx. */
import { AvatarPicker } from "../ui/AvatarPicker";
import type { PanelFeature } from "./panelContext";

const MenuButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button type="button" className="app__account" onClick={onClick}>{label}</button>
);

export const AVATAR_PANEL_ID = "appearance";

export const avatarPanel: PanelFeature = {
  id: AVATAR_PANEL_ID, slot: "side", order: 15,
  render: ({ isOpen, setOpen, session }) => (
    <>
      {session && !isOpen(AVATAR_PANEL_ID) && <MenuButton label="Appearance" onClick={() => setOpen(AVATAR_PANEL_ID, true)} />}
      {session && isOpen(AVATAR_PANEL_ID) && <AvatarPicker onClose={() => setOpen(AVATAR_PANEL_ID, false)} />}
    </>
  ),
};
