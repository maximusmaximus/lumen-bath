import { createServerFn } from "@tanstack/react-start";
import { optionalAuthMiddleware } from "@/lib/auth/middleware";
import { parseSubmission } from "@/lib/community/feedback";

export const mintCaptcha = createServerFn({ method: "POST" }).handler(async () => {
  const { assertSameSiteRequest } = await import("@/lib/auth/isolation.server");
  assertSameSiteRequest();
  const { issueChallenge } = await import("@/lib/community/feedback.server");
  return issueChallenge();
});

export const submitFeedback = createServerFn({ method: "POST" })
  .middleware([optionalAuthMiddleware])
  .validator((input: unknown) => parseSubmission(input))
  .handler(async ({ data, context }) => {
    const { assertSameSiteRequest } = await import("@/lib/auth/isolation.server");
    assertSameSiteRequest();
    const { fileFeedback } = await import("@/lib/community/feedback.server");
    return fileFeedback(data, context.userId);
  });

export const listFeedback = createServerFn({ method: "GET" })
  .middleware([optionalAuthMiddleware])
  .handler(async ({ context }) => {
    const { assertSameSiteRequest } = await import("@/lib/auth/isolation.server");
    assertSameSiteRequest();
    const { listInbox } = await import("@/lib/community/feedback.server");
    return listInbox(context.userId);
  });
