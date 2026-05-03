"use client";

import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";
import { UIProvider } from "@/components/ui/UIProvider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <UIProvider>{children}</UIProvider>
    </SessionProvider>
  );
}
