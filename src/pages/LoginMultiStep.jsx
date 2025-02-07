import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import * as faceapi from "face-api.js";

function LoginMultiStep() {
  // Step management: 1 = Credentials, 2 = OTP, 3 = Face Recognition
  const [step, setStep] = useState(1);

  // Credentials state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // OTP state
  const [otp, setOtp] = useState("");

  // UI states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // User data returned from the backend (should include _id and faceImage)
  const [user, setUser] = useState(null);

  // Face recognition states
  const videoRef = useRef();
  const canvasRef = useRef();
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [faceResult, setFaceResult] = useState("");
  const faceApiIntervalRef = useRef(null);

  // For navigation after successful authentication
  const navigate = useNavigate();

  // ----------- STEP 1: Credentials Verification -----------
  const handleCredentialsSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const loginResponse = await fetch("http://localhost:5000/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!loginResponse.ok) {
        throw new Error("Invalid credentials. Please try again.");
      }
      const data = await loginResponse.json();
      setUser(data.user);
      const otpResponse = await fetch("http://localhost:5000/generate-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!otpResponse.ok) {
        throw new Error("Unable to generate OTP. Please try again later.");
      }
      setStep(2);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  // ----------- STEP 2: OTP Verification -----------
  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("http://localhost:5000/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      if (!response.ok) {
        throw new Error("Invalid OTP. Please try again.");
      }
      setStep(3);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  // ----------- STEP 3: Face Recognition -----------
  useEffect(() => {
    if (step === 3 && !modelsLoaded) {
      const loadModels = async () => {
        try {
          await faceapi.nets.ssdMobilenetv1.loadFromUri("/models");
          await faceapi.nets.faceLandmark68Net.loadFromUri("/models");
          await faceapi.nets.faceRecognitionNet.loadFromUri("/models");
          setModelsLoaded(true);
        } catch (err) {
          setError("Error loading face recognition models.");
        }
      };
      loadModels();
    }
  }, [step, modelsLoaded]);

  useEffect(() => {
    if (step === 3 && modelsLoaded) {
      navigator.mediaDevices
        .getUserMedia({ video: true })
        .then((stream) => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch((err) =>
          setError("Error accessing camera: " + err.message)
        );
    }
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      }
      if (faceApiIntervalRef.current) {
        clearInterval(faceApiIntervalRef.current);
      }
    };
  }, [step, modelsLoaded]);

  // Convert stored face image to a data URL so faceapi can use it.
  const loadLabeledFaceDescriptors = async () => {
    const descriptors = [];
    try {
      const base64Image =
        "data:image/png;base64," +
        (typeof Buffer !== "undefined"
          ? Buffer.from(user.faceImage.data || user.faceImage).toString("base64")
          : (() => {
              const bytes = user.faceImage.data;
              let binary = "";
              for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
              }
              return window.btoa(binary);
            })());
      const img = await faceapi.fetchImage(base64Image);
      const detection = await faceapi
        .detectSingleFace(img)
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (detection) {
        descriptors.push(detection.descriptor);
      }
    } catch (err) {
      setError("Error loading face data from stored image.");
    }
    return new faceapi.LabeledFaceDescriptors(user._id, descriptors);
  };

  const handleVideoPlay = async () => {
    if (!videoRef.current || !modelsLoaded || !user) return;
    const labeledFaceDescriptors = await loadLabeledFaceDescriptors();
    const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, 0.6);
    faceApiIntervalRef.current = setInterval(async () => {
      if (!videoRef.current) return;
      const detections = await faceapi
        .detectAllFaces(videoRef.current)
        .withFaceLandmarks()
        .withFaceDescriptors();
      const resizedDetections = faceapi.resizeResults(detections, {
        width: videoRef.current.videoWidth,
        height: videoRef.current.videoHeight,
      });
      if (canvasRef.current) {
        const context = canvasRef.current.getContext("2d");
        context.clearRect(
          0,
          0,
          videoRef.current.videoWidth,
          videoRef.current.videoHeight
        );
        faceapi.draw.drawDetections(canvasRef.current, resizedDetections);
        faceapi.draw.drawFaceLandmarks(canvasRef.current, resizedDetections);
      }
      if (resizedDetections.length > 0) {
        const results = resizedDetections.map((d) =>
          faceMatcher.findBestMatch(d.descriptor)
        );
        console.log("Face detection results:", results);
        // Find the best match for the user's face.
        const bestMatch = results.find((r) => r.label === user._id);
        if (bestMatch && bestMatch.distance < 0.5) {
          setFaceResult("MATCH");
          clearInterval(faceApiIntervalRef.current);
          localStorage.setItem("faceAuth", JSON.stringify({ account: user }));
          navigate("/protected");
        } else {
          setFaceResult("NO_MATCH");
        }
      }
    }, 1000 / 15);
  };

  return (
    <div className="bg-white py-20 min-h-screen">
      <div className="max-w-md mx-auto">
        {step === 1 && (
          <form
            onSubmit={handleCredentialsSubmit}
            className="bg-gray-50 p-8 rounded-lg shadow-md"
          >
            <h2 className="text-2xl font-bold text-center mb-6">
              Login with Email &amp; Password
            </h2>
            {error && (
              <p className="text-red-500 text-center mb-4">{error}</p>
            )}
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full p-3 mb-4 border border-gray-300 rounded"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full p-3 mb-4 border border-gray-300 rounded"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-indigo-500 text-white rounded hover:bg-indigo-600 transition-colors"
            >
              {loading ? "Verifying..." : "Login"}
            </button>
          </form>
        )}
        {step === 2 && (
          <form
            onSubmit={handleOtpSubmit}
            className="bg-gray-50 p-8 rounded-lg shadow-md mt-8"
          >
            <h2 className="text-2xl font-bold text-center mb-6">
              OTP Verification
            </h2>
            {error && (
              <p className="text-red-500 text-center mb-4">{error}</p>
            )}
            <input
              type="text"
              placeholder="Enter OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              required
              className="w-full p-3 mb-4 border border-gray-300 rounded"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-indigo-500 text-white rounded hover:bg-indigo-600 transition-colors"
            >
              {loading ? "Verifying OTP..." : "Verify OTP"}
            </button>
          </form>
        )}
        {step === 3 && (
          <div className="bg-gray-50 p-8 rounded-lg shadow-md mt-8">
            <h2 className="text-2xl font-bold text-center mb-6">
              Face Recognition
            </h2>
            {error && (
              <p className="text-red-500 text-center mb-4">{error}</p>
            )}
            <div className="relative">
              <video
                ref={videoRef}
                autoPlay
                muted
                width="100%"
                height="auto"
                onPlay={handleVideoPlay}
                className="border border-gray-300 rounded"
              />
              <canvas
                ref={canvasRef}
                width="640"
                height="360"
                className="absolute top-0 left-0 w-full h-full"
              />
            </div>
            {faceResult === "MATCH" && (
              <p className="text-green-500 text-center mt-4">
                Face recognized successfully!
              </p>
            )}
            {faceResult === "NO_MATCH" && (
              <p className="text-red-500 text-center mt-4">
                Face not recognized. Please try again.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default LoginMultiStep;
