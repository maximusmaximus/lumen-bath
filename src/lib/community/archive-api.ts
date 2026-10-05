import { createServerFn } from "@tanstack/react-start";
import { optionalAuthMiddleware } from "@/lib/auth/middleware";

/** Copy the signed-in listener's live setup and saved baths to the GitHub library. */
export const keepLibrary = createServerFn({ method: "POST" })
  .middleware([optionalAuthMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ context, data }) => {
    if (!context.userId) return { archived: false as const };
    const { keepListenerLibrary } = await import("@/lib/community/archive.server");
    return keepListenerLibrary(context.userId, data);
  });
