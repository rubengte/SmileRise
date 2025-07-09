import * as faceapi from 'face-api.js';
import { ExtractedFace } from './types';

// Define the URL where your face-api.js models are hosted
// This should be relative to your public folder if bundled, or a full URL if on a CDN
const MODEL_URL = '/models'; // Assuming models are in public/models/

class FaceDetectionService {
    private isInitialized: boolean = false;
    private detectionMethod: string = 'Detection Failed - Models Not Loaded';

    // Initialize the Face-API.js models
    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            console.log('FaceDetectionService already initialized.');
            return;
        }

        try {
            console.log('Loading Face-API.js models...');
            await faceapi.nets.tinyFaceDetector.load(MODEL_URL);
            await faceapi.nets.faceLandmark68Net.load(MODEL_URL);
            await faceapi.nets.faceExpressionNet.load(MODEL_URL);
            this.isInitialized = true;
            this.detectionMethod = 'Face-API.js (TinyFaceDetector, Landmarks, Expressions) + Geometric Analysis';
            console.log('Face-API.js models loaded successfully.');
        } catch (error) {
            console.error('Failed to load Face-API.js models:', error);
            this.isInitialized = false;
            this.detectionMethod = `Detection Failed - ${error instanceof Error ? error.message : String(error)}`;
            throw new Error('Failed to load Face-API.js models. Check console for details.');
        }
    }

    public isUsingRealDetection(): boolean {
        return this.isInitialized;
    }

    public getDetectionMethod(): string {
        return this.detectionMethod;
    }

    // Detect faces and expressions in a given HTMLVideoElement
    public async detectFaces(videoElement: HTMLVideoElement): Promise<ExtractedFace[]> {
        if (!this.isInitialized) {
            console.warn('FaceDetectionService not initialized. Cannot detect faces.');
            return [];
        }

        const detections = await faceapi.detectAllFaces(
            videoElement,
            new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }) // Adjusted inputSize for better performance/accuracy balance
        )
        .withFaceLandmarks()
        .withFaceExpressions();

        const extractedFaces: ExtractedFace[] = [];

        for (const detection of detections) {
            // Check if the detected face is smiling based on expressions and geometric rules
            if (this.isSmiling(detection.expressions, detection.landmarks)) {
                extractedFaces.push({
                    detection: detection.detection.box, // Bounding box of the face
                    expressions: detection.expressions,
                    landmarks: detection.landmarks,
                    timestamp: videoElement.currentTime // Capture the current video time
                });
            }
        }
        return extractedFaces;
    }

    // Determine if a face is smiling based on expressions and geometric analysis
    private isSmiling(expressions: faceapi.FaceExpressions, landmarks: faceapi.FaceLandmarks68): boolean {
        // --- Tuning Parameters ---
        const happyScoreThreshold = 0.5; // Lowered from 0.6 to capture more smiles, including subtle ones
        const minSmileAspectRatio = 2.0; // Adjusted from 2.5 - allows for wider, less vertically stretched smiles
        const maxSmileAspectRatio = 6.0; // Remains the same, upper limit to filter extreme distortions
        const minMouthHeight = 2; // Added a minimum height to ensure mouth is not completely closed or inverted, but allows for very slight opening. Adjust as needed.

        // 1. Expression Score Check
        const happyScore = expressions.happy || 0;
        if (happyScore < happyScoreThreshold) {
            return false;
        }

        // 2. Geometric Analysis using Mouth Landmarks
        const mouth = landmarks.getMouth();
        const leftMouthCorner = mouth[0]; // Leftmost point of the mouth
        const rightMouthCorner = mouth[6]; // Rightmost point of the mouth
        const upperLipCenter = mouth[3];   // Center top point of the upper lip
        const lowerLipCenter = mouth[9];   // Center bottom point of the lower lip

        // Calculate mouth width (distance between corners)
        // Corrected: Use Math.abs or ensure right.x - left.x for positive width
        const mouthWidth = Math.sqrt(
            Math.pow(rightMouthCorner.x - leftMouthCorner.x, 2) +
            Math.pow(rightMouthCorner.y - leftMouthCorner.y, 2)
        );

        // Calculate mouth height (vertical distance between lip centers)
        const mouthHeight = lowerLipCenter.y - upperLipCenter.y;

        // Ensure valid dimensions before calculating aspect ratio
        if (mouthWidth <= 0 || mouthHeight < minMouthHeight) { // Changed from <=0 to < minMouthHeight
            return false;
        }

        const aspectRatio = mouthWidth / mouthHeight;

        // 3. Aspect Ratio Check
        const isSmilingGeometric = aspectRatio > minSmileAspectRatio && aspectRatio < maxSmileAspectRatio;

        // Optional: Add more advanced checks for Duchenne smile (eye crinkling) here if needed
        // This would involve analyzing eye landmarks (e.g., distance between eye corners and eyebrow points)
        // For example:
        // const leftEye = landmarks.getLeftEye();
        // const rightEye = landmarks.getRightEye();
        // const leftEyeInnerCorner = leftEye[0];
        // const leftEyeOuterCorner = leftEye[3];
        // const leftEyebrowInner = landmarks.getLeftEyeBrow()[1];
        // const leftEyebrowOuter = landmarks.getLeftEyeBrow()[3];
        // // Calculate vertical distance from eye to eyebrow, or eye aspect ratio for squinting/crinkling
        // const leftEyeVerticalDistance = Math.abs(leftEyebrowInner.y - leftEye[4].y); // Example: between eyebrow point and lower eyelid point
        // if (leftEyeVerticalDistance < someThresholdForSquinting) { /* ... */ }


        return isSmilingGeometric;
    }
}

export const faceDetectionService = new FaceDetectionService();

