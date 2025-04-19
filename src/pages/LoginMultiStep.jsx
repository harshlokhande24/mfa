import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import * as faceapi from "face-api.js";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";

// Mapping for digit words (if needed)
const wordToDigit = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9"
};

function LoginMultiStep() {
  // Steps: 1 = Credentials, 2 = OTP, 3 = Face Recognition (Challenge)
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState(null);

  // For face recognition
  const videoRef = useRef();
  const canvasRef = useRef();
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [faceResult, setFaceResult] = useState("");
  const faceApiIntervalRef = useRef(null);

  // Speech challenge states
  const [challenge, setChallenge] = useState("");
  const [speechActive, setSpeechActive] = useState(false);
  const [challengeVerified, setChallengeVerified] = useState(false);
  // Use a ref to hold the latest challengeVerified value for interval callback.
  const challengeVerifiedRef = useRef(false);
  const speechRecognitionRef = useRef(null);

  const navigate = useNavigate();

  // --- STEP 1: Credentials Verification ---
  const handleCredentialsSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    console.log("[STEP 1] Submitting credentials for:", email);
    try {
      const loginResponse = await fetch("http://localhost:5000/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!loginResponse.ok) throw new Error("Invalid credentials.");
      const data = await loginResponse.json();
      console.log("[STEP 1] Login successful:", data.user);
      setUser(data.user);
      const otpResponse = await fetch("http://localhost:5000/generate-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!otpResponse.ok) throw new Error("Unable to generate OTP.");
      console.log("[STEP 1] OTP generated for:", email);
      setStep(2);
    } catch (err) {
      console.error("[STEP 1] Error:", err);
      setError(err.message);
    }
    setLoading(false);
  };

  // --- STEP 2: OTP Verification ---
  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    console.log("[STEP 2] Submitting OTP for:", email);
    try {
      const response = await fetch("http://localhost:5000/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      if (!response.ok) throw new Error("Invalid OTP.");
      console.log("[STEP 2] OTP verified for:", email);
      setStep(3);
      // Generate a random 4-digit challenge for face verification
      const randChallenge = Math.floor(1000 + Math.random() * 9000).toString();
      setChallenge(randChallenge);
      console.log("[STEP 3] Challenge generated:", randChallenge);
    } catch (err) {
      console.error("[STEP 2] Error:", err);
      setError(err.message);
    }
    setLoading(false);
  };

  // --- STEP 3: Face Recognition ---
  useEffect(() => {
    tf.setBackend("webgl").then(() => {
      console.log("[STEP 3] TensorFlow backend set to WebGL");
    });
    if (step === 3 && !modelsLoaded) {
      const loadModels = async () => {
        try {
          console.log("[STEP 3] Loading face-api models from /models...");
          await faceapi.nets.ssdMobilenetv1.loadFromUri("/models");
          await faceapi.nets.faceLandmark68Net.loadFromUri("/models");
          await faceapi.nets.faceRecognitionNet.loadFromUri("/models");
          setModelsLoaded(true);
          console.log("[STEP 3] Face-api models loaded successfully.");
        } catch (err) {
          console.error("[STEP 3] Error loading models:", err);
          setError("Error loading face recognition models.");
        }
      };
      loadModels();
    }
  }, [step, modelsLoaded]);

  useEffect(() => {
    if (step === 3 && modelsLoaded) {
      console.log("[STEP 3] Accessing user camera...");
      navigator.mediaDevices
        .getUserMedia({ video: true })
        .then((stream) => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            console.log("[STEP 3] Camera stream set.");
          }
        })
        .catch((err) =>
          setError("Error accessing camera: " + err.message)
        );
    }
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
        console.log("[Cleanup] Camera stopped.");
      }
      if (faceApiIntervalRef.current) {
        clearInterval(faceApiIntervalRef.current);
        console.log("[Cleanup] Face detection interval cleared.");
      }
    };
  }, [step, modelsLoaded]);

  // --- Speech Recognition for Challenge ---
  useEffect(() => {
    if (step === 3 && challenge && speechActive) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        console.warn("[Speech] SpeechRecognition API not supported in this browser.");
        return;
      }
      const recognition = new SpeechRecognition();
      speechRecognitionRef.current = recognition;
      recognition.lang = "en-US";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      console.log("[Speech] Starting recognition for challenge:", challenge);
      recognition.start();
      recognition.onresult = (event) => {
        let spokenText = event.results[0][0].transcript.trim();
        console.log("[Speech] Raw recognized speech:", spokenText);
        // Normalize: convert to lowercase and remove spaces
        let normalizedSpoken = spokenText.toLowerCase().replace(/\s+/g, "");
        // Optionally convert words to digits:
        Object.keys(wordToDigit).forEach((word) => {
          normalizedSpoken = normalizedSpoken.replace(new RegExp(word, "g"), wordToDigit[word]);
        });
        console.log("[Speech] Normalized recognized speech:", normalizedSpoken);
        if (normalizedSpoken === challenge) {
          console.log("[Speech] Challenge verified successfully.");
          setChallengeVerified(true);
          challengeVerifiedRef.current = true;
        } else {
          console.log("[Speech] Challenge verification failed. Expected:", challenge, "Got:", normalizedSpoken);
          setChallengeVerified(false);
          challengeVerifiedRef.current = false;
        }
      };
      recognition.onerror = (event) => {
        console.error("[Speech] Recognition error:", event.error);
      };
      return () => recognition.abort();
    }
  }, [challenge, step, speechActive]);

  // --- Speech recognition button handlers ---
  const handleStartSpeech = () => {
    console.log("[Speech] Start button clicked.");
    setSpeechActive(true);
  };

  const handleStopSpeech = () => {
    console.log("[Speech] Stop button clicked.");
    setSpeechActive(false);
    // Do not reset challengeVerified so that once verified, it persists.
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.abort();
    }
  };

  // --- Helper: Preprocess image for snapshot capture ---
  async function processImageForAntispoof(imageBuffer) {
    console.log("[Process] Preprocessing image...");
    try {
      const decodedImage = tf.node.decodeImage(imageBuffer, 3);
      console.log("[Process] Decoded image shape:", decodedImage.shape);
      const resizedImage = tf.image.resizeBilinear(decodedImage, [32, 32]);
      console.log("[Process] Resized image shape:", resizedImage.shape);
      const normalizedImage = resizedImage.div(255.0);
      normalizedImage.print();
      const finalTensor = normalizedImage.expandDims(0);
      console.log("[Process] Final tensor shape:", finalTensor.shape);
      return finalTensor;
    } catch (err) {
      console.error("[Process] Error:", err);
      throw err;
    }
  }

  // --- Convert stored face image to data URL ---
  const loadLabeledFaceDescriptors = async () => {
    const descriptors = [];
    try {
      console.log("[Face-Load] Loading stored face for user:", user._id);
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
      console.log("[Face-Load] Fetched stored image.");
      const detection = await faceapi
        .detectSingleFace(img)
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (detection) {
        console.log("[Face-Load] Face descriptor loaded.");
        descriptors.push(detection.descriptor);
      } else {
        console.warn("[Face-Load] No face detected in stored image.");
      }
    } catch (err) {
      console.error("[Face-Load] Error:", err);
      setError("Error loading face data.");
    }
    return new faceapi.LabeledFaceDescriptors(user._id, descriptors);
  };

  // --- Main Face Recognition & Challenge Verification ---
  const handleVideoPlay = async () => {
    if (!videoRef.current || !modelsLoaded || !user) return;
    console.log("[Face-Play] Starting face recognition challenge.");
    const labeledFaceDescriptors = await loadLabeledFaceDescriptors();
    const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, 0.6);
    faceApiIntervalRef.current = setInterval(async () => {
      if (!videoRef.current) return;
      const detections = await faceapi
        .detectAllFaces(videoRef.current)
        .withFaceLandmarks()
        .withFaceDescriptors();
      console.log("[Face-Play] Detections count:", detections.length);
      const resizedDetections = faceapi.resizeResults(detections, {
        width: videoRef.current.videoWidth,
        height: videoRef.current.videoHeight,
      });
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext("2d");
        ctx.clearRect(0, 0, videoRef.current.videoWidth, videoRef.current.videoHeight);
        faceapi.draw.drawDetections(canvasRef.current, resizedDetections);
        faceapi.draw.drawFaceLandmarks(canvasRef.current, resizedDetections);
      }
      if (resizedDetections.length > 0) {
        const results = resizedDetections.map((d) =>
          faceMatcher.findBestMatch(d.descriptor)
        );
        console.log("[Face-Play] Matching results:", results);
        const bestMatch = results.find((r) => r.label === user._id);
        if (bestMatch && bestMatch.distance < 0.5) {
          console.log("[Face-Play] Face match found. Distance:", bestMatch.distance);
          // Check if the challenge has been verified using the ref for up-to-date value.
          if (!challengeVerifiedRef.current) {
            console.log("[Face-Play] Face verified, waiting for speech challenge...");
            setFaceResult(""); // Do not show "NO_MATCH" until speech challenge is complete.
          } else {
            console.log("[Face-Play] Challenge verified via speech. Proceeding with login.");
            clearInterval(faceApiIntervalRef.current);
            const captureCanvas = document.createElement("canvas");
            captureCanvas.width = videoRef.current.videoWidth;
            captureCanvas.height = videoRef.current.videoHeight;
            const ctx = captureCanvas.getContext("2d");
            ctx.drawImage(videoRef.current, 0, 0);
            const faceImageDataUrl = captureCanvas.toDataURL("image/png");
            console.log("[Face-Play] Captured image (first 50 chars):", faceImageDataUrl.substring(0, 50) + "...");
            try {
              const response = await fetch("http://localhost:5000/face-login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, faceImage: faceImageDataUrl }),
              });
              if (response.ok) {
                console.log("[Face-Play] Server verified face login successfully.");
                localStorage.setItem("faceAuth", JSON.stringify({ account: user }));
                navigate("/protected");
              } else {
                const data = await response.json();
                console.error("[Face-Play] Server rejected face login:", data.error);
                setFaceResult("NO_MATCH");
              }
            } catch (err) {
              console.error("[Face-Play] Error calling /face-login endpoint:", err);
              setError("Error verifying face on server.");
            }
          }
        } else {
          console.log("[Face-Play] No matching face found or distance too high.");
          setFaceResult("NO_MATCH");
        }
      } else {
        console.log("[Face-Play] No face detected in video frame.");
      }
    }, 1000 / 15);
  };

  // Overlay the challenge on the video
  const renderChallengeOverlay = () => {
    if (step === 3 && challenge) {
      return (
        <div style={{
          position: "absolute",
          top: "10%",
          left: "50%",
          transform: "translateX(-50%)",
          padding: "8px 16px",
          backgroundColor: "rgba(0,0,0,0.5)",
          color: "#fff",
          fontSize: "1.5rem",
          fontWeight: "bold",
          borderRadius: "8px",
          textAlign: "center",
          boxShadow: "0px 4px 6px rgba(0, 0, 0, 0.1)",
          zIndex: 2
        }}>
          {challenge}
        </div>
      );
    }
    return null;
  };

  // Render a button to start/stop speech recognition
  const renderSpeechButton = () => {
    if (step === 3 && challenge) {
      return (
        <div className="flex justify-center mt-4">
        {!speechActive ? (
          <button 
            onClick={handleStartSpeech} 
            className="px-4 py-2 bg-green-500 text-white rounded-lg shadow-md hover:bg-green-600 transition-all"
          >
            Start Challenge
          </button>
        ) : (
          <button 
            onClick={handleStopSpeech} 
            className="px-4 py-2 bg-red-500 text-white rounded-lg shadow-md hover:bg-red-600 transition-all"
          >
            Stop Challenge
          </button>
        )}
        </div>
      );
    }
    return null;
  };


  return (
    <div className="bg-white py-20 min-h-screen">
      <div className="max-w-md mx-auto">
        {step === 1 && (
          <form onSubmit={handleCredentialsSubmit} className="bg-gray-50 p-8 rounded-lg shadow-md">
            <h2 className="text-2xl font-bold text-center mb-6">Login with Email &amp; Password</h2>
            {error && <p className="text-red-500 text-center mb-4">{error}</p>}
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full p-3 mb-4 border border-gray-300 rounded" />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full p-3 mb-4 border border-gray-300 rounded" />
            <button type="submit" disabled={loading} className="w-full py-3 bg-indigo-500 text-white rounded hover:bg-indigo-600 transition-colors">
              {loading ? "Verifying..." : "Login"}
            </button>
          </form>
        )}
        {step === 2 && (
  <form onSubmit={handleOtpSubmit} className="bg-gray-50 p-8 rounded-lg shadow-md mt-8">
    <h2 className="text-2xl font-bold text-center mb-6">OTP Verification</h2>
    {error && <p className="text-red-500 text-center mb-4">{error}</p>}
    
    <div className="flex justify-center gap-2 mb-6">
      {Array.from({ length: 6 }).map((_, index) => (
        <input
          key={index}
          type="password"
          maxLength="1"
          value={otp[index] || ""}
          onChange={(e) => {
            const val = e.target.value;
            if (!/^[0-9]$/.test(val) && val !== "") return;
            const newOtp = otp.split("");
            newOtp[index] = val;
            setOtp(newOtp.join(""));

            // Auto focus to next input
            if (val && index < 5) {
              const nextInput = document.getElementById(`otp-${index + 1}`);
              nextInput?.focus();
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !otp[index] && index > 0) {
              const prevInput = document.getElementById(`otp-${index - 1}`);
              prevInput?.focus();
            }
          }}
          id={`otp-${index}`}
          className="w-12 text-center p-3 border border-gray-300 rounded text-xl tracking-widest"
          inputMode="numeric"
          autoComplete="one-time-code"
        />
      ))}
    </div>

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
          <div className="bg-gray-50 p-8 rounded-lg shadow-md mt-8" style={{ position: "relative" }}>
            <h2 className="text-2xl font-bold text-center mb-6">Face Recognition</h2>
            {error && <p className="text-red-500 text-center mb-4">{error}</p>}
            {renderChallengeOverlay()}
            {renderSpeechButton()}
            <div className="relative">
              <video ref={videoRef} autoPlay muted width="100%" height="auto" onPlay={handleVideoPlay} className="border border-gray-300 rounded" />
              <canvas ref={canvasRef} width="640" height="360" className="absolute top-0 left-0 w-full h-full" />
            </div>
            {faceResult === "MATCH" && (
              <p className="text-green-500 text-center mt-4">Face recognized successfully!</p>
            )}
            {faceResult === "NO_MATCH" && (
              <p className="text-red-500 text-center mt-4">Face not recognized. Please try again.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default LoginMultiStep;
