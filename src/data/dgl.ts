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
  /** The last N seconds turn the stage timer red. */
  criticalCountdownS: 3,
  /** The audience average stays hidden below this many votes. */
  minVotes: 5,
  /**
   * When the phone shows the average. "after-vote" hides it until the voter
   * has voted (or voting closed) so early votes do not anchor later ones;
   * "always" is the spec's literal reading.
   */
  showLiveAverage: "after-vote" as "after-vote" | "always",
  poll: { votingMs: 1500, idleMs: 3000, adminMs: 1000 },
  stage: {
    /** The projector hides the mouse pointer after this long without movement. */
    cursorIdleMs: 3000,
    /**
     * QR module colours: dark modules on a near-white plate (--color-canvas on
     * --color-paper). A projector greys out black, and some scanners do not
     * read light-on-dark codes, so the stage never inverts the code.
     */
    qr: { dark: "#050505", light: "#f4f4f2" },
  },
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

    // Audience page (/dgl)
    metaDescription: "Live audience voting for DevFest Got Latent at DevFest Noida 2026. Score each act from your phone.",
    lockupLabel: "DevFest Noida 2026",
    idleTitle: "DevFest Got Latent starts soon",
    idleBody: "Keep this page open. Voting opens here after each act.",
    upNext: "Up next",
    onStageNow: "On stage now",
    timeLeft: "Time left",
    performed: "Time. Voting opens in a moment.",
    votingTitle: "Score the act",
    lockIn: (n: number) => `Lock in ${n}`,
    pickScore: "Pick a score",
    earlierNotCounted: "Your earlier vote was not counted. Score again.",
    yourScore: "Your score",
    voteCount: (n: number) => (n === 1 ? "1 vote" : `${n} votes`),
    audienceAverage: "Audience average",
    outOfTen: (avg: string) => `${avg} / 10`,
    pausedBody: "Hang on, the host will reopen it.",
    votingClosed: "Voting closed",
    ownScore: "Own score",
    audience: "Audience",
    difference: (d: string) => `Difference ${d}`,
    notEnoughVotes: "Not enough votes for an audience score",
    completed: "Next act coming up",
    connection: { live: "Live", reconnecting: "Reconnecting", offline: "Offline" },

    // Stage display (/dgl/stage)
    stageTitle: "DevFest Got Latent stage",
    stageIdleBody: "Scan the code to score each act from your phone.",
    scanToVote: "Scan to vote",
    voteNow: "Vote now",
    stageTime: "Time",
    stageVotingOpen: "Voting open",
    stageYou: "You",
    outOf: "/ 10",
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
