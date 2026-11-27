import { useCallback, useEffect, useState } from "react";
import { api, type AdminMerchant, type AuditEvent } from "../net/api";

export function AdminPanel({ userId }: { userId: string }) {
  const [merchants, setMerchants] = useState<AdminMerchant[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void api.adminMerchants(userId).then((r) => setMerchants(r.merchants)).catch(() => setMerchants([]));
    void api.adminAudit(userId).then((r) => setAudit(r.events)).catch(() => setAudit([]));
  }, [userId]);

  useEffect(refresh, [refresh]);

  async function toggle(m: AdminMerchant) {
    setError(null);
    try {
      if (m.suspended) await api.adminReinstate(userId, m.id);
      else await api.adminSuspend(userId, m.id);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    }
  }

  return (
    <section className="panel" aria-label="Administration">
      <header className="panel__head">
        <strong>Admin</strong>
        <span className="panel__tag">{merchants.length} merchants</span>
      </header>

      <ul className="panel__list">
        {merchants.map((m) => (
          <li key={m.id} className="panel__order">
            <span>
              {m.name} · {m.businessType}
            </span>
            <em>{m.suspended ? "suspended" : "active"}</em>
            <button type="button" onClick={() => toggle(m)}>
              {m.suspended ? "Reinstate" : "Suspend"}
            </button>
          </li>
        ))}
      </ul>

      <p className="panel__hint">Recent admin actions</p>
      <ul className="panel__list">
        {audit.slice(0, 8).map((e) => (
          <li key={e.id}>
            {e.action} · {e.subject}
          </li>
        ))}
      </ul>
      {error && <p className="panel__error">{error}</p>}
    </section>
  );
}