interface WebTerminalLogoProps {
  size?: 'sm' | 'md'
}

export function WebTerminalLogo({ size = 'md' }: WebTerminalLogoProps = {}) {
  const sizeClass = size === 'sm' ? 'h-8' : 'h-12'

  return (
    <svg
      className={`w-auto ${sizeClass}`}
      viewBox="0 0 320 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Terminal box */}
      <rect
        x="4"
        y="8"
        width="48"
        height="48"
        rx="2"
        className="stroke-primary"
        strokeWidth="1.5"
      />

      {/* Greater than symbol with 90 degree angles */}
      <polyline
        points="16,24 28,32 16,40"
        className="stroke-primary"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="miter"
        fill="none"
      />

      {/* Underscore */}
      <line
        x1="32"
        y1="40"
        x2="40"
        y2="40"
        className="stroke-primary"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* PuTTrY text */}
      <text
        x="68"
        y="41"
        fontFamily="monospace"
        fontSize="28"
        fontWeight="600"
        className="fill-primary"
      >
        PuTTrY
      </text>
    </svg>
  )
}
