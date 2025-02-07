import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const OtpVerify = () => {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const navigate = useNavigate();

  const sendOtp = async () => {
    await fetch("http://localhost:5000/generate-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
  };

  const verifyOtp = async () => {
    const response = await fetch("http://localhost:5000/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, otp }),
    });

    if (response.ok) navigate("/password-auth");
    else alert("Invalid OTP");
  };

  return (
    <div className="flex flex-col items-center">
      <h2>OTP Verification</h2>
      <input type="email" placeholder="Enter Email" onChange={(e) => setEmail(e.target.value)} />
      <button onClick={sendOtp}>Send OTP</button>
      <input type="text" placeholder="Enter OTP" onChange={(e) => setOtp(e.target.value)} />
      <button onClick={verifyOtp}>Verify OTP</button>
    </div>
  );
};

export default OtpVerify;
