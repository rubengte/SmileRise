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
        if (happyScore > 0.08) {
          const geometricAnalysis = this.analyzeSmileGeometry(landmarks);
          const combinedConfidence = this.calculateCombinedConfidence(happyScore, geometricAnalysis);
          
          if (combinedConfidence.isGenuine) {
            genuineSmileCount++;
            bestSmileConfidence = Math.max(bestSmileConfidence, combinedConfidence.confidence);
            
            console.log(`😊 AMAZING SMILE DETECTED! Happy: ${(happyScore * 100).toFixed(1)}%, Geometric: ${(geometricAnalysis.confidence * 100).toFixed(1)}%, Combined: ${(combinedConfidence.confidence * 100).toFixed(1)}%`);
          }
        }
      }

      const hasSmile = genuineSmileCount > 0;
      const isGenuineSmile = bestSmileConfidence > 0.5; // More sensitive threshold

      if (hasSmile) {
        console.log(`🎯 ULTRA SENSITIVE DETECTION: ${genuineSmileCount} amazing smile(s)! Best confidence: ${(bestSmileConfidence * 100).toFixed(1)}% at ${currentTime.toFixed(1)}s`);
      }

      return {
        hasSmile,
        confidence: bestSmileConfidence,
        faceCount,
        isGenuineSmile
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
    
    // 1. Mouth Width Analysis
    const mouthWidth = Math.abs(rightMouthCorner.x - leftMouthCorner.x);
    const faceWidth = this.calculateDistance(leftEyeOuter, rightEyeOuter);
    const mouthWidthRatio = mouthWidth / faceWidth;
    
    // 2. Mouth Curvature Analysis
    const mouthCurvature = this.calculateMouthCurvature(leftMouthCorner, rightMouthCorner, topLip, bottomLip);
    
    // 3. Eye Crinkle Analysis (Duchenne smile indicator)
    const leftEyeCrinkle = this.calculateEyeCrinkle(leftEyeOuter, leftEyebrowInner);
    const rightEyeCrinkle = this.calculateEyeCrinkle(rightEyeOuter, rightEyebrowInner);
    const avgEyeCrinkle = (leftEyeCrinkle + rightEyeCrinkle) / 2;
    
    // 4. Mouth Openness
    const mouthOpenness = this.calculateDistance(topLip, bottomLip);
    const mouthOpennessRatio = mouthOpenness / mouthWidth;
    
    // 5. Symmetry Analysis
    const symmetryScore = this.calculateSmileSymmetry(leftMouthCorner, rightMouthCorner, noseTip);
    
    // Scoring thresholds based on research and testing
    const features = {
      mouthWidthRatio,
      mouthCurvature,
      avgEyeCrinkle,
      mouthOpennessRatio,
      symmetryScore
    };
    
    // Calculate geometric confidence
    let geometricScore = 0;
    
    // Mouth width contribution (30%) - FIXED: More sensitive thresholds
    if (mouthWidthRatio > 0.25) geometricScore += 0.3;
    else if (mouthWidthRatio > 0.2) geometricScore += 0.25;
    else if (mouthWidthRatio > 0.15) geometricScore += 0.15;
    
    // Mouth curvature contribution (25%)
    if (mouthCurvature > 0.7) geometricScore += 0.25;
    else if (mouthCurvature > 0.5) geometricScore += 0.15;
    else if (mouthCurvature > 0.3) geometricScore += 0.1;
    
    // Eye crinkle contribution (25%) - Duchenne smile
    if (avgEyeCrinkle > 0.6) geometricScore += 0.25;
    else if (avgEyeCrinkle > 0.4) geometricScore += 0.15;
    else if (avgEyeCrinkle > 0.2) geometricScore += 0.1;
    
    // Symmetry contribution (20%)
    if (symmetryScore > 0.8) geometricScore += 0.2;
    else if (symmetryScore > 0.6) geometricScore += 0.15;
    else if (symmetryScore > 0.4) geometricScore += 0.1;
    
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

  private calculateMouthCurvature(leftCorner: faceapi.Point, rightCorner: faceapi.Point, topLip: faceapi.Point, bottomLip: faceapi.Point): number {
    // Calculate if mouth corners are higher than the center
    const mouthCenterY = (topLip.y + bottomLip.y) / 2;
    const avgCornerY = (leftCorner.y + rightCorner.y) / 2;
    
    // Positive curvature means corners are higher (smile)
    const curvature = (mouthCenterY - avgCornerY) / this.calculateDistance(leftCorner, rightCorner);
    
    // Normalize to 0-1 range
    return Math.max(0, Math.min(1, curvature * 10 + 0.5));
  }

  private calculateEyeCrinkle(eyeCorner: faceapi.Point, eyebrow: faceapi.Point): number {
    // Distance between eye corner and eyebrow (smaller = more crinkle)
    const distance = this.calculateDistance(eyeCorner, eyebrow);
    
    // Normalize based on typical face proportions
    // This is a simplified approach - in practice you'd calibrate this
    const normalizedDistance = distance / 50; // Adjust based on testing
    
    // Invert so smaller distance = higher crinkle score
    return Math.max(0, Math.min(1, 1 - normalizedDistance));
  }

  private calculateSmileSymmetry(leftCorner: faceapi.Point, rightCorner: faceapi.Point, noseTip: faceapi.Point): number {
    // Calculate if smile is symmetric relative to nose
    const leftDistance = this.calculateDistance(leftCorner, noseTip);
    const rightDistance = this.calculateDistance(rightCorner, noseTip);
    
    const symmetryRatio = Math.min(leftDistance, rightDistance) / Math.max(leftDistance, rightDistance);
    
    return symmetryRatio;
  }

  private calculateCombinedConfidence(happyScore: number, geometricAnalysis: { confidence: number; features: any }): { confidence: number; isGenuine: boolean } {
    // Weighted combination of ML and geometric analysis
    const mlWeight = 0.4;
    const geometricWeight = 0.6;
    
    const combinedScore = (happyScore * mlWeight) + (geometricAnalysis.confidence * geometricWeight);
    
    // Additional bonus for strong geometric features
    let bonus = 0;
    if (geometricAnalysis.features.avgEyeCrinkle > 0.5) bonus += 0.1; // Duchenne smile bonus
    if (geometricAnalysis.features.symmetryScore > 0.8) bonus += 0.05; // Symmetry bonus
    if (geometricAnalysis.features.mouthWidthRatio > 0.3) bonus += 0.05; // Wide smile bonus
    if (geometricAnalysis.features.mouthCurvature > 0.6) bonus += 0.05; // Strong curvature bonus
    
    // NEW: Extra bonus for paragliding-style exuberant smiles
    if (geometricAnalysis.features.mouthWidthRatio > 0.35 && geometricAnalysis.features.mouthOpennessRatio > 0.12) {
      bonus += 0.08; // Big open smile bonus (like your paragliding photo!)
    }
    
    const finalConfidence = Math.min(1.0, combinedScore + bonus);
    
    // GENTLE: Maintain current sensitivity while being more inclusive of big smiles
    const isGenuine = finalConfidence > 0.45 && 
                     geometricAnalysis.confidence > 0.25 && 
                     happyScore > 0.12; // GENTLE: Slightly lower ML threshold for exuberant expressions
    
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
