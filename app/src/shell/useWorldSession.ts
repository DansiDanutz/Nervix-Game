import { useEffect, useState } from "react";
import { api, type QuestProgress, type Session } from "../net/api";
import { loadSession } from "../net/session";

export type ApiStatus = "connecting" | "connected" | "offline";

/** Session resume, demo session, house provisioning and quest progress on boot. */
export function useWorldSession(onResume: () => void) {
  const [session, setSession] = useState<Session | null>(null);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [status, setStatus] = useState<ApiStatus>("connecting");
  const [quest, setQuest] = useState<QuestProgress | null>(null);

  useEffect(() => {
    // Resume an existing verified session; never enter on a client flag.
    void api
      .me()
      .then((me) => {
        if (me.level === "signed_out") return;
        setSession({ userId: me.userId ?? "", displayName: me.displayName ?? "Traveler", role: me.level === "build" ? "merchant_owner" : "player", demo: true });
        onResume();
      })
      .catch(() => {});

    let alive = true;
    (async () => {
      try {
        const s = await api.session(loadSession().userId);
        if (!alive) return;
        setSession(s);
        // Only eligible builders reserve a property; visitors just explore.
        const property = await api.provision("merchant").then((r) => r.property).catch(() => null);
        if (!alive) return;
        if (property) setPropertyId(property.id);
        setQuest((await api.progress(s.userId)).progress);
        setStatus("connected");
      } catch {
        if (alive) setStatus("offline");
      }
    })();
    return () => {
      alive = false;
    };
    // Boot once, as before the split; onResume is a stable state setter.
  }, []);

  return { session, setSession, propertyId, status, quest, setQuest };
}
