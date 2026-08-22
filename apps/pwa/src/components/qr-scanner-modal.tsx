import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Loader2, AlertTriangle } from 'lucide-react';
import QrScanner from 'qr-scanner';

interface Props {
  open: boolean;
  onClose: () => void;
  onResult: (text: string) => void;
}

export function QrScannerModal({ open, onClose, onResult }: Props) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setReady(false);

    async function start() {
      if (!videoRef.current) return;
      try {
        scannerRef.current = new QrScanner(
          videoRef.current,
          (result) => onResult(result.data),
          {
            preferredCamera: 'environment',
            highlightScanRegion: true,
            highlightCodeOutline: true,
            maxScansPerSecond: 5,
          },
        );
        await scannerRef.current.start();
        if (!cancelled) setReady(true);
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Camera unavailable';
          setError(msg);
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      scannerRef.current?.stop();
      scannerRef.current?.destroy();
      scannerRef.current = null;
    };
  }, [open, onResult]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between px-3 pt-[max(env(safe-area-inset-top),0.75rem)] pb-2">
        <span className="text-sm font-medium">{t('pwa.scan.title')}</span>
        <button
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
          aria-label={t('common.cancel') as string}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          muted
        />
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 p-6 text-center">
            <AlertTriangle className="h-8 w-8 text-yellow-400" />
            <p className="text-sm font-medium">{t('pwa.scan.cameraError')}</p>
            <p className="text-xs text-white/70">{error}</p>
          </div>
        )}
      </div>

      <p className="px-6 py-3 pb-[max(env(safe-area-inset-bottom),1rem)] text-center text-xs text-white/70">
        {t('pwa.scan.hint')}
      </p>
    </div>
  );
}
