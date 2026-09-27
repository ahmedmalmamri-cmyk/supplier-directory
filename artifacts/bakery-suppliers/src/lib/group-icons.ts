import {
  Cake, CakeSlice, Candy, Cherry, Croissant, FileText, FlaskConical, Leaf,
  Milk, Nut, Package, Palette, Sandwich, Settings, Star, Wheat,
  type LucideIcon,
} from "lucide-react";
import { getItemCategoryIcon } from "./item-category-icons";

export const groupIconChoices: { value: string; label: string; Icon: LucideIcon }[] = [
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

type GroupIconData = { slug: string; icon: string; parentId: number | null };

export function groupIconValue(group: GroupIconData): string {
  // An explicitly chosen Lucide icon wins; legacy emoji get the canonical SVG
  // for known groups without changing their saved identity or other data.
  return group.icon.startsWith("icon:") ? group.icon : defaultGroupIcons[group.slug] ?? group.icon;
}

export function getGroupIcon(group: GroupIconData) {
  const value = groupIconValue(group);
  return iconsByValue.get(value) ?? getItemCategoryIcon(value);
}