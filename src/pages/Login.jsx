import React, { useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";
import AuthIdle from "../assets/images/auth-idle.svg";
import AuthFace from "../assets/images/auth-face.svg";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

function Login() {
  const [tempAccount, setTempAccount] = useState("");
  const [localUserStream, setLocalUserStream] = useState(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [faceApiLoaded, setFaceApiLoaded] = useState(false);
  const [loginResult, setLoginResult] = useState("PENDING");
  const [imageError, setImageError] = useState(false);
  const [counter, setCounter] = useState(5);
  const [labeledFaceDescriptors, setLabeledFaceDescriptors] = useState(null);
  const videoRef = useRef();
  const canvasRef = useRef();
  const faceApiIntervalRef = useRef(null);
  const videoWidth = 640;
  const videoHeight = 360;

  const location = useLocation();
  const navigate = useNavigate();

  // If there's no account data from the previous page, redirect home.
  if (!location?.state) {
    return <Navigate to="/" replace={true} />;
  }

  // Set the temporary account from the route state
  useEffect(() => {
    setTempAccount(location?.state?.account);
  }, [location]);

  // Load face-api models and labeled images once the account data is available.
  useEffect(() => {
    if (tempAccount) {
      const loadModelsAndImages = async () => {
        const uri = "/models";
        await faceapi.nets.ssdMobilenetv1.loadFromUri(uri);
        await faceapi.nets.faceLandmark68Net.loadFromUri(uri);
        await faceapi.nets.faceRecognitionNet.loadFromUri(uri);
        // Load labeled face descriptors
        const labeledFD = await loadLabeledImages();
        setLabeledFaceDescriptors(labeledFD);
        setModelsLoaded(true);
      };
      loadModelsAndImages().catch((error) => {
        console.error("Error loading models or images:", error);
        setImageError(true);
      });
    }
  }, [tempAccount]);

  // Cleanup face scanning interval on component unmount.
  useEffect(() => {
    return () => {
      if (faceApiIntervalRef.current) {
        clearInterval(faceApiIntervalRef.current);
      }
    };
  }, []);

  // Countdown effect for successful login.
  useEffect(() => {
    if (loginResult === "SUCCESS") {
      const counterInterval = setInterval(() => {
        setCounter((prevCounter) => prevCounter - 1);
      }, 1000);

      if (counter === 0) {
        // Stop the video and cleanup tracks.
        if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.srcObject = null;
        }
        if (localUserStream) {
          localUserStream.getTracks().forEach((track) => track.stop());
        }
        // Clear intervals and store authentication status.
        clearInterval(counterInterval);
        if (faceApiIntervalRef.current) clearInterval(faceApiIntervalRef.current);
        localStorage.setItem(
          "faceAuth",
          JSON.stringify({ status: true, account: tempAccount })
        );
        navigate("/protected", { replace: true });
      }

      return () => clearInterval(counterInterval);
    }
    // Reset counter if loginResult changes from SUCCESS.
    setCounter(5);
  }, [loginResult, counter, localUserStream, navigate, tempAccount]);

  // Start video capture from the user's camera.
  const getLocalUserVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: true,
      });
      videoRef.current.srcObject = stream;
      setLocalUserStream(stream);
    } catch (err) {
      console.error("Error accessing camera:", err);
    }
  };

  // Scan the user's face at 15 frames per second.
  const scanFace = async () => {
    // Prevent multiple intervals from being set.
    if (faceApiIntervalRef.current) return;

    // Ensure canvas is matched to the video dimensions.
    faceapi.matchDimensions(canvasRef.current, {
      width: videoWidth,
      height: videoHeight,
    });

    // Start scanning at ~15 FPS.
    faceApiIntervalRef.current = setInterval(async () => {
      const detections = await faceapi
        .detectAllFaces(videoRef.current)
        .withFaceLandmarks()
        .withFaceDescriptors();

      const resizedDetections = faceapi.resizeResults(detections, {
        width: videoWidth,
        height: videoHeight,
      });

      // Proceed only if we have the labeled descriptors loaded.
      if (labeledFaceDescriptors) {
        const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors);
        const results = resizedDetections.map((d) =>
          faceMatcher.findBestMatch(d.descriptor)
        );

        // Clear canvas and redraw detections.
        const context = canvasRef.current.getContext("2d");
        context.clearRect(0, 0, videoWidth, videoHeight);
        faceapi.draw.drawDetections(canvasRef.current, resizedDetections);
        faceapi.draw.drawFaceLandmarks(canvasRef.current, resizedDetections);

        // Check if the detected face matches the tempAccount.
        if (results.length > 0 && tempAccount.id === results[0].label) {
          setLoginResult("SUCCESS");
        } else {
          setLoginResult("FAILED");
        }
      }

      // Mark that the face API scanning has started.
      if (!faceApiLoaded) {
        setFaceApiLoaded(true);
      }
    }, 1000 / 15);
  };

  // Load labeled images for face recognition.
  async function loadLabeledImages() {
    if (!tempAccount) {
      return null;
    }
    const descriptions = [];
    let img;
    try {
      const imgPath =
        tempAccount?.type === "CUSTOM"
          ? tempAccount.picture
          : `/temp-accounts/${tempAccount.picture}`;
      img = await faceapi.fetchImage(imgPath);
    } catch (error) {
      console.error("Error fetching labeled image:", error);
      setImageError(true);
      return null;
    }

    const detection = await faceapi
      .detectSingleFace(img)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (detection) {
      descriptions.push(detection.descriptor);
    }
    return new faceapi.LabeledFaceDescriptors(tempAccount.id, descriptions);
  }

  // If the profile picture fails to load, show an error message.
  if (imageError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 max-w-3xl mx-auto">
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-rose-700 sm:text-4xl">
          Upps! There is no profile picture associated with this account.
        </h2>
        <span className="block mt-4">
          Please contact administration for registration or try again later.
        </span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col items-center justify-center gap-6 max-w-2xl mx-auto">
      {(!localUserStream || !modelsLoaded) && (
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
          {!localUserStream && modelsLoaded ? (
            <span className="block text-indigo-600 mt-2">
              Please recognize your face to log in.
            </span>
          ) : (
            <>
              <span className="block">
                You're attempting to log in with your face.
              </span>
              <span className="block text-indigo-600 mt-2">
                Loading models...
              </span>
            </>
          )}
        </h2>
      )}
      {localUserStream && loginResult === "SUCCESS" && (
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
          <span className="block text-indigo-600 mt-2">
            Face recognized successfully!
          </span>
          <span className="block text-indigo-600 mt-2">
            Please wait {counter} more seconds...
          </span>
        </h2>
      )}
      {localUserStream && loginResult === "FAILED" && (
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-rose-700 sm:text-4xl">
          <span className="block mt-14">
            Upps! We did not recognize your face.
          </span>
        </h2>
      )}
      {localUserStream && !faceApiLoaded && loginResult === "PENDING" && (
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
          <span className="block mt-14">Scanning face...</span>
        </h2>
      )}
      <div className="w-full">
        <div className="relative flex flex-col items-center p-2">
          <video
            muted
            autoPlay
            ref={videoRef}
            height={videoHeight}
            width={videoWidth}
            onPlay={scanFace}
            style={{
              objectFit: "fill",
              height: "360px",
              borderRadius: "10px",
              display: localUserStream ? "block" : "none",
            }}
          />
          <canvas
            ref={canvasRef}
            width={videoWidth}
            height={videoHeight}
            style={{
              position: "absolute",
              display: localUserStream ? "block" : "none",
            }}
          />
        </div>
        {!localUserStream && (
          <>
            {modelsLoaded ? (
              <>
                <img
                  alt="Scan face"
                  src={AuthFace}
                  className="cursor-pointer my-8 mx-auto object-cover h-68"
                />
                <button
                  onClick={getLocalUserVideo}
                  type="button"
                  className="flex justify-center items-center w-full py-2.5 px-5 mr-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg border border-gray-200"
                >
                  Scan my face
                </button>
              </>
            ) : (
              <>
                <img
                  alt="Loading models"
                  src={AuthIdle}
                  className="cursor-pointer my-8 mx-auto object-cover h-68"
                />
                <button
                  disabled
                  type="button"
                  className="cursor-not-allowed flex justify-center items-center w-full py-2.5 px-5 text-sm font-medium text-gray-900 bg-white rounded-lg border border-gray-200 hover:bg-gray-100 hover:text-blue-700"
                >
                  <svg
                    aria-hidden="true"
                    role="status"
                    className="inline mr-2 w-4 h-4 text-gray-200 animate-spin"
                    viewBox="0 0 100 101"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M100 50.59c0 27.615-22.385 50-50 50S0 78.205 0 50.59 22.385.59 50 .59s50 22.385 50 50z"
                      fill="currentColor"
                    />
                    <path
                      d="M93.967 39.04c3.393-1.004 5.375-4.395 4.521-6.752-1.718-4.296-4.139-8.34-7.214-11.492-3.075-3.153-6.783-5.373-10.888-6.177-4.107-.804-8.455-.421-12.28.965-3.824 1.386-7.023 3.48-9.38 6.28-2.357 2.8-3.665 6.348-3.766 10.02-.1 3.674.876 7.305 2.67 10.356a29.96 29.96 0 009.189 9.189c3.05 1.794 6.682 2.77 10.356 2.67 3.674-.1 7.222-1.409 10.02-3.766 2.8-2.357 4.894-5.556 6.28-9.38 1.386-3.824 1.77-8.173.965-12.28- .804-4.105-3.024-7.813-6.177-10.888-3.152-3.075-7.196-5.496-11.492-7.214-2.357-.854-5.748.128-6.752 4.521"
                      fill="#1C64F2"
                    />
                  </svg>
                  Please wait while models are loading...
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default Login;
