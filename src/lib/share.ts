import { toast } from 'sonner';
import { t } from '@/i18n';

export function pageLink(params: Record<string, string | number>): string {
  const hash = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `${location.origin}${location.pathname}#${hash}`;
}

export async function shareLink(data: { title: string; text: string; url: string }) {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share(data);
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(data.url);
    toast.success(t('sonde.share.linkCopied'));
  } catch {
    toast.error(t('sonde.copy.error'));
  }
}
