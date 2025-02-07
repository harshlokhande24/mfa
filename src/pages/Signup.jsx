import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import * as faceapi from "face-api.js";

function Signup() {
  const [form, setForm] = useState({ fullName: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef();
  const canvasRef = useRef();
  const navigate = useNavigate();

  useEffect(() => {
    const loadModels = async () => {
      try {
        await faceapi.nets.ssdMobilenetv1.loadFromUri("/models");
        await faceapi.nets.faceLandmark68Net.loadFromUri("/models");
        await faceapi.nets.faceRecognitionNet.loadFromUri("/models");
        console.log("Face models loaded successfully.");
      } catch (error) {
        console.error("Face model loading error:", error);
        alert("Error loading face models. Please try again.");
      }
    };
    loadModels();
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoRef.current.srcObject = stream;
      setCameraActive(true);
    } catch (error) {
      console.error("Camera error:", error);
      alert("Unable to access camera. Please allow camera permissions.");
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      setCameraActive(false);
    }
  };

  useEffect(() => {
    return () => stopCamera(); // Cleanup camera when unmounting
  }, []);

  const captureFaceImage = async () => {
    if (!videoRef.current || !cameraActive) {
      alert("Please start the camera first.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

    // Convert image to Base64
    const base64Image = canvas.toDataURL("image/png");
    setCapturedImage(base64Image);
    console.log("Captured Face Image:", base64Image);
    alert("Face image captured successfully!");
    stopCamera(); // Stop camera after capturing face
  };

  // Handle image upload from local storage
  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setCapturedImage(reader.result);
      console.log("Uploaded image:", reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSignup = async () => {
    if (!capturedImage) {
      alert("Please capture or upload your face image before signing up.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("http://localhost:5000/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, faceImage: capturedImage }),
      });

      if (response.ok) {
        console.log("Signup successful");
        navigate("/otp-verify");
      } else {
        alert("Signup failed. Email might be already in use.");
      }
    } catch (error) {
      console.error("Signup error:", error);
      alert("Failed to connect to the server. Try again later.");
    }
    setLoading(false);
  };

  return (
    // Removed vertical centering so the page can scroll upward when needed.
    <div className="bg-gray-100 min-h-screen overflow-y-auto py-8">
      <div className="bg-white p-8 shadow-lg rounded-lg w-96 mx-auto">
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">
          Create an Account
        </h2>

        <input
          type="text"
          placeholder="Full Name"
          className="w-full px-4 py-2 mb-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-400"
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
        />
        <input
          type="email"
          placeholder="Email"
          className="w-full px-4 py-2 mb-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-400"
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <input
          type="password"
          placeholder="Password"
          className="w-full px-4 py-2 mb-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-400"
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />

        {/* Webcam Section */}
        <div className="text-center my-4">
          <video
            ref={videoRef}
            autoPlay
            muted
            className="w-full rounded-md border"
          ></video>
          <canvas ref={canvasRef} style={{ display: "none" }}></canvas>
          <div className="mt-2 flex justify-center gap-2">
            <button
              onClick={startCamera}
              className="py-2 px-3 rounded-full bg-gradient-to-r from-indigo-300 to-indigo-500 text-white hover:from-indigo-400 hover:to-indigo-600 transition-colors"
            >
              Start Camera
            </button>
            <button
              onClick={captureFaceImage}
              className="py-2 px-3 rounded-full bg-gradient-to-r from-indigo-300 to-indigo-500 text-white hover:from-indigo-400 hover:to-indigo-600 transition-colors"
            >
              Capture Face
            </button>
          </div>
        </div>

        {/* File Upload Section */}
        <div className="text-center my-4">
          <label className="block mb-2 text-gray-600">Or Upload an Image</label>
          <label className="inline-block cursor-pointer bg-gradient-to-r from-indigo-300 to-indigo-500 text-white py-2 px-3 rounded-full hover:from-indigo-400 hover:to-indigo-600 transition-colors">
            Choose File
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </label>
        </div>

        {/* Image Preview Section with scrolling if content exceeds */}
        {capturedImage && (
          <div
            className="text-center my-4 overflow-y-auto"
            style={{ maxHeight: "300px" }}
          >
            <h3 className="text-lg font-medium mb-2">Image Preview:</h3>
            <img
              src={capturedImage}
              alt="Preview"
              className="mx-auto rounded-md border"
              style={{ maxWidth: "100%", height: "auto" }}
            />
          </div>
        )}

        <button
          onClick={handleSignup}
          className="w-full mt-4 py-3 rounded-full bg-gradient-to-r from-indigo-300 to-indigo-500 text-white hover:from-indigo-400 hover:to-indigo-600 transition-colors"
        >
          {loading ? "Signing Up..." : "Sign Up"}
        </button>
      </div>
    </div>
  );
}

export default Signup;
