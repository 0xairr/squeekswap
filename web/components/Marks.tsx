// Small drawn marks used instead of emoji. Both inherit `currentColor`.

/** Hamster silhouette: round body, two ears, eye and cheek. Used as the art placeholder and the wheel mark. */
export function HamsterMark({ size = 24, title }: { size?: number; title?: string }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 32 32" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <circle cx="9" cy="9" r="4" fill="currentColor" />
      <circle cx="23" cy="9" r="4" fill="currentColor" />
      <ellipse cx="16" cy="19" rx="12" ry="10" fill="currentColor" />
      <circle cx="12" cy="17" r="1.6" fill="var(--sheet, #fff)" />
      <circle cx="20" cy="17" r="1.6" fill="var(--sheet, #fff)" />
      <ellipse cx="16" cy="21.5" rx="2" ry="1.3" fill="var(--sheet, #fff)" />
    </svg>
  )
}

/** Sunflower seed: the Seeds points mark. */
export function SeedMark({ size = 14, title }: { size?: number; title?: string }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 16 16" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <path d="M8 1c3 2.5 4.5 5.5 4 8.5S9.5 15 8 15s-3.5-2.5-4-5.5S5 3.5 8 1z" fill="currentColor" />
      <path d="M8 3.5v9" stroke="var(--sheet, #fff)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}
