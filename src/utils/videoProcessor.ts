import { faceDetectionService } from './faceDetection';
import { ExtractedFrame, ProcessingOptions, ProcessingStats } from '../types';
import * as faceapi from 'face-api.js';

// Define parameters for smile buffering and selection
// Temporarily adjusted for easier debugging and initial detection
const SMILE_BUFFER_DURATION_MS = 500; // Shorter buffer to capture more distinct smiles
const SMILE_COOLDOWN_DURATION_MS = 2000; // Shorter cooldown
const MIN_SMILE_DURATION_MS = 100; // Very short minimum duration to ensure detection

// Define the time step for processing frames
const PROCESSING_FRAME_STEP_MS = 250; // Process a frame every 250ms (4 frames per second)

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
        const canvas = this.canvasElement; // Canvas is still needed for drawing for display/export

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
                video.removeEventListener('error', onError);
                console.log(`Video loaded. Duration: ${video.duration.toFixed(2)}s. Dimensions: ${video.videoWidth}x${video.videoHeight}`);
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
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
            totalFrames: estimatedTotalFrames,
            processedFrames: 0,
            smilingFaces: 0,
            isProcessing: true
        });

        let currentTime = 0;
        while (currentTime < video.duration && !this.stopProcessingFlag) {
            video.currentTime = currentTime;
            console.log(`Processing frame at: ${currentTime.toFixed(2)}s`);

            await new Promise<void>((resolve, reject) => {
                let seekTimeout: ReturnType<typeof setTimeout>;
                const onSeeked = () => {
                    video.removeEventListener('seeked', onSeeked);
                    video.removeEventListener('error', onError);
                    clearTimeout(seekTimeout);
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

                seekTimeout = setTimeout(() => {
                    video.removeEventListener('seeked', onSeeked);
                    video.removeEventListener('error', onError);
                    console.warn(`Seek to ${currentTime.toFixed(2)}s timed out.`);
                    resolve();
                }, 1000);
            });

            if (this.stopProcessingFlag) break;

            processedFrames++;
            setProcessingStats(prev => ({ ...prev, processedFrames }));

            // --- IMPORTANT: Pass the VIDEO ELEMENT directly to detectFaces ---
            // This is often more reliable for Face-API.js than a canvas that might not be fully rendered yet.
            const detections = await faceDetectionService.detectFaces(video); 
            console.log(`Detections in frame ${processedFrames} at ${video.currentTime.toFixed(2)}s: ${detections.length} faces found.`);

            // --- Simplified Smile Buffering and Selection Logic for Debugging ---
            const currentTimestampMs = video.currentTime * 1000;
            let smileDetectedInFrame = false;

            for (const detection of detections) {
                if (faceDetectionService.isSmiling(detection.expressions, detection.landmarks)) {
                    smileDetectedInFrame = true;
                    const currentFrameConfidence = detection.expressions.happy || 0;
                    console.log(`  Smile detected! Confidence: ${currentFrameConfidence.toFixed(2)}`);

                    if (this.smileCooldownActive) {
                        console.log("  Smile detected during cooldown, ignoring.");
                        continue;
                    }

                    if (!this.currentSmileBurst) {
                        this.currentSmileBurst = {
                            bestFrame: {
                                detection: detection.detection.box,
                                expressions: detection.expressions,
                                landmarks: detection.landmarks,
                                timestamp: video.currentTime,
                                confidence: currentFrameConfidence,
                                id: Date.now().toString() + Math.random().toString(36).substring(2, 9)
                            },
                            maxConfidence: currentFrameConfidence,
                            startTime: currentTimestampMs,
                            lastDetectionTime: currentTimestampMs,
                        };
                        console.log(`  Starting new smile burst at ${video.currentTime.toFixed(2)}s`);
                    } else {
                        if (currentFrameConfidence > this.currentSmileBurst.maxConfidence) {
                            this.currentSmileBurst.bestFrame = {
                                detection: detection.detection.box,
                                expressions: detection.expressions,
                                landmarks: detection.landmarks,
                                timestamp: video.currentTime,
                                confidence: currentFrameConfidence,
                                id: Date.now().toString() + Math.random().toString(36).substring(2, 9)
                            };
                            this.currentSmileBurst.maxConfidence = currentFrameConfidence;
                            console.log(`  Updating best frame in burst. New confidence: ${currentFrameConfidence.toFixed(2)}`);
                        }
                        this.currentSmileBurst.lastDetectionTime = currentTimestampMs;
                    }
                    break; // Only consider one smile per frame for burst logic
                }
            }

            // Logic to finalize a smile burst
            if (this.currentSmileBurst) {
                const burstDuration = currentTimestampMs - this.currentSmileBurst.startTime;
                const timeSinceLastDetection = currentTimestampMs - this.currentSmileBurst.lastDetectionTime;

                // Finalize if smile ended OR burst maxed out
                if (
                    (!smileDetectedInFrame && timeSinceLastDetection > SMILE_BUFFER_DURATION_MS) ||
                    (smileDetectedInFrame && burstDuration > SMILE_BUFFER_DURATION_MS)
                ) {
                    if (burstDuration >= MIN_SMILE_DURATION_MS && this.currentSmileBurst.bestFrame) {
                        extractedFrames.push(this.currentSmileBurst.bestFrame);
                        smilingFacesCount++;
                        setProcessingStats(prev => ({ ...prev, smilingFaces: smilingFacesCount }));
                        console.log(`  Extracted smile at ${this.currentSmileBurst.bestFrame.timestamp.toFixed(2)}s. Total smiles: ${smilingFacesCount}`);
                    }
                    this.smileCooldownActive = true;
                    if (this.cooldownTimeoutId) clearTimeout(this.cooldownTimeoutId);
                    this.cooldownTimeoutId = setTimeout(() => {
                        this.smileCooldownActive = false;
                        this.cooldownTimeoutId = null;
                        console.log("  Smile cooldown ended.");
                    }, SMILE_COOLDOWN_DURATION_MS);

                    this.currentSmileBurst = null;
                }
            }
            // --- End Simplified Smile Buffering and Selection Logic ---

            currentTime += PROCESSING_FRAME_STEP_MS / 1000;
            await new Promise(requestAnimationFrame);
        }

        // Finalize any pending smile burst after video ends
        if (this.currentSmileBurst && this.currentSmileBurst.bestFrame && 
            (video.currentTime * 1000 - this.currentSmileBurst.lastDetectionTime) <= SMILE_BUFFER_DURATION_MS &&
            (video.currentTime * 1000 - this.currentSmileBurst.startTime) >= MIN_SMILE_DURATION_MS &&
            !this.smileCooldownActive) {
            extractedFrames.push(this.currentSmileBurst.bestFrame);
            smilingFacesCount++;
            setProcessingStats(prev => ({ ...prev, smilingFaces: smilingFacesCount }));
            console.log(`Extracted final smile at ${this.currentSmileBurst.bestFrame.timestamp.toFixed(2)}s. Total smiles: ${smilingFacesCount}`);
        }

        setProcessingStats(prev => ({ ...prev, isProcessing: false }));
        console.log("Video processing finished. Total extracted smiles:", extractedFrames.length);

        extractedFrames.sort((a, b) => b.confidence - a.confidence);

        return extractedFrames;
    }
}

