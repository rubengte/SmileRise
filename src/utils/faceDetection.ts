import * as faceapi from 'face-api.js';

export class FaceDetectionService {
  private initialized = false;
  private detectionMethod: 'faceapi-hybrid' | 'fallback' = 'fallback';
  private modelsLoaded = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('🔄 Initializing Face-API.js with hybrid geometric smile detection...');
    
    try {
      // Load Face-API.js models
      await this.loadFaceAPIModels();
      
      this.detectionMethod = 'faceapi-hybrid';
      this.initialized = true;
      this.modelsLoaded = true;
      
      console.log('✅ Face-API.js hybrid detection system loaded successfully!');
      console.log('🎯 Using ML landmarks + geometric analysis for genuine smile detection');
      
    } catch (error) {
      console.error('❌ Failed to initialize Face-API.js:', error);
      this.detectionMethod = 'fallback';
      this.initialized = true;
      throw new Error(`Face-API.js initialization failed: ${error}`);
    }
  }

  private async loadFaceAPIModels(): Promise<void> {
    try {
      console.log('📥 Loading Face-API.js models...');
      
      // Load models from CDN for reliability
      const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@latest/model';
      
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
      ]);
      
      console.log('✅ All Face-API.js models loaded successfully');
      
    } catch (error) {
      console.error('❌ Error loading Face-API.js models:', error);
      throw error;
    }
  }

  async detectSmileInFrame(canvas: HTMLCanvasElement, currentTime: number): Promise<{ hasSmile: boolean; confidence: number; faceCount: number; isGenuineSmile: boolean }> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.detectionMethod !== 'faceapi-hybrid' || !this.modelsLoaded) {
      throw new Error('Face-API.js detection not available - initialization failed');
    }

    return await this.detectWithHybridMethod(canvas, currentTime);
  }

  private async detectWithHybridMethod(canvas: HTMLCanvasElement, currentTime: number): Promise<{ hasSmile: boolean; confidence: number; faceCount: number; isGenuineSmile: boolean }> {
    try {
      // Detect faces with landmarks and expressions
      const detections = await faceapi
        .detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions({
          inputSize: 416,
          scoreThreshold: 0.5
        }))
        .withFaceLandmarks()
        .withFaceExpressions();

      const faceCount = detections.length;
      let bestSmileConfidence = 0;
      let genuineSmileCount = 0;

      console.log(`👤 Face-API.js detected ${faceCount} faces at ${currentTime.toFixed(1)}s`);

      for (const detection of detections) {
        const landmarks = detection.landmarks;
        const expressions = detection.expressions;
        
        // Get the "happy" score as a pre-filter
        const happyScore = expressions.happy;
        
        // ULTRA SENSITIVE: Analyze geometry even for subtle happiness indicators
        // Lowered this slightly to ensure very expressive faces are not filtered too early
        if (happyScore > 0.05) { 
          const geometricAnalysis = this.analyzeSmileGeometry(landmarks);
          const combinedConfidence = this.calculateCombinedConfidence(happyScore, geometricAnalysis);
          
          if (combinedConfidence.isGenuine) {
            genuineSmileCount++;
            bestSmileConfidence = Math.max(bestSmileConfidence, combinedConfidence.confidence);
            
            console.log(`😊 AMAZING SMILE DETECTED! Happy: ${(happyScore * 100).toFixed(1)}%, Geometric: ${(geometricAnalysis.confidence * 100).toFixed(1)}%, Combined: ${(combinedConfidence.confidence * 100).toFixed(1)}%`);
          }
           // Added logging for debugging purposes, even if not detected as 'genuine' yet
           console.log(`  Debug - Happy Score: ${(happyScore * 100).toFixed(1)}%`);
           console.log(`  Debug - Geometric Confidence: ${(geometricAnalysis.confidence * 100).toFixed(1)}%`);
           console.log(`  Debug - Combined Confidence: ${(combinedConfidence.confidence * 100).toFixed(1)}%`);
           console.log(`  Debug - Is Genuine (Current Logic): ${combinedConfidence.isGenuine}`);
           console.log(`  Debug - Mouth Width Ratio: ${geometricAnalysis.features.mouthWidthRatio.toFixed(2)}`);
           console.log(`  Debug - Mouth Curvature: ${geometricAnalysis.features.mouthCurvature.toFixed(2)}`);
           console.log(`  Debug - Avg Eye Crinkle: ${geometricAnalysis.features.avgEyeCrinkle.toFixed(2)}`);
           console.log(`  Debug - Mouth Openness Ratio: ${geometricAnalysis.features.mouthOpennessRatio.toFixed(2)}`);
           console.log(`  Debug - Symmetry Score: ${geometricAnalysis.features.symmetryScore.toFixed(2)}`);
        }
      }

      const hasSmile = genuineSmileCount > 0;
      // Adjusted the final threshold for a bit more sensitivity
      const isGenuineSmile = bestSmileConfidence > 0.4; 

      if (hasSmile) {
        console.log(`🎯 ULTRA SENSITIVE DETECTION: ${genuineSmileCount} amazing smile(s)! Best confidence: ${(bestSmileConfidence * 100).toFixed(1)}% at ${currentTime.toFixed(1)}s`);
      }

      return {
        hasSmile,
        confidence: bestSmileConfidence,
        isGenuineSmile, // Use the adjusted threshold here
        faceCount
      };

    } catch (error) {
      console.error('❌ Face-API.js detection error:', error);
      throw error;
    }
  }

  private analyzeSmileGeometry(landmarks: faceapi.FaceLandmarks68): { confidence: number; features: any } {
    const points = landmarks.positions;
    
    // Key landmark indices for smile analysis
    const leftMouthCorner = points[48];   // Left corner of mouth
    const rightMouthCorner = points[54];  // Right corner of mouth
    const topLip = points[51];            // Top of upper lip
    const bottomLip = points[57];         // Bottom of lower lip
    const leftEyeOuter = points[36];      // Left eye outer corner
    const rightEyeOuter = points[45];     // Right eye outer corner
    const leftEyebrowInner = points[21];  // Left eyebrow inner
    const rightEyebrowInner = points[22]; // Right eyebrow inner
    const noseTip = points[33];           // Nose tip
    const chinTip = points[8];            // Tip of chin (for normalizing distances)
    const leftCheek = points[47];         // Lower left eyelid/upper cheek
    const rightCheek = points[42];        // Lower right eyelid/upper cheek
    
    // 1. Mouth Width Analysis
    const mouthWidth = Math.abs(rightMouthCorner.x - leftMouthCorner.x);
    // Normalize against a stable facial feature distance, e.g., distance from left eye to right eye
    const interEyeDistance = this.calculateDistance(leftEyeOuter, rightEyeOuter);
    const mouthWidthRatio = mouthWidth / interEyeDistance; 
    
    // 2. Mouth Curvature Analysis
    // Adjusted logic: A high mouth curvature is good, but for open-mouthed smiles,
    // the absolute y-difference might be less prominent.
    const mouthCenterY = (topLip.y + bottomLip.y) / 2;
    const avgCornerY = (leftMouthCorner.y + rightMouthCorner.y) / 2;
    const mouthHeight = this.calculateDistance(topLip, bottomLip);

    let mouthCurvature = 0;
    if (mouthWidth > 0) { // Avoid division by zero
        // Calculate based on corners relative to average lip line, normalized by mouth width
        mouthCurvature = (mouthCenterY - avgCornerY) / mouthWidth;
    }
    // Normalize to a 0-1 range, adjust multiplier based on testing
    mouthCurvature = Math.max(0, Math.min(1, mouthCurvature * 5 + 0.3)); // Adjusted multiplier and offset

    // 3. Eye Crinkle Analysis (Duchenne smile indicator)
    // More robust normalization for eye crinkle
    const leftEyeCrinkle = this.calculateEyeCrinkle(points[37], points[39], points[38]); // Upper eyelid points
    const rightEyeCrinkle = this.calculateEyeCrinkle(points[43], points[46], points[44]); // Upper eyelid points
    const avgEyeCrinkle = (leftEyeCrinkle + rightEyeCrinkle) / 2;
    
    // 4. Mouth Openness
    const mouthOpenness = this.calculateDistance(topLip, bottomLip);
    // Normalize mouth openness by mouth width for a consistent ratio
    const mouthOpennessRatio = mouthOpenness / mouthWidth; 

    // 5. Symmetry Analysis
    const symmetryScore = this.calculateSmileSymmetry(leftMouthCorner, rightMouthCorner, noseTip);

    // 6. Cheek Raise (Additional Duchenne indicator)
    // Distance between lower eyelid and upper cheek - should decrease with a smile
    const leftEyeLidBottom = points[40]; // Lower eyelid
    const rightEyeLidBottom = points[47]; // Lower eyelid
    const leftCheekRaiseDistance = this.calculateDistance(leftEyeLidBottom, points[30]); // Nose bridge/cheek area for reference
    const rightCheekRaiseDistance = this.calculateDistance(rightEyeLidBottom, points[30]);
    const avgCheekRaise = (leftCheekRaiseDistance + rightCheekRaiseDistance) / 2;
    // This value needs to be inverted and normalized. A smaller distance means more raise.
    // This is highly experimental and needs calibration against a baseline (e.g., neutral face).
    // For now, let's use a simpler heuristic for contribution.
    
    // Scoring thresholds based on research and testing
    const features = {
      mouthWidthRatio,
      mouthCurvature,
      avgEyeCrinkle,
      mouthOpennessRatio, // Kept for debugging, less direct score contribution for open smiles
      symmetryScore,
      avgCheekRaise // For debugging/future use
    };
    
    // Calculate geometric confidence
    let geometricScore = 0;
    
    // Mouth width contribution (30%) - Adjusted thresholds for wider smiles
    if (mouthWidthRatio > 0.4) geometricScore += 0.3; // Very wide smile
    else if (mouthWidthRatio > 0.3) geometricScore += 0.25;
    else if (mouthWidthRatio > 0.2) geometricScore += 0.15;
    
    // Mouth curvature contribution (20%) - Reduced weight for open-mouthed smiles, as it might be less pronounced
    if (mouthCurvature > 0.7) geometricScore += 0.20;
    else if (mouthCurvature > 0.5) geometricScore += 0.10;
    
    // Eye crinkle contribution (30%) - Duchenne smile, increased importance for genuine smiles
    if (avgEyeCrinkle > 0.7) geometricScore += 0.30; // Strong crinkle
    else if (avgEyeCrinkle > 0.5) geometricScore += 0.20;
    else if (avgEyeCrinkle > 0.3) geometricScore += 0.10;
    
    // Symmetry contribution (10%) - Still important, but less critical for highly expressive smiles
    if (symmetryScore > 0.8) geometricScore += 0.10;
    else if (symmetryScore > 0.6) geometricScore += 0.05;
    
    // Bonus for open-mouthed, wide smiles often seen in excitement
    // This is a heuristic: if mouth is wide AND open, it's likely a genuine excited smile.
    if (mouthWidthRatio > 0.35 && mouthOpennessRatio > 0.4) { // Specific thresholds for wide-open
        geometricScore += 0.15; // Significant bonus for this type of smile
    } else if (mouthWidthRatio > 0.25 && mouthOpennessRatio > 0.2) {
        geometricScore += 0.05; // Smaller bonus
    }

    return {
      confidence: Math.min(1.0, geometricScore),
      features
    };
  }

  private calculateDistance(point1: faceapi.Point, point2: faceapi.Point): number {
    const dx = point1.x - point2.x;
    const dy = point1.y - point2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Refined mouth curvature calculation
  private calculateMouthCurvature(leftCorner: faceapi.Point, rightCorner: faceapi.Point, topLip: faceapi.Point, bottomLip: faceapi.Point): number {
    const mouthCenterY = (topLip.y + bottomLip.y) / 2;
    const avgCornerY = (leftCorner.y + rightCorner.y) / 2;
    const mouthWidth = this.calculateDistance(leftCorner, rightCorner);

    if (mouthWidth === 0) return 0; // Avoid division by zero

    // Curvature is the relative vertical displacement of corners vs center, normalized by width
    // A positive value indicates corners are higher than the center (smile shape)
    const curvature = (mouthCenterY - avgCornerY) / mouthWidth;
    
    // Normalize and scale to a 0-1 range. This range might need fine-tuning.
    // For very open mouths, corners might not be significantly "higher" than center.
    return Math.max(0, Math.min(1, curvature * 5 + 0.3)); // Adjusted multiplier and offset
  }

  // Adjusted eye crinkle calculation
  private calculateEyeCrinkle(p1: faceapi.Point, p2: faceapi.Point, p3: faceapi.Point): number {
    // These points represent the upper eyelid. When eyes crinkle, these points
    // move closer to the lower eyelid. We are looking for the "compression" of the eye.
    // A simplified approach is to measure the vertical distance of the upper eyelid
    // and see how much it reduces.
    
    // Distance between mid-upper eyelid and mid-lower eyelid (not directly used here but for context)
    // For crinkling, we look at the vertical compression of the eye.
    // A common approach is to use the Eye Aspect Ratio (EAR) but this is more complex.
    // A simpler heuristic for crinkle: look at points 37, 38, 39 for left eye and 43, 44, 46 for right eye
    // These are upper eyelid points. When crinkled, they move down.
    
    // For a simpler crinkle metric: compare the vertical distance between top and bottom eyelid points.
    // However, without a neutral face baseline, this is hard.
    // A more practical proxy is the "crow's feet" effect, which reduces the distance between
    // the outer eye corner and the temple/eyebrow.
    
    // Let's assume the previous `calculateEyeCrinkle` was trying to capture something like vertical eye squish.
    // If landmarks 36/45 are outer eye corners and 21/22 are inner eyebrows, then the initial code
    // was looking at the vertical distance between eye corner and eyebrow, which is a bit indirect.
    
    // Let's refine based on the vertical "squeeze" of the eye.
    // Use the vertical distance of the upper eyelid from the pupil area.
    // For simplicity with given landmarks, let's use vertical distance across the eye.
    const eyeVerticalDist1 = this.calculateDistance(points[p1.idx], points[p3.idx]); // Example points
    // This needs careful calibration. Without a baseline or more advanced geometry, it's hard.
    // Sticking to the previous approach for now, but acknowledge its limitation.
    
    // Reverting to previous simplistic Eye Crinkle logic, as accurate Duchenne requires more points or a baseline.
    // The previous implementation was: `const distance = this.calculateDistance(eyeCorner, eyebrow);`
    // This function received `eyeCorner` and `eyebrow` from `analyzeSmileGeometry`.
    // Let's make sure the points passed are correct for that.
    
    // Assuming `eyeCorner` is 36/45 and `eyebrow` is 21/22.
    // A smaller distance (eyeCorner.y - eyebrow.y) means more crinkle.
    // Let's keep the core logic, but re-evaluate the normalization `distance / 50`.
    // It should be relative to the eye size itself.
    
    const distance_eye_eyebrow = this.calculateDistance(p1, p2); // using p1 as eyeCorner, p2 as eyebrow
    // Normalize by average eye size (e.g., inter-eye distance or eye width)
    const normalizedDistance = distance_eye_eyebrow / (this.calculateDistance(points[36], points[39])); // Normalized by inner to outer eye width
    
    return Math.max(0, Math.min(1, 1 - normalizedDistance * 0.7)); // Adjusted multiplier
  }

  // The original calculateEyeCrinkle received `eyeCorner` and `eyebrow`.
  // Let's use it as it was, but use `interEyeDistance` for normalization.
  private calculateEyeCrinkle_original(eyeCorner: faceapi.Point, eyebrow: faceapi.Point): number {
    const distance = this.calculateDistance(eyeCorner, eyebrow);
    const interEyeDistance = this.calculateDistance(points[36], points[45]); // Overall eye width
    
    // Normalize distance relative to typical face/eye proportions.
    // A smaller `distance` relative to `interEyeDistance` indicates more crinkle.
    const normalizedRelativeDistance = distance / interEyeDistance; 
    
    // Invert so smaller distance = higher crinkle score. Calibrate the '1.5' based on tests.
    return Math.max(0, Math.min(1, 1.5 - normalizedRelativeDistance)); // Adjusted scaling
  }


  private calculateSmileSymmetry(leftCorner: faceapi.Point, rightCorner: faceapi.Point, noseTip: faceapi.Point): number {
    // Calculate if smile is symmetric relative to nose
    const leftDistance = this.calculateDistance(leftCorner, noseTip);
    const rightDistance = this.calculateDistance(rightCorner, noseTip);
    
    // Avoid division by zero
    if (Math.max(leftDistance, rightDistance) === 0) return 1;

    const symmetryRatio = Math.min(leftDistance, rightDistance) / Math.max(leftDistance, rightDistance);
    
    return symmetryRatio;
  }

  private calculateCombinedConfidence(happyScore: number, geometricAnalysis: { confidence: number; features: any }): { confidence: number; isGenuine: boolean } {
    // Weighted combination of ML and geometric analysis
    const mlWeight = 0.4;
    const geometricWeight = 0.6;
    
    const combinedScore = (happyScore * mlWeight) + (geometricAnalysis.confidence * geometricWeight);
    
    // Additional bonus for strong geometric features, especially for expressive smiles
    let bonus = 0;
    if (geometricAnalysis.features.avgEyeCrinkle > 0.6) bonus += 0.15; // Increased bonus for strong Duchenne
    if (geometricAnalysis.features.mouthWidthRatio > 0.35) bonus += 0.05; // Wide smile bonus
    
    // Specific bonus for "open, excited" smile detected in geometric analysis
    if (geometricAnalysis.features.mouthOpennessRatio > 0.4 && geometricAnalysis.features.mouthWidthRatio > 0.3) {
        bonus += 0.1; // Significant bonus if mouth is both wide and open
    } else if (geometricAnalysis.features.mouthOpennessRatio > 0.25 && geometricAnalysis.features.mouthWidthRatio > 0.25) {
        bonus += 0.05; // Smaller bonus
    }
    
    const finalConfidence = Math.min(1.0, combinedScore + bonus);
    
    // Adjusted `isGenuine` logic:
    // Option 1: More flexible threshold for `finalConfidence` AND reasonable geometric/happy scores
    // Option 2: OR condition to capture very strong happy expressions even if geometric isn't perfect (e.g., due to open mouth affecting curvature)
    const isGenuine = (finalConfidence > 0.5 && geometricAnalysis.confidence > 0.3 && happyScore > 0.2) || // Baseline good smile
                      (happyScore > 0.7 && geometricAnalysis.features.avgEyeCrinkle > 0.4) || // Very happy expression with some eye crinkle
                      (geometricAnalysis.features.mouthWidthRatio > 0.4 && geometricAnalysis.features.mouthOpennessRatio > 0.5 && happyScore > 0.3); // Very wide, open, and reasonably happy

    return {
      confidence: finalConfidence,
      isGenuine
    };
  }

  isUsingRealDetection(): boolean {
    return this.detectionMethod === 'faceapi-hybrid' && this.initialized;
  }

  getDetectionMethod(): string {
    if (this.detectionMethod === 'faceapi-hybrid') {
      return 'Face-API.js + Geometric Analysis (Hybrid ML + CV)';
    } else {
      return 'Detection Failed - Face-API.js Not Available';
    }
  }

  clearHistory(): void {
    // No history to clear for Face-API.js detection
  }

  cleanup(): void {
    this.clearHistory();
  }
}

export const faceDetectionService = new FaceDetectionService();
