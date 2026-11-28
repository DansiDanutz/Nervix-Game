/** The composed API client: one object, split by domain under net/api/*. */
import { call } from "./http";
import { authEndpoints } from "./auth";
import { merchantEndpoints } from "./merchants";
import { agentEndpoints } from "./agent";
import { questEndpoints } from "./quest";
import { adminEndpoints } from "./admin";
import { houseEndpoints } from "./houses";
import { adsEndpoints } from "./ads";
import { orderEndpoints } from "./orders";
import { avatarEndpoints } from "./avatar";
import { worldEndpoints } from "./world";

export { ApiError, BASE, type Call } from "./http";
export type { Me } from "./auth";
export { AVATAR_PRESETS, DEFAULT_PRESET, isAvatarPresetId, type AvatarPreset, type AvatarPalette, type MyAvatar } from "./avatar";
export type * from "./types";
export { parseWorldHouses, type WorldHouse } from "./world";

export const api = Object.freeze({
  ...authEndpoints(call),
  ...merchantEndpoints(call),
  ...agentEndpoints(call),
  ...questEndpoints(call),
  ...adminEndpoints(call),
  ...houseEndpoints(call),
  ...adsEndpoints(call),
  ...orderEndpoints(call),
  ...avatarEndpoints(call),
  ...worldEndpoints(call),
});
