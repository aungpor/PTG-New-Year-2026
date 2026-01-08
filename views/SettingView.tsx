
import React, { useState } from 'react';
import { collection, getDocs, doc, setDoc, writeBatch, query, limit } from 'firebase/firestore';
import { db, COLLECTION_NAME, META_COLLECTION, COUNTER_DOC } from '../services/firebase';

const SettingView: React.FC = () => {
  const [loadingClear, setLoadingClear] = useState(false);
  const [loadingReset, setLoadingReset] = useState(false);

  // Helper function to delete documents in chunks to avoid Firestore batch limits (500)
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
      console.log("Starting clearance of collection:", COLLECTION_NAME);
      const deletedCount = await deleteCollection(COLLECTION_NAME);
      
      if (deletedCount === 0) {
        alert("ไม่พบข้อมูลพนักงานในระบบให้ลบ");
      } else {
        alert(`ลบรายชื่อพนักงานทั้งหมด ${deletedCount} รายการเรียบร้อยแล้ว`);
      }
    } catch (error: any) {
      console.error("Firestore Clear Error Details:", error);
      alert(`ไม่สามารถลบข้อมูลได้: ${error.message || 'กรุณาตรวจสอบสิทธิ์การเข้าถึง Firebase'}`);
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
      console.log("Resetting counter in:", META_COLLECTION, COUNTER_DOC);
      const counterRef = doc(db, META_COLLECTION, COUNTER_DOC);
      await setDoc(counterRef, { value: 0 }, { merge: true });
      alert("รีเซ็ตลำดับหมายเลขกลับไปเริ่มที่ 1 เรียบร้อยแล้ว");
    } catch (error: any) {
      console.error("Firestore Reset Counter Error Details:", error);
      alert(`ไม่สามารถรีเซ็ตหมายเลขได้: ${error.message || 'กรุณาตรวจสอบสิทธิ์การเข้าถึง Firebase'}`);
    } finally {
      setLoadingReset(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-20 animate-in fade-in slide-in-from-bottom-5 duration-500">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-black text-slate-900 tracking-tight">System Settings</h1>
        <p className="text-slate-500 font-medium mt-2">Maintenance and administrative tools</p>
      </div>

      <div className="space-y-8">
        {/* Action 1: Clear Participants */}
        <div className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-xl border border-slate-100 transition-all hover:shadow-2xl">
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
                <span className="text-rose-500 font-bold">* หมายเลข Running No จะไม่ถูกรีเซ็ต *</span>
              </p>
              
              <button 
                onClick={handleClearParticipants}
                disabled={loadingClear || loadingReset}
                className={`w-full md:w-auto px-8 py-4 bg-rose-600 text-white font-black rounded-2xl shadow-lg shadow-rose-200 hover:bg-rose-700 hover:-translate-y-1 active:translate-y-0 transition-all disabled:opacity-50 flex items-center justify-center gap-2`}
              >
                {loadingClear && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                {loadingClear ? 'กำลังลบข้อมูล...' : 'CLEAR ALL PARTICIPANTS'}
              </button>
            </div>
          </div>
        </div>

        {/* Action 2: Reset Counter */}
        <div className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-xl border border-slate-100 transition-all hover:shadow-2xl">
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
                disabled={loadingClear || loadingReset}
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
