
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
  const [shufflingName, setShufflingName] = useState<{ name: string, no: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialSync, setInitialSync] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sync eligible pool
  useEffect(() => {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('WonBy', '==', null)
    );
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
        

        if (userData.Status === 'Finished' && userData.DrawnResult) {
          const resQ = query(collection(db, COLLECTION_NAME), where('EmpID', '==', userData.DrawnResult), limit(1));
          const resSnap = await getDocs(resQ);
          if (!resSnap.empty) {
            setResultUser({ id: resSnap.docs[0].id, ...resSnap.docs[0].data() } as Participant);
          }
        }
        setCurrentUser(userData);
      }
    } catch (err) {
      setError("Error checking identity");
    } finally {
      setLoading(false);
    }
  };

  const handleDraw = async () => {
    if (!currentUser || drawing || eligibleParticipants.length === 0) return;

    setDrawing(true);

    // Filter valid pool (cannot draw self)
    const getFreshValidPool = (list: Participant[]) =>
      list.filter(p =>
        p.EmpID !== currentUser.EmpID && p.WonBy == null
      );


    // Start Shuffling Animation
    const shuffleInterval = setInterval(() => {
      const pool = getFreshValidPool(eligibleParticipants);
      if (pool.length > 0) {
        const randomPart = pool[Math.floor(Math.random() * pool.length)];
        setShufflingName({
          name: `${randomPart.FirstName} ${randomPart.LastName}`,
          no: randomPart.RunningNo
        });
      }
    }, 80);

    const startTime = Date.now();
    const minAnimationTime = 4000;

    // Retry loop for handling concurrency collisions
    let successResult: Participant | null = null;
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts && !successResult) {
      attempts++;
      try {
        const currentPool = getFreshValidPool(eligibleParticipants);
        if (currentPool.length === 0) throw new Error("ไม่เหลือรายชื่อให้จับแล้ว");

        const targetCandidate = currentPool[Math.floor(Math.random() * currentPool.length)];

        const transactionResult = await runTransaction(db, async (transaction) => {
          const userRef = doc(db, COLLECTION_NAME, currentUser.id!);
          const targetRef = doc(db, COLLECTION_NAME, targetCandidate.id!);

          const userSnap = await transaction.get(userRef);
          const targetSnap = await transaction.get(targetRef);

          if (!userSnap.exists() || !targetSnap.exists())
            throw new Error("Invalid data state");

          const uData = userSnap.data() as Participant;
          const tData = targetSnap.data() as Participant;

          if (uData.Status === 'Finished')
            throw new Error("คุณได้ทำการจับฉลากไปแล้ว");

          // ✅ collision check ที่ถูกต้อง
          if (tData.WonBy != null)
            throw "COLLISION";

          if (tData.EmpID === uData.EmpID)
            throw new Error("ไม่สามารถจับรายชื่อตัวเองได้");

          transaction.update(targetRef, {
            WonBy: currentUser.EmpID,
            WonAt: serverTimestamp()
          });

          transaction.update(userRef, {
            Status: 'Finished',
            DrawnResult: tData.EmpID
          });

          return { ...tData, id: targetSnap.id } as Participant;
        });


        successResult = transactionResult;
      } catch (err: any) {
        if (err === "COLLISION") {
          console.warn(`Draw collision detected (Attempt ${attempts}). Retrying with new candidate...`);
          // Brief pause before retry to let other transactions settle
          await new Promise(r => setTimeout(r, 100));
          continue;
        }
        // If not a collision, it's a real error (like user already finished)
        clearInterval(shuffleInterval);
        setShufflingName(null);
        setDrawing(false);
        alert(err.message || err.toString());
        return;
      }
    }

    // Wait for the rest of the animation if needed
    const elapsedTime = Date.now() - startTime;
    if (elapsedTime < minAnimationTime) {
      await new Promise(resolve => setTimeout(resolve, minAnimationTime - elapsedTime));
    }

    clearInterval(shuffleInterval);
    setShufflingName(null);

    if (successResult) {
      setResultUser(successResult);
      confetti({
        particleCount: 200,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#4f46e5', '#fbbf24', '#e11d48']
      });
    } else {
      alert("ไม่สามารถจับฉลากได้เนื่องจากมีการใช้งานหนาแน่น กรุณาลองใหม่อีกครั้ง");
    }
    setDrawing(false);
  };

  const resetState = () => {
    setCurrentUser(null);
    setResultUser(null);
    setInputEmpId('');
    setError(null);
  };

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
        <div className="w-16 h-16 border-4 border-[#00b751] border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Syncing Registry...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-18 relative ">
      {/* Brand Header */}
      {!currentUser && <div className="text-center mb-8 ">
        <h1 className="text-6xl md:text-8xl font-black text-slate-900 tracking-tighter leading-none mb-2 italic">
          PTG <span className="text-[#00b751]">2026</span>
        </h1>
        <div className="flex items-center justify-center gap-4">
          <div className="h-px w-10 bg-slate-300"></div>
          <p className="text-slate-400 font-black uppercase tracking-[0.4em] text-[10px] md:text-xs">The Grand Lucky Draw</p>
          <div className="h-px w-10 bg-slate-300"></div>
        </div>
      </div>}

      {!currentUser ? (
        <div className="w-full max-w-md  backdrop-blur-xl p-10 rounded-[3rem]  animate-in zoom-in-95 duration-500">
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
              placeholder="รหัสพนักงาน"
              className="w-full px-8 py-6 bg-white border-2 border-slate-100 rounded-[2rem] text-2xl font-black focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all text-center tracking-widest uppercase"
            />
            {error && <div className="text-rose-500 text-center font-black text-sm animate-pulse">{error}</div>}
            <button
              disabled={loading}
              className="w-full py-6 bg-slate-900 text-white font-black rounded-[2rem] shadow-2xl hover:bg-[#00b751] hover:-translate-y-1 active:translate-y-0 transition-all text-lg"
            >
              {loading ? 'CHECKING...' : 'เข้าสู่ห้องจับฉลาก'}
            </button>
          </form>
        </div>
      ) : (
        <div className="w-full max-w-4xl flex flex-col items-center m-auto gap-6">
          <div className="bg-white/80 backdrop-blur-md pl-2 pr-6 py-2 rounded-full border border-white shadow-lg mb-0 lg:mb-2 flex items-center gap-4 animate-in slide-in-from-bottom-4 duration-500">
            <div className="w-12 h-12 bg-[#00b751] rounded-full flex items-center justify-center text-white font-black shadow-inner">
              {currentUser.FirstName[0]}
            </div>
            <div>
              <div className="text-slate-900 font-black text-sm leading-none">{currentUser.FirstName} {currentUser.LastName}</div>
              <div className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">{currentUser.EmpID}</div>
            </div>
            <div className="w-px h-6 bg-slate-200 ml-2"></div>
            <button onClick={resetState} className="text-[16px] font-black text-slate-400 hover:text-rose-500 transition-colors uppercase">Logout</button>
          </div>

          {!resultUser ? (
            <div className="flex flex-col items-center w-full">
              <div className="relative w-full max-w-[400px] aspect-square flex items-center justify-center mb-6">
                <div className={`absolute inset-0 bg-indigo-500/10 blur-[100px] rounded-full transition-all duration-1000 ${drawing ? 'opacity-100 scale-150 bg-rose-500/20' : 'opacity-40'}`}></div>

                {/* 3D Glass Sphere */}
                <div className={`relative w-80 h-80 lucky-orb z-10 overflow-hidden flex items-center justify-center transition-all duration-500 ${drawing ? 'shaking scale-110' : 'animate-bounce-slow'}`}>
                  <div className="absolute top-[10%] left-[20%] w-[25%] h-[12%] bg-white/30 rounded-full blur-sm rotate-[-30deg]"></div>

                  {/* Slot Machine Animation Overlay */}
                  {drawing && shufflingName && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-indigo-900/40 backdrop-blur-[2px] animate-in fade-in duration-300">
                      <div className="text-white font-black text-5xl mb-2 animate-pulse">#{shufflingName.no}</div>
                      <div className="text-white/80 font-bold text-xs uppercase tracking-widest px-4 text-center">{shufflingName.name}</div>
                    </div>
                  )}

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

              <div className="text-center space-y-4">
                <button
                  onClick={handleDraw}
                  disabled={drawing || eligibleParticipants.length === 0}
                  className={`group relative px-16 py-8 rounded-[3rem] font-black text-4xl tracking-tighter transition-all shadow-2xl
    ${drawing
                      ? 'bg-slate-200 text-slate-400 scale-95 cursor-not-allowed'
                      : 'bg-[#00b751] text-white hover:bg-[#009e48] hover:-translate-y-2 active:scale-95'
                    }`}
                >
                  <span className="relative z-10">
                    {drawing ? 'MIXING...' : 'DRAW NOW'}
                  </span>

                  {!drawing && (
                    <div className="absolute inset-0 bg-gradient-to-r from-[#00b751] to-[#00e676] opacity-0 group-hover:opacity-100 transition-opacity rounded-[3rem]" />
                  )}
                </button>


                <p className="text-slate-400 font-bold uppercase tracking-[0.4em] text-[10px]">
                  {eligibleParticipants.length} Participants in the bowl
                </p>
                <div className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 rounded-full text-[9px] font-bold text-slate-500 uppercase tracking-widest border border-slate-200">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                  Collision Protection Active
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-xl bg-white p-3 rounded-[4rem] shadow-2xl animate-in zoom-in-90 fade-in duration-700">
              <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[3.5rem] p-4 text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full bg-indigo-500/5 blur-[80px] -z-10"></div>

                <h2 className="text-[#00b751] font-black mb-10 uppercase tracking-[0.2em] text-xs animate-bounce">รางวัลที่ได้</h2>

                <div className="flex justify-center mb-10 scale-125 md:scale-150 animate-in slide-in-from-top-10 duration-700 delay-300 fill-mode-both">
                  <div className="relative group">
                    <div className="absolute inset-0 bg-indigo-400 blur-2xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
                    <div className="lucky-ball ball-gold w-28 h-28 text-5xl shadow-2xl relative border-[6px] border-white/80 ring-4 ring-gold-500/20">
                      {resultUser.RunningNo}
                    </div>
                  </div>
                </div>

                <div className="mt-14 mb-8 animate-in fade-in slide-in-from-bottom-5 duration-700 delay-500 fill-mode-both">
                  <div className="text-4xl md:text-5xl font-black text-slate-900 mb-2 leading-tight tracking-tight">
                    {resultUser.FirstName} {resultUser.LastName}
                  </div>
                  {resultUser.Nickname && (
                    <div className="text-2xl md:text-3xl font-black text-[#00b751] mt-2 bg-indigo-50 inline-block px-4 py-1 rounded-2xl">
                      ({resultUser.Nickname})
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-center gap-3 mt-10 animate-in fade-in duration-1000 delay-700 fill-mode-both">
                  <div className="px-6 py-2 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center gap-3">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Employee ID</span>
                    <span className="text-slate-800 font-black tracking-widest">{resultUser.EmpID}</span>
                  </div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em]">
                    {resultUser.Module || 'Participant'}
                  </div>
                </div>

                <div className="mt-4 pt-8 border-t border-slate-200/50">
                  <p className="text-slate-300 font-bold italic text-xs uppercase tracking-widest">Happy New Year 2026</p>
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
