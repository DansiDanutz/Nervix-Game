import { useState } from "react";
import { api, type AgentAction, type AgentReply } from "../net/api";

interface Turn {
  role: "player" | "agent";
  text: string;
}

// Merchant replies are captions only (decision D8): no browser or system voice.
export function AgentPanel({ propertyId, agentName }: { propertyId: string; agentName: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<AgentAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setInput("");
    setTurns((t) => [...t, { role: "player", text }]);
    try {
      const reply: AgentReply = await api.message(propertyId, text);
      setTurns((t) => [...t, { role: "agent", text: reply.text }]);
      const action = reply.actions[0];
      if (action && !reply.denied) setPending(action);
    } catch (e) {
      setError(e instanceof Error ? e.message : "request failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    try {
      await api.confirm(propertyId, { ...pending, acknowledged: true });
      setTurns((t) => [...t, { role: "agent", text: "Confirmed — the merchant has it." }]);
      setPending(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "confirmation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-label={`AI employee ${agentName}`}>
      <header className="panel__head">
        <strong>{agentName}</strong>
        <span className="panel__tag">AI employee</span>
      </header>

      <div className="panel__log" role="log" aria-live="polite">
        {turns.length === 0 && <p className="panel__hint">Ask about products, prices or how to order.</p>}
        {turns.map((turn, i) => (
          <p key={i} className={turn.role === "player" ? "turn turn--player" : "turn"}>
            {turn.text}
          </p>
        ))}
        {busy && <p className="panel__hint">…</p>}
        {error && <p className="panel__error">{error}</p>}
      </div>

      {pending && (
        <div className="panel__confirm">
          <span>Confirm: {pending.tool.replace(/_/g, " ")}</span>
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
        />
        <button type="submit" disabled={busy || input.trim().length === 0}>
          Send
        </button>
      </form>
    </section>
  );
}