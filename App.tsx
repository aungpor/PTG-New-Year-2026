
import React, { useState } from 'react';
import DrawView from './views/DrawView';
import AdminView from './views/AdminView';
import SettingView from './views/SettingView';

const App: React.FC = () => {
  const [view, setView] = useState<'draw' | 'admin' | 'setting'>('draw');

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white/80 backdrop-blur-md px-2 py-2 rounded-full shadow-2xl border border-white/50 flex gap-1">
        <button 
          onClick={() => setView('draw')}
          className={`px-5 py-2 rounded-full font-bold text-sm transition-all ${view === 'draw' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          Draw
        </button>
        <button 
          onClick={() => setView('admin')}
          className={`px-5 py-2 rounded-full font-bold text-sm transition-all ${view === 'admin' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          Admin
        </button>
        <button 
          onClick={() => setView('setting')}
          className={`px-5 py-2 rounded-full font-bold text-sm transition-all ${view === 'setting' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          Settings
        </button>
      </nav>

      <main className="pb-24">
        {view === 'draw' && <DrawView />}
        {view === 'admin' && <AdminView />}
        {view === 'setting' && <SettingView />}
      </main>
    </div>
  );
};

export default App;
