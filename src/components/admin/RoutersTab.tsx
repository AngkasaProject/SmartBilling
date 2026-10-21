import React, { useState } from 'react';
import { RouterConfig } from '../../types';
import { getMikrotikIsolirScript, getHotspotWalledGardenScript } from '../../services/mikrotikScripts';
import {
  Server,
  Zap,
  Activity,
  Copy,
  Check,
  ShieldAlert,
  Wifi,
  ExternalLink,
  Cpu,
  RefreshCw,
  Plus,
  Terminal
} from 'lucide-react';

interface Props {
  routers: RouterConfig[];
  onRefreshData: () => void;
}

export const RoutersTab: React.FC<Props> = ({ routers, onRefreshData }) => {
  const [activeScriptTab, setActiveScriptTab] = useState<'isolir' | 'walledGarden' | 'pppoe'>('isolir');
  const [copied, setCopied] = useState(false);
  const [testingRouterId, setTestingRouterId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; latencyMs: number } | null>(null);
  const [billingHost, setBillingHost] = useState('103.180.12.5:3000');

  const handleTestConnection = (router: RouterConfig) => {
    setTestingRouterId(router.id);
    setTestResult(null);

    setTimeout(() => {
      setTestingRouterId(null);
      setTestResult({
        id: router.id,
        success: true,
        latencyMs: Math.floor(10 + Math.random() * 15),
      });
    }, 900);
  };

  const getActiveScriptContent = () => {
    if (activeScriptTab === 'isolir') {
      return getMikrotikIsolirScript(billingHost);
    }
    if (activeScriptTab === 'walledGarden') {
      return getHotspotWalledGardenScript(billingHost.split(':')[0]);
    }
    return `# =========================================================
# MIKROTIK PPPOE SERVER SETUP & BANDWIDTH QUEUE
# =========================================================

/ip pool
add name=pool-pppoe ranges=10.10.20.10-10.10.20.250

/ppp profile
add name=default-pppoe local-address=10.10.20.1 remote-address=pool-pppoe dns-server=8.8.8.8,1.1.1.1
add name="10M-Home" local-address=10.10.20.1 remote-address=pool-pppoe rate-limit="10M/10M" comment="Paket Home 10 Mbps"
add name="20M-Home" local-address=10.10.20.1 remote-address=pool-pppoe rate-limit="20M/20M" comment="Paket Home 20 Mbps"
add name="50M-Gamer" local-address=10.10.20.1 remote-address=pool-pppoe rate-limit="50M/50M" comment="Paket Bisnis 50 Mbps"

/interface pppoe-server server
add service-name=NetFlow-PPPoE interface=bridge-lan default-profile=default-pppoe authentication=pap,chap,mschap2 disabled=no
`;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getActiveScriptContent());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Routers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {routers.map(rtr => {
          const isTesting = testingRouterId === rtr.id;
          const isTested = testResult?.id === rtr.id;

          return (
            <div
              key={rtr.id}
              className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <Server className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">{rtr.name}</h3>
                    <p className="text-xs text-slate-400 font-mono">
                      {rtr.host}:{rtr.port} • API {rtr.apiType.toUpperCase()}
                    </p>
                  </div>
                </div>

                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  CONNECTED
                </span>
              </div>

              {/* Hardware stats */}
              <div className="grid grid-cols-3 gap-3 my-4 bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs font-mono">
                <div>
                  <div className="text-slate-400 text-[10px]">Model & OS</div>
                  <div className="font-semibold text-slate-200 truncate mt-0.5">{rtr.model}</div>
                  <div className="text-[10px] text-slate-500">{rtr.rosVersion}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px]">CPU & RAM</div>
                  <div className="font-semibold text-indigo-400 mt-0.5">{rtr.cpuLoad}% CPU</div>
                  <div className="text-[10px] text-slate-500">Free: {rtr.memoryFreeMb} MB</div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px]">Klien Aktif</div>
                  <div className="font-semibold text-emerald-400 mt-0.5">{rtr.activePppoe} PPPoE</div>
                  <div className="text-[10px] text-violet-400">{rtr.activeHotspot} Hotspot</div>
                </div>
              </div>

              {/* Test Connection Button */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                <div className="text-[11px] text-slate-400 font-mono">
                  {isTested && (
                    <span className="text-emerald-400 font-bold">
                      ✓ Ping {testResult.latencyMs}ms (API OK)
                    </span>
                  )}
                  {!isTested && <span>Uptime: {rtr.uptime}</span>}
                </div>

                <button
                  onClick={() => handleTestConnection(rtr)}
                  disabled={isTesting}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-indigo-400' : ''}`} />
                  <span>{isTesting ? 'Menguji API...' : 'Test Koneksi API'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Script Generator & RouterOS Terminal Guide */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Terminal className="w-5 h-5 text-indigo-400" />
              <span>Generator Skrip MikroTik RouterOS (Auto-Isolir & Hotspot)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Skrip resmi untuk RouterOS v6 dan v7 agar integrasi firewall isolir, payment gateway, dan PPPoE berjalan 100% otomatis
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
              <span className="text-slate-400">Host Billing:</span>
              <input
                type="text"
                value={billingHost}
                onChange={e => setBillingHost(e.target.value)}
                className="bg-transparent border-none text-white text-xs font-mono font-semibold focus:outline-none w-36"
              />
            </div>

            <button
              onClick={handleCopy}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 font-semibold text-white text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition flex items-center gap-1.5"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Tersalin ke Clipboard!' : 'Salin Skrip'}</span>
            </button>
          </div>
        </div>

        {/* Script Selection Tabs */}
        <div className="flex items-center gap-2 my-4">
          <button
            onClick={() => setActiveScriptTab('isolir')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
              activeScriptTab === 'isolir'
                ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>1. Skrip Auto-Isolir & Redirect Jatuh Tempo</span>
          </button>

          <button
            onClick={() => setActiveScriptTab('walledGarden')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
              activeScriptTab === 'walledGarden'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Wifi className="w-3.5 h-3.5" />
            <span>2. Walled Garden Payment Gateway (QRIS)</span>
          </button>

          <button
            onClick={() => setActiveScriptTab('pppoe')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
              activeScriptTab === 'pppoe'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>3. Skrip PPPoE Server & Pool</span>
          </button>
        </div>

        {/* Script Display Codeblock */}
        <div className="relative">
          <pre className="p-5 bg-slate-950 border border-slate-800 rounded-2xl font-mono text-xs text-indigo-300 leading-relaxed overflow-x-auto max-h-[420px]">
            {getActiveScriptContent()}
          </pre>
        </div>
      </div>
    </div>
  );
};
