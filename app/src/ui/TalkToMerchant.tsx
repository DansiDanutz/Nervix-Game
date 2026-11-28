import type { PanelContext } from "../features/panelContext";
import { useEscapeLayer } from "../input/useEscapeLayer";
import { AgentPanel } from "./AgentPanel";
import { PRIVACY_HINT, assistantName } from "./talkToMerchantModel";
import { useCurrentHouse } from "./useCurrentHouse";
import { useCloseOnChange } from "./useCloseOnChange";
import "./TalkToMerchant.css";

export const TALK_PANEL_ID = "talk";

/**
 * Talk to the merchant of the house the player is in (CT2). Bound to the
 * current house's property from the place store; the merchant's name comes
 * from the server. Visitors and owners alike chat privately (S3).
 */
export function TalkToMerchant({ ctx }: { ctx: PanelContext }) {
  const { isOpen, setOpen, session } = ctx;
  const userId = session?.userId ?? null;
  const { target, view, error } = useCurrentHouse(userId);
  const propertyId = target?.propertyId ?? null;
  const open = isOpen(TALK_PANEL_ID) && propertyId !== null && userId !== null;

  // Another house (or leaving one) starts closed; an unmount alone keeps the state.
  useCloseOnChange(propertyId, () => setOpen(TALK_PANEL_ID, false));
  useEscapeLayer(open, () => setOpen(TALK_PANEL_ID, false));

  if (!target) return null;
  const name = assistantName(view?.house ?? null, target.label);
  if (!session) return <p className="panel__hint talk__signin" data-testid="talk-signin">Sign in to talk to {name}.</p>;
  if (!open) {
    return (
      <button type="button" className="app__account" data-testid="talk-open" onClick={() => setOpen(TALK_PANEL_ID, true)}>
        Talk to {name}
      </button>
    );
  }
  return (
    <div className="talk" data-testid="talk-merchant" data-property={target.propertyId}>
      {error && <p className="panel__error" role="alert">{error}</p>}
      <AgentPanel key={`${target.propertyId}|${userId}`} propertyId={target.propertyId} agentName={name} hint={PRIVACY_HINT} />
      <button type="button" className="talk__close" onClick={() => setOpen(TALK_PANEL_ID, false)}>
        Close chat
      </button>
    </div>
  );
}
