import { useState } from "react";
import { ChevronDown, ChevronLeft } from "lucide-react";
import { Link } from "wouter";
import type { Group } from "@workspace/api-client-react";
import { categoryPath, groupPath, type TaxonomyCategory } from "@/components/categories/taxonomy";
import { getGroupIcon } from "@/lib/group-icons";

type HomeTaxonomyGroupsProps = {
  roots: Group[];
  groups: Group[];
  categories: TaxonomyCategory[];
};

const HIDDEN_ROOT_NAMES = new Set(["الخدمات والاستشارات"]);
const ALMOND_ITEM_NAMES = new Set(["لوز حب", "لوز شرائح", "لوز مطحون"]);
const DEFAULT_GROUP_LIMIT = 3;
const DEFAULT_CATEGORY_LIMIT = 4;

export function HomeTaxonomyGroups({ roots, groups, categories }: HomeTaxonomyGroupsProps) {
  const [expandedRoots, setExpandedRoots] = useState<number[]>([]);
  const visibleRoots = roots.filter((root) => !HIDDEN_ROOT_NAMES.has(root.name.trim()));

  return (
    <div className="mt-5 grid gap-4 md:grid-cols-2">
      {visibleRoots.map((root) => {
        const Icon = getGroupIcon(root);
        const subgroups = groups.filter((group) => group.parentId === root.id);
        const subgroupIds = new Set(subgroups.map((group) => group.id));
        const rootCategories = categories
          .filter((category) => (
            category.primaryGroupId === root.id
            || category.directGroupIds?.includes(root.id)
            || category.subGroupIds?.some((id) => subgroupIds.has(id))
            || (category.subGroupId !== null && subgroupIds.has(category.subGroupId))
          ))
          .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, "ar"));
        const browseCategories: Array<{ key: string; name: string; href: string }> = [];
        let almondTileAdded = false;
        for (const category of rootCategories) {
          if (ALMOND_ITEM_NAMES.has(category.name.trim())) {
            if (!almondTileAdded) {
              browseCategories.push({ key: "virtual-almond", name: "لوز", href: "/suppliers?category=لوز" });
              almondTileAdded = true;
            }
            continue;
          }
          browseCategories.push({
            key: `category-${category.id}`,
            name: category.name,
            href: categoryPath(category, categories, groups),
          });
        }
        const expanded = expandedRoots.includes(root.id);
        const visibleSubgroups = expanded ? subgroups : subgroups.slice(0, DEFAULT_GROUP_LIMIT);
        const visibleCategories = expanded ? browseCategories : browseCategories.slice(0, DEFAULT_CATEGORY_LIMIT);
        const hasMore = subgroups.length > DEFAULT_GROUP_LIMIT || browseCategories.length > DEFAULT_CATEGORY_LIMIT;

        return (
          <article
            key={root.id}
            className="overflow-hidden rounded-[1.35rem] border border-border/80 bg-card p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-warm sm:p-5"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                </span>
                <div className="min-w-0 pt-0.5">
                  <h3 className="text-base font-extrabold tracking-tight text-foreground">{root.name}</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {root.categoryCount.toLocaleString("ar-SA")} أصناف · {root.supplierCount.toLocaleString("ar-SA")} مورد
                  </p>
                </div>
              </div>
              <Link
                href={groupPath(root, groups)}
                aria-label={`تصفح ${root.name}`}
                className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>

            {visibleSubgroups.length > 0 && (
              <div className="mb-3">
                <p className="mb-2 text-[11px] font-bold text-muted-foreground">المجموعات الفرعية</p>
                <div className="grid grid-cols-2 gap-2">
                  {visibleSubgroups.map((subgroup) => (
                    <Link
                      key={subgroup.id}
                      href={groupPath(subgroup, groups)}
                      className="flex min-h-10 items-center justify-between gap-2 rounded-xl border border-border/80 bg-background px-3 py-2 text-right text-xs font-extrabold text-foreground transition hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="min-w-0 truncate">{subgroup.name}</span>
                      <ChevronLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {visibleCategories.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-bold text-muted-foreground">الأصناف</p>
                <div className="flex flex-wrap gap-2">
                  {visibleCategories.map((category) => (
                    <Link
                      key={category.key}
                      href={category.href}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-muted/30 px-3 py-1.5 text-xs font-bold text-foreground transition hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {category.name}
                      <ChevronLeft className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {hasMore && (
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpandedRoots((current) => (
                  expanded ? current.filter((id) => id !== root.id) : [...current, root.id]
                ))}
                className="mt-3 inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-extrabold text-primary transition hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {expanded ? "عرض أقل" : "عرض المزيد"}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
              </button>
            )}
          </article>
        );
      })}
    </div>
  );
}