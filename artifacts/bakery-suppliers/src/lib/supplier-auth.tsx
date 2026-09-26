import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListRequestsQueryKey } from "@workspace/api-client-react";

export type SupplierUser = {
  id: number;
  name: string;
  city: string;
  phone: string;
  whatsapp: string;
  isVerified: boolean;
};

type SupplierAuthContextValue = {
  supplier: SupplierUser | null;
  isLoading: boolean;
  refresh: () => Promise<SupplierUser | null>;
  logout: () => Promise<void>;
};

const SupplierAuthContext = createContext<SupplierAuthContextValue | null>(null);

export function SupplierAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [supplier, setSupplier] = useState<SupplierUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const requestId = useRef(0);
  const currentSupplierId = useRef<number | null>(null);

  const refresh = async () => {
    const id = ++requestId.current;
    setIsLoading(true);
    try {
      const response = await fetch("/api/supplier/me", { credentials: "same-origin" });
      const result = response.ok ? await response.json() as { supplier?: SupplierUser } : null;
      const next = result?.supplier ?? null;
      if (id === requestId.current) {
        if (currentSupplierId.current !== next?.id) {
          queryClient.removeQueries({ queryKey: ["supplier"] });
          queryClient.removeQueries({ queryKey: getListRequestsQueryKey() });
        }
        currentSupplierId.current = next?.id ?? null;
        setSupplier(next);
      }
      return next;
    } catch {
      if (id === requestId.current) {
        currentSupplierId.current = null;
        queryClient.removeQueries({ queryKey: ["supplier"] });
        queryClient.removeQueries({ queryKey: getListRequestsQueryKey() });
        setSupplier(null);
      }
      return null;
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  };

  const logout = async () => {
    const response = await fetch("/api/supplier/logout", { method: "POST", credentials: "same-origin" });
    if (!response.ok) throw new Error("تعذر تسجيل الخروج. حاول مرة أخرى.");
    requestId.current++;
    currentSupplierId.current = null;
    queryClient.removeQueries({ queryKey: ["supplier"] });
    queryClient.removeQueries({ queryKey: getListRequestsQueryKey() });
    setSupplier(null);
    setIsLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  return <SupplierAuthContext.Provider value={{ supplier, isLoading, refresh, logout }}>{children}</SupplierAuthContext.Provider>;
}

export function useSupplierAuth() {
  const context = useContext(SupplierAuthContext);
  if (!context) throw new Error("useSupplierAuth must be used inside SupplierAuthProvider");
  return context;
}