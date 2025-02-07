import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function Protected() {
  const [account, setAccount] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const authData = localStorage.getItem("faceAuth");
    if (!authData) {
      navigate("/login");
      return;
    }
    const { account } = JSON.parse(authData);
    setAccount(account);
  }, [navigate]);

  if (!account) {
    return null;
  }

  return (
    <div className="bg-white py-40 md:py-60 min-h-screen">
      <div className="mx-auto max-w-4xl text-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl mb-8">
          You have successfully logged in!
        </h2>
        <div className="flex flex-col items-center">
          <h1 className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-indigo-900 mb-4">
            {account.fullName}
          </h1>
          <p className="text-lg text-gray-700 mb-8">{account.email}</p>
          <button
            onClick={() => {
              localStorage.removeItem("faceAuth");
              navigate("/");
            }}
            className="flex items-center gap-2 mx-auto py-3 px-6 rounded-full bg-gradient-to-r from-indigo-300 to-indigo-500 hover:from-indigo-400 hover:to-indigo-600 transition-colors"
          >
            <span className="text-white">Log Out</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="white"
              className="w-6 h-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default Protected;
