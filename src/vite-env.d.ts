/// <reference types="vite/client" />

import type { BrainApi } from "../electron/preload";

declare global {
  interface Window {
    brainApi?: BrainApi;
  }
}
