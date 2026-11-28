/**
 * CT3 speech bubbles in the scene: each speaker's latest place-chat line
 * (useChatBubbles) over their head. Remote bubbles sit at the speaker's latest
 * presence position; the local bubble follows the local player every frame
 * (playerState). Display only: no interaction, nothing persisted.
 */
import { useRef } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import type { RemotePlayer } from "../net/presenceCore";
import { useChatBubbles } from "../net/presenceChatStore";
import { playerState } from "../player/playerState";
import { bubbleAnchors, type BubbleAnchor } from "../world/chatBubbleAnchors";
import "./ChatBubbles.css";

/** Bubble height above the ground (m): just over a 1.8 m figure. */
const BUBBLE_Y = 2.35;

function Bubble({ anchor }: { anchor: BubbleAnchor }) {
  return (
    <Html position={[0, BUBBLE_Y, 0]} center distanceFactor={10} zIndexRange={[20, 0]}>
      <div className="chat-bubble" data-testid={`chat-bubble-${anchor.key}`} data-self={anchor.self}>
        <small>{anchor.name}</small> {anchor.text}
      </div>
    </Html>
  );
}

function SelfBubble({ anchor }: { anchor: BubbleAnchor }) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    const { x, z } = playerState.ref.current;
    group.current?.position.set(x, 0, z);
  });
  return (
    <group ref={group}>
      <Bubble anchor={anchor} />
    </group>
  );
}

export function ChatBubbles({ players }: { players: readonly RemotePlayer[] }) {
  const anchors = bubbleAnchors(useChatBubbles(), players);
  return (
    <group name="chat_bubbles">
      {anchors.map((a) =>
        a.self ? (
          <SelfBubble key={a.key} anchor={a} />
        ) : (
          <group key={a.key} position={[a.x ?? 0, 0, a.z ?? 0]}>
            <Bubble anchor={a} />
          </group>
        ),
      )}
    </group>
  );
}
