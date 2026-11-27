import { useCallback, useEffect, useState } from "react";
import { api, type Campaign, type Placement } from "../net/api";

const iso = (d: Date) => d.toISOString();
const days = (n: number) => new Date(Date.now() + n * 86400000);

export function AdsPanel({ merchantId }: { merchantId: string }) {
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [placementId, setPlacementId] = useState("plaza-1");
  const [text, setText] = useState("");
  const [colour, setColour] = useState("#e8dcc0");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void api.placements().then((r) => setPlacements(r.placements)).catch(() => setPlacements([]));
    void api.campaigns().then((r) => setCampaigns(r.campaigns)).catch(() => setCampaigns([]));
  }, []);

  useEffect(refresh, [refresh]);

  async function create() {
    setError(null);
    try {
      await api.createCampaign({
        id: `cmp_${Date.now().toString(36)}`,
        merchantId,
        placementId,
        priceMinor: placements.find((p) => p.id === placementId)?.priceMinor ?? 1000,
        currency: "EUR",
        startsAt: iso(days(1)),
        endsAt: iso(days(8)),
        creative: { text, colour },
      });
      setText("");
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    }
  }

  async function act(c: Campaign, action: string) {
    await api.campaignAction(c.id, action);
    if (action === "request-payment") {
      await api.campaignAction(c.id, "pay");
      await api.campaignAction(c.id, "tick");
    }
    if (action === "tick") await api.campaignAction(c.id, "tick");
    refresh();
  }

  return (
    <section className="panel" aria-label="Advertising">
      <header className="panel__head">
        <strong>Advertising</strong>
        <span className="panel__tag">paid placement</span>
      </header>

      <div className="panel__grid">
        <select value={placementId} onChange={(e) => setPlacementId(e.target.value)} aria-label="Placement">
          {placements.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id} · {p.priceMinor} {p.currency}
            </option>
          ))}
        </select>
        <input type="color" value={colour} onChange={(e) => setColour(e.target.value)} aria-label="Colour" />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="creative text" aria-label="Creative text" />
        <button type="button" onClick={create} disabled={!text}>
          Create
        </button>
      </div>

      <ul className="panel__list">
        {campaigns.map((c) => (
          <li key={c.id} className="panel__order">
            <span>
              {c.id} · {c.placementId}
            </span>
            <em>{c.state}</em>
            {c.state === "draft" && (
              <button type="button" onClick={() => act(c, "request-payment")}>
                Pay (demo)
              </button>
            )}
            {c.state === "scheduled" && (
              <button type="button" onClick={() => act(c, "tick")}>
                Activate
              </button>
            )}
            {c.state === "active" && (
              <button type="button" onClick={() => act(c, "tick")}>
                Advance
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="panel__error">{error}</p>}
      <p className="panel__hint">Unpaid campaigns never serve.</p>
    </section>
  );
}