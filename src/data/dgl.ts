/**
 * DevFest Got Latent (DGL): live audience voting.
 *
 * Every number, limit and user-visible string for DGL lives here. Components
 * and routes never inline them.
 */
export const DGL = {
  name: "DevFest Got Latent",
  /** Performance length, server time. */
  performanceMs: 90_000,
  /** The last N seconds of the timer are made visually obvious. */
  finalCountdownS: 10,
  /** The audience average stays hidden below this many votes. */
  minVotes: 5,
  /**
   * When the phone shows the average. "after-vote" hides it until the voter
   * has voted (or voting closed) so early votes do not anchor later ones;
   * "always" is the spec's literal reading.
   */
  showLiveAverage: "after-vote" as "after-vote" | "always",
  poll: { votingMs: 1500, idleMs: 3000, adminMs: 1000 },
  limits: {
    votePerVoterPerMin: 6,
    votePerIpPerMin: 600,
    burstWindowS: 10,
    burstFlagAt: 25,
    loginFailures: 5,
    loginWindowMin: 15,
    kioskGapMs: 2000,
  },
  copy: {
    voteQueued: "Vote queued, waiting for connection",
    voteRecorded: "Vote recorded",
    waitingForAudience: "Waiting for audience...",
    perfectMatch: "Perfect match",
    votePaused: "Voting is paused",
    voteNotCounted: "Voting closed before your vote arrived, so it was not counted",
  },
  // Draft: organisers to confirm
  promptSeed: [
    "Explain Kubernetes to your grandmother",
    "Pitch a startup that solves a problem nobody has",
    "Do a product launch keynote for a stapler",
    "Debug a production outage, live, in song",
    "Roast your own GitHub profile",
    "Sell us a deprecated API",
    "Give a TED talk on tabs versus spaces",
    "Narrate a code review like a nature documentary",
  ] as string[],
};
