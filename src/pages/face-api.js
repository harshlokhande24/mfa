
async function loadFaceApiModels() {
  try {
    console.log("[face-api] Starting model load...");

    await faceapi.nets.resnet18.loadFromUri("/models");
    console.log("[face-api] Loaded: resnet18");

    await faceapi.nets.faceLandmark68Net.loadFromUri("/models");
    console.log("[face-api] Loaded: faceLandmark68Net");

    await faceapi.nets.faceRecognitionNet.loadFromUri("/models");
    console.log("[face-api] Loaded: faceRecognitionNet");

    console.log("[face-api] All face-api models loaded successfully");
  } catch (error) {
    console.error("[face-api] Error loading face-api models", error);
  }
}

// Just call the function when script runs
loadFaceApiModels();
