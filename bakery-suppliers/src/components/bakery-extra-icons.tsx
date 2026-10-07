import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function BakerySvg({ children, ...props }: IconProps & { children: ReactNode }) {
  return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>{children}</svg>;
}

export function BaguetteIcon(props: IconProps) {
  return <BakerySvg {...props}><path d="M7 38C4 35 7 29 13 24L31 8c5-4 9-4 11-1s0 7-4 11L20 36C14 42 9 41 7 38Z M13 29l7 5m1-14 7 6m1-14 7 6" /></BakerySvg>;
}
export function SamoonIcon(props: IconProps) {
  return <BakerySvg {...props}><path d="M5 28c2-9 9-15 19-15s17 6 19 15c1 7-7 12-19 12S4 35 5 28Z M7 30c8 4 26 4 34 0M13 23l6 4m10-8 6 5" /></BakerySvg>;
}
export function BrownBreadIcon(props: IconProps) {
  return <BakerySvg {...props}><path d="M6 24c0-8 7-14 18-14s18 6 18 14v14H6V24Z M6 29h36M13 23l4 4m6-9 3 5m10 0-4 4M12 34h24" /><circle cx="19" cy="21" r="1" fill="currentColor" stroke="none" /><circle cx="31" cy="30" r="1" fill="currentColor" stroke="none" /></BakerySvg>;
}
export function PieIcon(props: IconProps) {
  return <BakerySvg {...props}><path d="M5 29h38l-4 11H9L5 29Z M7 28c1-12 9-20 17-20s16 8 17 20 M15 19l18 9m0-9-18 9M11 34h26" /></BakerySvg>;
}
export function CheesecakeIcon(props: IconProps) {
  return <BakerySvg {...props}><path d="M7 32 37 14l5 4v18c-10 4-24 5-35 0v-4Z M7 32c11 3 25 2 35-1M37 14v17M7 32l30-18M11 37v2m7-1v2" /><circle cx="31" cy="16" r="3" /></BakerySvg>;
}
export function DonutIcon(props: IconProps) {
  return <BakerySvg {...props}><circle cx="24" cy="24" r="19" /><circle cx="24" cy="24" r="6" /><path d="M7 19c4 1 5 4 8 3 3-2 3-6 6-6s4 4 7 3 3-4 6-4c3 0 4 3 7 4M12 32l2 2m19-3 2-2M18 11l2 2" /></BakerySvg>;
}
export function ChocolateIcon(props: IconProps) {
  return <BakerySvg {...props}><rect x="7" y="9" width="34" height="30" rx="3" /><path d="M18 9v30m11-30v30M7 19h34M7 29h34" /></BakerySvg>;
}
export function MaamoulIcon(props: IconProps) {
  return <BakerySvg {...props}><path d="M5 30c0-10 8-18 19-18s19 8 19 18c0 7-8 11-19 11S5 37 5 30Z M8 30c8 4 24 4 32 0M24 17v11m-12-6 12 6 12-6m-20-5 8 11 8-11" /></BakerySvg>;
}
export function KunafaIcon(props: IconProps) {
  return <BakerySvg {...props}><path d="M5 27h38l-4 12H9L5 27Z M9 27l5-12m0 12 5-15m1 15 4-14m2 14 4-15m2 15 5-12 M11 32c8 3 18 3 26 0" /><circle cx="24" cy="9" r="3" /></BakerySvg>;
}
export function JuiceIcon(props: IconProps) {
  return <BakerySvg {...props}><path d="M9 17h30l-4 25H13L9 17Z M12 24h24M28 17l5-12h7 M24 12a5 5 0 0 1 10 0" /><path d="M20 29c-2 3-2 6 1 8m9-8c2 3 2 6-1 8" /></BakerySvg>;
}
export function SodaIcon(props: IconProps) {
  return <BakerySvg {...props}><path d="M14 9h20l2 33H12l2-33Z M14 15h20m-20 21h20M19 9V5h10v4" /><circle cx="21" cy="23" r="2" /><circle cx="29" cy="28" r="2" /><circle cx="25" cy="35" r="1" /></BakerySvg>;
}
export function HotDrinkIcon(props: IconProps) {
  return <BakerySvg {...props}><path d="M7 19h28v14c0 6-5 9-14 9S7 39 7 33V19Z M35 22h4c6 0 5 10-4 10M11 36h20M15 5c-3 4 3 5 0 10m8-10c-3 4 3 5 0 10m8-10c-3 4 3 5 0 10" /></BakerySvg>;
}
export function CartonIcon(props: IconProps) {
  return <BakerySvg {...props}><path d="M5 14 24 5l19 9-19 9L5 14Z M5 14v23l19 7 19-7V14M24 23v21M14 9l19 9m-4 7 9-4" /></BakerySvg>;
}
export function PaperBagIcon(props: IconProps) {
  return <BakerySvg {...props}><path d="M8 14h32l-2 29H10L8 14Z M14 14V9c0-3 3-5 10-5s10 2 10 5v5M14 21c0 8 20 8 20 0M17 35h14" /></BakerySvg>;
}
export function PlasticBagIcon(props: IconProps) {
  return <BakerySvg {...props}><path d="M6 16h36l-4 26H10L6 16Z M6 16V6h9v10m18 0V6h9v10M15 7c0 9 18 9 18 0M10 33c9 3 19 3 28 0" /></BakerySvg>;
}
export function PlateIcon(props: IconProps) {
  return <BakerySvg {...props}><circle cx="24" cy="24" r="19" /><circle cx="24" cy="24" r="13" /><circle cx="24" cy="24" r="7" /></BakerySvg>;
}
export function SpoonIcon(props: IconProps) {
  return <BakerySvg {...props}><ellipse cx="24" cy="14" rx="9" ry="11" /><path d="M24 25v18m-4 0h8" /></BakerySvg>;
}
export function GlassJarIcon(props: IconProps) {
  return <BakerySvg {...props}><path d="M13 10h22v6l4 5v20H9V21l4-5v-6Z M11 10V5h26v5M9 23h30M14 35h20" /></BakerySvg>;
}
export function SugarIcon(props: IconProps) {
  return <BakerySvg {...props}><path d="M7 30h34l-4 11H11L7 30Z M11 30c2-5 6-7 10-7 1-4 4-7 7-7 5 0 8 6 9 14" /><path d="m11 16 3-4m0 4-3-4m23-3 3-4m0 4-3-4" /></BakerySvg>;
}
export function OilBottleIcon(props: IconProps) {
  return <BakerySvg {...props}><path d="M19 6h10v8l6 6v22H13V20l6-6V6Z M18 6V4h12v2M13 25h22M24 27c-5 5-5 10 0 10s5-5 0-10Z" /></BakerySvg>;
}
export function YeastIcon(props: IconProps) {
  return <BakerySvg {...props}><path d="M9 9h30l-3 33H12L9 9Z M9 16h30M17 27c1-3 3-4 5-3 2-4 6-4 8 0 3 0 5 3 5 5H15c0-1 1-2 2-2ZM17 35h14" /></BakerySvg>;
}
export function SaltIcon(props: IconProps) {
  return <BakerySvg {...props}><path d="M15 16h18l4 26H11l4-26Z M16 11h16v5H16z M20 6h8v5h-8 M14 31h20" /><circle cx="20" cy="21" r="1" /><circle cx="26" cy="24" r="1" /><circle cx="30" cy="20" r="1" /></BakerySvg>;
}