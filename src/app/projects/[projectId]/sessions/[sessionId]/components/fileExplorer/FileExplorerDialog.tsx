"use client";

import { Trans, useLingui } from "@lingui/react";
import { FolderOpen, MessageSquarePlus, X } from "lucide-react";
import type { FC } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type FileExplorerCommentsMap,
  hasNonEmptyComment,
  useFileExplorerComment,
} from "@/contexts/FileExplorerCommentContext";
import { usePersistentDialog } from "@/contexts/PersistentDialogsContext";
import { cn } from "@/lib/utils";
import { EmptyState } from "./EmptyState";
import {
  createFileCommentKey,
  formatAllFileExplorerComments,
} from "./FileContentViewer";
import { FileTree } from "./FileTree";
import { FileViewer } from "./FileViewer";
import { DEFAULT_FILE_VIEW_OPTIONS, type FileViewOptions } from "./types";

export interface FileExplorerDialogProps {
  projectId: string;
  projectPath: string;
  projectName: string;
}

/**
 * Toggle button for view options (Wrap, Syntax)
 */
interface ViewOptionToggleProps {
  label: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const ViewOptionToggle: FC<ViewOptionToggleProps> = ({
  label,
  checked,
  onChange,
}) => {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "px-2 py-1 text-xs rounded transition-colors",
        checked
          ? "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300"
          : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700",
      )}
    >
      {label}
    </button>
  );
};

/**
 * FileExplorerDialog - Main dialog for browsing project files.
 *
 * Features:
 * - Minimizable dialog (persisted via PersistentDialogsContext)
 * - Two-panel layout: FileTree on left, FileViewer on right
 * - View options toggles (Wrap, Syntax)
 * - Line comments that can be sent to chat
 * - Close confirmation if unsent comments exist
 */
