import { useState, FormEvent } from 'react';
import type { IKanbanAdapter } from '../../../types/Kanban';

interface Props { adapter: IKanbanAdapter }

export function LoginScreen({ adapter }: Props) {
  const [username, setUsername] = useState('alice');
  const [password, setPassword] = useState('password123');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    adapter.login(username, password);
  };

  return (
    <div className="h-screen bg-[#060b14] flex items-center justify-center">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-lg font-black text-white">K</div>
          <div>
            <div className="text-lg font-bold text-slate-100">Kanban Board</div>
            <div className="text-[10px] text-slate-500">Realtime Thesis</div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-[#0d1420] p-8 shadow-2xl shadow-black/50">
          <h2 className="text-base font-semibold text-slate-200 mb-6">Sign in to your account</h2>

          {adapter.authError && (
            <div className="mb-4 rounded-lg px-3 py-2.5 text-sm text-red-300 bg-red-950/50 border border-red-800/60">
              {adapter.authError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1.5 uppercase tracking-wider">Username or email</label>
              <input
                type="text" value={username} onChange={e => setUsername(e.target.value)}
                className="w-full rounded-lg px-3.5 py-2.5 text-sm text-slate-100 bg-[#060b14] border border-white/[0.08] focus:outline-none focus:border-indigo-500/60 transition-colors"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1.5 uppercase tracking-wider">Password</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full rounded-lg px-3.5 py-2.5 text-sm text-slate-100 bg-[#060b14] border border-white/[0.08] focus:outline-none focus:border-indigo-500/60 transition-colors"
              />
            </div>
            <button
              type="submit" disabled={adapter.authLoading}
              className="w-full mt-2 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold text-white transition-colors shadow-lg shadow-indigo-900/40">
              {adapter.authLoading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {/* Demo accounts hint */}
          <div className="mt-6 pt-5 border-t border-white/[0.05]">
            <p className="text-[10px] text-slate-600 mb-2 uppercase tracking-wider">Demo accounts (password: password123)</p>
            <div className="grid grid-cols-2 gap-1.5">
              {['alice', 'bob', 'charlie', 'diana'].map(u => (
                <button key={u} onClick={() => setUsername(u)}
                  className={`text-xs rounded-md px-2.5 py-1.5 border transition-all text-left ${
                    username === u
                      ? 'border-indigo-500/50 bg-indigo-900/30 text-indigo-300'
                      : 'border-white/[0.06] text-slate-500 hover:text-slate-300 hover:border-white/20'
                  }`}>
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-[10px] text-slate-700 mt-4">
          {adapter.status === 'connecting' ? '⏳ Connecting…' : ''}
        </p>
      </div>
    </div>
  );
}