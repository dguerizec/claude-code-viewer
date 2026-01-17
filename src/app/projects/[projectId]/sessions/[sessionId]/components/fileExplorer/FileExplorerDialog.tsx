"use client";

import { Trans, useLingui } from "@lingui/react";
import { FolderOpen, MessageSquarePlus, X } from "lucide-react";
import type { FC, ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useFileExplorerComment } from "@/contexts/FileExplorerCommentContext";
import { usePersistentDialog } from "@/contexts/PersistentDialogsContext";
import { useFileLineComments } from "@/hooks/useFileLineComments";
import { cn } from "@/lib/utils";
import { formatFileLineComments } from "@/lib/utils/fileLineComments";
import { EmptyState } from "./EmptyState";
import { FileTree } from "./FileTree";
import { FileViewer } from "./FileViewer";
import { DEFAULT_FILE_VIEW_OPTIONS, type FileViewOptions } from "./types";

export interface FileExplorerDialogProps {
  projectId: string;
  projectPath: string;
  projectName: string;
}

/**
 * Checkbox toggle for view options (Wrap, Syntax)
 * Uses the same pattern as DiffOptionToggle in DiffViewer.tsx for UI consistency.
 */
const OptionToggle: FC<{
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ label, checked, onChange }) => {
  const id = useId();
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
      />
      <label
        htmlFor={id}
        className="text-xs text-gray-600 dark:text-gray-400 cursor-pointer select-none"
      >
        {label}
      </label>
    </div>
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

  // Use shared hook for comment management
  const {
    comments,
    handleAddComment,
    handleUpdateComment,
    handleRemoveComment,
    resetComments,
    nonEmptyCommentCount,
    commentCountByFile,
  } = useFileLineComments({
    setContextCommentCount: setNonEmptyCommentCount,
  });

  // Local state
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [viewOptions, setViewOptions] = useState<FileViewOptions>(
    DEFAULT_FILE_VIEW_OPTIONS,
  );

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

  // Send all comments to chat
  const handleSendAllComments = useCallback(() => {
    if (nonEmptyCommentCount === 0) return;

    const commentsArray = Array.from(comments.values());
    const formatted = formatFileLineComments(commentsArray);
    insertText(formatted);

    // Clear all comments after sending
    resetComments();

    // Minimize dialog and focus chat input (focus happens in insertText callback)
    hideDialog();
  }, [comments, insertText, nonEmptyCommentCount, resetComments, hideDialog]);

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
            <OptionToggle
              label={<Trans id="diff.options.wrap" />}
              checked={viewOptions.wrap}
              onChange={(wrap) => setViewOptions((prev) => ({ ...prev, wrap }))}
            />
            <OptionToggle
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
