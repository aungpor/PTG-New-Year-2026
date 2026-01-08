
import React, { useState, useRef } from 'react';
import { collection, getDocs, doc, setDoc, writeBatch, query, limit, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db, COLLECTION_NAME, META_COLLECTION, COUNTER_DOC } from '../services/firebase';

const SettingView: React.FC = () => {
  const [loadingClear, setLoadingClear] = useState(false);
  const [loadingReset, setLoadingReset] = useState(false);
  const [loadingResetDraw, setLoadingResetDraw] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const deleteCollection = async (collectionName: string) => {
    let deletedCount = 0;
    while (true) {
      const q = query(collection(db, collectionName), limit(500));
      const snapshot = await getDocs(q);
      
      if (snapshot.size === 0) break;

      const batch = writeBatch(db);
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      deletedCount += snapshot.size;
      
      if (snapshot.size < 500) break;
    }
    return deletedCount;
  };

  const handleClearParticipants = async () => {
    const isConfirmed = confirm(
      "ยืนยันการลบรายชื่อพนักงานทั้งหมด?\n\n" +
      "- ข้อมูลผู้เข้าร่วมและผลการจับฉลากจะหายไป\n" +
      "- ระบบจะกลับสู่สถานะว่างเปล่า\n" +
      "- *ลำดับหมายเลข Running No จะยังคงเดิม*"
    );
    
    if (!isConfirmed) return;

    setLoadingClear(true);
    try {
      const deletedCount = await deleteCollection(COLLECTION_NAME);
      if (deletedCount === 0) {
        alert("ไม่พบข้อมูลพนักงานในระบบให้ลบ");
      } else {
        alert(`ลบรายชื่อพนักงานทั้งหมด ${deletedCount} รายการเรียบร้อยแล้ว`);
      }
    } catch (error: any) {
      alert(`ไม่สามารถลบข้อมูลได้: ${error.message}`);
    } finally {
      setLoadingClear(false);
    }
  };

  const handleResetCounter = async () => {
    const isConfirmed = confirm(
      "ยืนยันการรีเซ็ตลำดับหมายเลข (Running No)?\n\n" +
      "- การลงทะเบียนคนต่อไปจะเริ่มที่หมายเลข 1\n" +
      "- *รายชื่อที่มีอยู่แล้วในระบบจะไม่ได้รับผลกระทบ*"
    );

    if (!isConfirmed) return;

    setLoadingReset(true);
    try {
      const counterRef = doc(db, META_COLLECTION, COUNTER_DOC);
      await setDoc(counterRef, { value: 0 }, { merge: true });
      alert("รีเซ็ตลำดับหมายเลขกลับไปเริ่มที่ 1 เรียบร้อยแล้ว");
    } catch (error: any) {
      alert(`ไม่สามารถรีเซ็ตหมายเลขได้: ${error.message}`);
    } finally {
      setLoadingReset(false);
    }
  };

  const handleResetDrawStatus = async () => {
    const isConfirmed = confirm(
      "ยืนยันการรีเซ็ตสถานะการจับฉลากใหม่?\n\n" +
      "- ผลการจับฉลากเดิมจะถูกล้างออกทั้งหมด\n" +
      "- ทุกคนจะกลับมามีสิทธิ์ถูกจับ (Eligible) อีกครั้ง\n" +
      "- *รายชื่อและลำดับหมายเลขจะยังคงเดิม*"
    );

    if (!isConfirmed) return;

    setLoadingResetDraw(true);
    try {
      let updatedCount = 0;
      while (true) {
        // Query participants who are not Eligible or have draw results
        const q = query(collection(db, COLLECTION_NAME), limit(500));
        const snapshot = await getDocs(q);
        
        if (snapshot.size === 0) break;

        const batch = writeBatch(db);
        let hasChanges = false;
        
        snapshot.docs.forEach((d) => {
          const data = d.data();
          // Only update if they aren't already purely eligible/fresh
          if (data.Status !== 'Eligible' || data.WonBy || data.DrawnResult) {
            batch.update(d.ref, {
              Status: 'Eligible',
              WonBy: null,
              DrawnResult: null,
              WonAt: null
            });
            hasChanges = true;
            updatedCount++;
          }
        });

        if (!hasChanges && snapshot.size < 500) break;
        if (hasChanges) await batch.commit();
        if (snapshot.size < 500) break;
      }
      
      alert(`รีเซ็ตสถานะการจับฉลากใหม่เรียบร้อยแล้ว (${updatedCount} รายการ)`);
    } catch (error: any) {
      alert(`ไม่สามารถรีเซ็ตสถานะได้: ${error.message}`);
    } finally {
      setLoadingResetDraw(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      await processCsv(text);
    };
    reader.readAsText(file);
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processCsv = async (csvText: string) => {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length <= 1) {
      alert("ไฟล์ CSV ว่างเปล่าหรือไม่มีข้อมูล");
      return;
    }

    // Skip header line
    const dataLines = lines.slice(1);
    setImporting(true);
    setImportProgress({ current: 0, total: dataLines.length });

    try {
      // 1. Get current counter
      const counterRef = doc(db, META_COLLECTION, COUNTER_DOC);
      const counterSnap = await getDoc(counterRef);
      let currentNo = counterSnap.exists() ? (counterSnap.data().value || 0) : 0;

      // 2. Process in batches (Firebase limit is 500)
      const chunkSize = 400;
      let processed = 0;

      for (let i = 0; i < dataLines.length; i += chunkSize) {
        const chunk = dataLines.slice(i, i + chunkSize);
        const batch = writeBatch(db);

        chunk.forEach(line => {
          // Structure: .,Employee ID,First Name,Last Name,Nickname
          const cols = line.split(',').map(c => c.trim());
          const empId = cols[1];
          const firstName = cols[2];
          const lastName = cols[3];
          const nickname = cols[4] || '';

          if (empId && firstName && lastName) {
            currentNo++;
            const newDocRef = doc(collection(db, COLLECTION_NAME));
            batch.set(newDocRef, {
              EmpID: empId,
              FirstName: firstName,
              LastName: lastName,
              Nickname: nickname,
              Module: 'Imported', // Default category
              RunningNo: currentNo,
              Status: 'Eligible',
              CreatedAt: serverTimestamp()
            });
            processed++;
          }
        });

        // Update counter in the same final batch if it's the last chunk or update incrementally
        batch.set(counterRef, { value: currentNo }, { merge: true });
        await batch.commit();
        
        setImportProgress({ current: Math.min(i + chunkSize, dataLines.length), total: dataLines.length });
      }

      alert(`นำเข้าข้อมูลเรียบร้อยแล้วทั้งหมด ${processed} รายชื่อ`);
    } catch (error: any) {
      console.error("CSV Import error:", error);
      alert(`เกิดข้อผิดพลาดในการนำเข้า: ${error.message}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-20 animate-in fade-in slide-in-from-bottom-5 duration-500">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-black text-slate-900 tracking-tight">System Settings</h1>
        <p className="text-slate-500 font-medium mt-2">Maintenance and administrative tools</p>
      </div>

      <div className="space-y-8">
        {/* Action: Import CSV */}
        <div className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-xl border border-slate-100 transition-all hover:shadow-2xl">
          <div className="flex flex-col md:flex-row items-start gap-6">
            <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <div className="flex-grow w-full">
              <h3 className="text-xl font-black text-slate-900 mb-2">Import Participants (CSV)</h3>
              <p className="text-slate-500 text-sm leading-relaxed mb-6">
                อัพโหลดไฟล์รายชื่อพนักงาน (.csv) เพื่อเพิ่มข้อมูลเข้าระบบจำนวนมาก <br/>
                <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded mt-2 block w-fit">
                  รูปแบบ: ., Employee ID, First Name, Last Name, Nickname
                </span>
              </p>
              
              <div className="space-y-4">
                <input 
                  type="file" 
                  accept=".csv"
                  onChange={handleFileUpload}
                  ref={fileInputRef}
                  disabled={importing}
                  className="hidden"
                  id="csv-upload"
                />
                <label 
                  htmlFor="csv-upload"
                  className={`w-full md:w-auto px-8 py-4 bg-emerald-600 text-white font-black rounded-2xl shadow-lg shadow-emerald-200 hover:bg-emerald-700 hover:-translate-y-1 active:translate-y-0 transition-all flex items-center justify-center gap-3 cursor-pointer ${importing ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  {importing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>กำลังนำเข้า ({importProgress.current}/{importProgress.total})</span>
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>
                      <span>UPLOAD CSV FILE</span>
                    </>
                  )}
                </label>
                {importing && (
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-emerald-500 h-full transition-all duration-300" 
                      style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                    ></div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Action: Reset Draw Status */}
        <div className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-xl border border-slate-100 transition-all hover:shadow-2xl">
          <div className="flex flex-col md:flex-row items-start gap-6">
            <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <div className="flex-grow">
              <h3 className="text-xl font-black text-slate-900 mb-2">Reset Draw Status</h3>
              <p className="text-slate-500 text-sm leading-relaxed mb-6">
                ล้างผลการจับฉลากทั้งหมดเพื่อให้เริ่มเล่นใหม่ได้ โดยที่รายชื่อพนักงานยังอยู่ครบ <br/>
                <span className="text-amber-500 font-bold">* ทุกคนจะกลับมามีสถานะว่างพร้อมถูกจับ *</span>
              </p>
              
              <button 
                onClick={handleResetDrawStatus}
                disabled={loadingClear || loadingReset || loadingResetDraw || importing}
                className={`w-full md:w-auto px-8 py-4 bg-amber-600 text-white font-black rounded-2xl shadow-lg shadow-amber-200 hover:bg-amber-700 hover:-translate-y-1 active:translate-y-0 transition-all disabled:opacity-50 flex items-center justify-center gap-2`}
              >
                {loadingResetDraw && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                {loadingResetDraw ? 'กำลังรีเซ็ตสถานะ...' : 'RESET DRAWING STATUS'}
              </button>
            </div>
          </div>
        </div>

        {/* Action: Clear Participants */}
        <div className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-xl border border-slate-100 transition-all hover:shadow-2xl opacity-80 hover:opacity-100">
          <div className="flex flex-col md:flex-row items-start gap-6">
            <div className="w-16 h-16 bg-rose-100 rounded-2xl flex items-center justify-center flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <div className="flex-grow">
              <h3 className="text-xl font-black text-slate-900 mb-2">Clear Participant Data</h3>
              <p className="text-slate-500 text-sm leading-relaxed mb-6">
                ลบรายชื่อพนักงานและผลการจับฉลากทั้งหมด (ใช้สำหรับล้างข้อมูลทดสอบ) <br/>
                <span className="text-rose-500 font-bold">* หมายเลข Running No จะยังคงเดิม *</span>
              </p>
              
              <button 
                onClick={handleClearParticipants}
                disabled={loadingClear || loadingReset || loadingResetDraw || importing}
                className={`w-full md:w-auto px-8 py-4 bg-rose-600 text-white font-black rounded-2xl shadow-lg shadow-rose-200 hover:bg-rose-700 hover:-translate-y-1 active:translate-y-0 transition-all disabled:opacity-50 flex items-center justify-center gap-2`}
              >
                {loadingClear && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                {loadingClear ? 'กำลังลบข้อมูล...' : 'CLEAR ALL PARTICIPANTS'}
              </button>
            </div>
          </div>
        </div>

        {/* Action: Reset Counter */}
        <div className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-xl border border-slate-100 transition-all hover:shadow-2xl opacity-80 hover:opacity-100">
          <div className="flex flex-col md:flex-row items-start gap-6">
            <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <div className="flex-grow">
              <h3 className="text-xl font-black text-slate-900 mb-2">Reset Running Number</h3>
              <p className="text-slate-500 text-sm leading-relaxed mb-6">
                ตั้งค่าตัวนับลำดับผู้สมัครกลับไปเริ่มต้นที่ 1 ใหม่ <br/>
                <span className="text-indigo-500 font-bold">* รายชื่อที่มีอยู่เดิมจะยังอยู่ครบถ้วน *</span>
              </p>
              
              <button 
                onClick={handleResetCounter}
                disabled={loadingClear || loadingReset || loadingResetDraw || importing}
                className={`w-full md:w-auto px-8 py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:-translate-y-1 active:translate-y-0 transition-all disabled:opacity-50 flex items-center justify-center gap-2`}
              >
                {loadingReset && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                {loadingReset ? 'กำลังรีเซ็ต...' : 'RESET RUNNING NO TO 1'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-20 text-center">
        <div className="inline-block p-4 bg-slate-100 rounded-full text-slate-400 font-bold text-xs uppercase tracking-widest">
          Maintenance Panel • PTG 2026
        </div>
      </div>
    </div>
  );
};

export default SettingView;
