
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import DrawView from './views/DrawView';
import AdminView from './views/AdminView';
import SettingView from './views/SettingView';

const App: React.FC = () => {
  return (
    <Router>
      <AppContent />
    </Router>
  );
};

const AppContent: React.FC = () => {
  const location = useLocation();
  return (
    <div className="h-dvh bg-slate-50 overflow-hidden">
      {(location.pathname === '/admin' || location.pathname === '/setting') && <Navigation />}
      <main className={(location.pathname === '/admin' || location.pathname === '/setting') ? 'pb-24' : ''}>
        <Routes>
          <Route path="/" element={<Navigate to="/draw" />} />
          <Route path="/draw" element={<DrawView />} />
          <Route path="/admin" element={<AdminView />} />
          <Route path="/setting" element={<SettingView />} />
        </Routes>
      </main>
    </div>
  );
};

const Navigation: React.FC = () => {
  const location = useLocation();
  return (
    <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white/80 backdrop-blur-md px-2 py-2 rounded-full shadow-2xl border border-white/50 flex gap-1">
      <Link
        to="/draw"
        className={`px-5 py-2 rounded-full font-bold text-sm transition-all ${location.pathname === '/draw' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-600 hover:bg-slate-100'}`}
      >
        Draw
      </Link>
      <Link
        to="/admin"
        className={`px-5 py-2 rounded-full font-bold text-sm transition-all ${location.pathname === '/admin' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-600 hover:bg-slate-100'}`}
      >
        Admin
      </Link>
      <Link
        to="/setting"
        className={`px-5 py-2 rounded-full font-bold text-sm transition-all ${location.pathname === '/setting' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-600 hover:bg-slate-100'}`}
      >
        Settings
      </Link>
    </nav>
  );
};

export default App;
