import { z } from "zod";

const healthSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  timestamp: z.string()
});

export type ApiHealth = z.infer<typeof healthSchema>;

const apiUrl = import.meta.env.VITE_API_URL ?? "";

export async function fetchHealth(): Promise<ApiHealth> {
  const response = await fetch(`${apiUrl}/api/health`, {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error("The API health check failed.");
  }

  return healthSchema.parse(await response.json());
}
