import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import "./App.css";
import Authentic from "./Authentic";
import { useEffect } from 'react';
import ResetPassword from "./Resetpassword"
function App() {
  useEffect(() => {
    document.title = "File Tracking System";
  }, []);
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Authentic />} />
        <Route path="/dashboard" element={<Authentic />} />
       <Route path="/reset-password/:token" element={<ResetPassword />} />
        <Route path="*" element={<Authentic />} /> {/* Catch-all route */}
      </Routes>
    </div>
  );
}

export default App;



