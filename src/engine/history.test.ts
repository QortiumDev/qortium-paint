import { describe, expect, it } from 'vitest';
import { SnapshotHistory } from './history';

describe('SnapshotHistory', () => {
  it('starts empty and becomes navigable after reset + record', () => {
    const history = new SnapshotHistory<string>();

    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(history.current).toBeNull();

    history.reset('base');
    expect(history.current).toBe('base');
    expect(history.canUndo).toBe(false);

    history.record('a');
    expect(history.current).toBe('a');
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
  });

  it('undoes and redoes in order', () => {
    const history = new SnapshotHistory<string>();

    history.reset('base');
    history.record('a');
    history.record('b');

    expect(history.undo()).toBe('a');
    expect(history.undo()).toBe('base');
    expect(history.undo()).toBeNull();
    expect(history.canUndo).toBe(false);

    expect(history.redo()).toBe('a');
    expect(history.redo()).toBe('b');
    expect(history.redo()).toBeNull();
    expect(history.canRedo).toBe(false);
  });

  it('truncates the redo branch when recording after an undo', () => {
    const history = new SnapshotHistory<string>();

    history.reset('base');
    history.record('a');
    history.record('b');
    history.undo();
    history.record('c');

    expect(history.canRedo).toBe(false);
    expect(history.current).toBe('c');
    expect(history.undo()).toBe('a');
    expect(history.redo()).toBe('c');
  });

  it('caps stored undo steps and drops the oldest snapshots', () => {
    const history = new SnapshotHistory<string>(40);

    history.reset('base');

    for (let i = 1; i <= 60; i += 1) {
      history.record(`s${i}`);
    }

    let undos = 0;

    while (history.canUndo) {
      history.undo();
      undos += 1;
    }

    // Exactly 40 undo steps survive; the oldest reachable state is s20.
    expect(undos).toBe(40);
    expect(history.current).toBe('s20');
  });

  it('rejects a non-positive cap', () => {
    expect(() => new SnapshotHistory<string>(0)).toThrow();
    expect(() => new SnapshotHistory<string>(1.5)).toThrow();
  });
});
