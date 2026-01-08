
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Using the provided Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAxlz4aaFkxMP2Te9zRp2H6JGmyk7vfRlo",
  authDomain: "ptg-new-year-party.firebaseapp.com",
  projectId: "ptg-new-year-party",
  storageBucket: "ptg-new-year-party.firebasestorage.app",
  messagingSenderId: "980972282794",
  appId: "1:980972282794:web:6dae2b36c9c3c9d71e01d3",
  measurementId: "G-M08DN270QG"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export interface Participant {
  id?: string;
  EmpID: string;
  FirstName: string;
  LastName: string;
  Module: string;
  RunningNo: number;
  Status: 'Eligible' | 'Won' | 'Finished'; // Eligible: Available to be drawn, Won: Been drawn by someone, Finished: Has participated and drawn someone
  WonBy?: string; // EmpID of the person who drew this name
  DrawnResult?: string; // EmpID of the person this user drew
  WonAt?: any;
  CreatedAt?: any;
}

export const COLLECTION_NAME = "Register";
export const META_COLLECTION = "Meta";
export const COUNTER_DOC = "RegisterCounter";
