/**
 * How a DGL screen is talking to the show, for the connection pill. Pure: no
 * React, no DOM.
 *
 * "connecting" until the first answer: the server render and the first client
 * render both say it (the server's snapshot of navigator.onLine is true and
 * nothing has answered yet), so hydration matches and no screen claims "live"
 * before it has heard from the server.
 */
export type Connection = "connecting" | "live" | "reconnecting" | "offline";

export function connectionFor(online: boolean, failing: boolean, answered: boolean): Connection {
  if (!online) return "offline";
  if (failing) return "reconnecting";
  return answered ? "live" : "connecting";
}
