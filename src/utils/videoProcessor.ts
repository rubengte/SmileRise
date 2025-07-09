import { faceDetectionService } from './faceDetection';
import { ExtractedFrame, ProcessingOptions, ProcessingStats } from '../types';
import * as faceapi from 'face-api.js';

// Define parameters for smile buffering and selection
const SMILE_BUFFER_DURATION_MS = 1000; // How long (ms) to buffer frames for a single smile burst (e.g., 1 second)
const SMILE_COOLDOWN_DURATION_MS = 3000; // How long (ms) to wait after extracting a smile before looking for a new one (e.g., 3 seconds)
const MIN_SMILE_DURATION_MS = 200; // Minimum duration (ms) a smile must be detected to be considered valid

// --- NEW: Define the time step for processing frames ---
const PROCESSING_FRAME_STEP_MS = 250; // Process a frame every 250ms (4 frames per second)
// You can adjust this later:
// 100ms = 10 frames/sec (more detailed, slower)
// 250ms = 4 frames/sec (good balance)
// 500ms = 2 frames/sec (faster, might miss quick smiles)

export class VideoProcessor {
    private videoElement: HTMLVideoElement | null = null;
    private canvasElement: HTMLCanvasElement | null = null;
    private stopProcessingFlag: boolean = false;

    // State for smile buffering
    private currentSmileBurst: {
        bestFrame: ExtractedFrame | null;
        maxConfidence: number;
        startTime: number; // Timestamp when the burst started (ms)
        lastDetectionTime: number; // Timestamp of the last frame where a smile was detected in this burst (ms)
    } | null = null;

    private smileCooldownActive: boolean = false;
    private cooldownTimeoutId: ReturnType<typeof setTimeout> | null = null;

    constructor(videoElement: HTMLVideoElement, canvasElement: HTMLCanvasElement) {
        this.videoElement = videoElement;
        this.canvasElement = canvasElement;
    }

    public stopProcessing(): void {
        this.stopProcessingFlag = true;
        if (this.cooldownTimeoutId) {
            clearTimeout(this.cooldownTimeoutId);
            this.cooldownTimeoutId = null;
        }
        console.log("Processing stopped.");
    }

    public async processVideo(
        file: File,
        options: ProcessingOptions,
        setProcessingStats: React.Dispatch<React.SetStateAction<ProcessingStats>>
    ): Promise<ExtractedFrame[]> {
        this.stopProcessingFlag = false;
        const video = this.videoElement;
        const canvas = this.canvasElement;

        if (!video || !canvas) {
            throw new Error("Video or canvas element not provided to VideoProcessor.");
        }

        // Reset video and canvas for new processing
        console.log("Loading video source...");
        video.src = URL.createObjectURL(file);
        video.load();
        video.currentTime = 0; // Start from the beginning
        video.playbackRate = 1; // Set playback rate to 1 for accurate seeking during processing

        // Ensure video metadata is loaded
        await new Promise<void>((resolve, reject) => {
            const onLoadedMetadata = () => {
                video.removeEventListener('loadedmetadata', onLoadedMetadata);
                video.removeEventListener('error', onError); // Clean up error listener too
                console.log(`Video loaded. Duration: ${video.duration.toFixed(2)}s. Dimensions: ${video.videoWidth}x${video.videoHeight}`);
                // Set canvas dimensions for processing (can be lower than video intrinsic for performance)
                // We'll use the intrinsic dimensions for final export in App.tsx
                canvas.width = video.videoWidth; // Use original video width for detection canvas
                canvas.height = video.videoHeight; // Use original video height for detection canvas
                resolve();
            };
            const onError = (e: Event) => {
                video.removeEventListener('loadedmetadata', onLoadedMetadata);
                video.removeEventListener('error', onError);
                console.error("Video loading error:", e);
                reject(new Error("Failed to load video metadata."));
            };
            video.addEventListener('loadedmetadata', onLoadedMetadata);
            video.addEventListener('error', onError);
        });

        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error("Could not get 2D context from canvas.");
        }

