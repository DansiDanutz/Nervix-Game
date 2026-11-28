# Controls

The full control map for the Nervix World client (desktop keyboard and mouse,
plus the touch pad). Tuning values are named constants in
`app/src/input/movement.ts` and `app/src/input/pointer.ts`; the key rules are
pure functions in `app/src/input/keys.ts`. Unit tests: `app/src/input/*.test.ts`.
E2E: `app/e2e/controls.spec.ts`.

## Keyboard

| Key | Action | Notes |
|---|---|---|
| W / ↑ | Walk forward | 4.2 m/s (`WALK_SPEED`) |
| S / ↓ | Walk back | |
| A / ← | Strafe left | |
| D / → | Strafe right | Diagonals are normalised, never faster |
| Shift (held) | Run | × 1.7 (`RUN_MULTIPLIER`); Shift+W covers 1.6–1.8 × the distance of W |
| Q (held) | Turn left | 1.8 rad/s (`KEY_TURN_RATE`): 1 s ≈ +1.8 rad |
| R (held) | Turn right | 1 s ≈ −1.8 rad |
| E | Enter the door in reach; otherwise collect a nearby seal | Ignored on auto-repeat |
| Enter | Enter the door in reach | **Pending the `useShellKeys` hookup** (today any Enter enters the door): never while a button, link or other control has focus, Enter belongs to that control |
| Esc | Close the open side menu or a visible panel; otherwise close the guide and leave the venue or house | **Pending the `useShellKeys` hookup** (today Esc always closes the guide and leaves). Only visible layers count, so the hidden side column never holds Esc back inside a house. Holding Esc only ever closes panels: a repeat never leaves |
| G | Toggle the district guide | |

### Rules that apply to every key

- **One typing filter** (`isTypingTarget`): nothing fires while focus is in an
  `INPUT`, `TEXTAREA`, `SELECT` or editable element. Esc in a field never leaves
  the house; W typed in a field never walks.
- **No stuck keys**: held keys clear on window blur, when the tab is hidden
  (`visibilitychange`) and on any Meta press or release (macOS drops keyups
  while ⌘ is held). A key held into a text field still releases.
- **Modifiers**: ⌘/Ctrl/Alt + a shell key (E, Enter, Esc, G) does nothing, so
  browser shortcuts never walk through a door.
- A frame step is capped at 0.05 s (`MAX_FRAME_DELTA`), so a stall never teleports the player.

### Hookup status

The rules above live in `app/src/input/keys.ts` (`shellKeyActions`),
`app/src/input/shellInput.ts` and `app/src/input/useShellKeys.ts`. The running
app still calls the pre-CT1 `app/src/shell/useWorldKeys.ts` until the lead
applies the hookup patch (`useWorldKeys` re-exports `useShellKeys`, and
`SideMenu` registers an Esc layer and an `EscapeVisibility` provider). The
typing filter and the no-stuck-keys rules for movement are already live.

## Mouse

| Input | Action | Notes |
|---|---|---|
| Drag on the world (any button) | Orbit the camera: horizontal turns, vertical pitches | 0.005 rad per px; dragging right turns right; pitch clamped |
| Click a door (press and release within 6 px) | Enter that door | `CLICK_MAX_TRAVEL_PX` |

A press is either a drag or a click, never both: the look-drag threshold
(`LOOK_DRAG_THRESHOLD_PX`) equals the door click guard and a unit test keeps
them equal. Clicking the world moves focus off any button, so E and Enter go
back to the world.

## Touch

The on-screen pad (▲ ◀ ▼ ▶) appears when a door is in reach and drives the same
movement as W/A/S/D, with Enter/Exit buttons for the door. Touch rework
(always-mounted pad, run toggle, turn buttons, `pointercancel`) is CT4.

## Player state

Every frame the controller publishes `{ x, z, yaw, tMs }` to
`app/src/player/playerState.ts` after the position update; readers get a frozen
snapshot with derived ground speed. `yaw` is the look yaw, with forward =
(−sin yaw, −cos yaw), the same value the `__nervixPlayer` dev hook reports.

Pending in the same hookup patch: `nextSnapshot` reports speed 0 for a step
faster than `MAX_GROUND_SPEED` (20 m/s), so a teleport or door transition is
not read as a one-frame run burst. Until it lands, speed spikes for one frame
on a teleport.
