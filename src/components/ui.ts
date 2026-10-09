// Tailwind class sets for the few controls used all over the app.

const BTN_VARIANTS = {
  default: 'border-line bg-surface text-fg hover:bg-surface-2',
  primary: 'border-accent bg-accent text-on-accent hover:bg-accent-hover',
  ghost: 'border-transparent bg-transparent text-fg hover:bg-surface-2',
  danger: 'border-line bg-surface text-danger hover:bg-surface-2',
};

export function btn({ variant = 'default', size = 'md', icon = false }: { variant?: keyof typeof BTN_VARIANTS; size?: 'sm' | 'md'; icon?: boolean } = {}) {
  const dims = size === 'sm' ? (icon ? 'size-[26px]' : 'h-[26px] px-2 text-[13px]') : icon ? 'size-8' : 'h-8 px-3';
  return `inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border font-medium whitespace-nowrap no-underline transition-colors hover:no-underline disabled:cursor-default disabled:opacity-55 ${dims} ${BTN_VARIANTS[variant]}`;
}

export const input =
  'h-8 min-w-0 rounded-md border border-line bg-surface px-2.5 focus:border-accent focus:ring-3 focus:ring-accent-soft focus:outline-none';

const BADGE_TONES = {
  neutral: 'bg-surface-2 text-fg-muted',
  accent: 'bg-accent-soft text-accent',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
};

export const badge = (tone: keyof typeof BADGE_TONES = 'neutral') =>
  `inline-flex h-5 items-center gap-1 rounded px-1.5 text-[11.5px] font-semibold whitespace-nowrap ${BADGE_TONES[tone]}`;

/** Label wrapping a checkbox (or a short control) and its text. */
export const check = 'inline-flex cursor-pointer items-center gap-1.5 text-fg-muted select-none [&_input]:m-0 [&_input]:accent-accent';

/** Segmented control: a group of aria-pressed buttons. */
export const chips = 'inline-flex overflow-hidden rounded-md border border-line bg-surface';
export const chip =
  'h-[30px] cursor-pointer border-r border-line px-2.5 text-fg-muted last:border-r-0 aria-pressed:bg-accent-soft aria-pressed:font-semibold aria-pressed:text-accent';

/** Modal backdrop. Callers set the z-index. */
export const scrim = 'fixed inset-0 animate-fade bg-[rgb(10_14_20/0.45)]';

/** Label + controls rows in the export forms. */
export const formRow = 'flex flex-wrap items-center gap-x-3 gap-y-2';
export const formLabel = 'w-[92px] text-[13px] text-fg-muted';
export const hint = 'text-[12.5px] text-fg-subtle';

/** Main content column and its header. */
export const page = 'max-w-[1600px] px-4 pt-4 pb-16 md:px-6 md:pt-5';
export const pageHeader = 'mb-4 flex flex-wrap items-end gap-3';
export const pageTitle = 'm-0 text-xl leading-tight font-bold';
export const pageSub = 'mt-0.5 text-[13px] text-fg-subtle';
