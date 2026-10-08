import { useCallback, useMemo, useRef, useState } from 'react';
import { matchCatalogFile } from '../catalog';
import { BlockedDownloadError, downloadSource, urlFileName } from '../lib/fetchSource';
import { importFile, prettyName } from '../lib/importer';
import type { CatalogPack } from '../lib/types';

export type JobStatus = 'queued' | 'downloading' | 'converting' | 'done' | 'error' | 'blocked';

export interface Job {
  id: string;
  title: string;
  status: JobStatus;
  message: string;
  fraction?: number;
  catalog?: CatalogPack;
  packId?: string;
}

const formatMB = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;

const newJob = (title: string, catalog?: CatalogPack): Job => ({ id: crypto.randomUUID(), title, status: 'queued', message: 'Waiting…', catalog });

export function useImports(onImported: () => void, proxyTemplate: string) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const proxyRef = useRef(proxyTemplate);
  proxyRef.current = proxyTemplate;
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  const patch = useCallback((id: string, p: Partial<Job>) => setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...p } : j))), []);

  const dismiss = useCallback((id: string) => setJobs((js) => js.filter((j) => j.id !== id)), []);

  const convert = useCallback(async (job: Job, fileName: string, data: ArrayBuffer) => {
    patch(job.id, { status: 'converting', message: 'Starting converter…', fraction: undefined });
    // Refresh the library as stencils land, at most twice a second.
    let lastRefresh = 0;
    const refresh = () => {
      if (Date.now() - lastRefresh < 500) return;
      lastRefresh = Date.now();
      onImported();
    };
    const result = await importFile(
      { fileName, data, name: job.catalog?.name, vendor: job.catalog?.vendor, catalogId: job.catalog?.id, sourceUrl: job.catalog?.url },
      (p) => patch(job.id, { message: p.message, fraction: p.fraction }),
      refresh,
    );
    const notes = [
      ...(result.errors.length ? [`${result.errors.length} file(s) skipped: ${result.errors.slice(0, 3).join('; ')}`] : []),
      ...(result.warnings.length ? [`${result.warnings.length} warning(s): ${result.warnings.slice(0, 3).join('; ')}`] : []),
    ];
    const updatedNote = result.updated ? ' (updated the existing pack)' : '';
    const n = result.stencils.length;
    patch(job.id, {
      status: 'done',
      packId: result.pack.id,
      fraction: 1,
      message: [`${result.pack.shapeCount.toLocaleString()} shapes from ${n} stencil${n === 1 ? '' : 's'}${updatedNote}`, ...notes].join('\n'),
    });
    // Keep notes on screen until dismissed; clean imports clear themselves.
    if (!notes.length) setTimeout(() => dismiss(job.id), 6000);
  }, [patch, dismiss, onImported]);

  /**
   * Queues a job. Imports are serialized: converting several large stencil packs
   * at once would exhaust memory. A new job for a catalog entry replaces any
   * blocked job for the same entry.
   */
  const enqueue = useCallback((job: Job, getData: () => Promise<{ fileName: string; data: ArrayBuffer }>) => {
    setJobs((js) => [...js.filter((j) => !(job.catalog && j.catalog?.id === job.catalog.id && j.status === 'blocked')), job]);
    const run = async () => {
      try {
        const { fileName, data } = await getData();
        await convert(job, fileName, data);
      } catch (err) {
        if (err instanceof BlockedDownloadError) {
          patch(job.id, {
            status: 'blocked',
            fraction: undefined,
            message: `${new URL(err.url).hostname} doesn't allow downloads from other websites. Download the file yourself, then drop it here (or choose it below).`,
          });
        } else {
          patch(job.id, { status: 'error', fraction: undefined, message: err instanceof Error ? err.message : String(err) });
        }
      }
      // A failed import may still have stored some stencils.
      onImported();
    };
    chain.current = chain.current.then(run, run);
  }, [patch, convert, onImported]);

  const importFiles = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        const catalog = await matchCatalogFile(file.name);
        enqueue(newJob(catalog?.name ?? prettyName(file.name), catalog), async () => ({ fileName: file.name, data: await file.arrayBuffer() }));
      }
    },
    [enqueue],
  );

  const importCatalog = useCallback(
    (entry: CatalogPack) => {
      const job = newJob(entry.name, entry);
      enqueue(job, async () => {
        patch(job.id, { status: 'downloading', message: `Downloading from ${new URL(entry.url).hostname}…` });
        const data = await downloadSource(entry.url, proxyRef.current, (loaded, total) =>
          patch(job.id, {
            message: `Downloading ${formatMB(loaded)}${total ? ` of ${formatMB(total)}` : ''}`,
            fraction: total ? loaded / total : undefined,
          }),
        );
        return { fileName: urlFileName(entry.url), data };
      });
    },
    [enqueue, patch],
  );

  /** Continues a blocked catalog import with a file the user downloaded manually. */
  const resumeWithFile = useCallback(
    (jobId: string, file: File) => {
      const blocked = jobsRef.current.find((j) => j.id === jobId);
      if (blocked) enqueue(newJob(blocked.title, blocked.catalog), async () => ({ fileName: file.name, data: await file.arrayBuffer() }));
    },
    [enqueue],
  );

  const busyCatalogIds = useMemo(
    () => new Set(jobs.filter((j) => j.catalog && (j.status === 'queued' || j.status === 'downloading' || j.status === 'converting')).map((j) => j.catalog!.id)),
    [jobs],
  );

  return { jobs, importFiles, importCatalog, resumeWithFile, dismiss, busyCatalogIds };
}
