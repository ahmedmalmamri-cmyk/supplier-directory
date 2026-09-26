import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export function FlourPowderIcon({ strokeWidth = 1.7, ...props }: IconProps) {
  return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M6 29h36l-4 11H10L6 29Z" />
    <path d="M11 29c1-4 4-6 8-6 2-5 5-8 9-8 5 0 8 5 9 14" />
    <path d="M19 29c2-3 5-4 8-4M31 24l2 2" />
    <circle cx="13" cy="18" r="1" fill="currentColor" stroke="none" />
    <circle cx="20" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="34" cy="11" r="1" fill="currentColor" stroke="none" />
    <circle cx="38" cy="18" r="1" fill="currentColor" stroke="none" />
  </svg>;
}

export function RoundBreadIcon({ strokeWidth = 1.7, ...props }: IconProps) {
  return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <ellipse cx="24" cy="26" rx="19" ry="14" />
    <path d="M6 29c5 5 31 5 36 0M13 20l5 4M23 16l5 5M33 21l3 3" />
    <path d="M15 32c5 2 13 2 18 0" />
  </svg>;
}

export const specialIcons = {
  "icon:flour-powder": FlourPowderIcon,
  "icon:round-bread": RoundBreadIcon,
};

export function CategoryIconValue({ icon, className = "inline-block h-[1em] w-[1em] align-middle" }: { icon: string; className?: string }) {
  const Icon = specialIcons[icon as keyof typeof specialIcons];
  return Icon ? <Icon className={className} aria-hidden="true" /> : <>{icon}</>;
}

export function categoryIconText(icon: string): string {
  return icon === "icon:flour-powder" ? "🥣" : icon === "icon:round-bread" ? "🫓" : icon;
}