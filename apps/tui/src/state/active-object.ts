export type ActiveObject =
  | { readonly type: "node"; readonly id: string }
  | { readonly type: "artifact"; readonly id: string }
  | { readonly type: "approval"; readonly id: string }
  | { readonly type: "model_call"; readonly id: string }
  | { readonly type: "logs"; readonly id: "logs" }
  | { readonly type: "plan"; readonly id: "plan" };
