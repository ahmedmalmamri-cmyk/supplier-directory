import type { SVGProps } from "react";
import {
  Apple, Banana, Bean, Boxes, Cake, CakeSlice, Candy, Carrot, ChefHat, Cherry,
  Citrus, Coffee, CookingPot, Cookie, Croissant, CupSoda, Dessert, Droplets,
  Egg, Flame, Flower2, GlassWater, Grape, IceCreamBowl, Leaf, Martini, Microwave,
  Milk, Nut, Package, PackageOpen, Pizza, Printer, Refrigerator, Ruler, Sandwich,
  Scale, Scissors, Settings, ShoppingBag, Snowflake, Soup, SprayCan, Sprout, Tag,
  Thermometer, Timer, Utensils, Wheat, WheatOff, Wine,
} from "lucide-react";

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

function FlourSackIcon(props: IconProps) {
  return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M14 7h20l-3 8 6 8 2 16c-8 3-22 3-30 0l2-16 6-8-3-8Z M17 15h14 M10 34c9 3 19 3 28 0" />
    <path d="M24 21v12m0-3-5-5m5 5 5-5" />
  </svg>;
}
function FlourScoopIcon(props: IconProps) {
  return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M4 30h29c0 7-6 11-14 11S4 37 4 30Z M24 30l16-17c2-2 5 1 3 3L30 30" />
    <path d="M10 27c2-5 5-6 8-6 2-4 5-6 8-5 4 1 5 5 5 11 M14 27l2-2m8 0 2 2" />
  </svg>;
}
function PitaBreadIcon(props: IconProps) {
  return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="24" cy="24" r="19" /><path d="M7 30c8 5 26 5 34 0M13 17l3 2m9-8 2 3m9 8 2 2M22 27l3-2m-10 1 2-1m14-5 2-1" />
  </svg>;
}
function BreadLoafIcon(props: IconProps) {
  return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M5 23c0-6 4-9 9-9 3-5 8-7 13-5 4 0 7 3 8 6 5 0 8 4 8 9v15H5V23Z M5 28h38M15 18v8m11-12v12m10-6v6" />
  </svg>;
}
function DoughBallIcon(props: IconProps) {
  return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M5 32c0-9 7-19 19-19s19 10 19 19c0 8-9 11-19 11S5 40 5 32Z M12 32c6 3 18 3 24 0M15 23l3-3m8-2 3 2m4 6 2 2" />
  </svg>;
}
function BreadSlicesIcon(props: IconProps) {
  return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M8 30V16c0-6 5-10 11-10s11 4 11 10v14c0 4-3 7-7 7h-8c-4 0-7-3-7-7Z M18 37v2c0 2 2 3 4 3h12c4 0 7-3 7-7V20c0-6-4-10-11-10M13 17v12m20-9v14" />
  </svg>;
}
function TeapotIcon(props: IconProps) {
  return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M10 19h29l-3 17c-2 7-21 7-23 0l-3-17Z M18 14h14m-11-4h8m-5-4v4 M39 22c7-1 7 9-1 11 M10 23 4 19l3 10 5 2 M14 37c7 3 16 3 21 0" />
  </svg>;
}

