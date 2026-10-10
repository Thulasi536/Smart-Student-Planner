import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD8Z1_3Yevcdo17O3095kB-X5Vq8bPB2ko",
  authDomain: "smart-student-planner-ed5ee.firebaseapp.com",
  projectId: "smart-student-planner-ed5ee",
  storageBucket: "smart-student-planner-ed5ee.firebasestorage.app",
  messagingSenderId: "913368981182",
  appId: "1:913368981182:web:e0a25fcfbb166d8d6208ef",
  measurementId: "G-TJQ6S1MN8T"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);