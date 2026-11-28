import { useCallback, useState } from "react";
import { withPanel } from "./panelOpenState";

/** Open/closed state for a set of registered panels (the PanelContext half a host adds). */
export function usePanelOpenState() {
  const [open, setOpenIds] = useState<ReadonlySet<string>>(() => new Set());
  const isOpen = useCallback((id: string) => open.has(id), [open]);
  const setOpen = useCallback((id: string, next: boolean) => setOpenIds((prev) => withPanel(prev, id, next)), []);
  return { isOpen, setOpen };
}
