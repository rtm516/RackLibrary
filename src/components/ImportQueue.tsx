import { useRef } from 'react';
import { Link } from 'react-router';
import type { Job } from '../hooks/useImports';
import { routePath } from '../hooks/useRoute';
import { AlertIcon, CheckIcon, CloseIcon, DownloadIcon, LoaderIcon, UploadIcon } from './Icons';
import { Progress } from './Progress';
import { btn } from './ui';

interface Props {
  jobs: Job[];
  onDismiss: (id: string) => void;
  onResume: (id: string, file: File) => void;
}

const BORDER: Partial<Record<Job['status'], string>> = { error: 'border-danger', blocked: 'border-warn' };

function StatusIcon({ status }: { status: Job['status'] }) {
  const cls = 'mt-px flex-none';
  if (status === 'done') return <CheckIcon className={`${cls} text-ok`} />;
  if (status === 'error') return <AlertIcon className={`${cls} text-danger`} />;
  if (status === 'blocked') return <AlertIcon className={`${cls} text-warn`} />;
  return <LoaderIcon className={cls} />;
}

function JobCard({ job, onDismiss, onResume }: { job: Job } & Omit<Props, 'jobs'>) {
  const input = useRef<HTMLInputElement>(null);
  const active = job.status === 'queued' || job.status === 'downloading' || job.status === 'converting';

  return (
    <div className={`flex animate-fade flex-col gap-2 rounded-lg border bg-surface py-3 pr-3 pl-3.5 text-[13px] shadow-pop ${BORDER[job.status] ?? 'border-line'}`} role="status">
      <div className="flex items-start gap-2">
        <StatusIcon status={job.status} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold" title={job.title}>
            {job.title}
          </div>
          <div className={`break-words whitespace-pre-line ${job.status === 'error' ? 'text-danger' : 'text-fg-muted'}`}>{job.message}</div>
        </div>
        {!active && (
          <button className={btn({ variant: 'ghost', size: 'sm', icon: true })} onClick={() => onDismiss(job.id)} aria-label="Dismiss">
            <CloseIcon size={14} />
          </button>
        )}
      </div>
      {active && <Progress fraction={job.fraction} />}
      {job.status === 'blocked' && job.catalog && (
        <div className="flex flex-wrap gap-1.5">
          <a className={btn({ variant: 'primary', size: 'sm' })} href={job.catalog.url} target="_blank" rel="noreferrer">
            <DownloadIcon size={14} /> Download file
          </a>
          <button className={btn({ size: 'sm' })} onClick={() => input.current?.click()}>
            <UploadIcon size={14} /> Choose downloaded file
          </button>
          <input
            ref={input}
            type="file"
            hidden
            accept=".zip,.vss,.vssx,.vssm,.vsd,.vsdx"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onResume(job.id, f);
              e.target.value = '';
            }}
          />
        </div>
      )}
      {job.status === 'done' && job.packId && (
        <div className="flex flex-wrap gap-1.5">
          <Link className={btn({ size: 'sm' })} to={routePath({ page: 'library', packId: job.packId })}>
            View shapes
          </Link>
        </div>
      )}
    </div>
  );
}

export function ImportQueue({ jobs, onDismiss, onResume }: Props) {
  if (!jobs.length) return null;
  return (
    <div className="fixed right-4 bottom-4 z-30 flex w-[min(380px,calc(100vw-32px))] flex-col gap-2" aria-live="polite">
      {jobs.map((j) => (
        <JobCard key={j.id} job={j} onDismiss={onDismiss} onResume={onResume} />
      ))}
    </div>
  );
}
