import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/** Menahan crash render satu tab agar tidak mengosongkan seluruh halaman. */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="rounded-2xl border border-rose-500/40 bg-rose-950/50 p-4 text-xs text-rose-200">
        <p className="font-bold text-rose-100">Terjadi kesalahan saat menampilkan halaman ini</p>
        <p className="mt-1 break-words font-mono">{this.state.error.message}</p>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="mt-2 rounded-lg border border-rose-400/40 px-2.5 py-1 font-semibold text-rose-100 hover:bg-rose-900/60"
        >
          Coba tampilkan ulang
        </button>
      </div>
    );
  }
}
