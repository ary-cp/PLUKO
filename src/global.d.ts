import type { RpaRow } from './types';

declare global {
  interface Window {
    initializeRpaStream: (
      callback: (incomingBatch: RpaRow[]) => void,
      csvUrl?: string
    ) => Promise<void>;
  }
}

export {};