export const specialIcons = {
  "icon:flour-powder": FlourPowderIcon,
  "icon:round-bread": RoundBreadIcon,
  "icon:flour-sack": FlourSackIcon,
  "icon:flour-scoop": FlourScoopIcon,
  "icon:pita-bread": PitaBreadIcon,
  "icon:bread-loaf": BreadLoafIcon,
  "icon:dough-ball": DoughBallIcon,
  "icon:bread-slices": BreadSlicesIcon,
  "icon:wheat": Wheat, "icon:wheat-off": WheatOff, "icon:sprout": Sprout,
  "icon:bean": Bean, "icon:nut": Nut, "icon:egg": Egg, "icon:milk": Milk,
  "icon:droplets": Droplets, "icon:citrus": Citrus, "icon:apple": Apple,
  "icon:cherry": Cherry, "icon:grape": Grape, "icon:banana": Banana,
  "icon:carrot": Carrot, "icon:leaf": Leaf, "icon:flower": Flower2,
  "icon:croissant": Croissant, "icon:sandwich": Sandwich, "icon:pizza": Pizza,
  "icon:cookie": Cookie, "icon:cake-slice": CakeSlice, "icon:cake": Cake,
  "icon:dessert": Dessert, "icon:ice-cream": IceCreamBowl, "icon:candy": Candy,
  "icon:chef-hat": ChefHat, "icon:cooking-pot": CookingPot, "icon:soup": Soup,
  "icon:utensils": Utensils, "icon:coffee": Coffee, "icon:cup": CupSoda,
  "icon:glass-water": GlassWater, "icon:wine": Wine, "icon:martini": Martini,
  "icon:teapot": TeapotIcon, "icon:flame": Flame, "icon:snowflake": Snowflake,
  "icon:scale": Scale, "icon:timer": Timer, "icon:thermometer": Thermometer,
  "icon:refrigerator": Refrigerator, "icon:microwave": Microwave,
  "icon:package": Package, "icon:package-open": PackageOpen, "icon:boxes": Boxes,
  "icon:shopping-bag": ShoppingBag, "icon:tag": Tag, "icon:printer": Printer,
  "icon:scissors": Scissors, "icon:ruler": Ruler, "icon:spray-can": SprayCan,
  "icon:settings": Settings,
};

export function CategoryIconValue({ icon, className = "inline-block h-[1em] w-[1em] align-middle" }: { icon: string; className?: string }) {
  const Icon = specialIcons[icon as keyof typeof specialIcons];
  return Icon ? <Icon className={className} aria-hidden="true" /> : <>{icon}</>;
}

export function categoryIconText(icon: string): string {
  if (!icon.startsWith("icon:")) return icon;
  const fallback: Record<string, string> = {
    "icon:flour-powder": "🥣", "icon:flour-sack": "🌾", "icon:flour-scoop": "🥄",
    "icon:round-bread": "🫓", "icon:pita-bread": "🫓", "icon:bread-loaf": "🍞",
    "icon:dough-ball": "🥣", "icon:bread-slices": "🍞",
    "icon:wheat": "🌾", "icon:wheat-off": "🌾", "icon:sprout": "🌱",
    "icon:bean": "🫘", "icon:nut": "🌰", "icon:egg": "🥚", "icon:milk": "🥛",
    "icon:droplets": "💧", "icon:citrus": "🍋", "icon:apple": "🍎",
    "icon:cherry": "🍒", "icon:grape": "🍇", "icon:banana": "🍌",
    "icon:carrot": "🥕", "icon:leaf": "🌿", "icon:flower": "🌸",
    "icon:croissant": "🥐", "icon:sandwich": "🥪", "icon:pizza": "🍕",
    "icon:cookie": "🍪", "icon:cake-slice": "🍰", "icon:cake": "🎂",
    "icon:dessert": "🍮", "icon:ice-cream": "🍨", "icon:candy": "🍬",
    "icon:chef-hat": "👨‍🍳", "icon:cooking-pot": "🍲", "icon:soup": "🥣",
    "icon:utensils": "🍴", "icon:coffee": "☕", "icon:cup": "🥤",
    "icon:glass-water": "🥛", "icon:wine": "🍷", "icon:martini": "🍸",
    "icon:teapot": "🫖", "icon:flame": "🔥", "icon:snowflake": "❄️",
    "icon:scale": "⚖️", "icon:timer": "⏱️", "icon:thermometer": "🌡️",
    "icon:refrigerator": "🧊", "icon:microwave": "♨️",
    "icon:package": "📦", "icon:package-open": "📦", "icon:boxes": "📦",
    "icon:shopping-bag": "🛍️", "icon:tag": "🏷️", "icon:printer": "🖨️",
    "icon:scissors": "✂️", "icon:ruler": "📏", "icon:spray-can": "🧴",
    "icon:settings": "⚙️",
  };
  return fallback[icon] ?? "📦";
}