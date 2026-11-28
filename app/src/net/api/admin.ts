import type { Call } from "./http";
import type { AdminMerchant, AuditEvent } from "./types";

export const adminEndpoints = (call: Call) => ({
  adminMerchants: (userId: string) => call<{ merchants: AdminMerchant[] }>(`/admin/merchants?userId=${encodeURIComponent(userId)}`),
  adminSuspend: (userId: string, merchantId: string) =>
    call<{ suspended: boolean }>(`/admin/merchants/${merchantId}/suspend`, { userId }),
  adminReinstate: (userId: string, merchantId: string) =>
    call<{ suspended: boolean }>(`/admin/merchants/${merchantId}/reinstate`, { userId }),
  adminAudit: (userId: string) => call<{ events: AuditEvent[] }>(`/admin/audit?userId=${encodeURIComponent(userId)}`),
});
