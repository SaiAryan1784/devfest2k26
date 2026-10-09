import type { StoredStatus, Winners } from "./types";

export type ActStanding = {
  performanceId: string;
  name: string;
  status: StoredStatus;
  votes: number;
  /** The exact (unrounded) average of counted votes, null with none. */
  exact: number | null;
  revealed: boolean;
};

/**
 * The winner of a track: among acts that were revealed and have at least one
 * counted vote, the highest exact average. An exact tie returns every tied act
 * in running order. `audience` is the rounded maximum (8.5 gives 9). Null when
 * no act qualifies.
 */
export function winnersOf(acts: ActStanding[]): Winners | null {
  const ok = acts.filter((a) => a.revealed && a.votes > 0 && a.exact !== null);
  if (ok.length === 0) return null;
  const max = Math.max(...ok.map((a) => a.exact as number));
  return { names: ok.filter((a) => a.exact === max).map((a) => a.name), audience: Math.round(max) };
}
