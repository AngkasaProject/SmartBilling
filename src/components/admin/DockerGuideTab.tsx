import React, { useState } from 'react';
import { getDockerConfig } from '../../services/mikrotikScripts';
import {
  Boxes,
  Copy,
  Check,
  Terminal,
  ShieldCheck,
  Server,
  ExternalLink,
  Cpu,
  Layers,
  ArrowRight
} from 'lucide-react';

export const DockerGuideTab: React.FC = () => {
  const [activeFile, setActiveFile] = useState<'compose' | 'dockerfile' | 'nginx'>('compose');
  const [copied, setCopied] = useState(false);
  const configs = getDockerConfig();

  const getFileContent = () => {
    if (activeFile === 'compose') return configs.dockerCompose;
    if (activeFile === 'dockerfile') return configs.dockerfile;
    return configs.nginxConf;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getFileContent());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Intro Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg">
            <Boxes className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white">Panduan Deployment Docker & VPS Cloud</h2>
            <p className="text-xs text-slate-400">
              Jalankan platform billing di Docker Container (Ubuntu/Debian VPS) dengan zero-downtime dan auto-restart
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-800 text-xs">
          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
            <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Multi-Stage Build</span>
            <div className="font-bold text-white mt-1">Node 20 Alpine Linux</div>
            <p className="text-[10px] text-slate-500 mt-0.5">Ukuran image ramping &lt; 150MB</p>
          </div>
          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
            <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">High Availability</span>
            <div className="font-bold text-emerald-400 mt-1">Restart: unless-stopped</div>
            <p className="text-[10px] text-slate-500 mt-0.5">Auto recovery saat server reboot</p>
          </div>
          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
            <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Healthcheck Built-In</span>
            <div className="font-bold text-indigo-400 mt-1">GET /api/health</div>
            <p className="text-[10px] text-slate-500 mt-0.5">Monitoring kondisi container 30s</p>
          </div>
        </div>
      </div>

      {/* Quick Start Commands */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <h3 className="text-base font-bold text-white flex items-center gap-2 mb-3">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span>Langkah Cepat Deploy di VPS (Hanya 3 Perintah)</span>
        </h3>

        <div className="space-y-3 font-mono text-xs">
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-slate-500"># 1. Konfigurasi file environment (.env)</span>
              <p className="text-emerald-400 font-semibold mt-1">
                cp .env.example .env && nano .env
              </p>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText('cp .env.example .env && nano .env');
                alert('Tersalin!');
              }}
              className="text-slate-400 hover:text-white p-1"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-slate-500"># 2. Build image dan jalankan container di background</span>
              <p className="text-emerald-400 font-semibold mt-1">
                docker compose up -d --build
              </p>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText('docker compose up -d --build');
                alert('Tersalin!');
              }}
              className="text-slate-400 hover:text-white p-1"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-slate-500"># 3. Periksa status log kontainer</span>
              <p className="text-emerald-400 font-semibold mt-1">
                docker compose logs -f --tail=50
              </p>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText('docker compose logs -f --tail=50');
                alert('Tersalin!');
              }}
              className="text-slate-400 hover:text-white p-1"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* File Viewer Box */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800 mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveFile('compose')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeFile === 'compose'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
              }`}
            >
              docker-compose.yml
            </button>

            <button
              onClick={() => setActiveFile('dockerfile')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeFile === 'dockerfile'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
              }`}
            >
              Dockerfile
            </button>

            <button
              onClick={() => setActiveFile('nginx')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeFile === 'nginx'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
              }`}
            >
              nginx.conf (SSL Reverse Proxy)
            </button>
          </div>

          <button
            onClick={handleCopy}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow transition flex items-center gap-1.5 self-start sm:self-auto"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Tersalin!' : 'Salin File Ini'}</span>
          </button>
        </div>

        <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-indigo-300 leading-relaxed overflow-x-auto max-h-[380px]">
          {getFileContent()}
        </pre>
      </div>

      {/* MikroTik Firewall Advice */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <h3 className="text-base font-bold text-white flex items-center gap-2 mb-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <span>Keamanan Koneksi MikroTik API dari Docker Container</span>
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed mb-4">
          Pastikan port API MikroTik (8728) hanya dapat diakses dari IP VPS Docker Anda untuk mencegah upaya brute force.
        </p>

        <pre className="p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] text-amber-300 overflow-x-auto">
{`/ip service
set api port=8728 address=IP_VPS_DOCKER_ANDA/32 disabled=no

# Atau gunakan API-SSL Port 8729 dengan sertifikat
set api-ssl port=8729 certificate=cert1 disabled=no`}
        </pre>
      </div>
    </div>
  );
};
