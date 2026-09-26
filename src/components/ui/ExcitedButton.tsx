"use client";

import { Planet, Rocket, Sparkle } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useLoaderState } from "@/lib/loader-state";
import { Z } from "@/lib/z";
import { cn } from "@/lib/utils";

const ID_KEY = "devfest-visitor-id";
const LAUNCHED_KEY = "devfest-rocket-launched";

/* The launch, in seconds. Rumble on the pad, ignition, then the burn. */
const IGNITE = 0.5; // flame catches, sparks and shockwave fire, count ticks up
const LIFT = 0.55; // rocket leaves the pad
const FLIGHT = 1.6; // rocket has left the screen
const TOTAL = 2.7; // the contrail has faded; the flight layer unmounts
const AT_LIFT = LIFT / FLIGHT;
/** The burn: slow off the pad, fastest as it leaves the screen. */
const BURN = [0.6, 0, 0.85, 0.15] as const;

const BRAND = ["#4285F4", "#34A853", "#FBBC04", "#EA4335", "#F5F5F7"];

// Deterministic particle layouts, so nothing random is in render.
const SPARKS = Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * Math.PI * 2 + (i % 3) * 0.21;
  const d = 30 + ((i * 37) % 26);
  return { x: Math.cos(a) * d, y: Math.sin(a) * d + 10, size: 3 + (i % 3), color: BRAND[i % BRAND.length], delay: (i % 4) * 0.025 };
});
const SMOKE = Array.from({ length: 8 }, (_, i) => {
  const side = i % 2 ? 1 : -1;
  return { x: side * (12 + ((i * 11) % 30)), y: 8 + ((i * 5) % 9), delay: i < 3 ? 0.1 + i * 0.1 : IGNITE + (i - 3) * 0.03 };
});

type Flight = { dist: number; drift: number; angle: number; exitX: number; exitY: number; exitAt: number };

function visitorId() {
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}

type Tally = { count: number; launched: boolean };
function postLaunch(id: string): Promise<Tally> {
  return fetch("/api/excited", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  }).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
}

/**
 * "I'm excited": launch a rocket. One-way, one per browser, counted for
 * everyone (Neon via /api/excited, keyed on an anonymous visitor id kept in
 * localStorage). Once launched the pad shows a planet, and hovering or
 * focusing it (tapping, on touch) opens a little space scene with your
 * rocket in orbit.
 *
 * The launch is one Motion keyframe timeline per element, all sharing the
 * constants above so rumble, ignition, burn, contrail and exit sparkle stay in
 * sync. Under reduced motion there is no flight: the pad just becomes the
 * planet. Hand-written GSAP is off-limits here (CLAUDE.md), so it's Motion.
 *
 * Renders pre-launch with a count of 0 on the server and first client paint,
 * then corrects from localStorage and the server after mount, so the HTML and
 * first client render always match.
 */
