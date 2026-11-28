import { useState, type FormEvent } from "react";
import { api, ApiError, type House } from "../net/api";

const THEMES = ["salon", "workshop", "gallery", "cafe"] as const;

/** Owner-only customisation. The server is the authority; this is only a form. */
export function HouseEditor({ house, onSaved }: { house: House; onSaved: () => void }) {
  const p = house.profile;
  const [welcome, setWelcome] = useState(p.welcome ?? "");
  const [theme, setTheme] = useState(p.decor.theme ?? "salon");
  const [accent, setAccent] = useState(p.decor.accent ?? "#c9a441");
  const [websiteUrl, setWebsiteUrl] = useState(p.websiteUrl ?? "");
  const [showApp, setShowApp] = useState(p.display.showApp !== false);
  const [featured, setFeatured] = useState<string[]>(p.display.featuredListingIds ?? []);
  const [listingName, setListingName] = useState("");
  const [listingPrice, setListingPrice] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const report = (e: unknown) => setStatus(e instanceof ApiError ? `Refused: ${e.code}` : "Could not save");

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("Saving…");
    try {
      await api.saveHouseProfile(house.propertyId, {
        welcome: welcome.trim() || null,
        decor: { theme, accent },
        display: { featuredListingIds: featured, showApp },
        websiteUrl: websiteUrl.trim() || null,
      });
      setStatus("Saved");
      onSaved();
    } catch (err) {
      report(err);
    }
  };

  const addListing = async (e: FormEvent) => {
    e.preventDefault();
    const priceMinor = Math.round(Number(listingPrice) * 100);
    if (!listingName.trim() || !Number.isFinite(priceMinor) || priceMinor < 0) {
      setStatus("Enter a name and a price");
      return;
    }
    try {
      await api.addHouseListing(house.propertyId, { name: listingName.trim(), priceMinor, currency: "EUR" });
      setListingName("");
      setListingPrice("");
      setStatus("Listing added");
      onSaved();
    } catch (err) {
      report(err);
    }
  };

  const toggleFeatured = (id: string) =>
    setFeatured((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(0, 6)));

  return (
    <section className="house-editor" aria-label="Customise your house" data-testid="house-editor">
      <h3>Customise your house</h3>
      <form onSubmit={save}>
        <label>
          Welcome
          <textarea maxLength={280} value={welcome} onChange={(e) => setWelcome(e.target.value)} data-testid="edit-welcome" />
        </label>
        <label>
          Decor
          <select value={theme} onChange={(e) => setTheme(e.target.value as (typeof THEMES)[number])}>
            {THEMES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Accent
          <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} />
        </label>
        <label>
          Website (https)
          <input type="url" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://" />
        </label>
        <label className="house-editor__check">
          <input type="checkbox" checked={showApp} onChange={(e) => setShowApp(e.target.checked)} /> Show my app
        </label>
        <fieldset>
          <legend>Featured on display</legend>
          {house.listings.map((l) => (
            <label key={l.id} className="house-editor__check">
              <input type="checkbox" checked={featured.includes(l.id)} onChange={() => toggleFeatured(l.id)} /> {l.name}
            </label>
          ))}
        </fieldset>
        <button type="submit" data-testid="edit-save">Save house</button>
      </form>
      <form onSubmit={addListing} className="house-editor__row">
        <input aria-label="New listing name" value={listingName} onChange={(e) => setListingName(e.target.value)} placeholder="New listing" />
        <input aria-label="Price in EUR" value={listingPrice} onChange={(e) => setListingPrice(e.target.value)} placeholder="EUR" inputMode="decimal" />
        <button type="submit">Add</button>
      </form>
      {status && <p className="house-editor__status" role="status" data-testid="edit-status">{status}</p>}
    </section>
  );
}
