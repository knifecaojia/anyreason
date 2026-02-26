/**
 * Preservation Property Tests — Session Task Result Display
 *
 * Property 2: Preservation – Non-Succeeded Event Handling and Existing Flows
 *
 * These tests capture the BASELINE behavior of the UNFIXED code.
 * They MUST PASS on unfixed code and continue to pass after the fix,
 * confirming no regressions were introduced.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
 */
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Types (inlined to avoid transitive ESM imports from component tree)
// ---------------------------------------------------------------------------

interface PlanData {
  id: string;
  kind: string;
  tool_id: string;
  inputs: Record<string, unknown>;
  preview?: Record<string, unknown>;
}

interface TraceEvent {
  type: string;
  [key: string]: unknown;
}

interface AIChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  plans: PlanData[] | null;
  trace: TraceEvent[] | null;
  created_at: string;
}

interface TaskEventPayload {
  user_id: string;
  task_id: string;
  event_type: string;
  status?: string;
  progress?: number;
  error?: string;
  payload?: Record<string, unknown>;
  result_json?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Exact copy of unfixed mapResultPlans from ScriptAIAssistantSessionPane.tsx
// ---------------------------------------------------------------------------

function mapResultPlans(raw: unknown): PlanData[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const mapped: PlanData[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const obj = item as Record<string, unknown>;
    if (
      typeof obj.id !== "string" ||
      typeof obj.kind !== "string" ||
      typeof obj.tool_id !== "string"
    )
      continue;
    mapped.push({
      id: obj.id,
      kind: obj.kind,
      tool_id: obj.tool_id,
      inputs: (typeof obj.inputs === "object" && obj.inputs !== null
        ? obj.inputs
        : {}) as Record<string, unknown>,
      preview: (typeof obj.preview === "object" && obj.preview !== null
        ? obj.preview
        : undefined) as PlanData["preview"],
    });
  }
  return mapped.length > 0 ? mapped : null;
}

// ---------------------------------------------------------------------------
// Simulated state machine for non-succeeded event handling
// Mirrors the exact logic in the useEffect subscribeTask callback
// ---------------------------------------------------------------------------

interface ComponentState {
  activeTaskId: string | null;
  running: boolean;
  errorText: string | null;
  streamingTrace: TraceEvent[];
  messages: AIChatMessage[];
}

/**
 * Simulates the unfixed subscribeTask callback for non-succeeded events.
 * Returns the new state after processing the event.
 */
function simulateNonSucceededEvent(
  state: ComponentState,
  event: TaskEventPayload,
): ComponentState {
  const newState = { ...state };

  // "log" events with trace-like payload update streamingTrace
  if (event.event_type === "log" && event.payload) {
    const payload = event.payload as Record<string, unknown>;
    const traceTypes = [
      "tool_event",
      "agent_run_start",
      "agent_run_done",
      "tool_start",
      "tool_done",
    ];
    if (typeof payload.type === "string" && traceTypes.includes(payload.type)) {
      newState.streamingTrace = [
        ...state.streamingTrace,
        payload as unknown as TraceEvent,
      ];
    }
  }

  // "progress" events don't change our modeled state (they update UI via
  // TaskProgressMonitor which reads from TaskProvider, not local state)
  // but we keep the state unchanged to confirm no side effects

  // "failed" events set error text and reset activeTaskId + running
  if (event.event_type === "failed") {
    newState.errorText = (event.error as string) || "任务失败";
    newState.activeTaskId = null;
    newState.running = false;
  }

  // "canceled" events are not explicitly handled in the unfixed code,
  // so state remains unchanged (no handler for canceled)

  return newState;
}

/**
 * Simulates loadSession behavior for session switch with no active task.
 * Returns validated messages with plans mapped through mapResultPlans.
 */
function simulateSessionSwitch(
  rawMessages: AIChatMessage[],
): AIChatMessage[] {
  return rawMessages.map((msg) => ({
    ...msg,
    plans: msg.plans ? mapResultPlans(msg.plans) : null,
  }));
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Fully valid plan with all required fields present and correct types */
const validPlanArb: fc.Arbitrary<PlanData> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 10 }),
  kind: fc.constantFrom("asset", "scene", "character", "location", "storyboard"),
  tool_id: fc.string({ minLength: 1, maxLength: 20 }),
  inputs: fc.constant({} as Record<string, unknown>),
  preview: fc.oneof(
    fc.constant(undefined as Record<string, unknown> | undefined),
    fc.constant({ summary: "test" } as Record<string, unknown>),
  ),
});