export function ExcitedButton() {
  const reduce = useReducedMotion();
  const loaderDone = useLoaderState((s) => s.done);
  const [launched, setLaunched] = useState(false);
  const [count, setCount] = useState(0);
  const [flight, setFlight] = useState<Flight | null>(null);
  // The rocket itself is gone after FLIGHT; `flight` (the contrail and
  // sparks) lingers until TOTAL. The planet lands on the pad in between.
  const [airborne, setAirborne] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [tapOpen, setTapOpen] = useState(false);
  const [announce, setAnnounce] = useState("");
  const padRef = useRef<HTMLSpanElement>(null);
  const serverCount = useRef<number | null>(null);
  const ignited = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const id = visitorId();
    const local = localStorage.getItem(LAUNCHED_KEY) === "1";
    // localStorage only exists on the client, so this corrects the neutral
    // server render after mount (a returning visitor sees the planet at once
    // instead of waiting for the network).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (local) setLaunched(true);
    fetch(`/api/excited?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: Tally) => {
        setCount(d.count);
        if (d.launched) {
          setLaunched(true);
          localStorage.setItem(LAUNCHED_KEY, "1");
        } else if (local) {
          // Launched here but the server never heard (offline, a failed
          // request): send it again rather than un-launching.
          postLaunch(id).then((d2) => setCount(d2.count)).catch(() => {});
        }
      })
      .catch(() => {});
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const later = (fn: () => void, s: number) => timers.current.push(setTimeout(fn, s * 1000));

  const onClick = () => {
    if (launched) {
      // Already in orbit: no un-launching. Touch has no hover, so a tap shows the scene.
      if (!airborne) {
        setTapOpen(true);
        later(() => setTapOpen(false), 3.5);
      }
      return;
    }
    const id = visitorId();
    localStorage.setItem(LAUNCHED_KEY, "1");
    setLaunched(true);
    setAnnounce("Rocket launched. Thanks for the boost.");
    const target = count + 1;
    serverCount.current = null;
    postLaunch(id)
      .then((d) => {
        serverCount.current = d.count;
        if (ignited.current) setCount(d.count);
      })
      .catch(() => {});

    if (reduce) {
      setCount(target);
      return;
    }

    const pad = padRef.current?.getBoundingClientRect();
    const cy = pad ? pad.top + pad.height / 2 : window.innerHeight - 52;
    const dist = cy + 70; // clear of the top edge
    const drift = -Math.min(110, dist * 0.12); // lean away from the screen edge
    const edge = Math.max(0, cy - 34); // where it crosses the top of the viewport
    const p = Math.min(1, edge / dist);
    setFlight({
      dist,
      drift,
      angle: (Math.atan(drift / dist) * 180) / Math.PI,
      exitX: drift * p,
      exitY: -edge,
      exitAt: LIFT + (FLIGHT - LIFT) * p ** (1 / 2.6),
    });
    setAirborne(true);
    ignited.current = false;
    later(() => setAirborne(false), FLIGHT + 0.05);
    later(() => {
      ignited.current = true;
      setCount((c) => Math.max(c, target, serverCount.current ?? 0));
    }, IGNITE + 0.05);
    later(() => setFlight(null), TOTAL);
  };

  const onRocketPad = !launched || airborne;
  const showHint = !launched && (hovered || focused);
  const showOrbit = launched && !airborne && (hovered || focused || tapOpen);
  const formatted = count.toLocaleString("en-IN");
  const rockets = `${formatted} ${count === 1 ? "rocket" : "rockets"}`;

  return (
    <motion.div
      style={{ position: "fixed", bottom: 24, right: 24, zIndex: Z.nav }}
      initial={{ y: 16, opacity: 0 }}
      animate={loaderDone ? { y: 0, opacity: 1 } : { y: 16, opacity: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
      // Mouse only: on touch, pointerleave fires right after every tap, which
      // would close the orbit card the instant the tap opened it.
      onPointerLeave={(e) => e.pointerType === "mouse" && setTapOpen(false)}
    >
      <div className="relative">
        <AnimatePresence>
          {showHint && (
            <motion.p
              key="hint"
              aria-hidden="true"
              className="pointer-events-none absolute bottom-[calc(100%+12px)] right-0 whitespace-nowrap rounded-pill border border-hair bg-surface px-4 py-2 text-[13px] text-text shadow-[0_12px_40px_rgba(0,0,0,.5)]"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={reduce ? { duration: 0 } : { duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              Excited? Launch a rocket.
            </motion.p>
          )}
          {showOrbit && <OrbitCard key="orbit" rockets={rockets} reduce={!!reduce} />}
        </AnimatePresence>

        <motion.button
          type="button"
          onClick={onClick}
          onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          // Keyboard focus only (a mouse click focuses the button too, which
          // would pin the card open after the pointer has left).
          onFocus={(e) => setFocused(e.currentTarget.matches(":focus-visible"))}
          onBlur={() => setFocused(false)}
          aria-label={
            launched
              ? `Your rocket is in orbit. ${rockets} launched for DevFest Noida 2026.`
              : `I'm excited: launch a rocket for DevFest Noida 2026. ${formatted} launched so far.`
          }
          // Solid, not glass: the button floats over everything, including the
          // light sponsor panel, and must stay legible on all of it.
          className="relative flex h-14 cursor-pointer items-center gap-3 rounded-pill border border-hair bg-surface/90 pl-3 pr-5 text-text shadow-[0_16px_50px_rgba(0,0,0,.55)] outline-none transition-colors duration-300 hover:border-white/20 focus-visible:ring-2 focus-visible:ring-blue/70"
          initial={false}
          animate={flight ? { scale: [1, 1, 0.93, 1.05, 1] } : { scale: 1 }}
          transition={flight ? { duration: 0.9, times: [0, IGNITE / 0.9, (IGNITE + 0.06) / 0.9, (IGNITE + 0.2) / 0.9, 1] } : { duration: 0.2 }}
        >
          {/* Ignition glow around the pill. */}
          {flight && (
            <motion.span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-pill"
              style={{ boxShadow: "0 0 34px 6px rgba(66,133,244,.55), inset 0 0 14px rgba(138,180,248,.35)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.35, 1, 0] }}
              transition={{ duration: 1.3, times: [0, 0.3, 0.42, 1] }}
            />
          )}

          <span ref={padRef} className="relative grid size-9 shrink-0 place-items-center">
            {flight && <LaunchFx flight={flight} />}

            <AnimatePresence initial={false}>
              {onRocketPad ? (
                <motion.span
                  key="rocket"
                  aria-hidden="true"
                  className="absolute inset-0 z-10 grid place-items-center"
                  initial={false}
                  animate={
                    flight
                      ? {
                          x: [0, -1.5, 1.5, -1.5, 1.5, -1, 0, flight.drift],
                          y: [0, 0.5, -0.5, 0.5, -0.5, 1, 2, -flight.dist],
                          scale: [1, 1.04, 1, 1.04, 1, 0.94, 1.15, 1.75, 1.25],
                          rotate: [0, -2, 2, -2, 2, 0, flight.angle / 2, flight.angle],
                          opacity: [1, 1, 0],
                        }
                      : { x: 0, y: 0, scale: 1, rotate: hovered ? [0, -10, 8, -5, 3, 0] : 0, opacity: 1 }
                  }
                  exit={{ opacity: 0, transition: { duration: 0 } }}
                  transition={
                    flight
                      ? {
                          duration: FLIGHT,
                          times: [0, 0.06, 0.12, 0.18, 0.24, 0.3, AT_LIFT, 1],
                          ease: ["linear", "linear", "linear", "linear", "linear", "linear", BURN],
                          // Swells as it lifts (rushing past the camera), then recedes toward space.
                          scale: { duration: FLIGHT, times: [0, 0.06, 0.12, 0.18, 0.24, 0.3, AT_LIFT, 0.62, 1], ease: "easeOut" },
                          opacity: { duration: FLIGHT, times: [0, 0.92, 1], ease: "linear" },
                        }
                      : reduce
                        ? { duration: 0 }
                        : { duration: 0.7, ease: "easeInOut" }
                  }
                >
                  {/* Heat halo behind the rocket while it burns. */}
                  {flight && (
                    <motion.span
                      className="pointer-events-none absolute left-1/2 top-1/2 -ml-8 -mt-6 block size-16 rounded-full"
                      style={{ background: "radial-gradient(circle, rgba(255,224,130,.55) 0%, rgba(251,188,4,.25) 35%, rgba(234,67,53,0) 70%)" }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 0, 1, 1] }}
                      transition={{ duration: FLIGHT, times: [0, IGNITE / FLIGHT, AT_LIFT, 1] }}
                    />
                  )}
                  <Rocket size={30} weight={flight || hovered ? "fill" : "regular"} className={cn("relative", flight || hovered ? "text-text" : "text-muted")} />
                  <Flame flying={flight !== null} idle={hovered && !launched} reduce={!!reduce} />
                </motion.span>
              ) : (
                <motion.span
                  key="planet"
                  aria-hidden="true"
                  className="absolute inset-0 grid place-items-center text-blue-hi"
                  initial={{ opacity: 0, scale: 0.4, rotate: -40 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 18 }}
                >
                  <Planet size={30} weight="fill" />
                </motion.span>
              )}
            </AnimatePresence>
          </span>

          <span aria-hidden="true" className="relative inline-flex h-[1.25em] overflow-hidden text-[17px] font-semibold leading-[1.25] tabular-nums">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={count}
                className="block"
                initial={{ y: "100%", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "-100%", opacity: 0 }}
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 30 }}
              >
                {formatted}
              </motion.span>
            </AnimatePresence>
          </span>
        </motion.button>
      </div>
      <span role="status" className="sr-only">
        {announce}
      </span>
    </motion.div>
  );
}

