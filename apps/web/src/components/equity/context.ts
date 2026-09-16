import { createContext, useContext } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@capy/backend/convex/_generated/api";
export type CompanyView = FunctionReturnType<typeof api.equity.company>;
export const CompanyContext = createContext<CompanyView | null>(null);
export const useCompany = () => {
  const value = useContext(CompanyContext);
  if (!value) throw new Error("Company context missing");
  return value;
};
