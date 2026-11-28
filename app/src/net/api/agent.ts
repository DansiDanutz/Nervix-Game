import type { Call } from "./http";
import type { AgentAction, AgentReply } from "./types";

export const agentEndpoints = (call: Call) => ({
  message: (propertyId: string, message: string, tool?: string, args?: Record<string, unknown>) =>
    call<AgentReply>(`/agent/${propertyId}/message`, { message, tool, args }),
  speak: (propertyId: string, text: string) =>
    call<{ available: boolean; audioUrl: string | null }>(`/agent/${propertyId}/speak`, { text }),
  confirm: (propertyId: string, action: AgentAction) =>
    call<{ result: unknown }>(`/agent/${propertyId}/confirm`, { action }),
});
