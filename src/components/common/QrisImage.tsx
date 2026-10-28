import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

interface QrisImageProps {
  src: string;
  alt: string;
  className?: string;
}

export const QrisImage: React.FC<QrisImageProps> = ({ src, alt, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const extension = src.toLowerCase().split('?')[0].endsWith('.jpg') ? 'jpg' : 'png';

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label={`${alt}. Klik untuk memperbesar`}
        title="Klik untuk memperbesar QRIS"
        className={`cursor-zoom-in rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${className}`}
      >
        <img src={src} alt={alt} className="h-full w-full object-contain" />
      </button>
      {isOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`QRIS diperbesar: ${alt}`}
          onMouseDown={event => {
            if (event.target === event.currentTarget) setIsOpen(false);
          }}
        >
          <div className="relative flex max-h-[95vh] w-full max-w-xl flex-col items-center rounded-2xl bg-white p-4 shadow-2xl sm:p-6">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Tutup tampilan QRIS"
              className="absolute right-2 top-2 rounded-full p-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            >
              <X className="h-5 w-5" />
            </button>
            <p className="mb-3 max-w-[80%] text-center text-sm font-semibold text-zinc-900">{alt}</p>
            <img src={src} alt={alt} className="max-h-[70vh] max-w-full object-contain" />
            <a
              href={src}
              download={`qris.${extension}`}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700"
            >
              <Download className="h-4 w-4" />
              Unduh QRIS
            </a>
          </div>
        </div>
      )}
    </>
  );
};
