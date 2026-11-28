/**
 * Read-only player state: position, yaw and speed. The player controller is the
 * only writer (publish); everything else reads `playerState.ref.current`, a
 * frozen snapshot, so readers never mutate the player.
 */
export interface PlayerSnapshot {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  /** Ground speed in metres per second. */
  readonly speed: number;
  readonly tMs: number;
}

export type PlayerSample = Omit<PlayerSnapshot, "speed">;

export const INITIAL_PLAYER: PlayerSnapshot = Object.freeze({ x: 0, z: 0, yaw: 0, speed: 0, tMs: 0 });

const MS_PER_S = 1000;

export function nextSnapshot(prev: PlayerSnapshot, sample: PlayerSample): PlayerSnapshot {
  const { x, z, yaw, tMs } = sample;
  if (![x, z, yaw, tMs].every(Number.isFinite)) return prev;
  const dt = (tMs - prev.tMs) / MS_PER_S;
  const first = prev === INITIAL_PLAYER;
  const speed = first ? 0 : dt > 0 ? Math.hypot(x - prev.x, z - prev.z) / dt : prev.speed;
  return Object.freeze({ x, z, yaw, speed, tMs });
}

export interface PlayerStateRef {
  readonly current: PlayerSnapshot;
}

export function createPlayerState() {
  let snapshot = INITIAL_PLAYER;
  const ref: PlayerStateRef = Object.freeze({
    get current() {
      return snapshot;
    },
  });
  const publish = (sample: PlayerSample) => {
    snapshot = nextSnapshot(snapshot, sample);
  };
  return Object.freeze({ ref, publish });
}

/** The one player state for the running client. */
export const playerState = createPlayerState();
