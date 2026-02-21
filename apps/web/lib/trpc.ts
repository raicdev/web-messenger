import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@workspace/api/router";

export const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/trpc`,
    }),
  ],
});
