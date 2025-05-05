import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import * as faceapi from "face-api.js";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";

// Mapping for digit words
const wordToDigit = {
  zero: "0", one: "1", two: "2", three: "3", four: "4",
  five: "5", six: "6", seven: "7", eight: "8", nine: "9"
};

function LoginMultiStep() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState(null);

  const videoRef = useRef();
  const canvasRef = useRef();
  const [modelsLoaded, setModelsLoaded] = useState(false);

  // Speech challenge
  const [challenge, setChallenge] = useState("");
  const [speechActive, setSpeechActive] = useState(false);
  const [challengeVerified, setChallengeVerified] = useState(false);
  const challengeVerifiedRef = useRef(false);
  const speechRecognitionRef = useRef(null);
  const faceVerifiedRef = useRef(false);

  const [authenticationComplete, setAuthenticationComplete] = useState(false);
  const [allVerified, setAllVerified] = useState(false);



  // Face verification
  const [faceVerified, setFaceVerified] = useState(false);

  // Blink detection FSM
  const blinkStateRef = useRef("open");
  const closedFrameRef = useRef(0);
  const openFrameRef = useRef(0);
  const blinkCountRef = useRef(0);
  const [blinkDetected, setBlinkDetected] = useState(false);

  const blinkDetectedRef = useRef(false);


  const EAR_THRESHOLD = 0.25;
  const BLINK_CLOSE_FRAMES = 2;
  const BLINK_OPEN_FRAMES = 2;
  const REQUIRED_BLINKS = 3;

  const faceIntervalRef = useRef(null);
  const navigate = useNavigate();

  // Helpers
  function distance(p1, p2) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
  }
  function computeEAR(eye) {
    const A = distance(eye[1], eye[5]);
    const B = distance(eye[2], eye[4]);
    const C = distance(eye[0], eye[3]);
    return (A + B) / (2.0 * C);
  }

  // STEP 1: Credentials
  const handleCredentialsSubmit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    console.log("[STEP 1] Submitting credentials:", email);
    try {
      const resp = await fetch("http://localhost:5000/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!resp.ok) throw new Error("Invalid credentials.");
      const { user } = await resp.json();
      setUser(user);
      console.log("[STEP 1] Login successful:", user);

      const otpResp = await fetch("http://localhost:5000/generate-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!otpResp.ok) throw new Error("Unable to generate OTP.");
      console.log("[STEP 1] OTP generated");

      setStep(2);
      console.log("[STEP 1] Moved to OTP step");
    } catch (err) {
      console.error("[STEP 1] Error:", err);
      setError(err.message);
    }
    setLoading(false);
  };

  // STEP 2: OTP
  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    console.log("[STEP 2] Submitting OTP:", otp);
    try {
      const resp = await fetch("http://localhost:5000/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      if (!resp.ok) throw new Error("Invalid OTP.");
      console.log("[STEP 2] OTP verified");

      setStep(3);
      const rand = Math.floor(1000 + Math.random()*9000).toString();
      setChallenge(rand);
      console.log("[STEP 2] Generated speech challenge:", rand);

      // Reset all FSMs & states
      blinkStateRef.current = "open";
      closedFrameRef.current = 0;
      openFrameRef.current = 0;
      blinkCountRef.current = 0;
      setBlinkDetected(false);

      setSpeechActive(false);
      setChallengeVerified(false);
      challengeVerifiedRef.current = false;

      setFaceVerified(false);
    } catch (err) {
      console.error("[STEP 2] Error:", err);
      setError(err.message);
    }
    setLoading(false);
  };

  // STEP 3: Load face-api models
  useEffect(() => {
    tf.setBackend("webgl");
    if (step === 3 && !modelsLoaded) {
      (async () => {
        try {
          console.log("[STEP 3] Loading face-api models...");
          await faceapi.nets.ssdMobilenetv1.loadFromUri("/models");
          await faceapi.nets.faceLandmark68Net.loadFromUri("/models");
          await faceapi.nets.faceRecognitionNet.loadFromUri("/models");
          setModelsLoaded(true);
          console.log("[STEP 3] Models loaded");
        } catch (err) {
          console.error("[STEP 3] Error loading models:", err);
          setError("Error loading models");
        }
      })();
    }
  }, [step, modelsLoaded]);

  // STEP 3: Access camera
  useEffect(() => {
    if (step === 3 && modelsLoaded) {
      console.log("[STEP 3] Accessing camera...");
      navigator.mediaDevices.getUserMedia({ video: true })
        .then((stream) => {
          videoRef.current.srcObject = stream;
          console.log("[STEP 3] Camera started");
        })
        .catch((err) => {
          console.error("[STEP 3] Camera error:", err);
          setError("Camera error: " + err.message);
        });
    }
    return () => {
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
        console.log("[Cleanup] Camera stopped");
      }
      clearInterval(faceIntervalRef.current);
      console.log("[Cleanup] Face loop cleared");
    };
  }, [step, modelsLoaded]);

  // STEP 3: Speech recognition
  useEffect(() => {
    if (step === 3 && challenge && speechActive) {
      console.log("[STEP 3] Starting speech recognition");
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) {
        setError("SpeechRecognition not supported");
        return;
      }
      const recog = new SR();
      speechRecognitionRef.current = recog;
      recog.lang = "en-US";
      recog.interimResults = false;
      recog.maxAlternatives = 1;
      recog.start();
      recog.onresult = (e) => {
        let txt = e.results[0][0].transcript
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "");
        Object.entries(wordToDigit).forEach(([w, d]) => {
          txt = txt.replace(new RegExp(w, "g"), d);
        });
        const ok = txt === challenge;
        setChallengeVerified(ok);
        challengeVerifiedRef.current = ok;
        console.log("[STEP 3] Speech challenge:", txt, ok);
      };
      recog.onerror = (err) => console.error("[STEP 3] Speech error:", err);
      return () => {
        recog.abort();
        console.log("[STEP 3] Speech aborted");
      };
    }
  }, [step, challenge, speechActive]);

  const handleStartSpeech = () => {
    console.log("[STEP 3] Speech start");
    setSpeechActive(true);
  };
  const handleStopSpeech = () => {
    console.log("[STEP 3] Speech stop");
    setSpeechActive(false);
    speechRecognitionRef.current?.abort();
  };

  // STEP 3: Face + Blink + Speech loop
  const handleVideoPlay = async () => {
    if (!modelsLoaded || !user) return;
    console.log("[STEP 3] Starting face recognition loop");

    // Load stored face descriptor once
    const descs = [];
    try {
      const bytes = user.faceImage.data || user.faceImage;
      let bin = "";
      bytes.forEach((b) => (bin += String.fromCharCode(b)));
      const img = await faceapi.fetchImage(
        "data:image/png;base64," + window.btoa(bin)
      );
      const det = await faceapi
        .detectSingleFace(img)
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (det) {
        descs.push(det.descriptor);
        console.log("[STEP 3] Stored descriptor loaded");
      }
    } catch (e) {
      console.warn("[STEP 3] Could not load stored descriptor", e);
    }

    const matcher = new faceapi.FaceMatcher(
      new faceapi.LabeledFaceDescriptors(user._id, descs),
      0.6
    );

    faceIntervalRef.current = setInterval(async () => {
      const video = videoRef.current;
      if (!video) return;

      const dets = await faceapi
        .detectAllFaces(video)
        .withFaceLandmarks()
        .withFaceDescriptors();

      const resized = faceapi.resizeResults(dets, {
        width: video.videoWidth,
        height: video.videoHeight,
      });

      const ctx = canvasRef.current.getContext("2d");
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      faceapi.draw.drawDetections(canvasRef.current, resized);
      faceapi.draw.drawFaceLandmarks(canvasRef.current, resized);

      if (resized.length > 0) {
        // 1) Face match
        const results = resized.map((r) =>
          matcher.findBestMatch(r.descriptor)
        );
        const match = results.find(
          (r) => r.label === user._id && r.distance < 0.5
        );
        if (match && !faceVerifiedRef.current) {
          faceVerifiedRef.current = true;
          setFaceVerified(true);
          console.log(
            `[STEP 3] Face recognized (distance=${match.distance.toFixed(3)})`
          );
        } else if (!match && faceVerifiedRef.current) {
          faceVerifiedRef.current = false;
          setFaceVerified(false);
          console.log("[STEP 3] Face no longer recognized");
        }

        // 2) Blink FSM
if (!blinkDetected) {
  const lm = resized[0].landmarks;
  const ear = (computeEAR(lm.getLeftEye()) + computeEAR(lm.getRightEye())) / 2;

  if (blinkStateRef.current === "open") {
    if (ear < EAR_THRESHOLD) {
      closedFrameRef.current++;
      if (closedFrameRef.current >= BLINK_CLOSE_FRAMES) {
        blinkStateRef.current = "closed";
        console.log("[STEP 3] Eyes closed state entered");
      }
    } else {
      closedFrameRef.current = 0;
    }
  } else if (blinkStateRef.current === "closed") {
    if (ear > EAR_THRESHOLD) {
      openFrameRef.current++;
      if (openFrameRef.current >= BLINK_OPEN_FRAMES) {
        blinkCountRef.current++;
        console.log(`[STEP 3] Blink ${blinkCountRef.current}/${REQUIRED_BLINKS}`);
        blinkStateRef.current = "open";
        closedFrameRef.current = 0;
        openFrameRef.current = 0;

        if (blinkCountRef.current >= REQUIRED_BLINKS) {
          setBlinkDetected(true);
          console.log("[STEP 3] Required blinks detected ✅");
        }
      }
    } else {
      openFrameRef.current = 0;
    }
  }
}

if (blinkCountRef.current >= REQUIRED_BLINKS) {
  setBlinkDetected(true);
  blinkDetectedRef.current = true;   // <--- set ref immediately too
  console.log("[STEP 3] Required blinks detected ✅");
}



        // 3) Final gate: face, blink & speech
        console.log(
          "[DEBUG] Current States -> Face:",
          faceVerifiedRef.current,
          "| Blink:",
          blinkDetected,
          "| Speech:",
          challengeVerifiedRef.current
        );
        
        if (
          faceVerifiedRef.current &&
          blinkDetectedRef.current &&
          challengeVerifiedRef.current
        ) {
          console.log("[STEP 3] All checks passed → navigating to /protected");
          clearInterval(faceIntervalRef.current);
        
          localStorage.setItem("faceAuth", JSON.stringify({ account: user }));
        
          setTimeout(() => {
            navigate("/protected");
          }, 100);
        
          // fire background server call
          const c = document.createElement("canvas");
          c.width = video.videoWidth;
          c.height = video.videoHeight;
          c.getContext("2d").drawImage(video, 0, 0);
          const dataUrl = c.toDataURL("image/png");
          fetch("http://localhost:5000/face-login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, faceImage: dataUrl }),
          })
            .then((r) => console.log("[STEP 3] face-login response:", r.status))
            .catch((e) => console.error("[STEP 3] face-login error:", e));
        }
                         
      }
    }, 1000 / 15);
  };

  useEffect(() => {
    if (allVerified) {
      console.log("[STEP 3] Navigating to /protected page...");
  
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
        console.log("[Cleanup] Camera stopped after verification");
      }
  
      localStorage.setItem("faceAuth", JSON.stringify({ account: user }));
  
      navigate("/protected");
    }
  }, [allVerified, user, navigate]);
  
  

  // Overlays & Buttons
  const renderChallengeOverlay = () =>
    step === 3 && challenge && (
      <div
        style={{
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
          zIndex: 2,
        }}
      >
        {challenge}
      </div>
    );

  const renderSpeechButton = () =>
    step === 3 && challenge && (
      <div className="flex justify-center mt-4">
        {!speechActive ? (
          <button
            onClick={handleStartSpeech}
            className="px-4 py-2 bg-green-500 text-white rounded-lg"
          >
            Start Challenge
          </button>
        ) : (
          <button
            onClick={handleStopSpeech}
            className="px-4 py-2 bg-red-500 text-white rounded-lg"
          >
            Stop Challenge
          </button>
        )}
      </div>
    );

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
              className="w-full p-3 mb-4 border rounded"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full p-3 mb-4 border rounded"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-indigo-500 text-white rounded"
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
            <div className="flex justify-center gap-2 mb-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <input
                  key={i}
                  id={`otp-${i}`}
                  type="password"
                  maxLength="1"
                  value={otp[i] || ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!/^[0-9]$/.test(v) && v !== "") return;
                    const arr = otp.split("");
                    arr[i] = v;
                    setOtp(arr.join(""));
                    if (v && i < 5)
                      document
                        .getElementById(`otp-${i + 1}`)
                        ?.focus();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" && !otp[i] && i > 0)
                      document
                        .getElementById(`otp-${i - 1}`)
                        ?.focus();
                  }}
                  className="w-12 text-center p-3 border rounded text-xl"
                />
              ))}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-indigo-500 text-white rounded"
            >
              {loading ? "Verifying OTP..." : "Verify OTP"}
            </button>
          </form>
        )}

        {step === 3 && (
          <div className="bg-gray-50 p-8 rounded-lg shadow-md mt-8 relative">
            <h2 className="text-2xl font-bold text-center mb-6">
              Face Recognition
            </h2>
            {error && (
              <p className="text-red-500 text-center mb-4">{error}</p>
            )}
            {renderChallengeOverlay()}
            {renderSpeechButton()}
            <div className="relative">
              <video
                ref={videoRef}
                autoPlay
                muted
                width="100%"
                height="auto"
                onPlay={handleVideoPlay}
                className="border rounded"
              />
              <canvas
                ref={canvasRef}
                width="640"
                height="360"
                className="absolute top-0 left-0 w-full h-full"
              />
            </div>
            {!blinkDetected && (
              <p className="text-yellow-600 text-center mt-4">
                Please blink {REQUIRED_BLINKS} times to confirm liveness
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default LoginMultiStep;
