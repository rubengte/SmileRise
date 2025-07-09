import * as faceapi from 'face-api.js';
import { ExtractedFace } from './types';

// Define the URL where your face-api.js models are hosted
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
                    timestamp: videoElement.currentTime, // Capture the current video time
                    confidence: detection.expressions.happy || 0, // Add confidence directly
                    id: Date.now().toString() + Math.random().toString(36).substring(2, 9) // Unique ID
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
        const minMouthHeight = 0.5; // Adjusted to a very small positive number. Allows for very subtle or almost closed-mouth smiles.

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
        const mouthWidth = Math.sqrt(
            Math.pow(rightMouthCorner.x - leftMouthCorner.x, 2) +
            Math.pow(rightMouthCorner.y - leftMouthCorner.y, 2)
        );

        // Calculate mouth height (vertical distance between lip centers)
        const mouthHeight = lowerLipCenter.y - upperLipCenter.y;

        // Ensure valid dimensions before calculating aspect ratio
        if (mouthWidth <= 0 || mouthHeight < minMouthHeight) { 
            return false;
        }

        const aspectRatio = mouthWidth / mouthHeight;

        // 3. Aspect Ratio Check
        const isSmilingGeometric = aspectRatio > minSmileAspectRatio && aspectRatio < maxSmileAspectRatio;

        return isSmilingGeometric;
    }
}

export const faceDetectionService = new FaceDetectionService();

