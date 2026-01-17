import { useLingui } from "@lingui/react";
import {
  CheckIcon,
  FileIcon,
  FolderCheckIcon,
  FolderIcon,
  SearchIcon,
} from "lucide-react";
import type React from "react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "../../../../../components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
} from "../../../../../components/ui/collapsible";
import { useFileCompletion } from "../../../../../hooks/useFileCompletion";
import { useFuzzyFileSearch } from "../../../../../hooks/useFuzzyFileSearch";
import { cn } from "../../../../../lib/utils";

type FileCompletionProps = {
  projectId: string;
  inputValue: string;
  cursorIndex: number;
  onFileSelect: (newMessage: string, newCursorPosition: number) => void;
  className?: string;
};

export type FileCompletionRef = {
  handleKeyDown: (e: React.KeyboardEvent) => boolean;
};

type CombinedEntry = {
  name: string;
  type: "file" | "directory" | "select-folder";
  path: string;
  source: "fuzzy" | "directory" | "action";
  score?: number;
};

// Parse the @ completion from input value, considering cursor position
const parseFileCompletionFromInput = (input: string, cursorIndex: number) => {
  // Find the last @ symbol BEFORE the cursor
  const textBeforeCursor = input.slice(0, cursorIndex);
  const lastAtIndex = textBeforeCursor.lastIndexOf("@");

  if (lastAtIndex === -1) {
    return {
      shouldShow: false,
      searchPath: "",
      beforeAt: "",
      textAfterCursor: "",
    };
  }

  // Get the text before @
  const beforeAt = input.slice(0, lastAtIndex);

  // The search path is the text between @ and cursor
  const searchPath = input.slice(lastAtIndex + 1, cursorIndex);

  // Text after the cursor (to preserve when selecting)
  const textAfterCursor = input.slice(cursorIndex);

  // Don't show completion if there's whitespace in the search path
  // (means user moved cursor past a completed path)
  const hasSpaceInSearchPath = /\s/.test(searchPath);

  return {
    shouldShow: !hasSpaceInSearchPath,
    searchPath,
    beforeAt,
    textAfterCursor,
  };
};

export const FileCompletion = forwardRef<
  FileCompletionRef,
  FileCompletionProps
