import { Fragment, useCallback, useState } from "react";
import { featuresIn } from "../features/registry";
import type { PanelRegistry, ShellContext } from "../features/panelContext";
import { SideMenu } from "./SideMenu";

/**
 * Renders the registered side panels inside the collapsed side menu. Open/closed
 * state lives here, outside SideMenu, so it survives the menu closing.
 */
export function PanelHost({ registry, ctx }: { registry: PanelRegistry; ctx: ShellContext }) {
  const [open, setOpenIds] = useState<ReadonlySet<string>>(() => new Set());
  const isOpen = useCallback((id: string) => open.has(id), [open]);
  const setOpen = useCallback((id: string, next: boolean) => {
    setOpenIds((prev) => {
      if (prev.has(id) === next) return prev;
      const copy = new Set(prev);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  }, []);
  const panelCtx = { ...ctx, isOpen, setOpen };
  return (
    <SideMenu>
      {featuresIn(registry, "side").map((f) => (
        <Fragment key={f.id}>{f.render(panelCtx)}</Fragment>
      ))}
    </SideMenu>
  );
}
