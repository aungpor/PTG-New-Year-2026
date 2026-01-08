
import React, { useEffect, useState } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  runTransaction, 
  doc, 
  serverTimestamp,
  where,
  getDocs,
  limit
} from 'firebase/firestore';
import { db, COLLECTION_NAME, Participant } from '../services/firebase';
import confetti from 'canvas-confetti';

const DrawView: React.FC = () => {
  const [inputEmpId, setInputEmpId] = useState('');
  const [currentUser, setCurrentUser] = useState<Participant | null>(null);
  const [resultUser, setResultUser] = useState<Participant | null>(null);
  const [eligibleParticipants, setEligibleParticipants] = useState<Participant[]>([]);
  
  const [drawing, setDrawing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialSync, setInitialSync] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sync eligible pool for animation and count
  useEffect(() => {
    const q = query(collection(db, COLLECTION_NAME), where('Status', '==', 'Eligible'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Participant));
      setEligibleParticipants(list);
      setInitialSync(false);
    }, (err: any) => {
      console.error(err);
      setError("Database Error: Check Permissions");
    });
    return () => unsubscribe();
  }, []);

  const handleVerifyIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputEmpId) return;

    setLoading(true);
    setError(null);
    try {
      const q = query(collection(db, COLLECTION_NAME), where('EmpID', '==', inputEmpId), limit(1));
      const snap = await getDocs(q);

      if (snap.empty) {
        setError("ไม่พบรหัสพนักงานนี้ในระบบ");
        setCurrentUser(null);
      } else {
        const userData = { id: snap.docs[0].id, ...snap.docs[0].data() } as Participant;
        setCurrentUser(userData);
        
        // If user already finished, find who they drew
        if (userData.Status === 'Finished' && userData.DrawnResult) {
          const resQ = query(collection(db, COLLECTION_NAME), where('EmpID', '==', userData.DrawnResult), limit(1));
          const resSnap = await getDocs(resQ);
          if (!resSnap.empty) {
            setResultUser({ id: resSnap.docs[0].id, ...resSnap.docs[0].data() } as Participant);
          }
        }
      }
    } catch (err) {
      setError("เกิดข้อผิดพลาดในการตรวจสอบข้อมูล");
    } finally {
      setLoading(false);
    }
  };

  const triggerConfetti = () => {
    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
  };

  const handleDraw = async () => {
    if (!currentUser || drawing || eligibleParticipants.length === 0) return;
    
    // Safety: Don't let someone draw themselves if they are the only one left
    const validPool = eligibleParticipants.filter(p => p.EmpID !== currentUser.EmpID);
    if (validPool.length === 0) {
      alert("ไม่เหลือผู้โชคดีคนอื่นให้จับแล้ว (หรือคุณคือคนสุดท้ายที่เหลืออยู่)");
      return;
    }

    setDrawing(true);
    await new Promise(resolve => setTimeout(resolve, 3000)); // Animation delay

    try {
      const randomIndex = Math.floor(Math.random() * validPool.length);
      const targetCandidate = validPool[randomIndex];

      const success = await runTransaction(db, async (transaction) => {
        const userRef = doc(db, COLLECTION_NAME, currentUser.id!);
        const targetRef = doc(db, COLLECTION_NAME, targetCandidate.id!);
        
        const userSnap = await transaction.get(userRef);
        const targetSnap = await transaction.get(targetRef);

        if (!userSnap.exists() || !targetSnap.exists()) throw "Data missing";
        
        const uData = userSnap.data() as Participant;
        const tData = targetSnap.data() as Participant;

        if (uData.Status === 'Finished') throw "คุณได้ทำการจับฉลากไปแล้ว";
        if (tData.Status !== 'Eligible') throw "เป้าหมายถูกจับไปแล้ว กรุณาลองใหม่";

        // Update Target: Marked as Won by User
        transaction.update(targetRef, {
          Status: 'Won',
          WonBy: currentUser.EmpID,
          WonAt: serverTimestamp()
        });

        // Update User: Marked as Finished, record DrawnResult
        // Fixed: Removed duplicate 'Status' property
        transaction.update(userRef, {
          Status: 'Finished', 
          DrawnResult: targetCandidate.EmpID
        });

        return { target: { ...tData, id: targetSnap.id } as Participant };
      });

      if (success) {
        setResultUser(success.target);
        triggerConfetti();
      }
    } catch (err: any) {
      alert(err.toString());
      window.location.reload();
    } finally {
      setDrawing(false);
    }
  };

  const resetState = () => {
    setCurrentUser(null);
    setResultUser(null);
    setInputEmpId('');
    setError(null);
  };

  if (initialSync) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-20 bg-gradient-to-br from-indigo-50 via-white to-rose-50">
      <div className="text-center mb-10">
        <h1 className="text-5xl md:text-7xl font-black text-indigo-950 mb-4 tracking-tighter uppercase italic">PTG New Year 2026</h1>
        <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-sm">Lucky Draw System</p>
      </div>

      {!currentUser ? (
        /* Step 1: Login / Identity Check */
        <div className="w-full max-w-md bg-white p-10 rounded-[40px] shadow-2xl border border-white/50 animate-in fade-in slide-in-from-bottom-10 duration-700">
          <h2 className="text-2xl font-black text-slate-900 mb-6 text-center">ระบุรหัสพนักงาน</h2>
          <form onSubmit={handleVerifyIdentity} className="space-y-6">
            <input 
              type="text"
              required
              value={inputEmpId}
              onChange={e => setInputEmpId(e.target.value)}
              placeholder="รหัสพนักงาน (Emp ID)"
              className="w-full px-6 py-5 bg-slate-50 border-2 border-slate-100 rounded-3xl text-xl font-bold focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all text-center"
            />
            {error && <div className="text-red-500 text-center font-bold animate-bounce">{error}</div>}
            <button 
              disabled={loading}
              className="w-full py-5 bg-indigo-600 text-white font-black rounded-3xl shadow-xl shadow-indigo-200 hover:bg-indigo-700 hover:-translate-y-1 active:translate-y-0 transition-all text-lg"
            >
              {loading ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบจับฉลาก'}
            </button>
          </form>
        </div>
      ) : (
        /* Step 2: Draw or Result */
        <div className="flex flex-col items-center w-full max-w-2xl">
          <div className="bg-white/60 backdrop-blur-md px-6 py-3 rounded-full border border-white/50 mb-8 flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-black text-sm">
              {currentUser.FirstName[0]}
            </div>
            <div className="text-slate-900 font-bold">
              {currentUser.FirstName} {currentUser.LastName} <span className="text-indigo-600 ml-2">({currentUser.EmpID})</span>
            </div>
            <button onClick={resetState} className="ml-4 text-xs font-black text-slate-400 hover:text-red-500 uppercase">ออกจากระบบ</button>
          </div>

          {!resultUser ? (
            /* Drawing State */
            <div className="flex flex-col items-center">
              <div className="relative w-full aspect-square flex items-center justify-center mb-10">
                <div className={`relative w-72 h-80 glass-jar rounded-t-[100px] rounded-b-[40px] flex items-end justify-center pb-8 overflow-hidden transition-all duration-700 ${drawing ? 'scale-110 rotate-12' : 'animate-float'}`}>
                  <div className="absolute top-4 left-1/4 w-1/2 h-full bg-gradient-to-r from-white/20 to-transparent skew-x-12"></div>
                  <div className="relative w-full h-full p-8 flex flex-wrap gap-2 items-end justify-center content-end">
                    {eligibleParticipants.slice(0, 30).map((p, i) => (
                      <div 
                        key={p.id}
                        className={`w-10 h-6 bg-white border border-indigo-100 rounded shadow-sm text-[8px] flex items-center justify-center font-bold text-indigo-800 ${drawing ? 'animate-bounce' : ''}`}
                        style={{ animationDelay: `${i * 0.05}s` }}
                      >
                        {p.RunningNo}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="absolute -z-10 w-96 h-96 bg-indigo-400/20 blur-[120px] rounded-full"></div>
              </div>

              <button
                onClick={handleDraw}
                disabled={drawing || eligibleParticipants.length === 0}
                className={`group relative w-full max-w-sm py-6 px-10 rounded-[2.5rem] font-black text-3xl transition-all shadow-2xl overflow-hidden ${
                  drawing ? 'bg-slate-400 text-white cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:-translate-y-2'
                }`}
              >
                <span className="relative z-10">{drawing ? 'กำลังเขย่าฉลาก...' : 'กดเพื่อเริ่มจับฉลาก'}</span>
                {!drawing && <div className="absolute inset-0 bg-gradient-to-r from-indigo-400 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>}
              </button>
              <p className="mt-6 text-slate-400 font-bold uppercase tracking-widest text-xs">เหลือผู้โชคดี {eligibleParticipants.length} ท่านในกล่อง</p>
            </div>
          ) : (
            /* Result State */
            <div className="w-full bg-white p-12 rounded-[50px] shadow-2xl border border-indigo-50 text-center animate-in zoom-in fade-in duration-500">
              <div className="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                </svg>
              </div>
              <h2 className="text-indigo-600 font-black mb-2 uppercase tracking-widest">ยินดีด้วย! คุณจับฉลากได้</h2>
              <div className="text-5xl font-black text-slate-900 mb-6 leading-tight">
                {resultUser.FirstName} {resultUser.LastName}
              </div>
              <div className="flex flex-wrap justify-center gap-3 mb-10">
                <span className="px-6 py-3 bg-slate-50 rounded-2xl text-slate-600 font-black">รหัส: {resultUser.EmpID}</span>
                <span className="px-6 py-3 bg-indigo-50 rounded-2xl text-indigo-600 font-black">แผนก: {resultUser.Module || 'ไม่ระบุ'}</span>
              </div>
              <div className="pt-8 border-t border-slate-50">
                <p className="text-slate-400 font-medium italic">ขอให้มีความสุขในเทศกาลปีใหม่!</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DrawView;
