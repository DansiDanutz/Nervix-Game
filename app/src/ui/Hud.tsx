import type { Marker } from "../scene/CityScene";

const QUEST_TITLE = "The Lost Seals of the City";
const QUEST_STEPS = [
  "Find the fountain in Central Plaza",
  "Speak with the city guide",
  "Recover the three ceremonial seals",
];

/**
 * Top-left quest, docked under the title. On arrival it is a one-line chip so the
 * left-hand merchant house and cafe read; it opens once the player starts exploring
 * or clicks it.
 */
function QuestCard({ open, seals, onToggle }: { open: boolean; seals: number; onToggle: () => void }) {
  return (
    <section className={open ? "hud__quest" : "hud__quest is-collapsed"} data-testid="quest" data-open={open}>
      <button type="button" className="hud__quest-toggle" aria-expanded={open} onClick={onToggle}>
        <h2>{QUEST_TITLE}</h2>
        {!open && <span className="hud__quest-count">{seals}/3</span>}
      </button>
      {open && (
        <ol>
          {QUEST_STEPS.map((step, i) => (
            <li key={step} className={i < seals ? "is-done" : undefined}>
              {step}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function Hud({
  session,
  nearby,
  seals,
  questOpen,
  onToggleQuest,
}: {
  session: { displayName: string; role: string; demo: boolean };
  nearby: Marker | null;
  seals: number;
  questOpen: boolean;
  onToggleQuest: () => void;
}) {
  return (
    <div className="hud">
      <header className="hud__top">
        <div className="hud__brand">
          <div className="hud__wordmark">
            <strong>Nervix World</strong>
            <span className="hud__tag">{session.demo ? "demo session" : session.role}</span>
          </div>
          <QuestCard open={questOpen} seals={seals} onToggle={onToggleQuest} />
        </div>
        <div className="hud__seals">Seals {seals}/3</div>
      </header>

      {nearby && (
        <div className="hud__prompt">
          <span>{nearby.kind ?? "interaction"}</span>
          {nearby.slot ? <small>{nearby.slot}</small> : null}
        </div>
      )}
    </div>
  );
}
