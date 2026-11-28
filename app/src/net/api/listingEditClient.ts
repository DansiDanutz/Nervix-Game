/** The bound P4 listing-edit client: server refusals become ApiError with their code. */
import { ApiError, call } from "./http";
import { listingEditEndpoints } from "./listingEdit";

export const listingEditApi = Object.freeze(listingEditEndpoints(call, (code) => new ApiError(400, code, code)));
