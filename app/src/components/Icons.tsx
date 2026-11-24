// Set minimale di icone SVG inline (zero dipendenze, <2 KB gzipped)

import type { ReactNode } from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

function Svg({ size = 20, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export function IconTrackpad(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <line x1="3" y1="15.5" x2="21" y2="15.5" />
      <line x1="12" y1="15.5" x2="12" y2="20" />
    </Svg>
  );
}

export function IconRemote(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 6v2M12 16v2M6 12h2M16 12h2" />
    </Svg>
  );
}

export function IconKeyboard(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
      <path d="M6.5 9.5h1M10 9.5h1M13.5 9.5h1M17 9.5h.5M6.5 13h1M10 13h1M13.5 13h1M17 13h.5M8 16h8" />
    </Svg>
  );
}

export function IconMacro(p: IconProps) {
  return (
    <Svg {...p}>
      <polygon points="13 2 4 14 11.5 14 10.5 22 20 10 12.5 10 13 2" />
    </Svg>
  );
}

export function IconSettings(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </Svg>
  );
}

export function IconWifi(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </Svg>
  );
}

export function IconBluetooth(p: IconProps) {
  return (
    <Svg {...p}>
      <polyline points="6.5 6.5 17.5 17.5 12 22 12 2 17.5 6.5 6.5 17.5" />
    </Svg>
  );
}

export function IconBug(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="8" y="6" width="8" height="14" rx="4" />
      <path d="M19 13h-3M8 13H5M19 9l-3 1M8 10 5 9M19 17l-3-1M8 16l-3 1M9 6l-1-2M15 6l1-2" />
    </Svg>
  );
}

export function IconPower(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
      <line x1="12" y1="2" x2="12" y2="12" />
    </Svg>
  );
}

export function IconVolumeDown(p: IconProps) {
  return (
    <Svg {...p}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </Svg>
  );
}

export function IconVolumeUp(p: IconProps) {
  return (
    <Svg {...p}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </Svg>
  );
}

export function IconVolumeMute(p: IconProps) {
  return (
    <Svg {...p}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="22" y1="9" x2="16" y2="15" />
      <line x1="16" y1="9" x2="22" y2="15" />
    </Svg>
  );
}

export function IconPlayPause(p: IconProps) {
  return (
    <Svg {...p}>
      <polygon points="5 5 13 12 5 19 5 5" />
      <line x1="16" y1="5" x2="16" y2="19" />
      <line x1="20" y1="5" x2="20" y2="19" />
    </Svg>
  );
}

export function IconPrev(p: IconProps) {
  return (
    <Svg {...p}>
      <polygon points="19 20 9 12 19 4 19 20" />
      <line x1="5" y1="19" x2="5" y2="5" />
    </Svg>
  );
}

export function IconNext(p: IconProps) {
  return (
    <Svg {...p}>
      <polygon points="5 4 15 12 5 20 5 4" />
      <line x1="19" y1="5" x2="19" y2="19" />
    </Svg>
  );
}

export function IconStop(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </Svg>
  );
}

export function IconSun(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </Svg>
  );
}

export function IconSend(p: IconProps) {
  return (
    <Svg {...p}>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </Svg>
  );
}

export function IconReturn(p: IconProps) {
  return (
    <Svg {...p}>
      <polyline points="9 10 4 15 9 20" />
      <path d="M20 4v7a4 4 0 0 1-4 4H4" />
    </Svg>
  );
}

export function IconBackspace(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
      <line x1="18" y1="9" x2="12" y2="15" />
      <line x1="12" y1="9" x2="18" y2="15" />
    </Svg>
  );
}

export function IconChevron(p: IconProps & { dir: 'up' | 'down' | 'left' | 'right' }) {
  const pts =
    p.dir === 'up'
      ? '18 15 12 9 6 15'
      : p.dir === 'down'
        ? '6 9 12 15 18 9'
        : p.dir === 'left'
          ? '15 18 9 12 15 6'
          : '9 18 15 12 9 6';
  return (
    <Svg {...p}>
      <polyline points={pts} />
    </Svg>
  );
}

export function IconPlus(p: IconProps) {
  return (
    <Svg {...p}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </Svg>
  );
}

export function IconClose(p: IconProps) {
  return (
    <Svg {...p}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </Svg>
  );
}

export function IconEdit(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </Svg>
  );
}

export function IconTrash(p: IconProps) {
  return (
    <Svg {...p}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </Svg>
  );
}