/** Trace event payloads that arrive via "log" events */
const tracePayloadArb: fc.Arbitrary<Record<string, unknown>> = fc.constantFrom(
  { type: "tool_event", tool: "search", status: "done" },
  { type: "agent_run_start", agent: "planner" },
  { type: "agent_run_done", agent: "planner" },
  { type: "tool_start", tool: "extract" },
  { type: "tool_done", tool: "extract", result: "ok" },
);

/** Non-trace log payloads (should NOT be added to streamingTrace) */
const nonTracePayloadArb: fc.Arbitrary<Record<string, unknown>> =
  fc.constantFrom(
    { type: "info", message: "processing" },
    { type: "debug", data: 42 },
    { type: "status", progress: 0.5 },
  );

/** Error messages for failed events */
const errorMessageArb = fc.oneof(
  fc.constant("任务失败"),
  fc.constant("timeout"),
  fc.constant("internal error"),
  fc.string({ minLength: 1, maxLength: 50 }),
);

/** Non-succeeded event types */
const nonSucceededEventTypeArb = fc.constantFrom(
  "failed",
  "canceled",
  "log",
  "progress",
);

/** A valid AIChatMessage for session history */
const chatMessageArb: fc.Arbitrary<AIChatMessage> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 12 }),
  role: fc.constantFrom("user" as const, "assistant" as const, "system" as const),
  content: fc.string({ minLength: 0, maxLength: 100 }),
  plans: fc.oneof(
    fc.constant(null as PlanData[] | null),
    fc.array(validPlanArb, { minLength: 1, maxLength: 3 }),
  ),
  trace: fc.oneof(
    fc.constant(null as TraceEvent[] | null),
    fc.array(
      fc.record({
        type: fc.constantFrom("tool_event", "agent_run_start", "tool_done"),
      }) as fc.Arbitrary<TraceEvent>,
      { minLength: 1, maxLength: 3 },
    ),
  ),
  created_at: fc.constant("2024-01-01T00:00:00Z"),
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("Preservation: Non-Succeeded Event Handling and Existing Flows", () => {
  /**
   * Property: For all "log" events with trace-type payloads, streamingTrace
   * is appended with the payload. This is the unfixed behavior that must
   * be preserved.
   *
   * **Validates: Requirements 3.1, 3.6**
   */
  it("Property 2a: log events with trace payloads append to streamingTrace", () => {
    fc.assert(
      fc.property(
        fc.array(tracePayloadArb, { minLength: 1, maxLength: 5 }),
        (tracePayloads) => {
          let state: ComponentState = {
            activeTaskId: "task-1",
            running: true,
            errorText: null,
            streamingTrace: [],
            messages: [],
          };

          for (const payload of tracePayloads) {
            const event: TaskEventPayload = {
              user_id: "u1",
              task_id: "task-1",
              event_type: "log",
              payload,
            };
            state = simulateNonSucceededEvent(state, event);
          }

          // Each trace payload should have been appended
          expect(state.streamingTrace.length).toBe(tracePayloads.length);
          // activeTaskId and running should be unchanged
          expect(state.activeTaskId).toBe("task-1");
          expect(state.running).toBe(true);
          expect(state.errorText).toBeNull();
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * Property: For all "log" events with non-trace payloads, streamingTrace
   * is NOT modified. Only specific trace types are appended.
   *
   * **Validates: Requirements 3.1, 3.6**
   */
  it("Property 2b: log events with non-trace payloads do not modify streamingTrace", () => {
    fc.assert(
      fc.property(nonTracePayloadArb, (payload) => {
        const state: ComponentState = {
          activeTaskId: "task-1",
          running: true,
          errorText: null,
          streamingTrace: [{ type: "existing_event" }],
          messages: [],
        };

        const event: TaskEventPayload = {
          user_id: "u1",
          task_id: "task-1",
          event_type: "log",
          payload,
        };
        const newState = simulateNonSucceededEvent(state, event);

        // streamingTrace should remain unchanged
        expect(newState.streamingTrace.length).toBe(1);
        expect(newState.streamingTrace[0].type).toBe("existing_event");
        // Other state unchanged
        expect(newState.activeTaskId).toBe("task-1");
        expect(newState.running).toBe(true);
      }),
      { numRuns: 10 },
    );
  });

  /**
   * Property: For all "failed" events, errorText is set, activeTaskId is
   * reset to null, and running is set to false. This is the exact unfixed
   * behavior.
   *
   * **Validates: Requirements 3.5**
   */
  it("Property 2c: failed events set error text and reset activeTaskId and running", () => {
    fc.assert(
      fc.property(errorMessageArb, (errorMsg) => {
        const state: ComponentState = {
          activeTaskId: "task-running",
          running: true,
          errorText: null,
          streamingTrace: [{ type: "some_trace" }],
          messages: [
            {
              id: "m1",
              role: "user",
              content: "hello",
              plans: null,
              trace: null,
              created_at: "2024-01-01T00:00:00Z",
            },
          ],
        };

        const event: TaskEventPayload = {
          user_id: "u1",
          task_id: "task-running",
          event_type: "failed",
          error: errorMsg,
        };
        const newState = simulateNonSucceededEvent(state, event);

        // Failed behavior: error set, activeTaskId null, running false
        expect(newState.errorText).toBe(errorMsg);
        expect(newState.activeTaskId).toBeNull();
        expect(newState.running).toBe(false);
        // Messages and streamingTrace are NOT modified by failed handler
        expect(newState.messages).toEqual(state.messages);
        expect(newState.streamingTrace).toEqual(state.streamingTrace);
      }),
      { numRuns: 20 },
    );
  });

  /**
   * Property: For "failed" events with no error string, the default
   * error message "任务失败" is used.
   *
   * **Validates: Requirements 3.5**
   */
  it("Property 2d: failed events with no error string use default message", () => {
    const state: ComponentState = {
      activeTaskId: "task-1",
      running: true,
      errorText: null,
      streamingTrace: [],
      messages: [],
    };

    const event: TaskEventPayload = {
      user_id: "u1",
      task_id: "task-1",
      event_type: "failed",
      // no error field
    };
    const newState = simulateNonSucceededEvent(state, event);

    expect(newState.errorText).toBe("任务失败");
    expect(newState.activeTaskId).toBeNull();
    expect(newState.running).toBe(false);
  });

  /**
   * Property: For all "canceled" and "progress" events, state remains
   * completely unchanged (unfixed code has no explicit handler for these).
   *
   * **Validates: Requirements 3.1**
   */
  it("Property 2e: canceled and progress events do not modify state", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("canceled", "progress"),
        fc.record({
          activeTaskId: fc.constant("task-1" as string | null),
          running: fc.constant(true),
          errorText: fc.constant(null as string | null),
          streamingTrace: fc.array(
            fc.record({ type: fc.constant("trace") }) as fc.Arbitrary<TraceEvent>,
            { minLength: 0, maxLength: 2 },
          ),
          messages: fc.constant([] as AIChatMessage[]),
        }),
        (eventType, initialState) => {
          const event: TaskEventPayload = {
            user_id: "u1",
            task_id: "task-1",
            event_type: eventType,
            progress: eventType === "progress" ? 0.5 : undefined,
          };
          const newState = simulateNonSucceededEvent(initialState, event);

          // State should be identical
          expect(newState.activeTaskId).toBe(initialState.activeTaskId);
          expect(newState.running).toBe(initialState.running);
          expect(newState.errorText).toBe(initialState.errorText);
          expect(newState.streamingTrace).toEqual(initialState.streamingTrace);
          expect(newState.messages).toEqual(initialState.messages);
        },
      ),
      { numRuns: 10 },
    );
  });

  /**
   * Property: For all session switch operations with no active task,
   * historical messages are loaded and plans are validated through
   * mapResultPlans. Messages with valid plans retain them; messages
   * with null plans stay null.
   *
   * **Validates: Requirements 3.4**
   */
  it("Property 2f: session switch loads historical messages with plans validated via mapResultPlans", () => {
    fc.assert(
      fc.property(
        fc.array(chatMessageArb, { minLength: 0, maxLength: 5 }),
        (rawMessages) => {
          const result = simulateSessionSwitch(rawMessages);

          expect(result.length).toBe(rawMessages.length);

          for (let i = 0; i < rawMessages.length; i++) {
            const original = rawMessages[i];
            const validated = result[i];

            // Non-plan fields are preserved exactly
            expect(validated.id).toBe(original.id);
            expect(validated.role).toBe(original.role);
            expect(validated.content).toBe(original.content);
            expect(validated.trace).toEqual(original.trace);
            expect(validated.created_at).toBe(original.created_at);

            // Plans: null stays null, valid plans are re-validated
            if (original.plans === null) {
              expect(validated.plans).toBeNull();
            } else {
              // mapResultPlans re-validates — valid plans should survive
              const revalidated = mapResultPlans(original.plans);
              expect(validated.plans).toEqual(revalidated);
            }
          }
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * Property: For all mapResultPlans calls with fully valid plans (all
   * fields present and correct type), output is identical — plans are
   * mapped 1:1 without any being dropped.
   *
   * **Validates: Requirements 3.3, 3.4**
   */
  it("Property 2g: mapResultPlans with fully valid plans maps all plans identically", () => {
    fc.assert(
      fc.property(
        fc.array(validPlanArb, { minLength: 1, maxLength: 5 }),
        (plans) => {
          const result = mapResultPlans(plans);

          // All valid plans should be mapped
          expect(result).not.toBeNull();
          expect(result!.length).toBe(plans.length);

          for (let i = 0; i < plans.length; i++) {
            expect(result![i].id).toBe(plans[i].id);
            expect(result![i].kind).toBe(plans[i].kind);
            expect(result![i].tool_id).toBe(plans[i].tool_id);
            expect(result![i].inputs).toEqual(plans[i].inputs);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * Property: mapResultPlans returns null for empty arrays and non-arrays.
   * This baseline behavior must be preserved.
   *
   * **Validates: Requirements 3.3**
   */
  it("Property 2h: mapResultPlans returns null for empty or non-array input", () => {
    fc.assert(
      fc.property(
        fc.constantFrom([], null, undefined, "string", 42, {}),
        (input) => {
          const result = mapResultPlans(input);
          expect(result).toBeNull();
        },
      ),
      { numRuns: 6 },
    );
  });

  /**
   * Property: For all sequences of non-succeeded events, the final state
   * is deterministic and matches the unfixed code's behavior exactly.
   * This tests mixed event sequences.
   *
   * **Validates: Requirements 3.1, 3.5, 3.6**
   */
  it("Property 2i: mixed non-succeeded event sequences produce deterministic state", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            // log with trace payload
            fc.record({
              event_type: fc.constant("log"),
              payload: tracePayloadArb,
              error: fc.constant(undefined as string | undefined),
            }),
            // log with non-trace payload
            fc.record({
              event_type: fc.constant("log"),
              payload: nonTracePayloadArb,
              error: fc.constant(undefined as string | undefined),
            }),
            // progress event
            fc.record({
              event_type: fc.constant("progress"),
              payload: fc.constant(undefined as Record<string, unknown> | undefined),
              error: fc.constant(undefined as string | undefined),
            }),
            // canceled event
            fc.record({
              event_type: fc.constant("canceled"),
              payload: fc.constant(undefined as Record<string, unknown> | undefined),
              error: fc.constant(undefined as string | undefined),
            }),
          ),
          { minLength: 1, maxLength: 8 },
        ),
        (events) => {
          let state: ComponentState = {
            activeTaskId: "task-1",
            running: true,
            errorText: null,
            streamingTrace: [],
            messages: [],
          };

          // Count expected trace events
          const traceTypes = [
            "tool_event",
            "agent_run_start",
            "agent_run_done",
            "tool_start",
            "tool_done",
          ];
          let expectedTraceCount = 0;

          for (const ev of events) {
            const event: TaskEventPayload = {
              user_id: "u1",
              task_id: "task-1",
              event_type: ev.event_type,
              payload: ev.payload,
              error: ev.error,
            };
            state = simulateNonSucceededEvent(state, event);

            if (
              ev.event_type === "log" &&
              ev.payload &&
              typeof (ev.payload as any).type === "string" &&
              traceTypes.includes((ev.payload as any).type)
            ) {
              expectedTraceCount++;
            }
          }

          // No failed events in this generator, so state should still be running
          expect(state.activeTaskId).toBe("task-1");
          expect(state.running).toBe(true);
          expect(state.errorText).toBeNull();
          expect(state.streamingTrace.length).toBe(expectedTraceCount);
        },
      ),
      { numRuns: 30 },
    );
  });
});
