// Keep the generated hooks, request functions, query keys and schemas together.
// This module is entirely local; it has no monorepo dependency.
export * from "./api/generated/api";
export * from "./api/generated/api.schemas";
export { setBaseUrl, setAuthTokenGetter } from "./api/custom-fetch";
export type { AuthTokenGetter } from "./api/custom-fetch";
export { useQueryClient } from "@tanstack/react-query";
