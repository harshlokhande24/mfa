// headMovementDetection.js

/**
 * Calculate Euclidean distance between two points.
 * Each point should be an object with { x, y } properties.
 */
export function distance(p1, p2) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  }
  
  /**
   * detectHeadMovement:
   * Analyzes changes in key facial landmarks (nose, face edges, chin) over a history
   * of frames to detect head movements (left turn, right turn, or nod).
   *
   * @param {Array} landmarksHistory - Array of facial landmark positions (each an array of points).
   * @param {number} frameThreshold - Minimum number of frames to compare (default: 15).
   * @returns {object} - { movementDetected: boolean, movementType: string|null }
   */
  export function detectHeadMovement(landmarksHistory, frameThreshold = 15) {
    if (landmarksHistory.length < frameThreshold) return { movementDetected: false, movementType: null };
    
    const initial = landmarksHistory[0];
    
    // Helper functions to get key points from landmarks (assuming 68-point model)
    const getNose = (pts) => pts[30]; // Nose tip
    const getLeftFace = (pts) => pts[0];  // Leftmost point
    const getRightFace = (pts) => pts[16]; // Rightmost point
    const getChin = (pts) => pts[8];       // Chin
    
    const initialNose = getNose(initial);
    const initialLeft = getLeftFace(initial);
    const initialRight = getRightFace(initial);
    const initialChin = getChin(initial);
    
    const initialWidth = distance(initialLeft, initialRight);
    const initialVertical = distance(initialNose, initialChin);
    
    let leftTurnCount = 0;
    let rightTurnCount = 0;
    let nodCount = 0;
    
    const recent = landmarksHistory.slice(-10);
    recent.forEach((pts) => {
      const currentNose = getNose(pts);
      const currentLeft = getLeftFace(pts);
      const currentRight = getRightFace(pts);
      const currentChin = getChin(pts);
      
      const currentWidth = distance(currentLeft, currentRight);
      const currentVertical = distance(currentNose, currentChin);
      
      // Ratio of distance from nose to left side vs. face width.
      const leftRatioInitial = distance(initialLeft, initialNose) / initialWidth;
      const leftRatioCurrent = distance(currentLeft, currentNose) / currentWidth;
      
      // Ratio for right side.
      const rightRatioInitial = distance(initialRight, initialNose) / initialWidth;
      const rightRatioCurrent = distance(currentRight, currentNose) / currentWidth;
      
      if (leftRatioCurrent < leftRatioInitial * 0.9) leftTurnCount++;
      if (rightRatioCurrent < rightRatioInitial * 0.9) rightTurnCount++;
      
      // Nodding: if vertical distance decreases significantly.
      if (currentVertical < initialVertical * 0.9) nodCount++;
    });
    
    console.log("[HeadMovement] Left turn count:", leftTurnCount, "Right turn count:", rightTurnCount, "Nod count:", nodCount);
    
    let movementDetected = false;
    let movementType = null;
    if (leftTurnCount >= 3) {
      movementDetected = true;
      movementType = "LEFT_TURN";
    } else if (rightTurnCount >= 3) {
      movementDetected = true;
      movementType = "RIGHT_TURN";
    } else if (nodCount >= 3) {
      movementDetected = true;
      movementType = "NOD";
    }
    
    return { movementDetected, movementType };
  }
  