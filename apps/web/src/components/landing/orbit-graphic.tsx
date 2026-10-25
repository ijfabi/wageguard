/** One orbiting chip: a priced shift from golden scenario G009. */
const CHIPS = [
  { label: "Mon", amount: "$260.70", radius: 118, duration: 38, start: 20 },
  { label: "Sat", amount: "$333.76", radius: 168, duration: 54, start: 150 },
  { label: "Sun", amount: "$267.69", radius: 218, duration: 72, start: 265 },
] as const;

/** Deterministic star field (no randomness, so server and client render the same). */
const STARS = Array.from({ length: 46 }, (_, i) => ({
  x: (i * 73) % 100,
  y: (i * 37 + 11) % 100,
  size: 1 + ((i * 7) % 3) * 0.6,
  delay: (i % 9) * 0.45,
}));

/**
 * Decorative hero graphic: a shield at the centre of a small "pay system", with the three priced
 * shifts from the golden scenario orbiting it. Purely visual (aria-hidden); every animation is CSS
 * and stops under reduced motion.
 */
export function OrbitGraphic() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[480px]" aria-hidden>
      {STARS.map((star, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: star.size,
            height: star.size,
            animation: `wg-twinkle ${3 + (i % 4)}s ease-in-out ${star.delay}s infinite`,
          }}
        />
      ))}

      <svg viewBox="-240 -240 480 480" className="absolute inset-0 size-full">
        <defs>
          <radialGradient id="wg-core" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#a5b4fc" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#6366f1" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#312e81" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="wg-shield" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#e0e7ff" />
            <stop offset="100%" stopColor="#67e8f9" />
          </linearGradient>
        </defs>
        <circle r="96" fill="url(#wg-core)" />
        {CHIPS.map((chip) => (
          <circle
            key={chip.label}
            r={chip.radius}
            fill="none"
            stroke="rgba(199,210,254,0.18)"
            strokeDasharray="2 7"
          />
        ))}
        {/* Shield with a tick-free mark: WageGuard never shows a green "pass". */}
        <g transform="translate(0 -6)">
          <path
            d="M0 -58 L46 -40 V-2 C46 30 26 50 0 62 C-26 50 -46 30 -46 -2 V-40 Z"
            fill="rgba(15,23,42,0.55)"
            stroke="url(#wg-shield)"
            strokeWidth="3"
          />
          <text
            x="0"
            y="12"
            textAnchor="middle"
            fill="#e0e7ff"
            fontSize="34"
            fontWeight="700"
            fontFamily="ui-sans-serif, system-ui"
          >
            $
          </text>
        </g>
      </svg>

      {/* Chips are positioned with percentages so the graphic scales with its container. */}
      {CHIPS.map((chip) => (
        <div
          key={`${chip.label}-arm`}
          className="absolute inset-0"
          style={{ transform: `rotate(${chip.start}deg)` }}
        >
          <div
            className="absolute inset-0"
            style={{ animation: `wg-orbit ${chip.duration}s linear infinite` }}
          >
            <div
              className="absolute top-1/2"
              style={{ left: `${50 + (chip.radius / 480) * 100}%`, transform: "translate(-50%, -50%)" }}
            >
              <div style={{ transform: `rotate(${-chip.start}deg)` }}>
                <div
                  style={{ animation: `wg-counter-orbit ${chip.duration}s linear infinite` }}
                  className="rounded-xl border border-white/15 bg-slate-950/70 px-3 py-1.5 text-center shadow-lg shadow-indigo-500/20 backdrop-blur"
                >
                  <div className="text-[10px] font-medium tracking-widest text-indigo-200 uppercase">
                    {chip.label}
                  </div>
                  <div className="text-sm font-semibold text-white tabular-nums">{chip.amount}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
