import { useState } from "react";
import { api } from "../net/api";
import {
  appendTurn,
  confirmPayload,
  confirmedText,
  pendingProposal,
  proposalLabel,
  supportRequest,
  type ProposalAction,
  type Turn,
} from "./talkToMerchantModel";

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/**
 * The chat with one property's merchant assistant. The server keeps the
 * conversation per (property, signed-in user) (S3); this panel only shows the
 * current viewer's own turns. Captions only (decision D8): no browser or system voice.
 */
export function AgentPanel({ propertyId, agentName, hint }: { propertyId: string; agentName: string; hint?: string }) {
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<ProposalAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Sends the typed text; `asSupport` asks the server to propose a support request for it. */
  async function send(asSupport = false) {
    const text = input.trim();
    if (!text || busy) return;
    const request = asSupport ? supportRequest(text) : null;
    setBusy(true);
    setError(null);
    setInput("");
    setTurns((t) => appendTurn(t, "player", text));
    try {
      const reply = request ? await api.message(propertyId, text, request.tool, request.args) : await api.message(propertyId, text);
      setTurns((t) => appendTurn(t, "agent", reply.text));
      setPending(pendingProposal(reply));
    } catch (e) {
      setError(errorText(e, "request failed"));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const { result } = await api.confirm(propertyId, confirmPayload(pending));
      setTurns((t) => appendTurn(t, "agent", confirmedText(pending.tool, result)));
      setPending(null);
    } catch (e) {
      setError(errorText(e, "confirmation failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-label={agentName} data-testid="merchant-chat">
      <header className="panel__head">
        <strong>{agentName}</strong>
        <span className="panel__tag">AI assistant</span>
      </header>

      {hint && <p className="panel__hint talk__privacy" data-testid="merchant-chat-privacy">{hint}</p>}

      <div className="panel__log" role="log" aria-live="polite" data-testid="merchant-chat-log">
        {turns.length === 0 && <p className="panel__hint">Ask about products, prices or how to order.</p>}
        {turns.map((turn, i) => (
          <p key={i} className={turn.role === "player" ? "turn turn--player" : "turn"} data-role={turn.role}>
            {turn.text}
          </p>
        ))}
        {busy && <p className="panel__hint">…</p>}
        {error && <p className="panel__error" role="alert">{error}</p>}
      </div>

      {pending && (
        <div className="panel__confirm" data-testid="merchant-chat-proposal">
          <span>{proposalLabel(pending)}</span>
          <button type="button" onClick={confirm} disabled={busy}>
            Confirm
          </button>
          <button type="button" onClick={() => setPending(null)} disabled={busy}>
            Cancel
          </button>
        </div>
      )}

      <form
        className="panel__form"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the merchant's assistant"
          aria-label="Message"
          maxLength={4000}
        />
        <button type="submit" disabled={busy || input.trim().length === 0}>
          Send
        </button>
      </form>
      {/* The server proposes; nothing reaches the merchant until the player confirms. */}
      <button
        type="button"
        className="talk__support"
        data-testid="merchant-chat-support"
        onClick={() => void send(true)}
        disabled={busy || input.trim().length === 0}
      >
        Send as a support request
      </button>
    </section>
  );
}
