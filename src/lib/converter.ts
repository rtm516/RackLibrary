import type { RawStencil } from './types';
import type { WorkerRequest, WorkerResponse } from './converter.worker';

type Pending = {
  resolve: (count: number) => void;
  reject: (e: Error) => void;
  onProgress?: (message: string, done: number, total: number) => void;
  onStencil: (stencil: RawStencil, done: number, total: number) => Promise<void>;
};

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./converter.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const msg = e.data;
    const p = pending.get(msg.id);
    if (!p) return;
    if (msg.type === 'progress') p.onProgress?.(msg.message, msg.done, msg.total);
    else if (msg.type === 'stencil') {
      // Acknowledge only once the stencil is stored, so the worker can't run ahead.
      const ack = () => worker?.postMessage({ id: msg.id, type: 'ack' } satisfies WorkerRequest);
      p.onStencil(msg.stencil, msg.done, msg.total).then(ack, (err) => {
        ack();
        console.error(err);
      });
    } else {
      pending.delete(msg.id);
      if (msg.type === 'result') p.resolve(msg.count);
      else p.reject(new Error(msg.message));
    }
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || 'Converter crashed'));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

const wasmUrl = () => new URL('wasm/visio2svg.js', document.baseURI).href;

/**
 * Converts a Visio file (or a zip of them) into raw per-master SVG. Stencils are
 * handed to onStencil one at a time; resolves with the number of files seen.
 */
export function convertFile(
  fileName: string,
  data: ArrayBuffer,
  onStencil: Pending['onStencil'],
  onProgress?: Pending['onProgress'],
): Promise<number> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject, onProgress, onStencil });
    const req: WorkerRequest = { id, type: 'convert', wasmUrl: wasmUrl(), fileName, data };
    getWorker().postMessage(req, [data]);
  });
}
