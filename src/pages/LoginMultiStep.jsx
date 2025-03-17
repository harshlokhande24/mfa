import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import * as faceapi from "face-api.js";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";

// Import detection functions from our separate modules
import { detectBlinkDynamic } from "./blinkDetection";
import { detectHeadMovement, distance } from "./headMovementDetection";

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
  // For storing blink detection state (for moving average)
  const blinkStateRef = useRef({ earHistory: [], inBlink: false });
  // For storing head movement landmark history (for multi-frame analysis)
  const headLandmarksHistoryRef = useRef([]);
  // For navigation after successful authentication
  const navigate = useNavigate();

  // ----------- STEP 1: Credentials Verification -----------
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
      if (!loginResponse.ok) {
        throw new Error("Invalid credentials. Please try again.");
      }
      const data = await loginResponse.json();
      console.log("[STEP 1] Login successful. Received user data:", data.user);
      setUser(data.user);
      const otpResponse = await fetch("http://localhost:5000/generate-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!otpResponse.ok) {
        throw new Error("Unable to generate OTP. Please try again later.");
      }
      console.log("[STEP 1] OTP generated successfully for:", email);
      setStep(2);
    } catch (err) {
      console.error("[STEP 1] Credentials error:", err);
      setError(err.message);
    }
    setLoading(false);
  };

  // ----------- STEP 2: OTP Verification -----------
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
      if (!response.ok) {
        throw new Error("Invalid OTP. Please try again.");
      }
      console.log("[STEP 2] OTP verified successfully for:", email);
      setStep(3);
    } catch (err) {
      console.error("[STEP 2] OTP verification error:", err);
      setError(err.message);
    }
    setLoading(false);
  };

  // ----------- STEP 3: Face Recognition -----------
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
          // Optionally load additional models (face expressions, etc.)
          setModelsLoaded(true);
          console.log("[STEP 3] Face-api models loaded successfully.");
        } catch (err) {
          console.error("[STEP 3] Error loading face-api models:", err);
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
            console.log("[STEP 3] Camera stream successfully set on video element.");
          }
        })
        .catch((err) =>
          setError("Error accessing camera: " + err.message)
        );
    }
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
        console.log("[Cleanup] Camera tracks stopped.");
      }
      if (faceApiIntervalRef.current) {
        clearInterval(faceApiIntervalRef.current);
        console.log("[Cleanup] Face detection interval cleared.");
      }
    };
  }, [step, modelsLoaded]);

  // Helper: Preprocess image for antispoofing (expects input shape [1, 32, 32, 3])
  async function processImageForAntispoof(imageBuffer) {
    console.log("[Process] processImageForAntispoof called");
    try {
      const decodedImage = tf.node.decodeImage(imageBuffer, 3);
      console.log("[Process] Decoded image shape:", decodedImage.shape);
      const resizedImage = tf.image.resizeBilinear(decodedImage, [32, 32]);
      console.log("[Process] Resized image shape:", resizedImage.shape);
      const normalizedImage = resizedImage.div(255.0);
      normalizedImage.print();
      const finalTensor = normalizedImage.expandDims(0);
      console.log("[Process] Final input tensor shape:", finalTensor.shape);
      return finalTensor;
    } catch (err) {
      console.error("[Process] Error in processImageForAntispoof:", err);
      throw err;
    }
  }

  // Convert stored face image (from backend) to a base64 data URL for face-api.
  const loadLabeledFaceDescriptors = async () => {
    const descriptors = [];
    try {
      console.log("[Face-Load] Loading stored face image for user:", user._id);
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
      console.log("[Face-Load] Fetched stored image for user.");
      const detection = await faceapi
        .detectSingleFace(img)
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (detection) {
        console.log("[Face-Load] Face descriptor loaded from stored image.");
        descriptors.push(detection.descriptor);
      } else {
        console.warn("[Face-Load] No face detected in stored image.");
      }
    } catch (err) {
      console.error("[Face-Load] Error loading face descriptors:", err);
      setError("Error loading face data from stored image.");
    }
    return new faceapi.LabeledFaceDescriptors(user._id, descriptors);
  };

  // ------------------------
  // FACE-BASED LOGIN WITH ANTISPOOFING AND LIVENESS (Blink + Head Movement)
  // ------------------------
  const handleVideoPlay = async () => {
    if (!videoRef.current || !modelsLoaded || !user) return;
    console.log("[Face-Play] handleVideoPlay triggered.");
    const labeledFaceDescriptors = await loadLabeledFaceDescriptors();
    console.log("[Face-Play] Labeled descriptors loaded.");
    const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, 0.6);
    // Reset head movement history on each new session
    headLandmarksHistoryRef.current = [];
    faceApiIntervalRef.current = setInterval(async () => {
      if (!videoRef.current) return;
      const detections = await faceapi
        .detectAllFaces(videoRef.current)
        .withFaceLandmarks()
        .withFaceDescriptors();
      console.log("[Face-Play] Detections found:", detections.length);
      const resizedDetections = faceapi.resizeResults(detections, {
        width: videoRef.current.videoWidth,
        height: videoRef.current.videoHeight,
      });
      if (canvasRef.current) {
        const context = canvasRef.current.getContext("2d");
        context.clearRect(0, 0, videoRef.current.videoWidth, videoRef.current.videoHeight);
        faceapi.draw.drawDetections(canvasRef.current, resizedDetections);
        faceapi.draw.drawFaceLandmarks(canvasRef.current, resizedDetections);
      }
      if (resizedDetections.length > 0) {
        // Update head landmarks history with the first detected face's landmarks.
        headLandmarksHistoryRef.current.push(resizedDetections[0].landmarks.positions);
        if (headLandmarksHistoryRef.current.length > 30) {
          headLandmarksHistoryRef.current.shift();
        }
        // Face matching
        const results = resizedDetections.map((d) =>
          faceMatcher.findBestMatch(d.descriptor)
        );
        console.log("[Face-Play] Face matching results:", results);
        const bestMatch = results.find((r) => r.label === user._id);
        if (bestMatch && bestMatch.distance < 0.5) {
          console.log("[Face-Play] Face match found. Distance:", bestMatch.distance);
          // Liveness: Blink detection
          const blinkResult = detectBlinkDynamic(
            resizedDetections[0].landmarks,
            blinkStateRef.current,
            5,
            0.25,
            0.85
          );
          console.log("[Face-Play] Blink detection result:", blinkResult);
          // Liveness: Head movement detection
          let headMovementResult = { movementDetected: false, movementType: null };
          if (headLandmarksHistoryRef.current.length >= 15) {
            headMovementResult = detectHeadMovement(headLandmarksHistoryRef.current);
          }
          console.log("[Face-Play] Head movement detection result:", headMovementResult);
          
          // Accept login if either blink OR head movement is detected as liveness cues.
          if (blinkResult.blinkDetected || headMovementResult.movementDetected) {
            console.log("[Face-Play] Liveness confirmed. Proceeding with face login.");
            clearInterval(faceApiIntervalRef.current);
            // Optionally capture a snapshot and send it to the backend.
            const captureCanvas = document.createElement("canvas");
            captureCanvas.width = videoRef.current.videoWidth;
            captureCanvas.height = videoRef.current.videoHeight;
            const ctx = captureCanvas.getContext("2d");
            ctx.drawImage(videoRef.current, 0, 0);
            const faceImageDataUrl = captureCanvas.toDataURL("image/png");
            console.log("[Face-Play] Captured face image (first 50 chars):", faceImageDataUrl.substring(0, 50) + "...");
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
          } else {
            console.log("[Face-Play] Liveness cues not yet satisfied (blink:", blinkResult.blinkDetected, "head movement:", headMovementResult.movementDetected, ").");
            setFaceResult("NO_MATCH");
          }
        } else {
          console.log("[Face-Play] No matching face found or distance too high.");
          setFaceResult("NO_MATCH");
        }
      } else {
        console.log("[Face-Play] No face detected in video frame.");
      }
    }, 1000 / 15); // ~15 FPS
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
            {error && <p className="text-red-500 text-center mb-4">{error}</p>}
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
            {error && <p className="text-red-500 text-center mb-4">{error}</p>}
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
            {error && <p className="text-red-500 text-center mb-4">{error}</p>}
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
