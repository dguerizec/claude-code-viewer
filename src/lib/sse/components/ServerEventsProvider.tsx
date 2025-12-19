import { useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import {
  type FC,
  type PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
} from "react";
import type { SSEEvent } from "../../../types/sse";
import { projectListQuery } from "../../api/queries";
import { callSSE } from "../callSSE";
import {
  type EventListener,
  SSEContext,
  type SSEContextType,
} from "../SSEContext";
import { sseAtom } from "../store/sseAtom";

const RECONNECT_DELAY_MS = 3000;
const HEARTBEAT_INTERVAL_MS = 10_000;
const HEARTBEAT_TIMEOUT_MS = HEARTBEAT_INTERVAL_MS * 3; // 30 seconds

export const ServerEventsProvider: FC<PropsWithChildren> = ({ children }) => {
  const sseRef = useRef<ReturnType<typeof callSSE> | null>(null);
  const listenersRef = useRef<
    Map<SSEEvent["kind"], Set<(event: SSEEvent) => void>>
  >(new Map());
  const sseListenerCleanupsRef = useRef<Array<() => void>>([]);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastHeartbeatRef = useRef<number>(Date.now());
  const [, setSSEState] = useAtom(sseAtom);
  const queryClient = useQueryClient();

  useEffect(() => {
    const stopHeartbeatCheck = () => {
      if (heartbeatCheckIntervalRef.current) {
        clearInterval(heartbeatCheckIntervalRef.current);
        heartbeatCheckIntervalRef.current = null;
      }
    };

    const checkHeartbeatAndReconnectIfNeeded = () => {
      const timeSinceLastHeartbeat = Date.now() - lastHeartbeatRef.current;
      if (timeSinceLastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
        console.log(
          `SSE heartbeat timeout (${timeSinceLastHeartbeat}ms since last heartbeat), forcing reconnection...`,
        );
        stopHeartbeatCheck();
        // Force close and reconnect
        if (sseRef.current) {
          sseRef.current.cleanUp();
          sseRef.current = null;
        }
        setSSEState({ isConnected: false });
        // Schedule reconnection
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log("SSE reconnecting after heartbeat timeout...");
          createSSEConnection();
        }, RECONNECT_DELAY_MS);
        return true;
      }
      return false;
    };

    const startHeartbeatCheck = () => {
      stopHeartbeatCheck();
      lastHeartbeatRef.current = Date.now();
      heartbeatCheckIntervalRef.current = setInterval(() => {
        checkHeartbeatAndReconnectIfNeeded();
      }, HEARTBEAT_INTERVAL_MS);
    };

    // Check connection when tab becomes visible again
    // (setInterval is throttled in background tabs)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkHeartbeatAndReconnectIfNeeded();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    const createSSEConnection = () => {
      // Clean up previous connection if any
      if (sseRef.current) {
        sseRef.current.cleanUp();
      }
      for (const cleanup of sseListenerCleanupsRef.current) {
        cleanup();
      }
      sseListenerCleanupsRef.current = [];
      stopHeartbeatCheck();

      const sse = callSSE({
        onError: (_event, isClosed) => {
          if (isClosed) {
            setSSEState({ isConnected: false });
            console.log(
              `SSE connection closed, reconnecting in ${RECONNECT_DELAY_MS}ms...`,
            );
            // Schedule reconnection
            if (reconnectTimeoutRef.current) {
              clearTimeout(reconnectTimeoutRef.current);
            }
            reconnectTimeoutRef.current = setTimeout(() => {
              console.log("SSE reconnecting...");
              createSSEConnection();
            }, RECONNECT_DELAY_MS);
          }
        },
      });
      sseRef.current = sse;

      // Register the "connect" listener
      const { removeEventListener: removeConnectListener } =
        sse.addEventListener("connect", async (event) => {
          setSSEState({
            isConnected: true,
          });
          console.log("SSE connected", event);
          // Start heartbeat monitoring after successful connection
          startHeartbeatCheck();
          // Invalidate queries to refresh data that may have changed during disconnection
          // This is done here (on "connect" event) rather than on EventSource "open"
          // because we only want to invalidate once the server confirms the connection
          await queryClient.invalidateQueries({
            queryKey: projectListQuery.queryKey,
          });
        });
      sseListenerCleanupsRef.current.push(removeConnectListener);

      // Register the "heartbeat" listener to track connection liveness
      const { removeEventListener: removeHeartbeatListener } =
        sse.addEventListener("heartbeat", () => {
          lastHeartbeatRef.current = Date.now();
        });
      sseListenerCleanupsRef.current.push(removeHeartbeatListener);

      // Re-register all existing listeners from listenersRef
      for (const [eventType, listeners] of listenersRef.current.entries()) {
        for (const listener of listeners) {
          const { removeEventListener } = sse.addEventListener(
            eventType,
            (event) => {
              listener(event as SSEEvent);
            },
          );
          sseListenerCleanupsRef.current.push(removeEventListener);
        }
      }
    };

    createSSEConnection();

    return () => {
      // Clean up on unmount
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopHeartbeatCheck();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (sseRef.current) {
        sseRef.current.cleanUp();
      }
      for (const cleanup of sseListenerCleanupsRef.current) {
        cleanup();
      }
      sseListenerCleanupsRef.current = [];
    };
  }, [setSSEState, queryClient]);

  const addEventListener = useCallback(
    <T extends SSEEvent["kind"]>(eventType: T, listener: EventListener<T>) => {
      // Store the listener in our internal map
      if (!listenersRef.current.has(eventType)) {
        listenersRef.current.set(eventType, new Set());
      }
      const listeners = listenersRef.current.get(eventType);
      if (listeners) {
        listeners.add(listener as (event: SSEEvent) => void);
      }

      // Register with the actual SSE connection
      let sseCleanup: (() => void) | null = null;
      let timeoutId: NodeJS.Timeout | null = null;

      const registerWithSSE = () => {
        if (sseRef.current) {
          const { removeEventListener } = sseRef.current.addEventListener(
            eventType,
            (event) => {
              // The listener expects the specific event type, so we cast it through unknown first
              listener(event as unknown as Extract<SSEEvent, { kind: T }>);
            },
          );
          sseCleanup = removeEventListener;
        }
      };

      // Register immediately if SSE is ready, or wait for it
      if (sseRef.current) {
        registerWithSSE();
      } else {
        // Use a small delay to wait for SSE to be initialized
        timeoutId = setTimeout(registerWithSSE, 0);
      }

      // Return cleanup function
      return () => {
        // Remove from internal listeners
        const listeners = listenersRef.current.get(eventType);
        if (listeners) {
          listeners.delete(listener as (event: SSEEvent) => void);
          if (listeners.size === 0) {
            listenersRef.current.delete(eventType);
          }
        }
        // Remove from SSE connection
        if (sseCleanup) {
          sseCleanup();
        }
        // Clear timeout if it exists
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };
    },
    [],
  );

  const contextValue: SSEContextType = {
    addEventListener,
  };

  return (
    <SSEContext.Provider value={contextValue}>{children}</SSEContext.Provider>
  );
};
