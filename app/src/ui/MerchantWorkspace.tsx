import type { PanelContext } from "../features/panelContext";
import { useEscapeLayer } from "../input/useEscapeLayer";
import { MerchantPanel } from "./MerchantPanel";
import { workspaceFor } from "./talkToMerchantModel";
import { useCurrentHouse } from "./useCurrentHouse";
import { useCloseOnChange } from "./useCloseOnChange";

export const WORKSPACE_PANEL_ID = "merchant";

/**
 * The merchant workspace, shown only inside a house whose verified owner the
 * server recognises (canEdit and a verified merchant). Visitors never see it.
 */
export function MerchantWorkspace({ ctx }: { ctx: PanelContext }) {
  const { isOpen, setOpen, session } = ctx;
  const { view } = useCurrentHouse(session?.userId ?? null);
  const workspace = session ? workspaceFor(view) : null;
  const open = isOpen(WORKSPACE_PANEL_ID) && workspace !== null;
  const propertyId = workspace?.propertyId ?? null;

  useCloseOnChange(propertyId, () => setOpen(WORKSPACE_PANEL_ID, false));
  useEscapeLayer(open, () => setOpen(WORKSPACE_PANEL_ID, false));

  if (!workspace) return null;
  if (!open) {
    return (
      <button type="button" className="app__account" data-testid="workspace-open" onClick={() => setOpen(WORKSPACE_PANEL_ID, true)}>
        Merchant workspace
      </button>
    );
  }
  return <MerchantPanel merchantId={workspace.merchantId} propertyId={workspace.propertyId} />;
}
