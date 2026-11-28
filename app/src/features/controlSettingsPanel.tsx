/** CT5: the control settings as a side-panel feature, for one `register` line in sidePanels.tsx. */
import { ControlSettings } from "../ui/ControlSettings";
import type { PanelContext, PanelFeature } from "./panelContext";

export const CONTROL_SETTINGS_PANEL_ID = "controls";
const OPENER_ID = "control-settings-open";

/** Open/close with focus handed back to the menu button that opened the panel. */
function ControlSettingsEntry({ isOpen, setOpen }: Pick<PanelContext, "isOpen" | "setOpen">) {
  const open = isOpen(CONTROL_SETTINGS_PANEL_ID);
  if (!open) {
    return (
      <button
        id={OPENER_ID} type="button" className="app__account" aria-expanded={false}
        onClick={() => setOpen(CONTROL_SETTINGS_PANEL_ID, true)}
      >
        Controls and accessibility
      </button>
    );
  }
  return (
    <ControlSettings
      onClose={() => setOpen(CONTROL_SETTINGS_PANEL_ID, false)}
      // The opener remounts when the panel closes: find it by id after the swap.
      returnFocus={() => document.getElementById(OPENER_ID)}
    />
  );
}

export const controlSettingsPanel: PanelFeature = {
  id: CONTROL_SETTINGS_PANEL_ID, slot: "side", order: 45,
  render: ({ isOpen, setOpen }) => <ControlSettingsEntry isOpen={isOpen} setOpen={setOpen} />,
};
