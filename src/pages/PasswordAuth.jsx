import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const PasswordAuth = () => {
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async () => {
    // Normally, you'd fetch this from a backend
    if (password === "yourpassword") {
      navigate("/face-auth");
    } else {
      alert("Incorrect Password");
    }
  };

  return (
    <div className="flex flex-col items-center">
      <h2>Password Authentication</h2>
      <input type="password" placeholder="Enter Password" onChange={(e) => setPassword(e.target.value)} />
      <button onClick={handleSubmit}>Verify</button>
    </div>
  );
};

export default PasswordAuth;
