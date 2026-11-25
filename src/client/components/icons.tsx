import type { ReactNode } from 'react';

const PATHS: Record<string, ReactNode> = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  chev: <path d="M9 5l7 7-7 7" />,
  back: <path d="M15 5l-7 7 7 7" />,
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  alert: (<><path d="M12 3l10 18H2L12 3z" /><path d="M12 10v5M12 18h.01" /></>),
  hour: <path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9" />,
  tray: <path d="M3 16h18M5 16a7 7 0 0114 0M12 9V7" />,
  arrow: (<><circle cx="12" cy="12" r="9" /><path d="M8 12h8M13 8l4 4-4 4" /></>),
  bell: (<><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 01-3.4 0" /></>),
  sun: (<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>),
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24, sw = 3 }: { name: IconName; size?: number; sw?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

/** The bow-seal brand mark. */
export function Seal({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#5C342F" />
      <path d="M12 12c-3-4-7-3-7 0s4 4 7 0zM12 12c3-4 7-3 7 0s-4 4-7 0z" fill="#FBE3EA" />
      <circle cx="12" cy="12" r="1.8" fill="#5C342F" />
    </svg>
  );
}

/** A white scored pill and a pale yellow pill, drawn so residents can recognise them instead of recalling names. */
export function Pills({ width, height }: { width: number; height: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 84 34" role="img"
      aria-label="One white round pill with a line across it and one pale yellow round pill">
      <circle cx="20" cy="17" r="14" fill="#FFFFFF" stroke="#5C342F" strokeWidth="2" />
      <path d="M9 17h22" stroke="#5C342F" strokeWidth="2" strokeLinecap="round" />
      <circle cx="62" cy="17" r="14" fill="#F2C879" stroke="#8A5300" strokeWidth="2" />
    </svg>
  );
}

export function OnePill({ index }: { index: number }) {
  return (
    <svg width="150" height="112" viewBox="0 0 84 64" role="img" aria-label="Illustration of the pill">
      {index === 0 ? (
        <>
          <circle cx="42" cy="32" r="26" fill="#FFFFFF" stroke="#5C342F" strokeWidth="2.5" />
          <path d="M24 32h36" stroke="#5C342F" strokeWidth="2.5" strokeLinecap="round" />
        </>
      ) : (
        <circle cx="42" cy="32" r="26" fill="#F2C879" stroke="#8A5300" strokeWidth="2.5" />
      )}
    </svg>
  );
}
