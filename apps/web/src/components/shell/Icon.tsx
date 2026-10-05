import type { SVGProps, ReactNode } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { title?: string };

function Base({ title, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const IconMenu = (p: IconProps) => (
  <Base {...p}><path d="M3 5h14M3 10h14M3 15h14" /></Base>
);
export const IconClose = (p: IconProps) => (
  <Base {...p}><path d="M5 5l10 10M15 5L5 15" /></Base>
);
export const IconChevronDown = (p: IconProps) => (
  <Base {...p}><path d="M5 8l5 5 5-5" /></Base>
);
export const IconChevronRight = (p: IconProps) => (
  <Base {...p}><path d="M8 5l5 5-5 5" /></Base>
);
export const IconChevronLeft = (p: IconProps) => (
  <Base {...p}><path d="M12 5l-5 5 5 5" /></Base>
);
export const IconSortAsc = (p: IconProps) => (
  <Base {...p}><path d="M10 15V5M6 9l4-4 4 4" /></Base>
);
export const IconSortDesc = (p: IconProps) => (
  <Base {...p}><path d="M10 5v10M6 11l4 4 4-4" /></Base>
);
export const IconLock = (p: IconProps) => (
  <Base {...p}><rect x="4.5" y="8.5" width="11" height="8" rx="1.5" /><path d="M7 8.5V6a3 3 0 016 0v2.5" /></Base>
);
export const IconCheck = (p: IconProps) => (
  <Base {...p}><path d="M4 10.5l4 4 8-9" /></Base>
);
export const IconClock = (p: IconProps) => (
  <Base {...p}><circle cx="10" cy="10" r="7" /><path d="M10 6v4.2l2.6 1.8" /></Base>
);
export const IconAlert = (p: IconProps) => (
  <Base {...p}><path d="M10 3.5l7 12.5H3z" /><path d="M10 8v3.2M10 13.6v.1" /></Base>
);
export const IconArrowBack = (p: IconProps) => (
  <Base {...p}><path d="M16 10H4M9 5l-5 5 5 5" /></Base>
);
export const IconDots = (p: IconProps) => (
  <Base {...p} strokeWidth="2"><path d="M5 10h.01M10 10h.01M15 10h.01" /></Base>
);
export const IconDoc = (p: IconProps) => (
  <Base {...p}><path d="M6 3h5l3 3v11H6z" /><path d="M11 3v3h3" /></Base>
);
export const IconUpload = (p: IconProps) => (
  <Base {...p}><path d="M10 14V5M6.5 8.5L10 5l3.5 3.5" /><path d="M4 14v2h12v-2" /></Base>
);
export const IconUser = (p: IconProps) => (
  <Base {...p}><circle cx="10" cy="7" r="3" /><path d="M4 17c0-3.3 2.7-5 6-5s6 1.7 6 5" /></Base>
);
export const IconLogout = (p: IconProps) => (
  <Base {...p}><path d="M8 5H4v10h4" /><path d="M12 13l3-3-3-3M15 10H8" /></Base>
);
export const IconSearch = (p: IconProps) => (
  <Base {...p}><circle cx="9" cy="9" r="5" /><path d="M13 13l3.5 3.5" /></Base>
);
export const IconPlus = (p: IconProps) => (
  <Base {...p}><path d="M10 4v12M4 10h12" /></Base>
);
export const IconDownload = (p: IconProps) => (
  <Base {...p}><path d="M10 4v9M6.5 9.5L10 13l3.5-3.5" /><path d="M4 15v1h12v-1" /></Base>
);
export const IconFilter = (p: IconProps) => (
  <Base {...p}><path d="M3 5h14l-5.5 6.2V16l-3 1.5v-6.3z" /></Base>
);
export const IconTrash = (p: IconProps) => (
  <Base {...p}><path d="M4 6h12M8 6V4h4v2M6 6l.8 10h6.4L14 6" /></Base>
);
export const IconEdit = (p: IconProps) => (
  <Base {...p}><path d="M13.5 3.5l3 3L8 15H5v-3z" /></Base>
);
export const IconSend = (p: IconProps) => (
  <Base {...p}><path d="M17 3L9 11M17 3l-5.5 14-2.5-6L3 8.5z" /></Base>
);
export const IconUndo = (p: IconProps) => (
  <Base {...p}><path d="M7 7L3.5 10.5 7 14" /><path d="M3.5 10.5H12a4.5 4.5 0 010 9h-1" /></Base>
);
export const IconShield = (p: IconProps) => (
  <Base {...p}><path d="M10 3l6 2.2v4.3c0 3.6-2.4 6.6-6 7.5-3.6-.9-6-3.9-6-7.5V5.2z" /></Base>
);
export const IconBuilding = (p: IconProps) => (
  <Base {...p}><path d="M4 17V6l6-3 6 3v11" /><path d="M8 17v-4h4v4" /><path d="M7.5 9h1M11.5 9h1" /></Base>
);
export const IconList = (p: IconProps) => (
  <Base {...p}><path d="M7 5h10M7 10h10M7 15h10M3.5 5h.01M3.5 10h.01M3.5 15h.01" /></Base>
);