/** Exhaust under the rocket: sputters in the rumble, roars in the burn, and a pilot flicker on hover. */
function Flame({ flying, idle, reduce }: { flying: boolean; idle: boolean; reduce: boolean }) {
  return (
    <motion.span
      className="pointer-events-none absolute left-1/2 top-[78%] -ml-[6px] block h-[22px] w-3 origin-top"
      initial={false}
      animate={
        flying
          ? { opacity: [0, 0, 0.8, 1, 1], scaleY: [0, 0.3, 0.5, 1.3, 2.4] }
          : { opacity: idle ? 0.9 : 0, scaleY: idle ? 0.45 : 0 }
      }
      transition={
        flying
          ? { duration: FLIGHT, times: [0, 0.1, IGNITE / FLIGHT, AT_LIFT, 1], ease: "easeOut" }
          : reduce
            ? { duration: 0 }
            : { duration: 0.25 }
      }
    >
      <motion.span
        className="block h-full w-full origin-top"
        style={{
          borderRadius: "50% 50% 50% 50% / 35% 35% 65% 65%",
          background: "radial-gradient(ellipse at 50% 18%, #fff 0%, #FFE082 22%, #FBBC04 42%, #EA4335 68%, rgba(234,67,53,0) 78%)",
        }}
        animate={{ scaleY: [1, 0.78, 1.12, 0.9, 1], scaleX: [1, 1.12, 0.9, 1.06, 1] }}
        transition={reduce ? { duration: 0 } : { duration: 0.22, repeat: Infinity, ease: "linear" }}
      />
    </motion.span>
  );
}

