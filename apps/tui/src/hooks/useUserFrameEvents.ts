import { submitUserFrameEvent, type UserFrameEvent, type UserFrameEventResult } from "@open-lagrange/core/interface";

export function useUserFrameEvents(): {
  readonly submitEvent: (event: UserFrameEvent) => Promise<UserFrameEventResult>;
} {
  return {
    submitEvent: (event) => submitUserFrameEvent(event),
  };
}
