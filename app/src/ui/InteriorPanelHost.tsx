import { Fragment } from "react";
import { featuresIn } from "../features/registry";
import { interiorPanels } from "../features/interiorPanels";
import type { PanelRegistry, ShellContext } from "../features/panelContext";
import { usePlace } from "../world/usePlace";
import { houseTarget } from "./talkToMerchantModel";
import { usePanelOpenState } from "./usePanelOpenState";
import "./InteriorPanelHost.css";

/**
 * The house's own panels (talk to the merchant, the owner's workspace), always
 * visible inside a house and never inside the collapsible side menu, so their
 * open state and transcripts survive the menu. Keyed by property: a new house
 * starts with every panel closed. Renders nothing outside houses.
 */
export function InteriorPanelHost({ ctx, registry = interiorPanels }: { ctx: ShellContext; registry?: PanelRegistry }) {
  const target = houseTarget(usePlace());
  if (!target) return null;
  return <InteriorPanels key={target.propertyId} ctx={ctx} registry={registry} />;
}

function InteriorPanels({ ctx, registry }: { ctx: ShellContext; registry: PanelRegistry }) {
  const { isOpen, setOpen } = usePanelOpenState();
  const panelCtx = { ...ctx, isOpen, setOpen };
  return (
    <aside className="interior-panels" aria-label="In this house" data-testid="interior-panels">
      {featuresIn(registry, "overlay").map((f) => (
        <Fragment key={f.id}>{f.render(panelCtx)}</Fragment>
      ))}
    </aside>
  );
}
