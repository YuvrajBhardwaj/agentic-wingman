export interface GitFileStatus {
  readonly path: string;
  /** Porcelain index (staged) status code, e.g. "M", "A", "?". */
  readonly index: string;
  /** Porcelain working-tree status code. */
  readonly workingTree: string;
}

export interface GitDiffOptions {
  /** Diff staged changes against HEAD instead of the working tree. */
  readonly staged?: boolean;
  /** Limit the diff to these paths. */
  readonly paths?: readonly string[];
}

/**
 * Git integration used for edit safety: snapshot before changes, show a diff
 * after, commit with a generated message, or roll back to a snapshot.
 */
export interface GitService {
  isRepo(): Promise<boolean>;
  init(): Promise<void>;
  status(): Promise<readonly GitFileStatus[]>;
  diff(options?: GitDiffOptions): Promise<string>;
  currentBranch(): Promise<string | undefined>;
  /** Capture the full working tree (tracked + untracked) as a restore point; returns its id. */
  snapshot(label?: string): Promise<string>;
  /** Restore the working tree to a snapshot, removing files created since. */
  rollback(snapshotId: string): Promise<void>;
  /** Stage all and commit; returns the commit sha, or undefined if nothing changed. */
  commit(message: string): Promise<string | undefined>;
  /** A heuristic, human-readable summary of the current changes (for commit messages). */
  summarizeChanges(): Promise<string>;
}
