/**
 * CT3 hookup glue: where each live chat bubble (useChatBubbles) is drawn.
 * A remote bubble sits over its speaker's latest presence position; the local
 * bubble has no position (the scene follows the local player every frame).
 * A speaker who is not in this place has no bubble. Pure; type-only shapes.
 */

interface BubbleLike {
  readonly playerId: string;
  readonly self: boolean;
  readonly name: string;
  readonly text: string;
}

interface PlayerLike {
  readonly id: string;
  readonly x: number;
  readonly z: number;
}

export interface BubbleAnchor {
  readonly key: string;
  readonly text: string;
  readonly name: string;
  readonly self: boolean;
  readonly x?: number;
  readonly z?: number;
}

export const SELF_BUBBLE_KEY = "self";

function anchorOf(bubble: BubbleLike, byId: ReadonlyMap<string, PlayerLike>): BubbleAnchor | null {
  const base = { text: bubble.text, name: bubble.name, self: bubble.self };
  if (bubble.self) return Object.freeze({ key: SELF_BUBBLE_KEY, ...base });
  const p = byId.get(bubble.playerId);
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return null;
  return Object.freeze({ key: bubble.playerId, ...base, x: p.x, z: p.z });
}

export function bubbleAnchors(bubbles: readonly BubbleLike[], players: readonly PlayerLike[]): readonly BubbleAnchor[] {
  const byId = new Map(players.map((p) => [p.id, p] as const));
  return Object.freeze(bubbles.map((b) => anchorOf(b, byId)).filter((a): a is BubbleAnchor => a !== null));
}