>(({ projectId, inputValue, cursorIndex, onFileSelect, className }, ref) => {
  const { i18n } = useLingui();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  // Track the searchPath when user dismissed with Escape to prevent auto-reopen
  const [dismissedSearchPath, setDismissedSearchPath] = useState<string | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Parse the input to extract the path being completed
  const { shouldShow, searchPath, beforeAt, textAfterCursor } = useMemo(
    () => parseFileCompletionFromInput(inputValue, cursorIndex),
    [inputValue, cursorIndex],
  );

  // Track previous shouldShow to detect when completion is newly triggered
  const prevShouldShowRef = useRef(shouldShow);

  // Reset dismissed state when:
  // 1. searchPath changes (user typed something new after @)
  // 2. shouldShow transitions from false to true (user typed a new @)
  useEffect(() => {
    const prevShouldShow = prevShouldShowRef.current;
    prevShouldShowRef.current = shouldShow;

    if (dismissedSearchPath !== null) {
      // Reset if searchPath changed OR if shouldShow just became true
      // The latter handles the case where user types @, presses Escape,
      // deletes @, then types @ again (searchPath stays "" throughout)
      if (
        searchPath !== dismissedSearchPath ||
        (!prevShouldShow && shouldShow)
      ) {
        setDismissedSearchPath(null);
      }
    }
  }, [searchPath, dismissedSearchPath, shouldShow]);

  // Determine the base path and filter term
  const { basePath, filterTerm } = useMemo(() => {
    if (!searchPath) {
      return { basePath: "/", filterTerm: "" };
    }

    const lastSlashIndex = searchPath.lastIndexOf("/");
    if (lastSlashIndex === -1) {
      return { basePath: "/", filterTerm: searchPath };
    }

    const path = searchPath.slice(0, lastSlashIndex + 1);
    const term = searchPath.slice(lastSlashIndex + 1);
    return {
      basePath: path === "/" ? "/" : path,
      filterTerm: term,
    };
  }, [searchPath]);

  // Fetch file completion data for current directory
  const { data: completionData, isLoading: isLoadingCompletion } =
    useFileCompletion(projectId, basePath, shouldShow);

  // Fetch fuzzy search results (only when there's a search term)
  // Always search from root with the full searchPath as query
  // This allows "sto/t" to match "src/va/storages/types.py"
  const { data: fuzzyData, isLoading: isLoadingFuzzy } = useFuzzyFileSearch(
    projectId,
    "/", // Always search from root
    searchPath, // Use full searchPath as query (e.g., "sto/t")
    10,
    shouldShow && searchPath.length > 0,
  );

  // Filter directory entries based on the current filter term
  const filteredDirectoryEntries = useMemo(() => {
    if (!completionData?.entries) return [];

    if (!filterTerm) {
      return completionData.entries;
    }

    return completionData.entries.filter((entry) =>
      entry.name.toLowerCase().includes(filterTerm.toLowerCase()),
    );
  }, [completionData?.entries, filterTerm]);

  // Convert to combined entries format
  const directoryEntries: CombinedEntry[] = useMemo(
    () =>
      filteredDirectoryEntries.map((entry) => ({
        ...entry,
        source: "directory" as const,
      })),
    [filteredDirectoryEntries],
  );

  // Get fuzzy search entries (excluding entries already in current directory)
  const fuzzyEntries: CombinedEntry[] = useMemo(() => {
    if (!fuzzyData?.entries || !searchPath) return [];

    // Create a set of paths from directory entries for quick lookup
    const directoryPaths = new Set(directoryEntries.map((e) => e.path));

    return fuzzyData.entries
      .filter((entry) => !directoryPaths.has(entry.path))
      .map((entry) => ({
        ...entry,
        source: "fuzzy" as const,
      }));
  }, [fuzzyData?.entries, directoryEntries, searchPath]);

  // Create "Select this folder" action when we're inside a directory and not filtering
  const selectFolderEntry: CombinedEntry | null = useMemo(() => {
    // Don't show if we're at root, or if user is typing a filter term
    if (basePath === "/" || !basePath || filterTerm) return null;
    // Remove trailing slash to get the folder path
    const folderPath = basePath.endsWith("/")
      ? basePath.slice(0, -1)
      : basePath;
    const folderName = folderPath.split("/").pop() || folderPath;
    return {
      name: folderName,
      type: "select-folder" as const,
      path: folderPath,
      source: "action" as const,
    };
  }, [basePath, filterTerm]);

  // Combine all lists: select folder action first, then fuzzy results, then directory entries
  const allEntries = useMemo(() => {
    const entries: CombinedEntry[] = [];
    if (selectFolderEntry) {
      entries.push(selectFolderEntry);
    }
    entries.push(...fuzzyEntries, ...directoryEntries);
    return entries;
  }, [selectFolderEntry, fuzzyEntries, directoryEntries]);

  // Determine if completion should be shown
  const isLoading = isLoadingCompletion || (searchPath && isLoadingFuzzy);
  // Don't reopen if user dismissed with Escape and hasn't typed anything new
  const isDismissed = dismissedSearchPath === searchPath;
  const shouldBeOpen =
    shouldShow && !isLoading && allEntries.length > 0 && !isDismissed;

  // Update open state when it should change
  if (isOpen !== shouldBeOpen) {
    setIsOpen(shouldBeOpen);
    // Always select first item when opening
    setSelectedIndex(shouldBeOpen && allEntries.length > 0 ? 0 : -1);
  }

  // Always keep first item selected when list changes and dropdown is open
  useEffect(() => {
    if (isOpen && allEntries.length > 0) {
      setSelectedIndex(0);
    }
  }, [isOpen, allEntries]);

  // Handle file/directory selection with different behaviors for different triggers
  const handleEntrySelect = useCallback(
    (entry: CombinedEntry, forceClose = false) => {
      const fullPath = entry.path;

      // Determine the suffix based on entry type
      // For directories (not closing): add "/" to continue completion
      // For files or forced close: add " " to end completion (unless text already has space)
      const isDirectory = entry.type === "directory";
      const shouldContinueCompletion = isDirectory && !forceClose;

      let newMessage: string;
      let newCursorPosition: number;

      if (shouldContinueCompletion) {
        // Directory: add "/" and preserve text after cursor
        newMessage = `${beforeAt}@${fullPath}/${textAfterCursor}`;
        // Cursor after the "/"
        newCursorPosition = beforeAt.length + 1 + fullPath.length + 1;
      } else {
        // File or forced close: add space (if needed) and preserve text after cursor
        const needsSpace =
          textAfterCursor.length === 0 || !/^\s/.test(textAfterCursor);
        const spacer = needsSpace ? " " : "";
        newMessage = `${beforeAt}@${fullPath}${spacer}${textAfterCursor}`;
        // Cursor after the space (or at the position if no space added)
        newCursorPosition =
          beforeAt.length + 1 + fullPath.length + spacer.length;
      }

      onFileSelect(newMessage, newCursorPosition);

      // Close completion if it's a file, select-folder, or if forced to close
      if (
        entry.type === "file" ||
        entry.type === "select-folder" ||
        forceClose
      ) {
        setIsOpen(false);
        setSelectedIndex(-1);
        // Prevent auto-reopen by dismissing the new searchPath
        // After selection, the new searchPath will be the full path (before the space)
        setDismissedSearchPath(fullPath);
      }
    },
    [beforeAt, textAfterCursor, onFileSelect],
  );

  // Scroll to selected entry
  const scrollToSelected = useCallback((index: number) => {
    if (index >= 0 && listRef.current) {
      const buttons = listRef.current.querySelectorAll('button[role="option"]');
      const selectedButton = buttons[index] as HTMLElement | undefined;
      if (selectedButton) {
        selectedButton.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
      }
    }
  }, []);

  // Keyboard navigation
  const handleKeyboardNavigation = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!isOpen || allEntries.length === 0) return false;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => {
            const newIndex = prev < allEntries.length - 1 ? prev + 1 : 0;
            requestAnimationFrame(() => scrollToSelected(newIndex));
            return newIndex;
          });
          return true;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => {
            const newIndex = prev > 0 ? prev - 1 : allEntries.length - 1;
            requestAnimationFrame(() => scrollToSelected(newIndex));
            return newIndex;
          });
          return true;
        case "Home":
          e.preventDefault();
          setSelectedIndex(0);
          requestAnimationFrame(() => scrollToSelected(0));
          return true;
        case "End":
          e.preventDefault();
          setSelectedIndex(allEntries.length - 1);
          requestAnimationFrame(() => scrollToSelected(allEntries.length - 1));
          return true;
        case "Enter":
          if (selectedIndex >= 0 && selectedIndex < allEntries.length) {
            e.preventDefault();
            const selectedEntry = allEntries[selectedIndex];
            if (selectedEntry) {
              // Enter: for directories, enter into them (like Tab)
              // For files and select-folder, select and close
              const shouldClose =
                selectedEntry.type === "file" ||
                selectedEntry.type === "select-folder";
              handleEntrySelect(selectedEntry, shouldClose);
            }
            return true;
          }
          break;
        case "Tab":
          if (selectedIndex >= 0 && selectedIndex < allEntries.length) {
            e.preventDefault();
            const selectedEntry = allEntries[selectedIndex];
            if (selectedEntry) {
              // Tab: same behavior as Enter
              const shouldClose =
                selectedEntry.type === "file" ||
                selectedEntry.type === "select-folder";
              handleEntrySelect(selectedEntry, shouldClose);
            }
            return true;
          }
          break;
        case "Escape":
          e.preventDefault();
          setIsOpen(false);
          setSelectedIndex(-1);
          // Remember the current searchPath to prevent auto-reopen
          setDismissedSearchPath(searchPath);
          return true;
      }
      return false;
    },
    [
      isOpen,
      allEntries.length,
      selectedIndex,
      handleEntrySelect,
      scrollToSelected,
      searchPath,
      allEntries,
    ],
  );

  // Handle clicks outside the component
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Expose keyboard handler to parent
  useImperativeHandle(
    ref,
    () => ({
      handleKeyDown: handleKeyboardNavigation,
    }),
    [handleKeyboardNavigation],
  );

  if (!shouldShow || isLoading || allEntries.length === 0) {
    return null;
  }

  // Calculate the global index for each entry
  let globalIndex = 0;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleContent>
          <div
            ref={listRef}
            className="absolute z-50 w-full bg-popover border border-border rounded-lg shadow-xl overflow-y-auto"
            style={{ height: "20rem" }}
            role="listbox"
            aria-label={i18n._("Available files and directories")}
          >
            {/* Select this folder action */}
            {selectFolderEntry &&
              (() => {
                const currentIndex = globalIndex++;
                return (
                  <div className="p-1.5 border-b border-border/50">
                    <Button
                      key="select-folder"
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "w-full justify-start text-left font-mono text-sm h-9 px-3 min-w-0 transition-colors duration-150",
                        currentIndex === selectedIndex
                          ? "bg-gradient-to-r from-green-500/10 to-emerald-500/10 text-foreground border border-green-500/20"
                          : "hover:bg-accent/50",
                      )}
                      onClick={() => handleEntrySelect(selectFolderEntry, true)}
                      onMouseEnter={() => setSelectedIndex(currentIndex)}
                      role="option"
                      aria-selected={currentIndex === selectedIndex}
                      aria-label={i18n._("Select folder {name}", {
                        name: selectFolderEntry.name,
                      })}
                      title={selectFolderEntry.path}
                    >
                      <FolderCheckIcon className="w-3.5 h-3.5 mr-2 text-green-600 dark:text-green-500 flex-shrink-0" />
                      <span className="font-medium truncate min-w-0">
                        {i18n._("Select this folder")}
                      </span>
                      <span className="text-xs text-muted-foreground/70 ml-2 truncate">
                        ({selectFolderEntry.path})
                      </span>
                      {currentIndex === selectedIndex && (
                        <CheckIcon className="w-3.5 h-3.5 ml-auto text-green-600 dark:text-green-500 flex-shrink-0" />
                      )}
                    </Button>
                  </div>
                );
              })()}

            {/* Fuzzy search results section */}
            {fuzzyEntries.length > 0 && (
              <div className="p-1.5 border-b border-border/50">
                <div
                  className="px-3 py-2 text-xs font-semibold text-muted-foreground/80 mb-1 flex items-center gap-2"
                  role="presentation"
                >
                  <SearchIcon className="w-3.5 h-3.5" />
                  {i18n._("Search Results")} ({fuzzyEntries.length})
                </div>
                {fuzzyEntries.map((entry) => {
                  const currentIndex = globalIndex++;
                  return (
                    <Button
                      key={`fuzzy-${entry.path}`}
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "w-full justify-start text-left font-mono text-sm h-9 px-3 min-w-0 transition-colors duration-150",
                        currentIndex === selectedIndex
                          ? "bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-foreground border border-blue-500/20"
                          : "hover:bg-accent/50",
                      )}
                      onClick={() =>
                        handleEntrySelect(entry, entry.type === "file")
                      }
                      onMouseEnter={() => setSelectedIndex(currentIndex)}
                      role="option"
                      aria-selected={currentIndex === selectedIndex}
                      aria-label={`${entry.type}: ${entry.name}`}
                      title={entry.path}
                    >
                      {entry.type === "directory" ? (
                        <FolderIcon className="w-3.5 h-3.5 mr-2 text-blue-500 dark:text-blue-400 flex-shrink-0" />
                      ) : (
                        <FileIcon className="w-3.5 h-3.5 mr-2 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                      )}
                      <span className="flex-1 min-w-0 flex flex-col">
                        <span className="font-medium truncate">
                          {entry.name}
                        </span>
                        <span className="text-xs text-muted-foreground/70 truncate">
                          {entry.path}
                        </span>
                      </span>
                      {entry.type === "directory" && (
                        <span className="text-muted-foreground ml-1 flex-shrink-0">
                          /
                        </span>
                      )}
                      {currentIndex === selectedIndex && (
                        <CheckIcon className="w-3.5 h-3.5 ml-auto text-blue-600 dark:text-blue-400 flex-shrink-0" />
                      )}
                    </Button>
                  );
                })}
              </div>
            )}

            {/* Directory entries section */}
            {directoryEntries.length > 0 && (
              <div className="p-1.5">
                <div
                  className="px-3 py-2 text-xs font-semibold text-muted-foreground/80 mb-1 flex items-center gap-2"
                  role="presentation"
                >
                  <FileIcon className="w-3.5 h-3.5" />
                  {basePath === "/"
                    ? i18n._("Files & Directories")
                    : i18n._("In {path}", { path: basePath })}{" "}
                  ({directoryEntries.length})
                </div>
                {directoryEntries.map((entry) => {
                  const currentIndex = globalIndex++;
                  return (
                    <Button
                      key={`dir-${entry.path}`}
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "w-full justify-start text-left font-mono text-sm h-9 px-3 min-w-0 transition-colors duration-150",
                        currentIndex === selectedIndex
                          ? "bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-foreground border border-blue-500/20"
                          : "hover:bg-accent/50",
                      )}
                      onClick={() =>
                        handleEntrySelect(entry, entry.type === "file")
                      }
                      onMouseEnter={() => setSelectedIndex(currentIndex)}
                      role="option"
                      aria-selected={currentIndex === selectedIndex}
                      aria-label={`${entry.type}: ${entry.name}`}
                      title={entry.path}
                    >
                      {entry.type === "directory" ? (
                        <FolderIcon className="w-3.5 h-3.5 mr-2 text-blue-500 dark:text-blue-400 flex-shrink-0" />
                      ) : (
                        <FileIcon className="w-3.5 h-3.5 mr-2 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                      )}
                      <span className="font-medium truncate min-w-0">
                        {entry.name}
                      </span>
                      {entry.type === "directory" && (
                        <span className="text-muted-foreground ml-1 flex-shrink-0">
                          /
                        </span>
                      )}
                      {currentIndex === selectedIndex && (
                        <CheckIcon className="w-3.5 h-3.5 ml-auto text-blue-600 dark:text-blue-400 flex-shrink-0" />
                      )}
                    </Button>
                  );
                })}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
});

FileCompletion.displayName = "FileCompletion";
