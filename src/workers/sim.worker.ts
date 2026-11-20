/// <reference lib="webworker" />
/** Runs the Monte Carlo simulation off the main thread. */
import { simulate, type SimInput, type SimResult } from '@/engine/simulate';

export interface SimRequest {
  id: number;
  input: SimInput;
}
export interface SimResponse {
  id: number;
  result: SimResult;
}

self.onmessage = (e: MessageEvent<SimRequest>) => {
  const { id, input } = e.data;
  const result = simulate(input);
  (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, result } satisfies SimResponse);
};
