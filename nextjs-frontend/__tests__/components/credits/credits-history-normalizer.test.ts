import {
  detectCategory,
  detectTraceType,
  getOperationLabel,
  normalizeTransaction,
} from "@/components/credits/credits-history-normalizer";
import type { CreditTransactionRaw } from "@/components/credits/credits-history-types";

function makeRaw(overrides: Partial<CreditTransactionRaw> = {}): CreditTransactionRaw {
  return {
    id: "tx-1",
    user_id: "user-1",
    delta: -3,
    balance_after: 97,
    reason: "agent.consume",
    actor_user_id: null,
    meta: {},
    created_at: "2026-03-22T10:00:00Z",
    ...overrides,
  };
}

describe("credits-history-normalizer", () => {
  it("uses backend operation display when provided", () => {
    const tx = makeRaw({ operation_display: "智能体: Story Agent" });
    expect(getOperationLabel(tx)).toBe("智能体: Story Agent");
  });

  it("derives agent trace and label from meta when backend fields are missing", () => {
    const tx = makeRaw({ meta: { agent_name: "Story Agent", agent_id: "agent-1" } });
    expect(detectTraceType(tx)).toBe("agent");
    expect(getOperationLabel(tx)).toBe("智能体: Story Agent");
  });

  it("classifies refunded transactions as refund even when delta is positive", () => {
    const tx = makeRaw({
      delta: 3,
      reason: "agent.refund",
      is_refund: true,
      meta: { refunded: true },
    });
    expect(detectCategory(tx)).toBe("refund");
  });

  it("normalizes traceability and refund linkage into a history row", () => {
    const tx = makeRaw({
      id: "tx-refund",
      delta: 3,
      balance_after: 100,
      reason: "agent.refund",
      trace_type: "agent",
      is_refund: true,
      linked_event_id: "event-123",
      meta: {
        refunded: true,
        agent_name: "Refund Agent",
      },
      operation_display: "智能体: Refund Agent",
      model_display: "mock-model",
    });

    const row = normalizeTransaction(tx);
    expect(row.category).toBe("refund");
    expect(row.traceType).toBe("agent");
    expect(row.isRefund).toBe(true);
    expect(row.linkedEventId).toBe("event-123");
    expect(row.modelDisplay).toBe("mock-model");
    expect(row.operationLabel).toBe("智能体: Refund Agent");
    expect(row.signedDelta).toBe("+3");
  });
});