/** Everything that happens around the pad while the rocket leaves: contrail, shockwave, sparks, smoke, exit sparkle. */
function LaunchFx({ flight }: { flight: Flight }) {
  const at = (s: number) => s / TOTAL;
  return (
    <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 size-0">
      {/* The contrail: grows up behind the rocket on the same burn curve, in the site's spectrum, then dissipates. */}
      <span className="absolute bottom-0 left-0 w-0" style={{ height: flight.dist, transform: `rotate(${flight.angle}deg)`, transformOrigin: "bottom center" }}>
        <motion.span
          className="absolute bottom-0 block h-full origin-bottom"
          style={{ left: -14, width: 28 }}
          initial={{ scaleY: 0, scaleX: 1, opacity: 0 }}
          animate={{ scaleY: [0, 0, 1], scaleX: [1, 1, 2.4], opacity: [0, 0, 1, 1, 0] }}
          transition={{
            scaleY: { duration: FLIGHT, times: [0, AT_LIFT, 1], ease: ["linear", BURN] },
            scaleX: { duration: TOTAL, times: [0, at(FLIGHT), 1], ease: "easeOut" },
            opacity: { duration: TOTAL, times: [0, at(LIFT), at(LIFT + 0.1), at(FLIGHT), 1], ease: "linear" },
          }}
        >
          <span
            className="absolute inset-0 rounded-pill opacity-50"
            style={{ background: "linear-gradient(to top, rgba(66,133,244,0) 0%, #4285F4 30%, #34A853 55%, #FBBC04 80%, #EA4335 100%)" }}
          />
          <span
            className="absolute inset-y-0 left-1/2 -ml-[1.5px] w-[3px] rounded-pill"
            style={{ background: "linear-gradient(to top, rgba(255,255,255,0), rgba(255,255,255,.9))" }}
          />
        </motion.span>
      </span>

      {/* Shockwave at ignition. */}
      <motion.span
        className="absolute -left-4 -top-4 block size-8 rounded-full border-2 border-blue-hi"
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: [0.3, 3.2], opacity: [0.9, 0] }}
        transition={{ delay: IGNITE, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Smoke rolling off the pad: a few puffs in the rumble, the rest at ignition. */}
      {SMOKE.map((s, i) => (
        <motion.span
          key={`s${i}`}
          className="absolute -left-2 -top-2 block size-4 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(245,245,247,.4), rgba(245,245,247,0) 70%)" }}
          initial={{ opacity: 0, scale: 0.4, x: 0, y: 0 }}
          animate={{ opacity: [0, 0.8, 0], scale: [0.4, 2.6], x: s.x, y: s.y }}
          transition={{ delay: s.delay, duration: 1.3, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}

      {/* Sparks, in the brand's colours. */}
      {SPARKS.map((p, i) => (
        <motion.span
          key={`p${i}`}
          className="absolute block rounded-full"
          style={{ width: p.size, height: p.size, left: -p.size / 2, top: -p.size / 2, background: p.color, boxShadow: `0 0 6px ${p.color}` }}
          initial={{ opacity: 0, x: 0, y: 0, scale: 0.6 }}
          animate={{ opacity: [0, 1, 0], x: p.x, y: p.y, scale: [0.6, 1, 0.3] }}
          transition={{ delay: IGNITE + p.delay, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}

      {/* The sparkle where it leaves the screen: it made it to space. */}
      <motion.span
        className="absolute -left-3 -top-3 grid size-6 place-items-center text-yellow-hi"
        style={{ x: flight.exitX, y: flight.exitY }}
        initial={{ opacity: 0, scale: 0, rotate: 0 }}
        animate={{ opacity: [0, 1, 0], scale: [0, 1.5, 0], rotate: [0, 90] }}
        transition={{ delay: flight.exitAt, duration: 0.7, ease: "easeOut" }}
      >
        <Sparkle size={24} weight="fill" />
      </motion.span>
    </span>
  );
}

/* The orbit card's sky: fixed star positions (x%, y%, size px, twinkle delay s). */
const STARS = [
  [8, 14, 2, 0], [22, 70, 1.5, 0.6], [35, 24, 1, 1.1], [48, 82, 2, 0.3], [62, 12, 1.5, 0.9],
  [74, 64, 1, 0.2], [88, 22, 2, 1.3], [92, 78, 1.5, 0.5], [15, 42, 1, 1.6], [80, 44, 1, 0.8],
  [55, 50, 1, 1.9], [30, 90, 1, 0.4], [68, 88, 1, 1.2], [4, 86, 1.5, 0.7],
] as const;

/** An ellipse orbit, tilted, sampled into keyframes with the rocket turned along its heading. */
const ORBIT = (() => {
  const rx = 62, ry = 26, tilt = (-14 * Math.PI) / 180, n = 48;
  const xs: number[] = [], ys: number[] = [], rs: number[] = [];
  let prev = 0;
  for (let k = 0; k <= n; k++) {
    const t = (k / n) * Math.PI * 2;
    const x = rx * Math.cos(t), y = ry * Math.sin(t);
    xs.push(x * Math.cos(tilt) - y * Math.sin(tilt));
    ys.push(x * Math.sin(tilt) + y * Math.cos(tilt));
    const dx = -rx * Math.sin(t), dy = ry * Math.cos(t);
    const vx = dx * Math.cos(tilt) - dy * Math.sin(tilt), vy = dx * Math.sin(tilt) + dy * Math.cos(tilt);
    let deg = (Math.atan2(vy, vx) * 180) / Math.PI + 90; // the icon points up
    while (deg - prev > 180) deg -= 360;
    while (deg - prev < -180) deg += 360;
    rs.push((prev = deg));
  }
  return { xs, ys, rs, rx, ry, tilt: -14 };
})();

/** Shown once launched: the rocket is already out in space, circling a planet. */
function OrbitCard({ rockets, reduce }: { rockets: string; reduce: boolean }) {
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute bottom-[calc(100%+12px)] right-0 w-[252px] rounded-card border border-hair bg-surface p-3 shadow-[0_24px_70px_rgba(0,0,0,.6)]"
      initial={{ opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.96 }}
      style={{ transformOrigin: "bottom right" }}
      transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 26 }}
    >
      <div className="relative h-[124px] overflow-hidden rounded-[14px] bg-canvas">
        {STARS.map(([x, y, s, d], i) => (
          <motion.span
            key={i}
            className="absolute block rounded-full bg-white"
            style={{ left: `${x}%`, top: `${y}%`, width: s, height: s }}
            animate={{ opacity: [1, 0.25, 1] }}
            transition={reduce ? { duration: 0 } : { duration: 1.8 + (i % 3) * 0.5, delay: d, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}

        <div className="absolute left-1/2 top-1/2">
          {/* Orbit path, then the planet with its ring (back half, body, front half). */}
          <span
            className="absolute block rounded-full border border-dashed border-white/15"
            style={{ width: ORBIT.rx * 2, height: ORBIT.ry * 2, left: -ORBIT.rx, top: -ORBIT.ry, transform: `rotate(${ORBIT.tilt}deg)` }}
          />
          <span className="absolute -left-[34px] -top-[8px] block h-4 w-[68px] -rotate-[18deg] rounded-full border-[1.5px] border-blue-hi/50" />
          <span
            className="absolute -left-[21px] -top-[21px] block size-[42px] rounded-full"
            style={{
              background: "radial-gradient(circle at 34% 30%, #8AB4F8 0%, #4285F4 42%, #1B49B8 78%, #0f2d73 100%)",
              boxShadow: "0 0 24px rgba(66,133,244,.45)",
            }}
          />
          <span
            className="absolute -left-[34px] -top-[8px] block h-4 w-[68px] -rotate-[18deg] rounded-full border-[1.5px] border-blue-hi/70"
            style={{ clipPath: "inset(50% 0 0 0)" }}
          />

          <motion.span
            className="absolute -left-[7px] -top-[7px] grid size-[14px] place-items-center text-text"
            initial={{ x: ORBIT.xs[0], y: ORBIT.ys[0], rotate: ORBIT.rs[0] }}
            animate={{ x: ORBIT.xs, y: ORBIT.ys, rotate: ORBIT.rs }}
            transition={reduce ? { duration: 0 } : { duration: 6, repeat: Infinity, ease: "linear" }}
          >
            <Rocket size={14} weight="fill" />
          </motion.span>
        </div>
      </div>
      <p className="display mt-3 px-1 text-[15px] font-semibold">Already in orbit.</p>
      <p className="mt-1 px-1 pb-1 text-[13px] leading-snug text-muted">Your rocket is out in space. {rockets} launched so far.</p>
    </motion.div>
  );
}
