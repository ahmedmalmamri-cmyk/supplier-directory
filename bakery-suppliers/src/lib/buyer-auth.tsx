import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";


export type BuyerUser = {
  id: number;
  fullName: string;
  phone: string;
  email: string | null;
  city: string;
  businessType: string;
  businessName: string | null;
  otherBusinessType: string | null;
  isOwner: boolean;
  jobTitle: string | null;
  createdAt: string;
  lastLogin: string | null;
};

type BuyerAuthContextValue = {
  user: BuyerUser | null;
  isLoading: boolean;
  refresh: () => Promise<BuyerUser | null>;
  logout: () => Promise<void>;
};

const BuyerAuthContext = createContext<BuyerAuthContextValue | null>(null);

export function BuyerAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<BuyerUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const requestId = useRef(0);
  const currentBuyer = useRef<{ id: number; isOwner: boolean } | null>(null);

  const refresh = async () => {
    const id = ++requestId.current;
    setIsLoading(true);
    try {
      const response = await fetch("/api/buyer/me", { credentials: "same-origin" });
      if (!response.ok) {
        if (id === requestId.current) {
          if (currentBuyer.current) { queryClient.removeQueries({ queryKey: getListRequestsQueryKey() }); queryClient.removeQueries({ queryKey: getListBuyerItemInquiriesQueryKey() }); }
          currentBuyer.current = null;
          setUser(null);
        }
        return null;
      }
      const result = await response.json() as { user: BuyerUser };
      if (id === requestId.current) {
        if (currentBuyer.current?.id !== result.user.id || currentBuyer.current?.isOwner !== result.user.isOwner) {
          queryClient.removeQueries({ queryKey: getListRequestsQueryKey() });
          queryClient.removeQueries({ queryKey: getListBuyerItemInquiriesQueryKey() });
        }
        currentBuyer.current = { id: result.user.id, isOwner: result.user.isOwner };
        setUser(result.user);
      }
      return result.user;
    } catch {
      if (id === requestId.current) {
        if (currentBuyer.current) { queryClient.removeQueries({ queryKey: getListRequestsQueryKey() }); queryClient.removeQueries({ queryKey: getListBuyerItemInquiriesQueryKey() }); }
        currentBuyer.current = null;
        setUser(null);
      }
      return null;
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  };

  const logout = async () => {
    const response = await fetch("/api/buyer/logout", { method: "POST", credentials: "same-origin" });
    if (!response.ok) throw new Error("تعذر تسجيل الخروج. حاول مرة أخرى.");
    requestId.current++;
    currentBuyer.current = null;
    queryClient.removeQueries({ queryKey: getListRequestsQueryKey() });
    queryClient.removeQueries({ queryKey: getListBuyerItemInquiriesQueryKey() });
    setUser(null);
    setIsLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  const value = useMemo(() => ({ user, isLoading, refresh, logout }), [user, isLoading]);
  return <BuyerAuthContext.Provider value={value}>{children}</BuyerAuthContext.Provider>;
}

export function useBuyerAuth() {
  const context = useContext(BuyerAuthContext);
  if (!context) throw new Error("useBuyerAuth must be used inside BuyerAuthProvider");
  return context;
}
