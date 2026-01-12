import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  notificationSettingsAtom,
  soundNotificationsEnabledAtom,
} from "@/lib/atoms/notifications";
import { playNotificationSound } from "@/lib/notifications";
import type { PublicSessionProcess } from "@/types/session-process";

/**
 * Global hook to handle session transitions (running → paused) for all sessions.
 *
 * When any session completes (transitions from running to paused):
 * 1. Plays notification sound (if enabled)
 * 2. Shows "Task completed" toast
 *
 * This works regardless of which session is currently being viewed.
 */
export const useGlobalSessionTransitions = (
  sessionProcesses: PublicSessionProcess[],
) => {
  const settings = useAtomValue(notificationSettingsAtom);
  const soundEnabled = useAtomValue(soundNotificationsEnabledAtom);

  // Track previous statuses by sessionId (not processId) to detect transitions
  // This is important because processId changes when we auto-send queued messages
  const prevStatusesRef = useRef<Map<string, "running" | "paused">>(new Map());

  const handleSessionCompleted = useCallback(() => {
    // Show toast
    toast.success("Task completed");

    // Play notification sound if enabled
    if (soundEnabled) {
      playNotificationSound(settings.soundType);
    }
  }, [soundEnabled, settings.soundType]);

  useEffect(() => {
    const prevStatuses = prevStatusesRef.current;

    for (const process of sessionProcesses) {
      // Track by sessionId, not processId, because processId changes on restart
      const prevStatus = prevStatuses.get(process.sessionId);
      const currentStatus = process.status;

      // Detect transition from running to paused
      if (prevStatus === "running" && currentStatus === "paused") {
        handleSessionCompleted();
      }

      // Update tracked status
      prevStatuses.set(process.sessionId, currentStatus);
    }

    // Clean up sessions that no longer exist
    for (const sessionId of prevStatuses.keys()) {
      if (!sessionProcesses.some((p) => p.sessionId === sessionId)) {
        prevStatuses.delete(sessionId);
      }
    }
  }, [sessionProcesses, handleSessionCompleted]);
};
