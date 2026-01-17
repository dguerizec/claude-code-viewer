"use client";

import {
  createContext,
  type FC,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * Context for inserting text from diff line comments into the chat textarea
 * and for sharing the comment count with badge components.
 */

type InsertTextCallback = (text: string) => void;

/**
 * Data for a single line comment in a diff
 */
export interface LineCommentData {
  filePath: string;
  lineNumber: number;
  side: "old" | "new";
  lineContent: string;
  comment: string;
}

/**
 * Map of comment key to comment data
 */
export type CommentsMap = Map<string, LineCommentData>;

/**
 * Checks if a comment has non-empty content (not just whitespace).
 */
export function hasNonEmptyComment(comment: LineCommentData): boolean {
  return comment.comment.trim().length > 0;
}

interface DiffLineCommentContextValue {
  /**
   * Register a callback to insert text into the chat textarea.
   * Returns an unregister function.
   */
  registerInsertCallback: (callback: InsertTextCallback) => () => void;
  /**
   * Insert text into the chat textarea at cursor position or at the end.
   */
  insertText: (text: string) => void;
  /**
   * Count of non-empty comments (set by DiffModal, read by badge components)
   */
  nonEmptyCommentCount: number;
  /**
   * Update the non-empty comment count (called by DiffModal)
   */
  setNonEmptyCommentCount: (count: number) => void;
}

const DiffLineCommentContext =
  createContext<DiffLineCommentContextValue | null>(null);

interface DiffLineCommentProviderProps {
  children: ReactNode;
}

export const DiffLineCommentProvider: FC<DiffLineCommentProviderProps> = ({
  children,
}) => {
  const callbackRef = useRef<InsertTextCallback | null>(null);
  const [nonEmptyCommentCount, setNonEmptyCommentCount] = useState(0);

  const registerInsertCallback = useCallback((callback: InsertTextCallback) => {
    callbackRef.current = callback;
    return () => {
      callbackRef.current = null;
    };
  }, []);

  const insertText = useCallback((text: string) => {
    callbackRef.current?.(text);
  }, []);

  const value = useMemo(
    () => ({
      registerInsertCallback,
      insertText,
      nonEmptyCommentCount,
      setNonEmptyCommentCount,
    }),
    [registerInsertCallback, insertText, nonEmptyCommentCount],
  );

  return (
    <DiffLineCommentContext.Provider value={value}>
      {children}
    </DiffLineCommentContext.Provider>
  );
};

export const useDiffLineComment = (): DiffLineCommentContextValue => {
  const context = useContext(DiffLineCommentContext);
  if (!context) {
    throw new Error(
      "useDiffLineComment must be used within a DiffLineCommentProvider",
    );
  }
  return context;
};
