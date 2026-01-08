
import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  doc, 
  runTransaction, 
  serverTimestamp,
  getDocs,
  query,
  orderBy,
  where,
  limit
} from 'firebase/firestore';
import { db, COLLECTION_NAME, META_COLLECTION, COUNTER_DOC, Participant } from '../services/firebase';

const AdminView: React.FC = () => {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [formData, setFormData] = useState({ EmpID: '', FirstName: '', LastName: '', Nickname: '', Module: '' });
  const [autoRunning, setAutoRunning] = useState(true);
  const [manualNo, setManualNo] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, COLLECTION_NAME), orderBy('RunningNo', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Participant));
      setParticipants(list);
    }, (err: any) => {
      console.error("Admin listener error:", err.code);
    });
    return () => unsubscribe();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!formData.EmpID || !formData.FirstName || !formData.LastName) return;
    
    setLoading(true);
    try {
      // 1. Check for duplicate EmpID
      const q = query(collection(db, COLLECTION_NAME), where('EmpID', '==', formData.EmpID.trim()), limit(1));
      const existingSnap = await getDocs(q);
      
      if (!existingSnap.empty) {
        setError(`รหัสพนักงาน ${formData.EmpID} มีอยู่ในระบบแล้ว`);
        setLoading(false);
        return;
      }

      // 2. Add new participant
      let runNo = manualNo;
      if (autoRunning) {
        runNo = await runTransaction(db, async (transaction) => {
          const counterRef = doc(db, META_COLLECTION, COUNTER_DOC);
          const counterSnap = await transaction.get(counterRef);
          let nextVal = 1;
          if (counterSnap.exists()) nextVal = (counterSnap.data().value || 0) + 1;
          transaction.set(counterRef, { value: nextVal });
          return nextVal;
        });
      }
      
      await addDoc(collection(db, COLLECTION_NAME), { 
        ...formData, 
        EmpID: formData.EmpID.trim(),
        RunningNo: runNo, 
        Status: 'Eligible', 
        WonBy: null,
        DrawnResult: null,
        WonAt: null,
        CreatedAt: serverTimestamp() 
      });
      
      setFormData({ EmpID: '', FirstName: '', LastName: '', Nickname: '', Module: '' });
      if (!autoRunning) setManualNo(prev => prev + 1);
    } catch (error) {
      console.error(error);
      alert("Error adding participant.");
    } finally {
      setLoading(false);
    }
  };

  const stats = {
    total: participants.length,
    eligible: participants.filter(p => p.Status === 'Eligible').length,
    won: participants.filter(p => p.Status === 'Won').length,
    finished: participants.filter(p => p.Status === 'Finished').length,
  };

  const findNameAndIdByEmpID = (empId?: string) => {
    if (!empId) return '-';
    const found = participants.find(p => p.EmpID === empId);
    return found ? `${found.FirstName} ${found.LastName} (${found.EmpID})` : empId;
  };

  const findRunningNoByEmpID = (empId?: string) => {
    if (!empId) return '-';
    const found = participants.find(p => p.EmpID === empId);
    return found ? `#${found.RunningNo}` : '-';
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-12 animate-in fade-in duration-500">
      <div className="mb-10">
        <h1 className="text-4xl font-black text-slate-900 tracking-tight">Admin Dashboard</h1>
        <p className="text-slate-500 font-medium uppercase text-xs tracking-widest mt-1">Real-time Registration Management</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
        {[
          { label: 'Total Members', val: stats.total, color: 'slate' },
          { label: 'Wait to draw', val: stats.eligible, color: 'indigo' },
          { label: 'Being Drawn', val: stats.won, color: 'rose' },
          { label: 'Drawn Success', val: stats.finished, color: 'emerald' },
        ].map(s => (
          <div key={s.label} className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
            <div className={`text-${s.color}-400 text-[10px] font-black uppercase mb-1 tracking-widest`}>{s.label}</div>
            <div className={`text-4xl font-black text-slate-900`}>{s.val}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-1">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-indigo-50 sticky top-12">
            <h2 className="text-xl font-black text-slate-900 mb-6">Register Participant</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <input 
                  type="text" 
                  required 
                  value={formData.EmpID} 
                  onChange={e => setFormData({...formData, EmpID: e.target.value})} 
                  className={`w-full px-5 py-4 bg-slate-50 border-2 rounded-2xl focus:ring-2 focus:ring-indigo-500 transition-all font-bold ${error ? 'border-red-200' : 'border-transparent'}`} 
                  placeholder="รหัสพนักงาน" 
                />
                {error && <p className="mt-2 text-xs font-bold text-red-500 px-1">{error}</p>}
              </div>
              <input type="text" required value={formData.FirstName} onChange={e => setFormData({...formData, FirstName: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border-0 rounded-2xl font-bold" placeholder="ชื่อ" />
              <input type="text" required value={formData.LastName} onChange={e => setFormData({...formData, LastName: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border-0 rounded-2xl font-bold" placeholder="นามสกุล" />
              <input type="text" value={formData.Nickname} onChange={e => setFormData({...formData, Nickname: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border-0 rounded-2xl font-bold" placeholder="ชื่อเล่น" />
              <input type="text" value={formData.Module} onChange={e => setFormData({...formData, Module: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border-0 rounded-2xl font-bold" placeholder="แผนก" />
              
              <div className="py-4 border-t border-slate-50">
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="text-xs font-black text-slate-400 uppercase">Auto Number</span>
                  <button type="button" onClick={() => setAutoRunning(!autoRunning)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoRunning ? 'bg-indigo-600' : 'bg-slate-200'}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoRunning ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
                {!autoRunning && <input type="number" value={manualNo} onChange={e => setManualNo(parseInt(e.target.value) || 0)} className="w-full px-5 py-4 bg-slate-50 border-0 rounded-2xl font-bold" placeholder="Manual No" />}
              </div>

              <button disabled={loading} className="w-full py-5 bg-indigo-600 text-white font-black rounded-2xl shadow-lg hover:bg-indigo-700 transition-all disabled:opacity-50">
                {loading ? 'Processing...' : 'ADD TO SYSTEM'}
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50 text-slate-400 uppercase text-[10px] tracking-widest font-black">
                    <th className="px-6 py-5">No</th>
                    <th className="px-6 py-5">Participant</th>
                    <th className="px-6 py-5">Drawn By</th>
                    <th className="px-6 py-5">Result (No)</th>
                    <th className="px-6 py-5">Statuses</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {participants.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-20 text-center text-slate-400 font-bold italic">No participants found</td>
                    </tr>
                  ) : participants.map((p) => (
                    <tr key={p.id} className="hover:bg-indigo-50/30 transition-colors">
                      <td className="px-6 py-5 font-black text-indigo-600">#{p.RunningNo}</td>
                      <td className="px-6 py-5">
                        <div className="font-black text-slate-900">{p.FirstName} {p.LastName} {p.Nickname ? `(${p.Nickname})` : ''}</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase">{p.EmpID} • {p.Module || 'General'}</div>
                      </td>
                      <td className="px-6 py-5 text-[11px] font-bold text-slate-500">
                        {p.WonBy ? findNameAndIdByEmpID(p.WonBy) : <span className="text-slate-300">-</span>}
                      </td>
                      <td className="px-6 py-5 text-sm font-black text-emerald-600">
                        {p.DrawnResult ? findRunningNoByEmpID(p.DrawnResult) : <span className="text-slate-300">-</span>}
                      </td>
                      <td className="px-6 py-5 space-y-2">
                        <div className="flex items-center">
                          <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase inline-block w-24 text-center ${
                            p.WonBy ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-400'
                          }`}>
                            เลข: {p.WonBy ? 'ถูกจับแล้ว' : 'ว่าง'}
                          </span>
                        </div>
                        <div className="flex items-center">
                          <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase inline-block w-24 text-center ${
                            p.DrawnResult ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-400'
                          }`}>
                            สิทธิ์: {p.DrawnResult ? 'จับแล้ว' : 'ยังไม่จับ'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminView;
