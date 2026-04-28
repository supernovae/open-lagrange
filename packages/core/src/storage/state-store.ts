import { inMemoryApprovalStore, type ApprovalStore } from "../approval/approval-store.js";
import { inMemoryPlanStateStore, type PlanStateStore } from "../planning/plan-state.js";
import { inMemoryStatusStore, type StatusStore } from "../status/status-store.js";
import { createSqliteStateStore } from "./sqlite-state-store.js";

export type OpenLagrangeStateStore = StatusStore & ApprovalStore & PlanStateStore;

let defaultStore: OpenLagrangeStateStore | undefined;

export function getStateStore(): OpenLagrangeStateStore {
  if (defaultStore) return defaultStore;
  const dialect = process.env.OPEN_LAGRANGE_DB_DIALECT ?? "sqlite";
  if (dialect === "memory") {
    defaultStore = { ...inMemoryStatusStore, ...inMemoryApprovalStore, ...inMemoryPlanStateStore };
    return defaultStore;
  }
  if (dialect !== "sqlite") {
    throw new Error(`Unsupported Open Lagrange state store dialect: ${dialect}`);
  }
  defaultStore = createSqliteStateStore({
    path: process.env.OPEN_LAGRANGE_SQLITE_PATH ?? "./runs/open-lagrange.sqlite",
  });
  return defaultStore;
}

export function setStateStoreForTests(store: OpenLagrangeStateStore | undefined): void {
  defaultStore = store;
}
