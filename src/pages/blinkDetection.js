// blinkDetection.js

/**
 * Compute Euclidean distance between two points.
 * Each point should be an object with { x, y } properties.
 */
export function euclideanDistance(pt1, pt2) {
    return Math.hypot(pt1.x - pt2.x, pt1.y - pt2.y);
  }
  
  /**
   * Compute the Eye Aspect Ratio (EAR) for an array of 6 eye landmarks.
   * If landmarks are incomplete, returns null.
   */
  export function computeEAR(eye) {
    if (!eye || eye.length < 6) return null;
    const A = euclideanDistance(eye[1], eye[5]);
    const B = euclideanDistance(eye[2], eye[4]);
    const C = euclideanDistance(eye[0], eye[3]);
    return (A + B) / (2.0 * C);
  }
  
  /**
   * detectBlinkDynamic:
   * Uses a moving average over a window of frames to detect a blink.
   * If only one eye is available (e.g. profile), it lowers the threshold.
   *
   * @param {object} landmarks - Face landmarks from face-api.js.
   * @param {object} state - An object to persist EAR history and blink state.
   *                        Expected to have { earHistory: Array<number>, inBlink: boolean }.
   * @param {number} windowSize - Number of frames for moving average (default: 5).
   * @param {number} defaultThreshold - Default EAR threshold for frontal faces (default: 0.25).
   * @param {number} singleEyeFactor - Factor to lower threshold when one eye is detected (default: 0.85).
   * @returns {object} - { blinkDetected: boolean, avgEAR: number, effectiveThreshold: number }.
   */
  export function detectBlinkDynamic(landmarks, state, windowSize = 5, defaultThreshold = 0.25, singleEyeFactor = 0.85) {
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();
    
    let leftEAR = computeEAR(leftEye);
    let rightEAR = computeEAR(rightEye);
    
    let effectiveThreshold = defaultThreshold;
    let currentEAR;
    
    if (leftEAR !== null && rightEAR !== null) {
      currentEAR = (leftEAR + rightEAR) / 2;
    } else if (leftEAR !== null) {
      currentEAR = leftEAR;
      effectiveThreshold = defaultThreshold * singleEyeFactor;
    } else if (rightEAR !== null) {
      currentEAR = rightEAR;
      effectiveThreshold = defaultThreshold * singleEyeFactor;
    } else {
      currentEAR = 1; // assume open eyes if no data
    }
    
    if (!state.earHistory) state.earHistory = [];
    state.earHistory.push(currentEAR);
    if (state.earHistory.length > windowSize) {
      state.earHistory.shift();
    }
    
    const avgEAR = state.earHistory.reduce((sum, val) => sum + val, 0) / state.earHistory.length;
    console.log("[BlinkDetection] Moving average EAR:", avgEAR, "Effective threshold:", effectiveThreshold);
    
    let blinkDetected = false;
    if (!state.inBlink && avgEAR < effectiveThreshold) {
      state.inBlink = true;
      console.log("[BlinkDetection] Blink potential started.");
    }
    if (state.inBlink && avgEAR >= effectiveThreshold) {
      blinkDetected = true;
      state.inBlink = false;
      state.earHistory = [];
      console.log("[BlinkDetection] Blink confirmed.");
    }
    
    return { blinkDetected, avgEAR, effectiveThreshold };
  }
  