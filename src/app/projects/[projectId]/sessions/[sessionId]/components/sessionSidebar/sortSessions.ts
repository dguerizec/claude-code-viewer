import type {
  PublicSessionProcess,
  SessionProcessStatus,
} from "../../../../../../../types/session-process";

interface SessionWithDate {
  id: string;
  lastModifiedAt: Date | string;
}

export const sortSessionsByStatusAndDate = <T extends SessionWithDate>(
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

    const aStatus = aProcess?.status;
    const bStatus = bProcess?.status;

    // Define priority: active sessions (starting, pending, running) = 0, paused = 1, others = 2
    const getPriority = (status: SessionProcessStatus | undefined) => {
      if (status === "starting" || status === "pending" || status === "running")
        return 0;
      if (status === "paused") return 1;
      return 2;
    };

    const aPriority = getPriority(aStatus);
    const bPriority = getPriority(bStatus);

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
