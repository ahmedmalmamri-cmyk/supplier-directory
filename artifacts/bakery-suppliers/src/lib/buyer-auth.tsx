import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type BuyerUser = {
  id: number;
  fullName: string;
  phone: string;
  email: string;
  city: string;
  businessType: string;
  businessName: string | null;
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
  const [user, setUser] = useState<BuyerUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/buyer/me", { credentials: "same-origin" });
      if (!response.ok) {
        setUser(null);
        return null;
      }
      const result = await response.json() as { user: BuyerUser };
      setUser(result.user);
      return result.user;
    } catch {
      setUser(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    await fetch("/api/buyer/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
    setUser(null);
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