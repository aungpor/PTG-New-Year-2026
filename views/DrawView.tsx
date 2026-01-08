
import React, { useEffect, useState, useMemo } from 'react';
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

  // Sync eligible pool
  useEffect(() => {
    const q = query(collection(db, COLLECTION_NAME), where('Status', '==', 'Eligible'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Participant));
      setEligibleParticipants(list);
      setInitialSync(false);
    }, (err: any) => {
      console.error(err);
      setError("Database Error");
    });
    return () => unsubscribe();
  }, []);

  const handleVerifyIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputEmpId) return;

    setLoading(true);
    setError(null);
    try {
      const q = query(collection(db, COLLECTION_NAME), where('EmpID', '==', inputEmpId.trim()), limit(1));
      const snap = await getDocs(q);

      if (snap.empty) {
        setError("ไม่พบรหัสพนักงานนี้ในระบบ");
        setCurrentUser(null);
      } else {
        const userData = { id: snap.docs[0].id, ...snap.docs[0].data() } as Participant;
        setCurrentUser(userData);
        
        if (userData.Status === 'Finished' && userData.DrawnResult) {
          const resQ = query(collection(db, COLLECTION_NAME), where('EmpID', '==', userData.DrawnResult), limit(1));
          const resSnap = await getDocs(resQ);
          if (!resSnap.empty) {
            setResultUser({ id: resSnap.docs[0].id, ...resSnap.docs[0].data() } as Participant);
          }
        }
      }
    } catch (err) {
      setError("Error checking identity");
    } finally {
      setLoading(false);
    }
  };

  const handleDraw = async () => {
    // 1. Double check current state
    if (!currentUser || drawing || eligibleParticipants.length === 0) return;
    
    // 2. STRICT FILTER: Remove the user themselves from the potential winners pool
    const validPool = eligibleParticipants.filter(p => p.EmpID !== currentUser.EmpID);
    
    if (validPool.length === 0) {
      alert("ขออภัย ไม่เหลือผู้โชคดีท่านอื่นให้จับในขณะนี้ (คุณคือคนสุดท้ายที่เหลืออยู่)");
      return;
    }

    setDrawing(true);
    
    // Visual suspense delay (4 seconds for dramatic effect)
    await new Promise(resolve => setTimeout(resolve, 4000));

    try {
      // 3. Select a random person from the VALID pool (doesn't include self)
      const randomIndex = Math.floor(Math.random() * validPool.length);
      const targetCandidate = validPool[randomIndex];

      const success = await runTransaction(db, async (transaction) => {
        const userRef = doc(db, COLLECTION_NAME, currentUser.id!);
        const targetRef = doc(db, COLLECTION_NAME, targetCandidate.id!);
        
        const userSnap = await transaction.get(userRef);
        const targetSnap = await transaction.get(targetRef);

        if (!userSnap.exists() || !targetSnap.exists()) throw "Invalid data state";
        
        const uData = userSnap.data() as Participant;
        const tData = targetSnap.data() as Participant;

        if (uData.Status === 'Finished') throw "คุณได้ทำการจับฉลากไปแล้ว";
        if (tData.Status !== 'Eligible') throw "สิทธิ์นี้ถูกจับไปแล้ว กรุณาลองใหม่";
        // Logic check inside transaction too
        if (tData.EmpID === uData.EmpID) throw "ไม่สามารถจับรายชื่อตัวเองได้";

        transaction.update(targetRef, {
          Status: 'Won',
          WonBy: currentUser.EmpID,
          WonAt: serverTimestamp()
        });

        transaction.update(userRef, {
          Status: 'Finished', 
          DrawnResult: targetCandidate.EmpID
        });

        return { target: { ...tData, id: targetSnap.id } as Participant };
      });

      if (success) {
        setResultUser(success.target);
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
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

  // Generate consistent ball visual positions
  const ballVisuals = useMemo(() => {
    const types = ['gold', 'indigo', 'silver'];
    return eligibleParticipants.slice(0, 45).map((p, i) => ({
      id: p.id,
      no: p.RunningNo,
      type: types[i % types.length],
      x: 15 + Math.random() * 70,
      y: 40 + Math.random() * 50,
      scale: 0.8 + Math.random() * 0.4,
      rotation: Math.random() * 360
    }));
  }, [eligibleParticipants.length]);

  if (initialSync) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Syncing Registry...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-20 relative">
      {/* Brand Header */}
      <div className="text-center mb-12 animate-in fade-in slide-in-from-top-4 duration-1000">
        <h1 className="text-6xl md:text-8xl font-black text-slate-900 tracking-tighter leading-none mb-2 italic">
          PTG <span className="text-indigo-600">2026</span>
        </h1>
        <div className="flex items-center justify-center gap-4">
          <div className="h-px w-10 bg-slate-300"></div>
          <p className="text-slate-400 font-black uppercase tracking-[0.4em] text-[10px] md:text-xs">The Grand Lucky Draw</p>
          <div className="h-px w-10 bg-slate-300"></div>
        </div>
      </div>

      {!currentUser ? (
        /* Identity Verification */
        <div className="w-full max-w-md bg-white/70 backdrop-blur-xl p-10 rounded-[3rem] shadow-2xl border border-white animate-in zoom-in-95 duration-500">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-black text-slate-900 mb-2">Welcome</h2>
            <p className="text-slate-500 text-sm font-medium">ระบุรหัสพนักงานเพื่อร่วมจับฉลาก</p>
          </div>
          <form onSubmit={handleVerifyIdentity} className="space-y-6">
            <input 
              type="text"
              required
              value={inputEmpId}
              onChange={e => setInputEmpId(e.target.value)}
              placeholder="รหัสพนักงาน (EMP ID)"
              className="w-full px-8 py-6 bg-white border-2 border-slate-100 rounded-[2rem] text-2xl font-black focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all text-center tracking-widest uppercase"
            />
            {error && <div className="text-rose-500 text-center font-black text-sm animate-pulse">{error}</div>}
            <button 
              disabled={loading}
              className="w-full py-6 bg-slate-900 text-white font-black rounded-[2rem] shadow-2xl hover:bg-indigo-600 hover:-translate-y-1 active:translate-y-0 transition-all text-lg"
            >
              {loading ? 'CHECKING...' : 'เข้าสู่ห้องจับฉลาก'}
            </button>
          </form>
        </div>
      ) : (
        /* Draw Area */
        <div className="w-full max-w-4xl flex flex-col items-center">
          {/* Active User Badge */}
          <div className="bg-white/80 backdrop-blur-md pl-2 pr-6 py-2 rounded-full border border-white shadow-lg mb-12 flex items-center gap-4 animate-in slide-in-from-bottom-4 duration-500">
            <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center text-white font-black shadow-inner">
              {currentUser.FirstName[0]}
            </div>
            <div>
              <div className="text-slate-900 font-black text-sm leading-none">{currentUser.FirstName} {currentUser.LastName}</div>
              <div className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">{currentUser.EmpID}</div>
            </div>
            <div className="w-px h-6 bg-slate-200 ml-2"></div>
            <button onClick={resetState} className="text-[10px] font-black text-slate-400 hover:text-rose-500 transition-colors uppercase">Logout</button>
          </div>

          {!resultUser ? (
            /* The Lucky Orb UI */
            <div className="flex flex-col items-center w-full">
              <div className="relative w-full max-w-[400px] aspect-square flex items-center justify-center mb-12">
                {/* Glow Aura */}
                <div className={`absolute inset-0 bg-indigo-500/10 blur-[100px] rounded-full transition-all duration-1000 ${drawing ? 'opacity-100 scale-150 bg-rose-500/20' : 'opacity-40'}`}></div>
                
                {/* 3D Glass Sphere */}
                <div className={`relative w-80 h-80 lucky-orb z-10 overflow-hidden flex items-end justify-center pb-12 transition-all duration-500 ${drawing ? 'shaking scale-110' : 'animate-bounce-slow'}`}>
                  {/* Reflection Highlights */}
                  <div className="absolute top-[10%] left-[20%] w-[25%] h-[12%] bg-white/30 rounded-full blur-sm rotate-[-30deg]"></div>
                  
                  {/* The Floating Spheres */}
                  <div className="relative w-full h-full p-6 flex flex-wrap gap-2 items-end justify-center content-end">
                    {ballVisuals.map((b) => (
                      <div 
                        key={b.id}
                        className={`lucky-ball ball-${b.type} w-10 h-10 text-[10px] shadow-lg ${drawing ? 'shaking' : ''}`}
                        style={{ 
                          left: drawing ? `${Math.random() * 80 + 5}%` : `${b.x}%`,
                          top: drawing ? `${Math.random() * 80 + 5}%` : `${b.y}%`,
                          transform: `scale(${b.scale}) rotate(${drawing ? Math.random() * 360 : b.rotation}deg)`,
                          transition: drawing ? 'all 0.1s linear' : 'all 2s ease-in-out'
                        }}
                      >
                        {b.no}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Draw Button */}
              <div className="text-center space-y-4">
                <button
                  onClick={handleDraw}
                  disabled={drawing || eligibleParticipants.length === 0}
                  className={`group relative px-16 py-8 rounded-[3rem] font-black text-4xl tracking-tighter transition-all shadow-2xl ${
                    drawing ? 'bg-slate-200 text-slate-400 scale-95 cursor-not-allowed' : 'bg-slate-900 text-white hover:bg-indigo-600 hover:-translate-y-2 active:scale-95'
                  }`}
                >
                  <span className="relative z-10">{drawing ? 'MIXING...' : 'DRAW NOW'}</span>
                  {!drawing && <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-rose-600 opacity-0 group-hover:opacity-100 transition-opacity rounded-[3rem]"></div>}
                </button>
                
                <p className="text-slate-400 font-bold uppercase tracking-[0.4em] text-[10px]">
                  {eligibleParticipants.length} Participants in the bowl
                </p>
                <div className="px-4 py-2 bg-slate-100 rounded-full text-[9px] font-bold text-slate-500 inline-block uppercase tracking-widest border border-slate-200">
                  Strict "No Self-Draw" Filter Active
                </div>
              </div>
            </div>
          ) : (
            /* Result Reveal Card */
            <div className="w-full max-w-xl bg-white p-3 rounded-[4rem] shadow-2xl animate-in zoom-in-90 fade-in duration-700">
              <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[3.5rem] p-12 text-center relative overflow-hidden">
                {/* Celebrate Icon */}
                <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-3xl shadow-xl mb-8 border border-slate-100 rotate-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-7.714 2.143L11 21l-2.286-6.857L1 12l7.714-2.143L11 3z" />
                  </svg>
                </div>

                <h2 className="text-indigo-600 font-black mb-4 uppercase tracking-[0.3em] text-xs">Congratulations! You Found:</h2>
                <div className="text-5xl md:text-7xl font-black text-slate-900 mb-6 leading-none tracking-tighter">
                  {resultUser.FirstName} <br/> {resultUser.LastName}
                </div>
                
                <div className="flex justify-center gap-3 mb-10">
                  <div className="px-6 py-3 bg-white rounded-2xl shadow-sm text-slate-600 font-black text-sm border border-slate-100">
                    ID: {resultUser.EmpID}
                  </div>
                  <div className="px-6 py-3 bg-white rounded-2xl shadow-sm text-indigo-600 font-black text-sm border border-slate-100">
                    #{resultUser.RunningNo}
                  </div>
                </div>

                <div className="pt-8 border-t border-slate-200/50">
                  <p className="text-slate-400 font-bold italic text-sm italic">Wishing you a prosperous 2026!</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DrawView;
