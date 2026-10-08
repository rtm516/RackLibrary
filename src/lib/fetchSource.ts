// Downloads a stencil archive straight from its official URL, in the browser.
// Most stencil hosts do not send CORS headers, so this often fails; the UI then
// falls back to "download it yourself and drop it here". Users can optionally
// configure their own CORS proxy.

export class BlockedDownloadError extends Error {
  constructor(public url: string) {
    super('The download server does not allow direct browser downloads (CORS).');
  }
}

export function proxiedUrl(template: string, url: string): string {
  return template.includes('{url}') ? template.replace('{url}', encodeURIComponent(url)) : template + encodeURIComponent(url);
}

async function readWithProgress(res: Response, onProgress?: (loaded: number, total?: number) => void): Promise<ArrayBuffer> {
  const total = Number(res.headers.get('content-length')) || undefined;
  if (!res.body || !onProgress) return res.arrayBuffer();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(loaded, total);
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out.buffer;
}

export async function downloadSource(
  url: string,
  proxyTemplate: string | undefined,
  onProgress?: (loaded: number, total?: number) => void,
): Promise<ArrayBuffer> {
  const attempts = [url];
  if (proxyTemplate?.trim()) attempts.push(proxiedUrl(proxyTemplate.trim(), url));
  let lastError: unknown;
  for (const target of attempts) {
    try {
      const res = await fetch(target, { mode: 'cors', credentials: 'omit', redirect: 'follow' });
      if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
      return await readWithProgress(res, onProgress);
    } catch (err) {
      lastError = err;
    }
  }
  // fetch() rejects with a bare TypeError when CORS blocks the response.
  if (lastError instanceof TypeError) throw new BlockedDownloadError(url);
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** The file name a browser will save for this URL, e.g. "Fortinet Visio Stencil.zip". */
export function urlFileName(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() ?? url);
  } catch {
    return url;
  }
}
