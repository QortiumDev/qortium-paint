// Generic snapshot-based undo/redo. The engine stores document snapshots as
// PNG data URLs (compressed, memory-sane versus raw ImageData), but this
// class is deliberately snapshot-type-agnostic so it stays unit-testable.

export const DEFAULT_HISTORY_CAP = 40;

export class SnapshotHistory<T> {
  private entries: T[] = [];
  private index = -1;
  private readonly maxUndoSteps: number;

  // `maxUndoSteps` caps how many undos are possible (stored snapshots are
  // capped at maxUndoSteps + 1, since the baseline snapshot is also kept).
  constructor(maxUndoSteps: number = DEFAULT_HISTORY_CAP) {
    if (!Number.isInteger(maxUndoSteps) || maxUndoSteps < 1) {
      throw new Error('maxUndoSteps must be a positive integer');
    }

    this.maxUndoSteps = maxUndoSteps;
  }

  get canUndo(): boolean {
    return this.index > 0;
  }

  get canRedo(): boolean {
    return this.index < this.entries.length - 1;
  }

  // Snapshot the history is currently pointing at (null before reset()).
  get current(): T | null {
    return this.index >= 0 ? (this.entries[this.index] ?? null) : null;
  }

  // Drops everything and installs `initial` as the new baseline.
  reset(initial: T): void {
    this.entries = [initial];
    this.index = 0;
  }

  // Records the document state after a committed operation. Truncates any
  // redo branch, then enforces the cap by dropping the oldest snapshots.
  record(snapshot: T): void {
    if (this.index < this.entries.length - 1) {
      this.entries.length = this.index + 1;
    }

    this.entries.push(snapshot);

    const maxEntries = this.maxUndoSteps + 1;

    if (this.entries.length > maxEntries) {
      this.entries.splice(0, this.entries.length - maxEntries);
    }

    this.index = this.entries.length - 1;
  }

  undo(): T | null {
    if (!this.canUndo) {
      return null;
    }

    this.index -= 1;

    return this.entries[this.index] ?? null;
  }

  redo(): T | null {
    if (!this.canRedo) {
      return null;
    }

    this.index += 1;

    return this.entries[this.index] ?? null;
  }
}
