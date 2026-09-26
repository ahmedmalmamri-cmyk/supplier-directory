import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type DashboardData = {
  supplier: { id: number; name: string; city: string };
  month: { views: number; contacts: number; rating: number | null; reviewsCount: number; totalReviews: number };
  position: Array<{ categoryName: string; rank: number; total: number }>;
  marketAverageRating: number | null;
  ratingPercentile: number | null;
  opportunities: Array<{ id: number | string; type: string; title: string; description: string; isRead: boolean }>;
  weekly: {
    views: number;
    viewsChangePercent: number | null;
    contacts: number;
    contactsChangePercent: number | null;
    newReviews: number;
  };
};

export type MarketData = {
  topDemand: Array<{ name: string; buyers: number }>;
  lowSupply: Array<{ name: string; supplierCount: number }>;
  underservedCities: string[];
  averageRating: number | null;
  supplierCount: number;
};

export class SupplierUnauthorizedError extends Error {}

async function supplierRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", ...init });
  if (response.status === 401) throw new SupplierUnauthorizedError("يرجى تسجيل الدخول لعرض بيانات المورد.");
  if (!response.ok) {
    let message = "تعذر تحميل البيانات. حاول مرة أخرى.";
    try {
      const body = await response.json() as { error?: string };
      if (body.error) message = body.error;
    } catch { /* Server may return a non-JSON error. */ }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function useSupplierDashboard() {
  return useQuery({ queryKey: ["supplier", "dashboard"], queryFn: () => supplierRequest<DashboardData>("/api/supplier/dashboard") });
}

export function useSupplierMarket() {
  return useQuery({ queryKey: ["supplier", "market"], queryFn: () => supplierRequest<MarketData>("/api/supplier/market") });
}

export function useReadOpportunity() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number) => supplierRequest<{ success: true }>(`/api/supplier/opportunities/${encodeURIComponent(id)}/read`, { method: "POST" }),
    onSuccess: (_, id) => {
      client.setQueryData<DashboardData>(["supplier", "dashboard"], (current) =>
        current ? { ...current, opportunities: current.opportunities.map((item) => String(item.id) === String(id) ? { ...item, isRead: true } : item) } : current
      );
    },
  });
}