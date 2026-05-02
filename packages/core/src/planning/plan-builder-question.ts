import { z } from "zod";

export const PlannerQuestion = z.object({
  question_id: z.string().min(1),
  severity: z.enum(["blocking", "clarifying", "optional"]),
  question: z.string().min(1),
  why_it_matters: z.string().min(1),
  default_assumption: z.string().min(1).optional(),
  choices: z.array(z.string().min(1)),
  affected_nodes: z.array(z.string().min(1)),
  answer: z.string().min(1).optional(),
  answered_at: z.string().datetime().optional(),
}).strict();

export type PlannerQuestion = z.infer<typeof PlannerQuestion>;

export function unansweredQuestions(questions: readonly PlannerQuestion[]): PlannerQuestion[] {
  return questions.filter((question) => !question.answer);
}
