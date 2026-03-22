"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { creditsMy } from "@/components/actions/credits-actions";

interface CreditsContextValue {
  balance: number;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const CreditsContext = createContext<CreditsContextValue | null>(null);

interface CreditsProviderProps {
  children: React.ReactNode;
  initialBalance: number;
}

export function CreditsProvider({ children, initialBalance }: CreditsProviderProps) {
  const [balance, setBalance] = useState(initialBalance);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await creditsMy();
      if (response?.data?.balance !== undefined) {
        setBalance(response.data.balance);
      }
    } catch (error) {
      console.error("Failed to refresh credits balance:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <CreditsContext.Provider value={{ balance, isLoading, refresh }}>
      {children}
    </CreditsContext.Provider>
  );
}

export function useCredits(): CreditsContextValue {
  const context = useContext(CreditsContext);
  if (!context) {
    // Fallback for components outside the provider - should not happen in normal usage
    return {
      balance: 0,
      isLoading: false,
      refresh: async () => {},
    };
  }
  return context;
}
