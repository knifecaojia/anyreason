import { shouldRefetchTaskOnEvent } from "@/components/tasks/TaskProvider";

describe("shouldRefetchTaskOnEvent", () => {
  it("returns true for task-lifecycle events", () => {
    const yes = ["created", "running", "progress", "succeeded", "failed", "canceled", "retried"];
    for (const t of yes) {
      expect(shouldRefetchTaskOnEvent(t)).toBe(true);
    }
  });

  it("returns false for other events", () => {
    const no = ["log", "ping", "tool_start", "", "unknown"];
    for (const t of no) {
      expect(shouldRefetchTaskOnEvent(t)).toBe(false);
    }
  });
});

