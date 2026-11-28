/**
 * Shell keys moved to input/useShellKeys (CT1): one typing filter, Esc closes
 * visible side panels first, Enter on a focused control stays with that
 * control, auto-repeat never walks through a door. Re-exported under the old
 * name so App.tsx keeps its call.
 */
export { useShellKeys as useWorldKeys } from "../input/useShellKeys";
