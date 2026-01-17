import type { FC } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDiffLineComment } from "@/contexts/DiffLineCommentContext";
import { useFileExplorerComment } from "@/contexts/FileExplorerCommentContext";
import { usePersistentDialogs } from "@/contexts/PersistentDialogsContext";
import { cn } from "@/lib/utils";

export const PersistentDialogIndicators: FC = () => {
  const context = usePersistentDialogs();
  const { nonEmptyCommentCount: diffCommentCount } = useDiffLineComment();
  const { nonEmptyCommentCount: fileExplorerCommentCount } =
    useFileExplorerComment();

  // When outside a provider (e.g., on project list page), render nothing
  if (!context || context.dialogs.size === 0) {
    return null;
  }

  const { dialogs, visibleDialogId, toggle } = context;

  return (
    <div className="flex flex-col p-2 space-y-1">
      {Array.from(dialogs.values()).map((dialog) => {
        const Icon = dialog.icon;
        const isActive = visibleDialogId === dialog.id;
        // Show badge for git or file-explorer dialog based on their comment counts
        const badgeCount =
          dialog.id === "git"
            ? diffCommentCount
            : dialog.id === "file-explorer"
              ? fileExplorerCommentCount
              : 0;

        return (
          <Tooltip key={dialog.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => toggle(dialog.id)}
                className={cn(
                  "w-8 h-8 flex items-center justify-center rounded-md transition-colors relative",
                  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                    : "text-sidebar-foreground/70",
                )}
                data-testid={`persistent-dialog-${dialog.id}-button`}
              >
                <Icon className="w-4 h-4" />
                {badgeCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center text-[10px] font-medium bg-blue-500 text-white rounded-full px-1">
                    {badgeCount}
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>{dialog.label}</p>
              {dialog.description && (
                <p className="text-xs text-muted-foreground">
                  {dialog.description}
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
};
