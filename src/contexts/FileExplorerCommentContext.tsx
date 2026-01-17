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
 * Context for inserting text from file explorer line comments into the chat textarea
 * and for sharing the comment count with badge components.
 *
 * This is separate from DiffLineCommentContext to ensure independent counters
 * and no interference between Git dialog and File Explorer.
 */

type InsertTextCallback = (text: string) => void;

/**
 * Data for a single line comment in the file explorer
 */
export interface FileExplorerLineCommentData {
  filePath: string;
  lineNumber: number;
  lineContent: string;
  comment: string;
}

/**
 * Map of comment key to comment data
 */
export type FileExplorerCommentsMap = Map<string, FileExplorerLineCommentData>;

/**
 * Checks if a comment has non-empty content (not just whitespace).
 */
export function hasNonEmptyComment(
  comment: FileExplorerLineCommentData,
): boolean {
  return comment.comment.trim().length > 0;
}

interface FileExplorerCommentContextValue {
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
   * Count of non-empty comments (set by FileExplorerDialog, read by badge components)
   */
  nonEmptyCommentCount: number;
  /**
   * Update the non-empty comment count (called by FileExplorerDialog)
   */
  setNonEmptyCommentCount: (count: number) => void;
}

const FileExplorerCommentContext =
  createContext<FileExplorerCommentContextValue | null>(null);

interface FileExplorerCommentProviderProps {
  children: ReactNode;
}

export const FileExplorerCommentProvider: FC<
  FileExplorerCommentProviderProps
> = ({ children }) => {
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
    <FileExplorerCommentContext.Provider value={value}>
      {children}
    </FileExplorerCommentContext.Provider>
  );
};

export const useFileExplorerComment = (): FileExplorerCommentContextValue => {
  const context = useContext(FileExplorerCommentContext);
  if (!context) {
    throw new Error(
      "useFileExplorerComment must be used within a FileExplorerCommentProvider",
    );
  }
  return context;
};
