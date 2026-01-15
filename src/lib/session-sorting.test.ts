import { describe, expect, test } from "vitest";
import type { PublicSessionProcess } from "@/types/session-process";
import {
  getStatusPriority,
  sortSessionsByStatusAndDate,
} from "./session-sorting";

describe("getStatusPriority", () => {
  test("returns 0 for active statuses (starting, pending, running)", () => {
    expect(getStatusPriority("starting")).toBe(0);
    expect(getStatusPriority("pending")).toBe(0);
    expect(getStatusPriority("running")).toBe(0);
  });

  test("returns 1 for paused status", () => {
    expect(getStatusPriority("paused")).toBe(1);
  });

  test("returns 2 for undefined status", () => {
    expect(getStatusPriority(undefined)).toBe(2);
  });
});

describe("sortSessionsByStatusAndDate", () => {
  const createSession = (id: string, date: Date) => ({
    id,
    lastModifiedAt: date,
  });

  const createProcess = (
    sessionId: string,
    status: PublicSessionProcess["status"],
  ): PublicSessionProcess => ({
    id: `process-${sessionId}`,
    projectId: "project-1",
    sessionId,
    status,
    permissionMode: "default",
  });

  test("sorts running sessions before paused sessions", () => {
    const sessions = [
      createSession("session-paused", new Date("2024-01-01")),
      createSession("session-running", new Date("2024-01-01")),
    ];
    const processes = [
      createProcess("session-paused", "paused"),
      createProcess("session-running", "running"),
    ];

    const result = sortSessionsByStatusAndDate(sessions, processes);

    expect(result.map((s) => s.id)).toEqual([
      "session-running",
      "session-paused",
    ]);
  });

  test("sorts paused sessions before sessions without process", () => {
    const sessions = [
      createSession("session-no-process", new Date("2024-01-01")),
      createSession("session-paused", new Date("2024-01-01")),
    ];
    const processes = [createProcess("session-paused", "paused")];

    const result = sortSessionsByStatusAndDate(sessions, processes);

    expect(result.map((s) => s.id)).toEqual([
      "session-paused",
      "session-no-process",
    ]);
  });

  test("sorts by date within the same priority group", () => {
    const sessions = [
      createSession("session-old", new Date("2024-01-01")),
      createSession("session-new", new Date("2024-01-15")),
    ];
    const processes: PublicSessionProcess[] = [];

    const result = sortSessionsByStatusAndDate(sessions, processes);

    expect(result.map((s) => s.id)).toEqual(["session-new", "session-old"]);
  });

  test("active sessions with older dates still appear before paused sessions with newer dates", () => {
    const sessions = [
      createSession("session-paused-new", new Date("2024-01-15")),
      createSession("session-running-old", new Date("2024-01-01")),
    ];
    const processes = [
      createProcess("session-paused-new", "paused"),
      createProcess("session-running-old", "running"),
    ];

    const result = sortSessionsByStatusAndDate(sessions, processes);

    expect(result.map((s) => s.id)).toEqual([
      "session-running-old",
      "session-paused-new",
    ]);
  });

  test("handles all active statuses equally", () => {
    const sessions = [
      createSession("session-pending", new Date("2024-01-01")),
      createSession("session-running", new Date("2024-01-02")),
      createSession("session-starting", new Date("2024-01-03")),
    ];
    const processes = [
      createProcess("session-pending", "pending"),
      createProcess("session-running", "running"),
      createProcess("session-starting", "starting"),
    ];

    const result = sortSessionsByStatusAndDate(sessions, processes);

    // All have priority 0, so sorted by date (newest first)
    expect(result.map((s) => s.id)).toEqual([
      "session-starting",
      "session-running",
      "session-pending",
    ]);
  });

  test("does not mutate the original array", () => {
    const sessions = [
      createSession("session-b", new Date("2024-01-01")),
      createSession("session-a", new Date("2024-01-15")),
    ];
    const originalOrder = sessions.map((s) => s.id);

    sortSessionsByStatusAndDate(sessions, []);

    expect(sessions.map((s) => s.id)).toEqual(originalOrder);
  });

  test("handles empty sessions array", () => {
    const result = sortSessionsByStatusAndDate([], []);
    expect(result).toEqual([]);
  });

  test("handles sessions with no matching processes", () => {
    const sessions = [
      createSession("session-a", new Date("2024-01-15")),
      createSession("session-b", new Date("2024-01-01")),
    ];

    const result = sortSessionsByStatusAndDate(sessions, []);

    // All have priority 2 (no process), so sorted by date
    expect(result.map((s) => s.id)).toEqual(["session-a", "session-b"]);
  });

  test("complex scenario: mixed statuses and dates", () => {
    const sessions = [
      createSession("no-process-old", new Date("2024-01-01")),
      createSession("paused-new", new Date("2024-01-20")),
      createSession("running-mid", new Date("2024-01-10")),
      createSession("no-process-new", new Date("2024-01-15")),
      createSession("starting-old", new Date("2024-01-05")),
      createSession("paused-old", new Date("2024-01-02")),
    ];
    const processes = [
      createProcess("paused-new", "paused"),
      createProcess("running-mid", "running"),
      createProcess("starting-old", "starting"),
      createProcess("paused-old", "paused"),
    ];

    const result = sortSessionsByStatusAndDate(sessions, processes);

    // Expected order:
    // Priority 0 (active): running-mid (Jan 10), starting-old (Jan 5)
    // Priority 1 (paused): paused-new (Jan 20), paused-old (Jan 2)
    // Priority 2 (none): no-process-new (Jan 15), no-process-old (Jan 1)
    expect(result.map((s) => s.id)).toEqual([
      "running-mid",
      "starting-old",
      "paused-new",
      "paused-old",
      "no-process-new",
      "no-process-old",
    ]);
  });
});
