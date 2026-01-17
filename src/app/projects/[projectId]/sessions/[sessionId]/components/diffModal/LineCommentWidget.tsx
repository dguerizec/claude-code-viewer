"use client";

import { Trans, useLingui } from "@lingui/react";
import { forwardRef, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  hasNonEmptyComment,
  type LineCommentData,
} from "@/contexts/DiffLineCommentContext";

interface LineCommentWidgetProps {
  filePath: string;
  lineNumber: number;
  initialComment: string;
  onCommentChange: (comment: string) => void;
  onCancel: () => void;
}

/**
 * LineCommentWidget - Widget for adding comments to diff lines.
 *
 * Uses forwardRef to properly handle refs that may be passed by the
 * @git-diff-view/react library when rendering extend lines.
 * Without forwardRef, React error #185 would be thrown:
 * "It is not supported to assign `ref` to a function component."
 */
export const LineCommentWidget = forwardRef<
  HTMLDivElement,
  LineCommentWidgetProps
>(function LineCommentWidget(
  { lineNumber, initialComment, onCommentChange, onCancel },
  ref,
) {
  const { i18n } = useLingui();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Use local state to avoid cursor jumping issues
  // The parent's renderExtendLine callback is memoized and won't re-render this widget
  // on every keystroke, so we need local state for responsive typing
  const [localComment, setLocalComment] = useState(initialComment);

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Sync local state to parent on change (debounced effect not needed for Map state)
  useEffect(() => {
    onCommentChange(localComment);
  }, [localComment, onCommentChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Close on Escape
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  /**
   * We use Tailwind's `!` prefix (e.g., `!bg-white`) to force `!important` on styles.
   * This is necessary because the @git-diff-view/react library applies its own CSS
   * that overrides normal Tailwind classes. The library's styles have higher specificity
   * due to its internal CSS structure, so we need `!important` to ensure our theme
   * colors (especially dark mode) are applied correctly.
   */
  return (
    <div
      ref={ref}
      className="diff-line-comment-widget p-3 !bg-[#f6f8fa] dark:!bg-[#161b22]"
    >
      {/* Title */}
      <div className="text-sm mb-2 !text-[#57606a] dark:!text-[#8b949e]">
        <Trans id="diff.line_comment.title" values={{ line: lineNumber }} />
      </div>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={localComment}
        onChange={(e) => setLocalComment(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={i18n._("diff.line_comment.placeholder")}
        className="resize-none rounded-lg focus-visible:ring-1 focus-visible:ring-ring px-3 py-2 text-base min-h-[80px] mb-2 w-full !bg-white dark:!bg-[#0d1117] !text-[#1f2328] dark:!text-[#e6edf3] !border !border-[#d0d7de] dark:!border-[#30363d] placeholder:!text-[#6e7781] dark:placeholder:!text-[#8b949e]"
      />

      {/* Button row */}
      <div className="flex items-center justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          className="!bg-[#f6f8fa] hover:!bg-[#f3f4f6] !text-[#24292f] !border-[#d0d7de] dark:!bg-[#21262d] dark:hover:!bg-[#30363d] dark:!text-[#c9d1d9] dark:!border-[#30363d]"
        >
          <Trans id="diff.line_comment.cancel" />
        </Button>
      </div>
    </div>
  );
});

/**
 * Formats a line comment into a markdown block for the chat textarea.
 *
 * Format:
 * ---
 *
 * file:line
 * ```lang
 * code
 * ```
 *
 * user comment (can be multiline)
 */
export function formatLineCommentBlock(data: LineCommentData): string {
  const lang = getLangFromFileName(data.filePath);
  const lines = [
    "---",
    "",
    `${data.filePath}:${data.lineNumber}`,
    `\`\`\`${lang}`,
    data.lineContent.trimEnd(),
    "```",
  ];

  if (data.comment) {
    lines.push("");
    lines.push(data.comment);
  }

  return lines.join("\n");
}

/**
 * Formats multiple comments into a single string for the chat textarea.
 * Only includes comments with non-empty content.
 */
export function formatAllComments(comments: LineCommentData[]): string {
  return comments
    .filter(hasNonEmptyComment)
    .map(formatLineCommentBlock)
    .join("\n\n");
}

function getLangFromFileName(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    md: "markdown",
    css: "css",
    scss: "scss",
    html: "html",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    sh: "bash",
    yaml: "yaml",
    yml: "yaml",
    xml: "xml",
    sql: "sql",
    php: "php",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
  };
  return langMap[ext] ?? "";
}
