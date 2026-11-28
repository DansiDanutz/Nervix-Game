import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import { isActivatableTarget, isTypingTarget } from "../input/keys";
import { SAY_MAX_CHARS } from "../net/presenceChat";
import { chatStore, useChat } from "../net/presenceChatStore";
import { capDraft, chatKeyIntent } from "./playerChatModel";
import "./PlayerChat.css";

/** Safari reports keys pressed during IME composition with this keyCode. */
const IME_KEY_CODE = 229;

interface PlayerChatProps {
  /**
   * True lets Enter open the chat too. Off by default so Enter stays with doors
   * and exits; the App passes `enterFocuses={target === null}` (T always works).
   */
  enterFocuses?: boolean;
}

/** T or Enter in the world focuses the chat input. */
function useFocusKeys(input: RefObject<HTMLInputElement | null>, enterFocuses: boolean) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target === input.current) return; // the input's own handler decides
      const intent = chatKeyIntent({
        key: e.key, inChat: false, typing: isTypingTarget(e.target), activatable: isActivatableTarget(e.target),
        enterFocuses, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, repeat: e.repeat,
      });
      if (intent !== "focus") return;
      e.preventDefault(); // the T must not land in the input
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [input, enterFocuses]);
}

/**
 * Player chat for the place the player is in (CT3). Lines go to everyone in
 * the same place and nowhere else; the server keeps no history and this log
 * lives in memory only. While the input has focus, movement keys are ignored
 * (isTypingTarget). Merchant conversations have their own panel, never this one.
 */
export function PlayerChat({ enterFocuses = false }: PlayerChatProps) {
  const chat = useChat();
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  useFocusKeys(input, enterFocuses);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    const intent = chatKeyIntent({
      key: e.key, inChat: true, typing: true, activatable: true, enterFocuses, repeat: e.repeat,
      composing: e.nativeEvent.isComposing || e.keyCode === IME_KEY_CODE,
    });
    if (intent === "blur") {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (intent === "send") {
      e.preventDefault();
      if (draft.trim() !== "" && chatStore.say(draft).ok) setDraft("");
      e.currentTarget.blur(); // back to walking
    }
  };

  return (
    <section className="player-chat" aria-label="Place chat" data-testid="player-chat">
      <ol className="player-chat__log" role="log" aria-live="polite" aria-relevant="additions" data-testid="player-chat-log">
        {chat.lines.map((line) => (
          <li key={line.key} className={line.self ? "player-chat__line player-chat__line--self" : "player-chat__line"}>
            <span className="player-chat__name">{line.self ? "You" : line.name}</span>
            <span className="player-chat__text">{line.text}</span>
          </li>
        ))}
      </ol>
      {chat.notice && <p className="player-chat__notice" role="status">{chat.notice}</p>}
      <input
        ref={input}
        className="player-chat__input"
        data-testid="player-chat-input"
        type="text"
        value={draft}
        autoComplete="off"
        spellCheck={false}
        aria-label="Say something to everyone in this place"
        placeholder="Press T to chat"
        onChange={(e) => setDraft(capDraft(e.target.value, SAY_MAX_CHARS))}
        onKeyDown={onKeyDown}
      />
    </section>
  );
}
