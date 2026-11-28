import { useEffect, useRef } from "react";
import { closeOnChange } from "./panelOpenState";

/** Calls `close` when `key` really changes (another house, or none); never on mount or unmount. */
export function useCloseOnChange<T>(key: T, close: () => void) {
  const previous = useRef<T | undefined>(undefined);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (closeOnChange(previous.current, key)) closeRef.current();
    previous.current = key;
  }, [key]);
}
