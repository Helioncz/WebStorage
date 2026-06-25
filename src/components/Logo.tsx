// Logo Project Hangar: hangárový oblouk + </> (web/kód). Barva dle tématu (--accent).
export default function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="8" style={{ fill: "var(--accent)" }} />
      {/* hangárový oblouk */}
      <path
        d="M6 25 V16 a10 10 0 0 1 20 0 V25"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* </> uvnitř */}
      <path
        d="M13 14.5 L10.4 17.6 L13 20.7 M19 14.5 L21.6 17.6 L19 20.7 M17 12.8 L15 22"
        fill="none"
        stroke="#fff"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
