import { describe, expect, it } from "vitest";
import { acceptPlanBuilderDefaults, answerPlanBuilderQuestion, readPlanBuilderSession, startPlanBuilderSession, validatePlanBuilderSession } from "./handlers";

describe("Plan Builder web handlers", () => {
  it("creates, reads, answers, and validates sessions", async () => {
    const created = await startPlanBuilderSession({ prompt: "Every morning, make me a cited brief on open source container security." }) as { session_id: string; pending_questions: { question_id: string }[] };

    expect(created.session_id).toMatch(/^builder_/);
    expect(readPlanBuilderSession(created.session_id)).toMatchObject({ session_id: created.session_id });

    const question = created.pending_questions[0];
    if (question) {
      const answered = answerPlanBuilderQuestion(created.session_id, { question_id: question.question_id, answer: "08:00" }) as { answered_questions: unknown[] };
      expect(answered.answered_questions).toHaveLength(1);
    }

    const defaults = await acceptPlanBuilderDefaults(created.session_id) as { session_id: string };
    expect(defaults.session_id).toBe(created.session_id);
    expect(validatePlanBuilderSession(created.session_id)).toMatchObject({ session_id: created.session_id });
  });
});
