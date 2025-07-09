import { ExtractedFrame, ProcessingStats, ProcessingOptions } from '../types';
import { faceDetectionService } from './faceDetection';

export class VideoProcessor {
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private fullResCanvas: HTMLCanvasElement; // New: Full resolution canvas for export
  private ctx: CanvasRenderingContext2D;
  private fullResCtx: CanvasRenderingContext2D; // New: Full resolution context
  private lastDetectionTime: number = 0;
  private detectionCooldown: number = 3000; // Increased to 3 seconds for better diversity
  private isProcessing: boolean = false;
  private shouldStop: boolean = false;
  private smileClusters: Array<{ frames: ExtractedFrame[]; avgTimestamp: number }> = [];

  constructor() {
    this.video = document.createElement('video');
    this.canvas = document.createElement('canvas');
    this.fullResCanvas = document.createElement('canvas'); // Full resolution canvas for export
    this.ctx = this.canvas.getContext('2d')!;
    this.fullResCtx = this.fullResCanvas.getContext('2d')!; // Full resolution context
    
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.preload = 'metadata';
  }

  async processVideo(
    file: File,
    options: ProcessingOptions,
    onProgress: (stats: ProcessingStats) => void
  ): Promise<ExtractedFrame[]> {
    // Prevent multiple simultaneous processing
    if (this.isProcessing) {
      throw new Error('Video processing already in progress');
    }

    this.isProcessing = true;
    this.shouldStop = false;
    this.smileClusters = [];
    
    // Clear smile detection history
    faceDetectionService.clearHistory();
    
    return new Promise((resolve, reject) => {
      const extractedFrames: ExtractedFrame[] = [];
      let frameCount = 0;
      let processedFrames = 0;
      this.lastDetectionTime = 0;

      // Clean up any existing video source
      if (this.video.src) {
        URL.revokeObjectURL(this.video.src);
        this.video.src = '';
      }

      const videoUrl = URL.createObjectURL(file);
      this.video.src = videoUrl;
      
      const cleanup = () => {
        this.isProcessing = false;
        this.shouldStop = true;
        if (videoUrl) {
          URL.revokeObjectURL(videoUrl);
        }
        this.video.src = '';
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        faceDetectionService.clearHistory();
      };

      const handleError = (error: string | Error) => {
        cleanup();
        reject(new Error(typeof error === 'string' ? error : error.message));
      };

      this.video.onloadedmetadata = async () => {
        try {
          if (this.shouldStop) return;

          const duration = this.video.duration;
          
          // Handle very long videos (30+ minutes) with adaptive frame rate
          let fps = 2; // Default 2 FPS
          if (duration > 1800) { // 30+ minutes
            fps = 1; // Reduce to 1 FPS for very long videos
          } else if (duration > 3600) { // 60+ minutes
            fps = 0.5; // Even lower for extremely long videos
          }
          
          const totalFrames = Math.floor(duration * fps);
          
          console.log(`🎬 Processing ${(duration/60).toFixed(1)} minute video at ${fps} FPS (${totalFrames} frames)`);
          
          // Set canvas size for optimal face detection with high-quality videos
          const maxWidth = 1200; // Increased for 2.7K/4K videos
          const maxHeight = 900;
          const videoAspect = this.video.videoWidth / this.video.videoHeight;
          
          if (videoAspect > 1) {
            this.canvas.width = Math.min(maxWidth, this.video.videoWidth);
            this.canvas.height = this.canvas.width / videoAspect;
          } else {
            this.canvas.height = Math.min(maxHeight, this.video.videoHeight);
            this.canvas.width = this.canvas.height * videoAspect;
          }

          console.log(`📐 Canvas size: ${this.canvas.width}x${this.canvas.height} (from ${this.video.videoWidth}x${this.video.videoHeight})`);

          // Set FULL RESOLUTION canvas for export (this is the key fix!)
          this.fullResCanvas.width = this.video.videoWidth;
          this.fullResCanvas.height = this.video.videoHeight;
          
          console.log(`🎯 EXPORT canvas size: ${this.fullResCanvas.width}x${this.fullResCanvas.height} (FULL RESOLUTION)`);

          // Initialize face detection
          await faceDetectionService.initialize();

          const processFrame = async (currentTime: number) => {
            try {
              if (this.shouldStop) {
                cleanup();
                resolve(this.getFinalResults(extractedFrames, options));
                return;
              }

              this.video.currentTime = currentTime;
              
              await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                  reject(new Error('Video seek timeout'));
                }, 10000); // Increased timeout for large files

                this.video.onseeked = () => {
                  clearTimeout(timeout);
                  resolve(undefined);
                };
                
                this.video.onerror = () => {
                  clearTimeout(timeout);
                  reject(new Error('Video seek error'));
                };
              });

              if (this.shouldStop) return;

              // Clear detection canvas and draw frame for analysis
              this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
              this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
              
              processedFrames++;
              
              try {
                // Ultra-precise smile detection with temporal analysis
                const detection = await faceDetectionService.detectSmileInFrame(this.canvas, currentTime);
                
                if (detection.hasSmile && detection.isGenuineSmile) {
                  // Check if this frame is diverse enough from existing frames
                  const isDiverse = this.checkFrameDiversity(currentTime, extractedFrames);
                  
                  if (isDiverse) {
                    // Capture frame at FULL RESOLUTION for export (FIXED!)
                    this.fullResCtx.clearRect(0, 0, this.fullResCanvas.width, this.fullResCanvas.height);
                    this.fullResCtx.drawImage(this.video, 0, 0, this.fullResCanvas.width, this.fullResCanvas.height);
                    
                    const frameData: ExtractedFrame = {
                      id: `frame-${Date.now()}-${Math.random()}`,
                      dataUrl: this.fullResCanvas.toDataURL('image/jpeg', 0.98), // MAXIMUM QUALITY export
                      timestamp: currentTime,
                      confidence: detection.confidence
                    };
                    
                    // Add to appropriate cluster or create new one
                    this.addToCluster(frameData);
                    
                    // Update extracted frames with best from each cluster
                    const bestFrames = this.getBestFramesFromClusters();
                    extractedFrames.length = 0;
                    extractedFrames.push(...bestFrames);
                    
                    // Sort by confidence
                    extractedFrames.sort((a, b) => b.confidence - a.confidence);
                    
                    // Limit frames if not extracting all
                    if (!options.extractAll && extractedFrames.length > options.maxExtract) {
                      extractedFrames.splice(options.maxExtract);
                    }
                    
                    console.log(`🎯 MAXIMUM QUALITY EXPORT (${this.fullResCanvas.width}x${this.fullResCanvas.height})! Total: ${extractedFrames.length}, Confidence: ${(detection.confidence * 100).toFixed(1)}%`);
                  }
                }
              } catch (detectionError) {
                console.warn('Detection error:', detectionError);
              }

              if (!this.shouldStop) {
                onProgress({
                  totalFrames,
                  processedFrames,
                  smilingFaces: extractedFrames.length,
                  isProcessing: true
                });
              }

              frameCount++;
              
              if (frameCount >= totalFrames || this.shouldStop) {
                const finalResults = this.getFinalResults(extractedFrames, options);
                
                onProgress({
                  totalFrames,
                  processedFrames,
                  smilingFaces: finalResults.length,
                  isProcessing: false
                });
                cleanup();
                resolve(finalResults);
              } else {
                // Process next frame with adaptive delay based on video length
                const delay = duration > 1800 ? 200 : 150; // Longer delay for very long videos
                setTimeout(() => processFrame(frameCount / fps), delay);
              }
            } catch (error) {
              handleError(error as Error);
            }
          };

          // Start processing
          onProgress({
            totalFrames,
            processedFrames: 0,
            smilingFaces: 0,
            isProcessing: true
          });
          
          processFrame(0);
        } catch (error) {
          handleError(error as Error);
        }
      };

      this.video.onerror = () => {
        handleError('Video processing failed. Please ensure the video file is valid and not corrupted.');
      };

      // Extended timeout for large files (30 minutes for 10GB files)
      setTimeout(() => {
        if (this.isProcessing) {
          handleError('Video processing timeout. This can happen with very large files. Try processing in smaller segments.');
        }
      }, 1800000); // 30 minute timeout for large files
    });
  }

  private checkFrameDiversity(currentTime: number, existingFrames: ExtractedFrame[]): boolean {
    // Ensure minimum time gap between frames
    const minTimeGap = 1.5; // Reduced to 1.5 seconds to catch more amazing smiles
    
    for (const frame of existingFrames) {
      if (Math.abs(currentTime - frame.timestamp) < minTimeGap) {
        return false;
      }
    }
    
    return true;
  }

  private addToCluster(frame: ExtractedFrame): void {
    const clusterThreshold = 4.0; // Reduced to 4 seconds for better diversity
    
    // Find existing cluster for this frame
    let targetCluster = this.smileClusters.find(cluster => 
      Math.abs(cluster.avgTimestamp - frame.timestamp) <= clusterThreshold
    );
    
    if (targetCluster) {
      targetCluster.frames.push(frame);
      // Update average timestamp
      targetCluster.avgTimestamp = targetCluster.frames.reduce((sum, f) => sum + f.timestamp, 0) / targetCluster.frames.length;
    } else {
      // Create new cluster
      this.smileClusters.push({
        frames: [frame],
        avgTimestamp: frame.timestamp
      });
    }
  }

  private getBestFramesFromClusters(): ExtractedFrame[] {
    return this.smileClusters.map(cluster => {
      // Return the frame with highest confidence from each cluster
      return cluster.frames.reduce((best, current) => 
        current.confidence > best.confidence ? current : best
      );
    });
  }

  private getFinalResults(frames: ExtractedFrame[], options: ProcessingOptions): ExtractedFrame[] {
    // Final sort by confidence (highest first)
    const sortedFrames = [...frames].sort((a, b) => b.confidence - a.confidence);
    
    // Apply final limit if needed
    if (!options.extractAll && sortedFrames.length > options.maxExtract) {
      return sortedFrames.slice(0, options.maxExtract);
    }
    
    return sortedFrames;
  }

  stop() {
    this.shouldStop = true;
    this.isProcessing = false;
  }

  cleanup() {
    this.stop();
    if (this.video.src) {
      URL.revokeObjectURL(this.video.src);
      this.video.src = '';
    }
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.fullResCtx.clearRect(0, 0, this.fullResCanvas.width, this.fullResCanvas.height); // Clear full res canvas
    this.smileClusters = [];
    faceDetectionService.clearHistory();
  }
}
