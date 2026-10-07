import {
  Cake, CakeSlice, Candy, Cherry, createLucideIcon, Croissant, FileText, FlaskConical, Leaf,
  Milk, Nut, Package, Palette, Sandwich, Settings, Star, Wheat,
  type LucideIcon,
} from "lucide-react";
import { getItemCategoryIcon } from "./item-category-icons";

// A flour sack, oil drop, and sugar cube: raw materials extend beyond grains.
const RawMaterials = createLucideIcon("RawMaterials", [
  ["path", { d: "M5 7 4 4h8l-1 3", key: "sack-top" }],
  ["path", { d: "M5 7h6l2 3v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10z", key: "sack" }],
  ["path", { d: "M6 12h4m-4 3h4", key: "flour" }],
  ["path", { d: "M18 2c-1.8 2.6-3.3 4.5-3.3 6.1a3.3 3.3 0 0 0 6.6 0C21.3 6.5 19.8 4.6 18 2Z", key: "oil" }],
  ["path", { d: "m18.5 13 3.5 2v4l-3.5 2-3.5-2v-4z", key: "sugar" }],
  ["path", { d: "m15 15 3.5 2 3.5-2m-3.5 2v4", key: "sugar-folds" }],
]);

const CleaningSupplies = createLucideIcon("CleaningSupplies", [
  ["path", { d: "M6 10h9v10a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z", key: "bottle" }],
  ["path", { d: "M9 10V7h4V5h5l2 2h-7", key: "sprayer" }],
  ["path", { d: "M9 15h3", key: "label" }],
  ["path", { d: "m19 10 .7 2.3L22 13l-2.3.7L19 16l-.7-2.3L16 13l2.3-.7z", key: "sparkle" }],
]);

export const groupIconChoices: { value: string; label: string; Icon: LucideIcon }[] = [
  { value: "icon:raw-materials", label: "مواد خام متنوعة", Icon: RawMaterials },
  { value: "icon:wheat", label: "قمح ومواد أساسية", Icon: Wheat },
  { value: "icon:milk", label: "حليب", Icon: Milk },
  { value: "icon:sandwich", label: "أجبان", Icon: Sandwich },
  { value: "icon:candy", label: "شوكولاتة", Icon: Candy },
  { value: "icon:nut", label: "مكسرات", Icon: Nut },
  { value: "icon:cake", label: "كيك", Icon: Cake },
  { value: "icon:flask", label: "خمائر ومحسنات", Icon: FlaskConical },
  { value: "icon:leaf", label: "نكهات", Icon: Leaf },
  { value: "icon:croissant", label: "مخبوزات", Icon: Croissant },
  { value: "icon:package", label: "تغليف", Icon: Package },
  { value: "icon:cleaning-supplies", label: "تنظيف وسلامة", Icon: CleaningSupplies },
  { value: "icon:settings", label: "معدات", Icon: Settings },
  { value: "icon:cherry", label: "حشوات", Icon: Cherry },
  { value: "icon:star", label: "متنوعات", Icon: Star },
  { value: "icon:cake-slice", label: "خلطات", Icon: CakeSlice },
  { value: "icon:palette", label: "تزيين", Icon: Palette },
  { value: "icon:file-text", label: "ورق وقواعد", Icon: FileText },
];

const iconsByValue = new Map(groupIconChoices.map(({ value, Icon }) => [value, Icon]));
const defaultGroupIcons: Record<string, string> = {
  "basic-materials": "icon:wheat",
  dairy: "icon:milk",
  cheese: "icon:sandwich",
  chocolate: "icon:candy",
  nuts: "icon:nut",
  "cake-supplies": "icon:cake",
  yeast: "icon:flask",
  flavors: "icon:leaf",
  dough: "icon:croissant",
  packaging: "icon:package",
  equipment: "icon:settings",
  mixes: "icon:cake-slice",
  fillings: "icon:cherry",
  decorations: "icon:palette",
  molds: "icon:cake",
  paper: "icon:file-text",
  "raw-misc": "icon:star",
};

type GroupIconData = { name: string; slug: string; icon: string; parentId: number | null };

export function groupIconValue(group: GroupIconData): string {
  // An explicitly chosen Lucide icon wins; legacy emoji get the canonical SVG
  // for known groups without changing their saved identity or other data.
  if (group.icon.startsWith("icon:")) return group.icon;
  if (group.parentId === null) {
    if (group.name === "المواد الخام الغذائية") return "icon:raw-materials";
    if (group.name === "مستلزمات النظافة والسلامة") return "icon:cleaning-supplies";
  }
  return defaultGroupIcons[group.slug] ?? group.icon;
}

export function getGroupIcon(group: GroupIconData) {
  const value = groupIconValue(group);
  return iconsByValue.get(value) ?? getItemCategoryIcon(value);
}