import { useCallback, useRef, useState, type ReactNode } from "react";
import { EscapeVisibility } from "../input/escapeVisibility";
import { useEscapeLayer } from "../input/useEscapeLayer";
import { isShown } from "../input/visibility";

/**
 * Account, merchant, orders, guide and advertising tools behind one collapsed button,
 * so the right-hand skyline (casino dome, roofline) stays clear on arrival.
 */
export function SideMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  // The side column is hidden inside a house: then neither the menu nor its panels hold Esc back.
  const isVisible = useCallback(() => isShown(toggle.current), []);
  useEscapeLayer(open, () => setOpen(false), isVisible);
  return (
    <EscapeVisibility.Provider value={isVisible}>
      <button ref={toggle} type="button" className="app__account app__menu" aria-expanded={open} data-testid="side-menu" onClick={() => setOpen((v) => !v)}>
        {open ? "Close menu" : "Menu"}
      </button>
      {open && children}
    </EscapeVisibility.Provider>
  );
}
