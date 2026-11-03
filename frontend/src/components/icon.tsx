import type { ReactNode } from "react";

type IconName =
  | "grid" | "layers" | "sparkles" | "graduation" | "network" | "folder" | "plug" | "activity" | "settings"
  | "search" | "plus" | "chevron-down" | "chevron-right" | "arrow-up-right" | "arrow-right" | "arrow-up"
  | "file" | "globe" | "video" | "sticky-note" | "clock" | "book" | "more" | "filter" | "sliders"
  | "calendar" | "check" | "zap" | "target" | "brain" | "database" | "message" | "send" | "paperclip"
  | "external" | "menu" | "x" | "bell" | "help" | "command" | "sparkle" | "upload" | "link"
  | "bookmark" | "refresh" | "lock" | "moon" | "sun" | "trash" | "play" | "plus-circle" | "braces" | "shield-check" | "minus" | "info" | "inbox" | "pin" | "file-text" | "archive" | "list" | "list-ordered" | "list-checks" | "grip" | "file-plus" | "key" | "monitor" | "wallet" | "eye" | "eye-off";

const paths: Record<IconName, ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,
  sparkles: <><path d="m12 3 1.4 5.1L18.5 10l-5.1 1.4L12 16.5l-1.4-5.1L5.5 10l5.1-1.9L12 3Z"/><path d="m19 14 .8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z"/><path d="m5 14 .7 1.8L7.5 16.5l-1.8.7L5 19l-.7-1.8-1.8-.7 1.8-.7L5 14Z"/></>,
  graduation: <><path d="m2 9 10-5 10 5-10 5L2 9Z"/><path d="M6 11v5c3.5 2.7 8.5 2.7 12 0v-5M22 9v6"/></>,
  network: <><circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="m10.8 7.2-4.5 8.5m7-8.5 4.5 8.5M7.5 18h9"/></>,
  folder: <><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H10l2 2h7.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11Z"/></>,
  plug: <><path d="M9 7V3m6 4V3M7 7h10v4a5 5 0 0 1-10 0V7Zm5 9v5"/></>,
  activity: <><path d="M3 12h4l3-8 4 16 3-8h4"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1a1.8 1.8 0 1 1-2.5 2.5l-.1-.1a1.8 1.8 0 0 0-3 .9v.2a1.8 1.8 0 1 1-3.6 0v-.2a1.8 1.8 0 0 0-3-.9l-.1.1a1.8 1.8 0 1 1-2.5-2.5l.1-.1a1.8 1.8 0 0 0-.9-3h-.2a1.8 1.8 0 1 1 0-3.6h.2a1.8 1.8 0 0 0 .9-3l-.1-.1a1.8 1.8 0 1 1 2.5-2.5l.1.1a1.8 1.8 0 0 0 3-.9v-.2a1.8 1.8 0 1 1 3.6 0v.2a1.8 1.8 0 0 0 3 .9l.1-.1a1.8 1.8 0 1 1 2.5 2.5l-.1.1a1.8 1.8 0 0 0 .9 3h.2a1.8 1.8 0 1 1 0 3.6h-.2a1.8 1.8 0 0 0-.9 3Z"/></>,
  search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  "chevron-down": <path d="m6 9 6 6 6-6"/>,
  "chevron-right": <path d="m9 18 6-6-6-6"/>,
  "arrow-up-right": <><path d="M7 17 17 7M7 7h10v10"/></>,
  "arrow-right": <><path d="M5 12h14m-6-6 6 6-6 6"/></>,
  "arrow-up": <><path d="M12 19V5m-6 6 6-6 6 6"/></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></>,
  globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>,
  video: <><rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3"/></>,
  "sticky-note": <><path d="M5 3h14a2 2 0 0 1 2 2v10l-6 6H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 21v-6h7M7 8h10M7 12h7"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5v-12Z"/><path d="M4 16a2 2 0 0 1 2-2h14M8 7h8"/></>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  filter: <><path d="M4 6h16M7 12h10m-7 6h4"/></>,
  sliders: <><path d="M4 7h8m4 0h4M4 17h4m4 0h8"/><circle cx="14" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  zap: <path d="m13 2-3 8h7l-6 12 2-9H6l7-11Z"/>,
  target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
  brain: <><path d="M12 18V5a3 3 0 0 0-5.8-1 3.5 3.5 0 0 0-2.1 6.5A3.5 3.5 0 0 0 7 17.8 3 3 0 0 0 12 18Zm0-13a3 3 0 0 1 5.8-1 3.5 3.5 0 0 1 2.1 6.5 3.5 3.5 0 0 1-2.9 7.3A3 3 0 0 1 12 18"/><path d="M8 8c2 0 2 2 4 2m4-2c-2 0-2 2-4 2m-5 3c2 0 2 2 5 2m5-2c-2 0-2 2-5 2"/></>,
  database: <><ellipse cx="12" cy="5" rx="8.5" ry="3"/><path d="M3.5 5v7c0 1.7 3.8 3 8.5 3s8.5-1.3 8.5-3V5M3.5 12v7c0 1.7 3.8 3 8.5 3s8.5-1.3 8.5-3v-7"/></>,
  message: <><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-2 2v-9.5A7.5 7.5 0 0 1 10.5 4H12a8 8 0 0 1 8 7.5Z"/><path d="M7 10h8M7 14h5"/></>,
  send: <><path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/></>,
  paperclip: <path d="m8 12.5 7.5-7.5a3.5 3.5 0 0 1 5 5L10 20.5a5 5 0 0 1-7-7L14 2.5"/>,
  external: <><path d="M14 3h7v7m0-7-9 9"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
  x: <><path d="m18 6-12 12M6 6l12 12"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.5 2.5 0 1 1 4.6 1.4c-1.2 1.1-2.2 1.5-2.2 3.1M12 17.5v.1"/></>,
  command: <><path d="M9 7V5a2 2 0 1 0-2 2h10a2 2 0 1 0-2-2v14a2 2 0 1 0 2-2H7a2 2 0 1 0 2 2V7Z"/></>,
  sparkle: <><path d="m12 3 1.4 5.6L19 10l-5.6 1.4L12 17l-1.4-5.6L5 10l5.6-1.4L12 3Z"/><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"/></>,
  upload: <><path d="M12 16V4m-5 5 5-5 5 5"/><path d="M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></>,
  link: <><path d="M10 13a5 5 0 0 0 7.1 0l3-3A5 5 0 0 0 13 2.9l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.1 0l-3 3A5 5 0 0 0 11 21.1l1.7-1.7"/></>,
  bookmark: <path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-4-6 4V4Z"/>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.5-3"/></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/></>,
  moon: <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
  trash: <><path d="M3 6h18M8 6V4h8v2m3 0-1 15H6L5 6m4 4v7m6-7v7"/></>,
  play: <path d="m8 5 11 7-11 7V5Z"/>,
  "plus-circle": <><circle cx="12" cy="12" r="9"/><path d="M12 8v8m-4-4h8"/></>,
  braces: <><path d="M8 4H6a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3a2 2 0 0 0 2 2h2M16 4h2a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2 2 2 0 0 0-2 2v3a2 2 0 0 1-2 2h-2M10 8l-2 4 2 4m4-8 2 4-2 4"/></>,
  "shield-check": <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></>,
  minus: <path d="M5 12h14"/>,
  inbox: <><path d="M4 4h16l2 11v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-4L4 4Z"/><path d="M2 15h6l2 3h4l2-3h6"/></>,
  pin: <><path d="m16 3 5 5-4 1-4 4-1 5-2-2-2-2 5-1 4-4 1-4Z"/><path d="m9 15-6 6"/></>,
  "file-text": <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></>,
  archive: <><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8m-7 4v5m-2-2 2 2 2-2"/></>,
  list: <><path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></>,
  "list-ordered": <><path d="M10 6h11M10 12h11M10 18h11"/><path d="M4 5h1v3m-1 4h2l-2 3h2m-2 3h2a1 1 0 0 1 0 2H4"/></>,
  "list-checks": <><path d="M9 6h12M9 12h12M9 18h12"/><path d="m3 6 1 1 2-2m-3 7 1 1 2-2m-3 7 1 1 2-2"/></>,
  grip: <><circle cx="8" cy="5" r="1"/><circle cx="16" cy="5" r="1"/><circle cx="8" cy="12" r="1"/><circle cx="16" cy="12" r="1"/><circle cx="8" cy="19" r="1"/><circle cx="16" cy="19" r="1"/></>,
  "file-plus": <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h7"/><path d="M14 2v6h6M8 13h5m-5 4h4"/><path d="M19 15v6m-3-3h6"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></>,
  key: <><circle cx="8" cy="15" r="4"/><path d="m11 12 9-9m-4 4 3 3m-6-1 3 3"/></>,
  monitor: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></>,
  wallet: <><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H20v16H6a3 3 0 0 1-3-3V7a.5.5 0 0 1 1-.5Z"/><path d="M3 8h17m-3 5h3"/><circle cx="16" cy="13" r=".5"/></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
  "eye-off": <><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.1 4.1M6.2 6.2C3.6 8 2 12 2 12s3.5 7 10 7a10 10 0 0 0 3.2-.5"/></>,
};

export function Icon({ name, size = 18, strokeWidth = 1.8, className = "" }: { name: IconName | string; size?: number; strokeWidth?: number; className?: string }) {
  const icon = paths[name as IconName] ?? <><circle cx="12" cy="12" r="8"/><path d="M12 8v8m-4-4h8"/></>;
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icon}</svg>;
}
