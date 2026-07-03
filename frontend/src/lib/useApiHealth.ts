import { useQuery } from "@tanstack/react-query";
import { fetchHealth } from "./api";

export function useApiHealth() {
  return useQuery({
    queryKey: ["api-health"],
    queryFn: fetchHealth,
    refetchInterval: 30_000
  });
}
