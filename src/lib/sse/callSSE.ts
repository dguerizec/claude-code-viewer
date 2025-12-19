import type { SSEEventMap } from "../../types/sse";

export const callSSE = (options?: {
  onOpen?: (event: Event) => void;
  onError?: (event: Event, isClosed: boolean) => void;
}) => {
  const { onOpen, onError } = options ?? {};

  const eventSource = new EventSource(
    new URL("/api/sse", window.location.origin).href,
  );

  const handleOnOpen = (event: Event) => {
    console.log("SSE connection opened", event);
    onOpen?.(event);
  };

  const handleOnError = (event: Event) => {
    const isClosed = eventSource.readyState === EventSource.CLOSED;
    console.error("SSE connection error", { event, isClosed });
    onError?.(event, isClosed);
  };

  eventSource.onopen = handleOnOpen;
  eventSource.onerror = handleOnError;

  const addEventListener = <EventName extends keyof SSEEventMap>(
    eventName: EventName,
    listener: (event: SSEEventMap[EventName]) => void,
  ) => {
    const callbackFn = (event: MessageEvent) => {
      try {
        const sseEvent: SSEEventMap[EventName] = JSON.parse(event.data);
        listener(sseEvent);
      } catch (error) {
        console.error("Failed to parse SSE event data:", error);
      }
    };
    eventSource.addEventListener(eventName, callbackFn);

    const removeEventListener = () => {
      eventSource.removeEventListener(eventName, callbackFn);
    };

    return {
      removeEventListener,
    } as const;
  };

  const cleanUp = () => {
    eventSource.onopen = null;
    eventSource.onerror = null;
    eventSource.onmessage = null;
    eventSource.close();
  };

  const getReadyState = () => eventSource.readyState;

  return {
    addEventListener,
    cleanUp,
    getReadyState,
  } as const;
};
