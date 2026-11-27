import type { Marker } from "../scene/CityScene";

const QUEST_STEPS = [
  "Find the fountain in Central Plaza",
  "Speak with the city guide",
  "Recover the three ceremonial seals",
];

export function Hud({
  session,
  nearby,
  seals,
}: {
  session: { displayName: string; role: string; demo: boolean };
  nearby: Marker | null;
  seals: number;
}) {
  return (
    <div className="hud">
      <header className="hud__top">
        <div>
          <strong>Nervix World</strong>
          <span className="hud__tag">{session.demo ? "demo session" : session.role}</span>
        </div>
        <div className="hud__seals">Seals {seals}/3</div>
      </header>

      <div className="hud__quest">
        <h2>The Lost Seals of the City</h2>
        <ol>
          {QUEST_STEPS.map((step, i) => (
            <li key={step} className={i < seals ? "is-done" : undefined}>
              {step}
            </li>
          ))}
        </ol>
      </div>

      {nearby && (
        <div className="hud__prompt">
          <span>{nearby.kind ?? "interaction"}</span>
          {nearby.slot ? <small>{nearby.slot}</small> : null}
        </div>
      )}

      <footer className="hud__help">
        WASD / arrows to walk · Shift to run · Merchant conversations are private
      </footer>
    </div>
  );
}