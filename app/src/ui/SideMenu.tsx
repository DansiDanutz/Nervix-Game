import { useState, type ReactNode } from "react";

/**
 * Account, merchant, orders, guide and advertising tools behind one collapsed button,
 * so the right-hand skyline (casino dome, roofline) stays clear on arrival.
 */
export function SideMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="app__account app__menu" aria-expanded={open} data-testid="side-menu" onClick={() => setOpen((v) => !v)}>
        {open ? "Close menu" : "Menu"}
      </button>
      {open && children}
    </>
  );
}
