/** The hexagon mark of the logo (docs/assets/blueroot-logo.svg): an H3 cell, a mangrove, four anchored proofs. */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="22 10 176 200" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <polygon points="110,14 192,62 192,158 110,206 28,158 28,62" fill="#0B3C5D" />
      <polygon points="110,24 183,67 183,153 110,196 37,153 37,67" fill="none" stroke="#6EC6E8" strokeWidth="2" opacity="0.55" />
      <g fill="#3FB37F">
        <circle cx="110" cy="62" r="24" />
        <circle cx="86" cy="78" r="17" />
        <circle cx="134" cy="78" r="17" />
      </g>
      <circle cx="101" cy="55" r="9" fill="#5FCF9C" opacity="0.85" />
      <g fill="none" stroke="#C9E4DE" strokeLinecap="round">
        <path d="M110 90 L110 124" strokeWidth="7" />
        <path d="M110 118 C 96 126, 80 138, 72 162" strokeWidth="4.5" />
        <path d="M110 118 C 104 134, 98 146, 94 164" strokeWidth="4.5" />
        <path d="M110 118 C 116 134, 122 146, 126 164" strokeWidth="4.5" />
        <path d="M110 118 C 124 126, 140 138, 148 162" strokeWidth="4.5" />
      </g>
      <polyline points="72,162 94,164 126,164 148,162" fill="none" stroke="#F2C14E" strokeWidth="2.5" strokeLinejoin="round" />
      <g fill="#F2C14E" stroke="#0B3C5D" strokeWidth="2">
        <circle cx="72" cy="162" r="5" />
        <circle cx="94" cy="164" r="5" />
        <circle cx="126" cy="164" r="5" />
        <circle cx="148" cy="162" r="5" />
      </g>
      <path d="M62 174 q 12 -7 24 0 t 24 0 t 24 0 t 24 0" fill="none" stroke="#6EC6E8" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
