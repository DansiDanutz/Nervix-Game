import { useEffect, useState } from "react";
import { api, type CatalogItem } from "../net/api";

const TEMPLATES = ["merchant_house", "cafe_shop", "casino_venue"];
const TONES = ["warm", "formal", "playful"];

export function MerchantPanel({ merchantId, propertyId }: { merchantId: string; propertyId: string }) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [agentName, setAgentName] = useState("Mira");
  const [tone, setTone] = useState("warm");
  const [template, setTemplate] = useState("merchant_house");
  const [palette, setPalette] = useState("#e8dcc0");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void api.merchantProducts(merchantId).then((r) => setItems(r.items)).catch(() => setItems([]));
  }, [merchantId]);

  async function add() {
    try {
      const { product } = await api.addProduct(merchantId, {
        sku,
        name,
        unitAmountMinor: Number(amount),
        currency: "EUR",
        fulfillment: "pickup",
      });
      setItems((list) => [...list.filter((i) => i.sku !== product.sku), product]);
      setSku("");
      setName("");
      setAmount("");
      setMessage("Added");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "failed");
    }
  }

  return (
    <section className="panel" aria-label="Merchant workspace">
      <header className="panel__head">
        <strong>Merchant</strong>
        <span className="panel__tag">{items.length} products</span>
      </header>

      <ul className="panel__list">
        {items.map((i) => (
          <li key={i.sku}>
            {i.name} · {i.unitAmountMinor} {i.currency}
          </li>
        ))}
      </ul>

      <div className="panel__grid">
        <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="sku" aria-label="SKU" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="name" aria-label="Name" />
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="cents" inputMode="numeric" aria-label="Amount in cents" />
        <button type="button" onClick={add} disabled={!sku || !name || !amount}>
          Add
        </button>
      </div>

      <div className="panel__grid">
        <input value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="agent name" aria-label="Agent name" />
        <select value={tone} onChange={(e) => setTone(e.target.value)} aria-label="Tone">
          {TONES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void api.updateAgent(merchantId, propertyId, { name: agentName, tone, languages: ["en", "ro"] })}>
          Save agent
        </button>
      </div>

      <div className="panel__grid">
        <select value={template} onChange={(e) => setTemplate(e.target.value)} aria-label="Template">
          {TEMPLATES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input type="color" value={palette} onChange={(e) => setPalette(e.target.value)} aria-label="Palette" />
        <button type="button" onClick={() => void api.updateAppearance(merchantId, propertyId, { template, palette })}>
          Save look
        </button>
      </div>

      {message && <p className="panel__hint">{message}</p>}
    </section>
  );
}