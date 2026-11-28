/** The HTTP request handler: route lookup, body parsing and error-to-status mapping. */

import { AccessError } from "../entitlement.mjs";
import { HouseProfileError } from "../house-authority.mjs";
import { send, readJson, readRaw } from "./http.mjs";
import { matchRoute } from "./index.mjs";

const BODY_METHODS = ["POST", "PATCH", "PUT"];

const ACCESS_STATUS = Object.freeze({ unauthorized: 401, unknown_property: 404, cap_reached: 429 });
const FORBIDDEN = 403;
const BAD_REQUEST = 400;
const SERVER_ERROR = 500;

function errorResponse(res, error) {
  if (error instanceof AccessError) return send(res, ACCESS_STATUS[error.code] ?? FORBIDDEN, { error: error.code, message: error.message });
  if (error instanceof HouseProfileError) return send(res, BAD_REQUEST, { error: "invalid_profile", message: error.message });
  if (error?.name === "agent_error") return send(res, SERVER_ERROR, { error: "agent_error", message: error.message });
  if (error instanceof TypeError || error instanceof ReferenceError || !error?.name) {
    console.error(`request failed: ${error?.stack ?? error}`);
    return send(res, SERVER_ERROR, { error: "server_error", message: "internal error" });
  }
  return send(res, BAD_REQUEST, { error: error.name, message: error.message });
}

export function createRequestHandler(routes) {
  return async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const { handler, params: pathParams } = matchRoute(routes, req.method, path);

    const rawBodyRoute = req.method === "POST" && path === "/webhooks/nervixpay";
    const params = { ...Object.fromEntries(url.searchParams.entries()), ...pathParams, req, res };
    if (rawBodyRoute) {
      // The webhook route verifies the raw bytes, so its stream must stay unread.
      try {
        const raw = await readRaw(req);
        return send(res, 200, await handler({ raw, headers: req.headers }, params));
      } catch (error) {
        return errorResponse(res, error);
      }
    }
    if (!handler) return send(res, 404, { error: "not_found", path });
    try {
      const body = BODY_METHODS.includes(req.method) ? await readJson(req) : {};
      return send(res, 200, await handler(body, params));
    } catch (error) {
      return errorResponse(res, error);
    }
  };
}
