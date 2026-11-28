import { createContext } from "react";

/**
 * How a container tells the escape layers inside it whether it is visible.
 * The side menu provides one (its column is hidden inside a house), so every
 * panel rendered in it inherits the check without wiring it itself.
 */
export const EscapeVisibility = createContext<() => boolean>(() => true);
