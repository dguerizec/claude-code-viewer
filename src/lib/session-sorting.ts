import type {
  PublicSessionProcess,
  SessionProcessStatus,
} from "../types/session-process";

interface SessionWithDateAndId {
  id: string;
  lastModifiedAt: Date | string;
}

/**
 * Gets the priority of a session process status for sorting.
 * Lower values have higher priority (appear first).
 *
 * - Priority 0: Active sessions (starting, pending, running)
 * - Priority 1: Paused sessions (waiting for user input)
 * - Priority 2: Other sessions (no active process)
 */
export const getStatusPriority = (
  status: SessionProcessStatus | undefined,
): number => {
  if (status === "starting" || status === "pending" || status === "running") {
    return 0;
  }
  if (status === "paused") {
    return 1;
  }
  return 2;
};

/**
 * Sorts sessions by their process status (active first, then paused, then others)
 * and within each status group by lastModifiedAt (newest first).
 *
 * This function is used on both backend (for pagination) and frontend (for real-time updates).
 */
export const sortSessionsByStatusAndDate = <T extends SessionWithDateAndId>(
  sessions: T[],
  sessionProcesses: PublicSessionProcess[],
): T[] => {
  return [...sessions].sort((a, b) => {
    const aProcess = sessionProcesses.find(
      (process) => process.sessionId === a.id,
    );
    const bProcess = sessionProcesses.find(
      (process) => process.sessionId === b.id,
    );

    const aPriority = getStatusPriority(aProcess?.status);
    const bPriority = getStatusPriority(bProcess?.status);

    // First sort by priority
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    // Then sort by lastModifiedAt (newest first)
    const aTime = a.lastModifiedAt ? new Date(a.lastModifiedAt).getTime() : 0;
    const bTime = b.lastModifiedAt ? new Date(b.lastModifiedAt).getTime() : 0;
    return bTime - aTime;
  });
};
