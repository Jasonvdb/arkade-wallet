/** An ID card: the Pubky identity row in Settings. */
export default function PubkyIcon({ size = 20, strokeWidth = 1.8 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth={strokeWidth}
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
    >
      <rect x='2' y='5' width='20' height='14' rx='2' />
      <circle cx='9' cy='11' r='2' />
      <path d='M6.17 15a3 3 0 0 1 5.66 0' />
      <path d='M15 10h3M15 14h3' />
    </svg>
  )
}
