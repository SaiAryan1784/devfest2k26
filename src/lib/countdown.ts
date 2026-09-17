export type Countdown = { days: number; hours: number; minutes: number; seconds: number; done: boolean };

export function countdownTo(iso: string, now = Date.now()): Countdown {
  const diff = Math.max(0, new Date(iso).getTime() - now);
  const s = Math.floor(diff / 1000);
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
    done: diff === 0,
  };
}
