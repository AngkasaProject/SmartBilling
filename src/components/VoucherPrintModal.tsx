import React, { useState } from 'react';
import { AppSettings, Voucher } from '../types';
import { QrCode } from './common/QrCode';
import { X, Printer, Wifi, Sparkles } from 'lucide-react';

interface Props {
  vouchers: Voucher[];
  settings: AppSettings;
  onClose: () => void;
}

export const VoucherPrintModal: React.FC<Props> = ({ vouchers, settings, onClose }) => {
  const [printLayout, setPrintLayout] = useState<'grid' | 'thermal'>('grid');
  const [ssidName, setSsidName] = useState(settings.defaultSsid);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl text-white shadow-2xl relative my-6 flex flex-col max-h-[92vh]">
        {/* Modal Controls (No print) */}
        <div className="no-print p-4 sm:p-5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-950">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              <Printer className="w-4 h-4 text-indigo-400" />
              <span>Cetak Voucher Hotspot ({vouchers.length} Voucher)</span>
            </h2>
            <p className="text-xs text-slate-400">Siap dicetak di kertas A4 (gunting) atau printer kasir thermal</p>
          </div>

          <div className="flex items-center gap-2.5">
            {/* SSID Setting */}
            <div className="hidden sm:flex items-center gap-1.5 bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800 text-xs">
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-slate-400">SSID:</span>
              <input
                type="text"
                value={ssidName}
                onChange={e => setSsidName(e.target.value)}
                className="bg-transparent border-none text-white text-xs font-mono font-semibold focus:outline-none w-36"
              />
            </div>

            {/* Layout switch */}
            <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-xs">
              <button
                onClick={() => setPrintLayout('grid')}
                className={`px-3 py-1 rounded-md font-medium transition ${
                  printLayout === 'grid' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Grid A4 (Kartu)
              </button>
              <button
                onClick={() => setPrintLayout('thermal')}
                className={`px-3 py-1 rounded-md font-medium transition ${
                  printLayout === 'thermal' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Thermal Slip (Kasir)
              </button>
            </div>

            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 font-semibold text-white text-xs rounded-lg shadow-lg shadow-indigo-600/30 transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak Sekarang</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Area */}
        <div className="overflow-y-auto p-6 bg-slate-950 flex-1">
          {printLayout === 'grid' ? (
            /* A4 Grid 2-3 Column Card Layout */
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {vouchers.map(v => (
                <div
                  key={v.id}
                  className="bg-white text-slate-900 rounded-xl p-4 border border-dashed border-slate-400 relative overflow-hidden shadow-sm flex flex-col justify-between"
                  style={{ minHeight: '180px' }}
                >
                  {/* Top Bar */}
                  <div className="flex items-start justify-between border-b border-slate-200 pb-2 mb-2.5">
                    <div className="min-w-0 flex-1">
                      {settings.brandMainLogoDataUrl || settings.brandLogoDataUrl ? (
                        <img
                          src={settings.brandMainLogoDataUrl || settings.brandLogoDataUrl}
                          alt={settings.brandName || settings.appName}
                          className="h-8 w-36 max-w-full object-contain object-left"
                        />
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white">
                            {settings.brandIconDataUrl
                              ? <img src={settings.brandIconDataUrl} alt="" className="h-full w-full rounded-lg bg-white object-contain p-0.5" />
                              : (settings.brandName || settings.appName || 'S').charAt(0)}
                          </div>
                          <h4 className="truncate font-extrabold text-xs tracking-tight text-slate-900">{settings.brandName || settings.appName}</h4>
                        </div>
                      )}
                      <p className="flex items-center gap-1 text-[9px] font-mono text-slate-500">
                        <Wifi className="h-2.5 w-2.5" /> {ssidName}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="block text-[8px] font-bold uppercase tracking-wider text-slate-400">
                        Paket
                      </span>
                      <span className="block max-w-32 truncate text-[10px] font-bold text-indigo-700">
                        {v.profileName}
                      </span>
                      <p className="text-xs font-black text-slate-900 mt-0.5">
                        Rp {v.price.toLocaleString('id-ID')}
                      </p>
                    </div>
                  </div>

                  {/* Body with QR & Code */}
                  <div className="my-1 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">
                        Username
                      </span>
                      <div className="max-w-36 truncate rounded border border-slate-200 bg-slate-100 px-2 py-1 font-mono text-sm font-black tracking-wider text-slate-900">
                        {v.code}
                      </div>
                      <div className="mt-1 text-[9px] leading-tight text-slate-500">
                        Password: <b className="break-all font-mono text-slate-700">{v.password || v.code}</b>
                      </div>
                      <div className="mt-1 text-[9px] text-slate-500">
                        Masa aktif: <b>{v.validityDuration}</b>
                      </div>
                    </div>

                    <div className="flex flex-col items-center">
                      <QrCode value={JSON.stringify({ username: v.code, password: v.password || v.code })} size={104} label={`Data login ${v.code}`} />
                      <span className="mt-0.5 text-[8px] font-medium text-slate-400">Scan untuk login</span>
                    </div>
                  </div>

                  {/* Footer instruction */}
                  <div className="mt-2 pt-2 border-t border-slate-100 text-[9px] text-slate-400 flex items-center justify-between">
                    <span>Scan QR atau masukkan username & password</span>
                    <span>1 User</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Thermal Receipt 58mm/80mm Style */
            <div className="flex flex-col items-center gap-6">
              {vouchers.map(v => (
                <div
                  key={v.id}
                  className="bg-white text-slate-900 w-72 p-4 font-mono text-center border border-dashed border-slate-300 shadow-md rounded"
                >
                  {settings.brandMainLogoDataUrl || settings.brandLogoDataUrl
                    ? <img src={settings.brandMainLogoDataUrl || settings.brandLogoDataUrl} alt={settings.brandName || settings.appName} className="mx-auto h-10 w-40 object-contain" />
                    : <p className="font-extrabold text-sm uppercase tracking-wide">*** {settings.brandName || settings.appName} ***</p>}
                  <p className="text-[11px] text-slate-600">SSID: {ssidName}</p>
                  <p className="text-[10px] text-slate-400">--------------------------------</p>

                  <div className="my-2">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Paket</p>
                    <p className="text-xs font-bold text-indigo-700">{v.profileName}</p>
                    <p className="text-sm font-black text-slate-900">Rp {v.price.toLocaleString('id-ID')}</p>
                  </div>

                  <p className="text-[10px] text-slate-400">--------------------------------</p>

                  <div className="my-3">
                    <span className="text-[10px] uppercase text-slate-500">Username:</span>
                    <p className="text-xl font-black text-slate-900 tracking-widest my-1 bg-slate-100 py-1 rounded border border-slate-200">
                      {v.code}
                    </p>
                    <p className="text-xs text-slate-600">Password: <b className="font-mono text-slate-900">{v.password || v.code}</b></p>
                  </div>

                  <div className="flex justify-center my-2">
                    <QrCode value={JSON.stringify({ username: v.code, password: v.password || v.code })} size={128} label={`Data login ${v.code}`} />
                  </div>

                  <p className="text-[10px] text-slate-500">Masa aktif: {v.validityDuration}</p>
                  <p className="text-[9px] text-slate-400 mt-2">
                    1. Hubungkan HP ke WiFi {ssidName}<br />
                    2. Scan QR atau masukkan username & password<br />
                    Terima Kasih & Selamat Berinternet!
                  </p>
                  <p className="text-[8px] text-slate-400 mt-2">Batch: {v.batchCode}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
