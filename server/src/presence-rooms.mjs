/**
 * Room reads and room fan-out for presence (split out of presence.mjs before
 * C9). A room is every joined record whose `place` matches; frames for a room
 * reach those sockets and nobody else. `flush` is one tick: a `delta` per room
 * that changed since the last tick, built from the players' current records.
 */
import { deliver } from "./presence-transport.mjs";

/**
 * `players` is the live ws -> record map, `batch` the room change batcher and
 * `publicView` the record -> broadcast shape. Nothing here mutates a record.
 */
export function createRooms({ players, batch, publicView, maxBufferedBytes }) {
  let tick = 0;
  const members = (place) => [...players.values()].filter((r) => r.place === place);
  const roomOf = (place) => members(place).map(publicView);
  const roomSize = (place) => members(place).length;

  /** Sends one frame to every joined socket in `place`, and nobody else. */
  const broadcastRoom = (place, type, payload = {}) => {
    const data = JSON.stringify({ type, ...payload });
    for (const [client, record] of players) {
      if (record.place === place) deliver(client, data, maxBufferedBytes);
    }
  };

  const flush = () => {
    tick += 1;
    for (const { place, changed, left } of batch.drain()) {
      const present = members(place);
      const here = new Set(present.map((r) => r.handle));
      const touched = new Set(changed);
      const upserts = present.filter((r) => touched.has(r.handle)).map(publicView);
      const gone = left.filter((handle) => !here.has(handle));
      if (upserts.length > 0 || gone.length > 0) broadcastRoom(place, "delta", { place, tick, players: upserts, left: gone });
    }
  };

  return Object.freeze({ roomOf, roomSize, broadcastRoom, flush });
}
