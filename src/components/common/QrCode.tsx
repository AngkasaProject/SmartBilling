import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface Props {
  value: string;
  size?: number;
  className?: string;
}

export const QrCode: React.FC<Props> = ({ value, size = 160, className = '' }) => {
  const [source, setSource] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (!value.trim()) {
      setSource('');
      setError('QR tidak memiliki data.');
      return () => {
        active = false;
      };
    }
    QRCode.toDataURL(value, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: size,
      color: { dark: '#0f172a', light: '#ffffff' },
    }).then(dataUrl => {
      if (active) {
        setSource(dataUrl);
        setError('');
      }
    }).catch(qrError => {
      if (active) setError(qrError instanceof Error ? qrError.message : String(qrError));
    });
    return () => {
      active = false;
    };
  }, [value, size]);

  if (error) return <span role="img" aria-label="QR code tidak tersedia" className={`inline-block rounded bg-rose-50 p-2 text-[9px] text-rose-700 ${className}`}>{error}</span>;
  if (!source) return <span aria-label="Membuat QR code" className={`inline-block animate-pulse rounded bg-slate-100 ${className}`} style={{ width: size + 16, height: size + 16 }} />;

  return (
    <span className={`inline-flex rounded-xl bg-white p-2 shadow-inner ${className}`}>
      <img src={source} width={size} height={size} alt={`QR code ${value}`} className="block" />
    </span>
  );
};
