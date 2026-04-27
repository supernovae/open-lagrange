import { createPlatformClientFromCurrentProfile } from "@open-lagrange/platform-client";
import type { UserFrameEvent, UserFrameEventResult } from "@open-lagrange/core/interface";

export function useUserFrameEvents(): {
  readonly submitEvent: (event: UserFrameEvent) => Promise<UserFrameEventResult>;
} {
  return {
    submitEvent: async (event) => (await (await createPlatformClientFromCurrentProfile()).submitUserFrameEvent(event)) as UserFrameEventResult,
  };
}
