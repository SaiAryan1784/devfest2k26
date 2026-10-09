/**
 * DevFest Got Latent (DGL): live audience voting.
 *
 * Every number, limit and user-visible string for DGL lives here. Components
 * and routes never inline them.
 */
/** The three simultaneous rooms. Each has its own show, stage, QR code and votes. */
export const DGL_TRACKS = [
  { id: "build", label: "Build" },
  { id: "grow", label: "Grow" },
  { id: "think", label: "Think" },
] as const;
export type Track = (typeof DGL_TRACKS)[number]["id"];

export const DGL = {
  name: "DevFest Got Latent",
  /** Performance length, server time. */
  performanceMs: 90_000,
  /**
   * The server ends an act this long after performanceMs. The stage and phones learn that the act
   * started a second or three late (CDN cache plus poll), so they hold the clock at 90 until the
   * remaining time drops under it: the performer gets a full 90 s on screen and every screen
   * starts from 90.
   */
  startLeadMs: 3_000,
  /** The last N seconds of the timer are made visually obvious. */
  finalCountdownS: 10,
  /** The last N seconds turn the stage timer red. */
  criticalCountdownS: 3,
  /**
   * When the phone shows the average. "after-vote" hides it until the voter
   * has voted (or voting closed) so early votes do not anchor later ones;
   * "always" is the spec's literal reading.
   */
  showLiveAverage: "after-vote" as "after-vote" | "always",
  poll: { votingMs: 1500, idleMs: 3000, adminMs: 1000 },
  /**
   * The prompt wheel. A spin (READY only) stores the prompt and the server
   * time of the spin; every screen hides the prompt until spinMs later, in
   * server time, so the wheel and the reveal land together everywhere.
   */
  wheel: { spinMs: 4500, segments: 12 },
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
    /**
     * A whole hall can sit behind one venue or carrier address, so this is
     * high on purpose: the burst flag records the signal and the
     * (performance, voter) unique key is the real guard.
     */
    votePerIpPerMin: 5000,
    burstWindowS: 10,
    burstFlagAt: 25,
    loginFailures: 5,
    loginWindowMin: 15,
    /** Sign in attempts per IP per minute, per server instance (best effort, see loginLimiter). */
    loginPerIpPerMin: 10,
    kioskGapMs: 2000,
    /** An act's name (put on stage, fix the name): 1 to 80 characters once trimmed, no control characters. */
    nameMax: 80,
  },
  copy: {
    voteQueued: "Vote queued, waiting for connection",
    voteRecorded: "Vote recorded",
    waitingForAudience: "Waiting for audience...",
    perfectMatch: "Perfect match",
    votePaused: "Voting is paused",
    voteNotCounted: "Voting closed before your vote arrived, so it was not counted",
    voteCookiesBlocked: "Your browser is blocking cookies, so this vote cannot be sent. Allow cookies for this site and reload.",

    // Audience page (/dgl)
    metaDescription: "Live audience voting for DevFest Got Latent at DevFest Noida 2026. Score each act from your phone.",
    lockupLabel: "DevFest Noida 2026",
    idleTitle: "DevFest Got Latent starts soon",
    /** The phone's waiting screen: the header above it already says the show's name. */
    startsSoon: "Starts soon",
    idleBody: "Keep this page open. Voting opens here after each act.",
    upNext: "Up next",
    onStageNow: "On stage now",
    timeLeft: "Time left",
    /** After the whole-second clock: "90 sec", never "1:30". */
    secondsUnit: "sec",
    performed: "Time. Voting opens in a moment.",
    votingTitle: "Score the act",
    lockIn: (n: number) => `Lock in ${n}`,
    pickScore: "Pick a score",
    earlierNotCounted: "Your earlier vote was not counted. Score again.",
    yourScore: "Your score",
    voteCount: (n: number) => (n === 1 ? "1 vote" : `${n} votes`),
    audienceAverage: "Audience average",
    /** The card under a recorded vote: the live whole-number average and the count. */
    audienceSoFar: "Audience so far",
    outOfTen: (n: number) => `${n} / 10`,
    pausedBody: "Hang on, the host will reopen it.",
    votingClosed: "Voting closed",
    ownScore: "Own score",
    audience: "Audience",
    /** The reveal's line, and the tally line once voting closed, when nobody voted. */
    noVotes: "No votes",
    completed: "Next act coming up",
    connection: { connecting: "Connecting", live: "Live", reconnecting: "Reconnecting", offline: "Offline" },

    // Room picker, winner
    pickRoomTitle: "Pick your room",
    pickRoomBody: "Choose the track you are watching.",
    pickStageTitle: "Pick the stage",
    pickStageBody: "Choose the track this screen is for.",
    spinning: "Spinning the wheel...",
    winnerTitle: "Winner",
    winnersTitle: "Winners",
    winnerScore: (n: number) => `Audience ${n} / 10`,

    // Stage display (/dgl/<track>/stage)
    stageTitle: "DevFest Got Latent stage",
    stageIdleBody: "The QR code to vote appears when the act begins.",
    scanToVote: "Scan to vote",
    /** Alt text for the full DevFest Got Latent poster shown on the stage while waiting and between acts. */
    posterAlt: "DevFest Got Latent: a gold title on a stage with blue curtains",
    /** Alt text for the title strip along the top of every other stage screen. */
    bannerAlt: "DevFest Got Latent",
    /** Accessible name of the prompt wheel on the stage. */
    wheelLabel: "Prompt wheel",
    voteNow: "Vote now",
    stageTime: "Time",
    stageVotingOpen: "Voting open",
    stageYou: "You",
    outOf: "/ 10",

    // Volunteer backup voting kiosk (/dgl/kiosk)
    kiosk: {
      pageTitle: "DevFest Got Latent kiosk",
      heading: "Backup voting",
      checking: "Checking session",
      unreachable: "Cannot reach the server. Check this device's connection.",
      tryAgain: "Try again",
      wrongRole: "This role cannot record kiosk votes. Sign in with a volunteer or operator account.",
      scoreTitle: "Score to record",
      pickScore: "Pick a score",
      record: (n: number) => `Record vote ${n}`,
      sending: "Sending",
      loading: "Loading the show",
      notOpen: "Voting is not open.",
      pausedBody: "Wait for the host to reopen it.",
      outcome: {
        recorded: "Recorded. Hand over for the next vote.",
        /** The server already had this press with another score (an earlier try went through): its score stands. */
        recordedAs: (n: number) => `Recorded as ${n}, from the earlier press. Hand over for the next vote.`,
        confirmedScore: (n: number) => `Score on record: ${n}`,
        paused: "Voting is paused",
        closed: "Voting closed, this vote was not counted",
        rateLimited: "Too fast. Wait a moment.",
        notSent: "Not sent. Check this device's connection, then press again. It will not count twice.",
      },
    },

    // Admin console (/dgl/admin)
    admin: {
      pageTitle: "DevFest Got Latent admin",
      heading: "Show control",
      checking: "Checking session",
      unreachable: "Cannot reach the server. Retrying.",
      signIn: {
        title: "Sign in to run the show",
        body: "Use the name and passcode an organiser gave you.",
        name: "Name",
        passcode: "Passcode",
        submit: "Sign in",
        submitting: "Signing in",
        missing: "Enter your name and passcode.",
        invalid: "Name or passcode is not right.",
        locked: "Too many attempts. Try again in 15 minutes.",
        rateLimited: "Too many attempts. Try again in a minute.",
        failed: "Could not sign in. Check the connection and try again.",
      },
      sessionEnded: "Your session ended. Sign in again.",
      signOut: "Sign out",
      signOutFailed: "Could not sign out. Try again.",
      roles: { SUPER_ADMIN: "Super admin", HOST: "Host" },
      trackLabel: "Track",
      phases: {
        IDLE: "No act on stage",
        READY: "Ready",
        PERFORMING: "Performing",
        PERFORMED: "Time up",
        VOTING: "Voting open",
        VOTING_PAUSED: "Voting paused",
        VOTING_CLOSED: "Voting closed",
        REVEAL: "Revealed",
        COMPLETED: "Act complete",
      },
      stats: {
        contestant: "On stage",
        phase: "Phase",
        timeLeft: "Time left",
        votes: "Votes",
        rawAverage: "Raw average",
        noVotes: "No votes yet",
        flagged: "Flagged",
        excluded: "Excluded",
        kiosk: "Kiosk",
        nobody: "Nobody yet",
      },
      primary: {
        putOnStage: "Put on stage",
        startPerformance: "Start performance",
        startVoting: "Start voting",
        stopVoting: "Stop voting",
        resumeVoting: "Resume voting",
        reveal: "Reveal",
        complete: "Finish act",
      },
      secondaryTitle: "More controls",
      secondary: {
        pauseVoting: "Pause voting",
        resumeVoting: "Resume voting",
        stopVoting: "Stop voting",
        reopenVoting: "Reopen voting",
        spinWheel: "Spin the wheel",
        renameAct: "Fix the name",
        setSelfScore: "Save own score",
        showWinner: "Show winner",
        hideWinner: "Hide winner",
      },
      spinAgain: "Spin again",
      tapAgain: "Tap again to confirm",
      /** Under the big button for a moment after it changes, while taps are ignored. */
      updating: "Updating",
      confirmAnnounce: (label: string) => `${label}: tap again within 3 seconds to confirm.`,
      reason: {
        needsSelfScore: "Enter their own score first",
        noPrompts: "No active prompts to spin. Add some in setup.",
        noWinner: "No act has votes yet",
      },
      outcome: {
        stale: "Someone else just changed the show. Updated.",
        notAllowed: (phase: string) => `That cannot be done now. The show is at: ${phase}.`,
        no_winner: "No act has votes yet",
        needs_self_score: "Enter their own score first",
        forbidden: "Your role cannot do that.",
        invalid: "That was not accepted. Check it and try again.",
        network: "No answer from the server. Check the phase before trying again.",
      },
      stage: {
        nameLabel: "Who is on stage?",
        nameHint: "Type the name, then put them on stage.",
        namePlaceholder: "Name",
        nameMissing: "Type a name first.",
        nameMax: 80,
        renameLabel: "New name",
        renameSave: "Save name",
        promptNone: "No prompt. Spin the wheel for one.",
        promptTitle: "Prompt",
      },
      ownScore: {
        title: "Own score",
        hint: "The contestant's own prediction, 1 to 10. Hidden until the reveal.",
        saved: (n: number) => `Saved: ${n}`,
        none: "Not entered yet",
        save: (n: number) => `Save ${n}`,
        pick: "Pick a score",
      },
      acts: {
        title: "Acts so far",
        empty: "No acts yet.",
        leading: "Leading",
        noVotes: "No votes",
        votes: (n: number) => (n === 1 ? "1 vote" : `${n} votes`),
        shown: "The winner is on screen.",
      },
      /** The two-item switch at the top of the console (Setup for super admins and operators only). */
      views: { label: "Console view", live: "Live", setup: "Setup" },
      setup: {
        saved: "Saved.",
        /** The server's `invalid` on an admin change: the guards explain themselves through disabled controls. */
        notAllowed: "That change is not allowed.",
        save: "Save",
        cancel: "Cancel",
        edit: "Edit",
        active: "Active",
        inactive: "Inactive",
        activate: "Activate",
        deactivate: "Deactivate",
        prompts: {
          title: "Prompts",
          body: "The wheel picks from the active prompts, unused ones first.",
          empty: "No prompts yet.",
          text: "Prompt",
          add: "Add prompt",
          editLabel: "Edit prompt",
          textMissing: "Enter the prompt text.",
          maxLength: 200,
          added: "Prompt added.",
          seed: "Load the starter prompts",
          seedBody: (n: number) => (n === 1 ? "1 starter prompt is not in the list yet." : `${n} starter prompts are not in the list yet.`),
          seedDone: "All starter prompts are in the list.",
          seedProgress: (done: number, total: number) => `Adding ${done} of ${total}`,
          seedFinished: (n: number) => (n === 1 ? "Added 1 starter prompt." : `Added ${n} starter prompts.`),
          seedStopped: (done: number, total: number) => `Stopped after ${done} of ${total}. Nothing else was added.`,
        },
        admins: {
          title: "Admins",
          body: "Who can sign in to this console. A change of role or status applies on that person's next request.",
          you: "You",
          name: "Name",
          role: "Role",
          track: "Track",
          allTracks: "All tracks",
          passcode: "Passcode",
          newPasscode: "New passcode",
          newPasscodeHint: "Leave empty to keep the current passcode. At least 6 characters.",
          passcodeHint: "At least 6 characters. Share it with them in person.",
          passcodeShort: "The passcode needs at least 6 characters.",
          passcodeMin: 6,
          passcodeMax: 256,
          nameMissing: "Enter a name.",
          nameMax: 64,
          add: "Add admin",
          added: (name: string) => `Added ${name}.`,
          status: "Status",
          selfLocked: "You cannot change your own role or deactivate yourself.",
          lastSuperLocked: "This is the only active super admin, so its role and status are locked.",
          deactivateWarning: "Deactivating signs them out and stops them signing in until reactivated.",
          editLabel: (name: string) => `Edit ${name}`,
        },
        moderation: {
          title: "Moderation",
          body: "Votes from one connection arriving in a burst are flagged, which is normal on shared venue Wi-Fi. Excluding them removes real votes from the count and the average: use it only when you have evidence of abuse.",
          empty: "No votes yet.",
          votes: "Counted",
          flagged: "Flagged",
          excluded: "Excluded",
          exclude: "Exclude flagged votes",
          include: "Include flagged votes",
          noFlagged: "Nothing flagged",
          forAct: (name: string) => `for ${name}`,
        },
        audit: {
          title: "Audit log",
          body: "The last 50 changes, newest first.",
          empty: "Nothing yet.",
        },
        reset: {
          title: "Reset show",
          body: "Clears this track's rehearsal data: every act and every vote in the track. Prompts and admins are kept.",
          warning: "This cannot be undone. Do not use it once the real show has started.",
          label: "Type RESET to confirm",
          button: "Reset show",
          done: "Show reset. Ready for a fresh start.",
        },
      },
    },
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