        // Estimate total frames based on the new PROCESSING_FRAME_STEP_MS
        const estimatedTotalFrames = Math.floor(video.duration * 1000 / PROCESSING_FRAME_STEP_MS);
        let processedFrames = 0;
        let smilingFacesCount = 0;
        const extractedFrames: ExtractedFrame[] = [];

        // Reset smile buffering state
        this.currentSmileBurst = null;
        this.smileCooldownActive = false;
        if (this.cooldownTimeoutId) {
            clearTimeout(this.cooldownTimeoutId);
            this.cooldownTimeoutId = null;
        }

        setProcessingStats({
            totalFrames: estimatedTotalFrames, // Update totalFrames estimate
            processedFrames: 0,
            smilingFaces: 0,
            isProcessing: true
        });

        // --- NEW: Loop through video by fixed time steps ---
        let currentTime = 0;
        while (currentTime < video.duration && !this.stopProcessingFlag) {
            video.currentTime = currentTime; // Seek to the current time
            // console.log(`Seeking to: ${currentTime.toFixed(2)}s`); // Log seek time

            // Wait for the video to actually seek to the new time and be ready
            await new Promise<void>((resolve, reject) => {
                let seekTimeout: ReturnType<typeof setTimeout>;
                const onSeeked = () => {
                    video.removeEventListener('seeked', onSeeked);
                    video.removeEventListener('error', onError);
                    clearTimeout(seekTimeout); // Clear timeout if seeked
                    resolve();
                };
                const onError = (e: Event) => {
                    video.removeEventListener('seeked', onSeeked);
                    video.removeEventListener('error', onError);
                    clearTimeout(seekTimeout);
                    console.error("Error during video seek:", e);
                    reject(new Error("Video seek failed."));
                };
                video.addEventListener('seeked', onSeeked);
                video.addEventListener('error', onError);

                // Add a timeout for the seeked event in case it never fires (e.g., corrupted frame)
                seekTimeout = setTimeout(() => {
                    video.removeEventListener('seeked', onSeeked);
                    video.removeEventListener('error', onError);
                    console.warn(`Seek to ${currentTime.toFixed(2)}s timed out.`);
                    resolve(); // Resolve anyway to avoid freezing, but log warning
                }, 1000); // 1 second timeout for seek
            });

            // If processing was stopped while waiting for seeked, break
            if (this.stopProcessingFlag) break;

            processedFrames++;
            setProcessingStats(prev => ({ ...prev, processedFrames }));

            // Draw current video frame to canvas for detection
            context.drawImage(video, 0, 0, canvas.width, canvas.height);

            // --- IMPORTANT: Ensure Face-API.js can access the canvas for detection ---
            // Pass the canvas element to detectFaces, as Face-API.js works best with an image source
            const detections = await faceDetectionService.detectFaces(canvas); // Changed from video to canvas
            // console.log(`Detections in frame ${processedFrames} at ${video.currentTime.toFixed(2)}s: ${detections.length}`); // Log detections

            // --- Smile Buffering and Selection Logic ---
            const currentTimestampMs = video.currentTime * 1000; // Use actual video currentTime
            let smileDetectedInFrame = false;

            for (const detection of detections) {
                if (faceDetectionService.isSmiling(detection.expressions, detection.landmarks)) {
                    smileDetectedInFrame = true;
                    const currentFrameConfidence = detection.expressions.happy || 0;

                    if (this.smileCooldownActive) {
                        // console.log("Smile detected during cooldown, ignoring.");
                        continue;
                    }

                    if (!this.currentSmileBurst) {
                        // Start a new smile burst
                        // console.log(`Starting new smile burst at ${video.currentTime.toFixed(2)}s`);
                        this.currentSmileBurst = {
                            bestFrame: {
                                detection: detection.detection.box,
                                expressions: detection.expressions,
                                landmarks: detection.landmarks,
                                timestamp: video.currentTime,
                                confidence: currentFrameConfidence,
                                id: Date.now().toString() + Math.random().toString(36).substring(2, 9) // Unique ID
                            },
                            maxConfidence: currentFrameConfidence,
                            startTime: currentTimestampMs,
                            lastDetectionTime: currentTimestampMs,
                        };
                    } else {
                        // Continue current smile burst
                        // Update best frame if current frame is more confident
                        if (currentFrameConfidence > this.currentSmileBurst.maxConfidence) {
                            // console.log(`Updating best frame in burst. New confidence: ${currentFrameConfidence.toFixed(2)}`);
                            this.currentSmileBurst.bestFrame = {
                                detection: detection.detection.box,
                                expressions: detection.expressions,
                                landmarks: detection.landmarks,
                                timestamp: video.currentTime,
                                confidence: currentFrameConfidence,
                                id: Date.now().toString() + Math.random().toString(36).substring(2, 9) // Unique ID
                            };
                            this.currentSmileBurst.maxConfidence = currentFrameConfidence;
                        }
                        this.currentSmileBurst.lastDetectionTime = currentTimestampMs;
                    }
                    // If a smile is detected, we don't need to check other faces for this frame's burst logic
                    break; 
                }
            }

            // Logic to finalize a smile burst
            if (this.currentSmileBurst) {
                const burstDuration = currentTimestampMs - this.currentSmileBurst.startTime;
                const timeSinceLastDetection = currentTimestampMs - this.currentSmileBurst.lastDetectionTime;

                // Condition to finalize a burst:
                // 1. Smile is no longer detected AND (time since last detection exceeds buffer OR burst duration exceeds buffer)
                // 2. Or, burst duration has passed since the start of the burst (even if smile is still active)
                if (
                    (!smileDetectedInFrame && timeSinceLastDetection > SMILE_BUFFER_DURATION_MS) || // Smile ended and buffer time passed
                    (smileDetectedInFrame && burstDuration > SMILE_BUFFER_DURATION_MS) // Smile still active but burst maxed out
                ) {
                    if (burstDuration >= MIN_SMILE_DURATION_MS && this.currentSmileBurst.bestFrame) {
                        extractedFrames.push(this.currentSmileBurst.bestFrame);
                        smilingFacesCount++;
                        setProcessingStats(prev => ({ ...prev, smilingFaces: smilingFacesCount }));
                        // console.log(`Extracted smile at ${this.currentSmileBurst.bestFrame.timestamp.toFixed(2)}s. Total smiles: ${smilingFacesCount}`);
                    }
                    // Start cooldown
                    this.smileCooldownActive = true;
                    if (this.cooldownTimeoutId) clearTimeout(this.cooldownTimeoutId);
                    this.cooldownTimeoutId = setTimeout(() => {
                        this.smileCooldownActive = false;
                        this.cooldownTimeoutId = null;
                        // console.log("Smile cooldown ended.");
                    }, SMILE_COOLDOWN_DURATION_MS);

                    this.currentSmileBurst = null; // Reset for next burst
                }
            }
            // --- End Smile Buffering and Selection Logic ---

            currentTime += PROCESSING_FRAME_STEP_MS / 1000; // Advance by the defined step in seconds
            // Yield control to browser to prevent freezing UI
            await new Promise(requestAnimationFrame);
        }

        // Finalize any pending smile burst after video ends
        if (this.currentSmileBurst && this.currentSmileBurst.bestFrame && 
            (video.currentTime * 1000 - this.currentSmileBurst.lastDetectionTime) <= SMILE_BUFFER_DURATION_MS && // Check if still within buffer duration relative to end
            (video.currentTime * 1000 - this.currentSmileBurst.startTime) >= MIN_SMILE_DURATION_MS &&
            !this.smileCooldownActive) { // Only add if not in cooldown
            extractedFrames.push(this.currentSmileBurst.bestFrame);
            smilingFacesCount++;
            setProcessingStats(prev => ({ ...prev, smilingFaces: smilingFacesCount }));
            // console.log(`Extracted final smile at ${this.currentSmileBurst.bestFrame.timestamp.toFixed(2)}s. Total smiles: ${smilingFacesCount}`);
        }

        setProcessingStats(prev => ({ ...prev, isProcessing: false }));
        console.log("Video processing finished. Total extracted smiles:", extractedFrames.length);

        // Sort final extracted frames by confidence (highest first)
        extractedFrames.sort((a, b) => b.confidence - a.confidence);

        return extractedFrames;
    }
}