export const FileExplorerDialog: FC<FileExplorerDialogProps> = ({
  projectId,
  projectPath,
  projectName,
}) => {
  const { i18n } = useLingui();
  const contentRef = useRef<HTMLDivElement>(null);

  // Context for inserting comments into chat
  const { insertText, setNonEmptyCommentCount } = useFileExplorerComment();

  // Local state
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [comments, setComments] = useState<FileExplorerCommentsMap>(
    () => new Map(),
  );
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [viewOptions, setViewOptions] = useState<FileViewOptions>(
    DEFAULT_FILE_VIEW_OPTIONS,
  );

  // Calculate non-empty comment count
  const nonEmptyCommentCount = useMemo(() => {
    let count = 0;
    for (const comment of comments.values()) {
      if (hasNonEmptyComment(comment)) count++;
    }
    return count;
  }, [comments]);

  // Count non-empty comments per file (for badges in tree view)
  const commentCountByFile = useMemo(() => {
    const counts = new Map<string, number>();
    for (const comment of comments.values()) {
      if (hasNonEmptyComment(comment)) {
        const current = counts.get(comment.filePath) ?? 0;
        counts.set(comment.filePath, current + 1);
      }
    }
    return counts;
  }, [comments]);

  // Sync non-empty comment count to context for badge display
  useEffect(() => {
    setNonEmptyCommentCount(nonEmptyCommentCount);
  }, [nonEmptyCommentCount, setNonEmptyCommentCount]);

  // Reset context count on unmount
  useEffect(() => {
    return () => {
      setNonEmptyCommentCount(0);
    };
  }, [setNonEmptyCommentCount]);

  // Register as a persistent dialog
  const dialogConfig = useMemo(
    () => ({
      id: "file-explorer",
      icon: FolderOpen,
      label: <Trans id="control.files" />,
      description: projectName,
    }),
    [projectName],
  );
  const { isVisible, hide: hideDialog } = usePersistentDialog(dialogConfig);

  // Handle hide with confirmation if there are non-empty comments
  const handleHide = useCallback(() => {
    if (nonEmptyCommentCount > 0) {
      setShowCloseConfirm(true);
    } else {
      hideDialog();
    }
  }, [nonEmptyCommentCount, hideDialog]);

  // Force hide (after confirmation)
  const handleForceHide = useCallback(() => {
    setShowCloseConfirm(false);
    hideDialog();
  }, [hideDialog]);

  // Handle adding a comment
  const handleAddComment = useCallback(
    (filePath: string, lineNumber: number, lineContent: string) => {
      const key = createFileCommentKey(filePath, lineNumber);
      // Don't add if already exists
      if (comments.has(key)) return;

      setComments((prev) => {
        const next = new Map(prev);
        next.set(key, {
          filePath,
          lineNumber,
          lineContent,
          comment: "",
        });
        return next;
      });
    },
    [comments],
  );

  // Handle updating a comment
  const handleUpdateComment = useCallback((key: string, comment: string) => {
    setComments((prev) => {
      const existing = prev.get(key);
      if (!existing) return prev;

      // CRITICAL: Don't create a new Map if the value hasn't changed.
      // This prevents an infinite loop caused by:
      // 1. LineCommentWidget's useEffect syncs localComment to parent on mount
      // 2. If we always create a new Map, comments changes -> extendData changes
      // 3. Library re-renders extend lines -> new onCommentChange callback
      // 4. LineCommentWidget sees new callback -> useEffect runs again -> LOOP!
      if (existing.comment === comment) return prev;

      const next = new Map(prev);
      next.set(key, { ...existing, comment });
      return next;
    });
  }, []);

  // Handle removing a comment
  const handleRemoveComment = useCallback((key: string) => {
    setComments((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  // Send all comments to chat
  const handleSendAllComments = useCallback(() => {
    if (nonEmptyCommentCount === 0) return;

    const commentsArray = Array.from(comments.values());
    const formatted = formatAllFileExplorerComments(commentsArray);
    insertText(formatted);

    // Clear all comments after sending
    setComments(new Map());

    // Minimize dialog and focus chat input (focus happens in insertText callback)
    hideDialog();
  }, [comments, insertText, nonEmptyCommentCount, hideDialog]);

  // Handle file selection
  const handleFileSelect = useCallback((filePath: string) => {
    // Only set file if it's not a directory (directories end with / or are "/")
    if (filePath !== "/" && !filePath.endsWith("/")) {
      setSelectedFile(filePath);
    }
  }, []);

  // Handle Escape key to hide
  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleHide();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [isVisible, handleHide]);

  // Handle click outside to hide
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleHide();
    }
  };

  // Render as portal with custom overlay (stays mounted, visibility controlled by CSS)
  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center",
        isVisible ? "visible" : "invisible pointer-events-none",
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="file-explorer-dialog-title"
    >
      {/* Overlay/backdrop */}
      <div
        className={cn(
          "absolute inset-0 bg-black/50 transition-opacity duration-200",
          isVisible ? "opacity-100" : "opacity-0",
        )}
        onClick={handleOverlayClick}
        onKeyDown={(e) => e.key === "Escape" && handleHide()}
      />

      {/* Dialog content */}
      <div
        ref={contentRef}
        className={cn(
          "relative z-10 bg-background rounded-lg shadow-lg border",
          "max-w-7xl w-[95vw] h-[90vh] overflow-hidden flex flex-col",
          "transition-all duration-200",
          isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <h2
            id="file-explorer-dialog-title"
            className="text-lg font-semibold flex items-center gap-2"
          >
            <FolderOpen className="w-5 h-5" />
            <Trans id="file_explorer.title" /> — {projectName}
          </h2>

          <div className="flex items-center gap-2">
            {/* View options */}
            <ViewOptionToggle
              label={<Trans id="diff.options.wrap" />}
              checked={viewOptions.wrap}
              onChange={(wrap) => setViewOptions((prev) => ({ ...prev, wrap }))}
            />
            <ViewOptionToggle
              label={<Trans id="diff.options.highlight" />}
              checked={viewOptions.highlight}
              onChange={(highlight) =>
                setViewOptions((prev) => ({ ...prev, highlight }))
              }
            />

            {/* Close button */}
            <button
              type="button"
              onClick={handleHide}
              className="ml-2 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              aria-label={i18n._("Close")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Main content - two panel layout */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Left panel - File tree */}
          <div className="w-64 md:w-72 lg:w-80 border-r border-gray-200 dark:border-gray-700 overflow-hidden shrink-0">
            <FileTree
              projectId={projectId}
              projectPath={projectPath}
              selectedFile={selectedFile}
              onFileSelect={handleFileSelect}
              commentCountByFile={commentCountByFile}
            />
          </div>

          {/* Right panel - File viewer */}
          <div className="flex-1 overflow-hidden relative">
            {selectedFile ? (
              <FileViewer
                projectId={projectId}
                filePath={selectedFile}
                options={viewOptions}
                comments={comments}
                onAddComment={handleAddComment}
                onUpdateComment={handleUpdateComment}
                onRemoveComment={handleRemoveComment}
              />
            ) : (
              <EmptyState />
            )}

            {/* Floating button to send all comments */}
            {nonEmptyCommentCount > 0 && (
              <div className="absolute bottom-4 right-4 z-10">
                <Button
                  onClick={handleSendAllComments}
                  className="shadow-lg bg-blue-500 hover:bg-blue-600 text-white"
                  size="sm"
                >
                  <MessageSquarePlus className="w-4 h-4 mr-2" />
                  <Trans
                    id="diff.line_comment.send_all"
                    values={{ count: nonEmptyCommentCount }}
                  />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation dialog for closing with unsent comments */}
      <Dialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
        <DialogContent className="max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              <Trans id="diff.close_confirm.title" />
            </DialogTitle>
            <DialogDescription>
              <Trans
                id="diff.close_confirm.description"
                values={{ count: nonEmptyCommentCount }}
              />
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCloseConfirm(false)}
            >
              <Trans id="diff.close_confirm.cancel" />
            </Button>
            <Button variant="destructive" onClick={handleForceHide}>
              <Trans id="diff.close_confirm.confirm" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>,
    document.body,
  );
};
