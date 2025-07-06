export class FaceDetectionService {
  private initialized = false;
  private detectionMethod: 'opencv' | 'fallback' = 'fallback';
  private faceCascade: any = null;
  private smileCascade: any = null;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('🔄 Initializing OpenCV.js face detection...');
    
    try {
      // Wait for OpenCV.js to be ready
      await this.waitForOpenCV();
      
      // Load Haar cascades from Netlify deployment
      await this.loadHaarCascades();
      
      this.detectionMethod = 'opencv';
      this.initialized = true;
      
      console.log('✅ Real OpenCV.js with Haar cascades loaded successfully!');
      console.log('🎯 Using genuine computer vision for face and smile detection');
      
    } catch (error) {
      console.error('❌ Failed to initialize OpenCV.js:', error);
      this.detectionMethod = 'fallback';
      this.initialized = true;
      throw new Error(`OpenCV initialization failed: ${error}`);
    }
  }

  private async waitForOpenCV(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if OpenCV is already loaded and ready
      if (typeof (window as any).cv !== 'undefined' && 
          (window as any).cv.Mat && 
          (window as any).cvReady === true) {
        console.log('✅ OpenCV.js already loaded and ready');
        resolve();
        return;
      }

      // Listen for the opencv-ready event
      const onOpenCVReady = () => {
        if (typeof (window as any).cv !== 'undefined' && (window as any).cv.Mat) {
          console.log('✅ OpenCV.js loaded via event listener');
          window.removeEventListener('opencv-ready', onOpenCVReady);
          clearTimeout(timeout);
          resolve();
        }
      };

      window.addEventListener('opencv-ready', onOpenCVReady);

      // Fallback polling with extended timeout for large OpenCV files
      let attempts = 0;
      const maxAttempts = 1200; // 120 seconds with 100ms intervals for large files
      
      const checkOpenCV = () => {
        attempts++;
        
        if (typeof (window as any).cv !== 'undefined' && 
            (window as any).cv.Mat && 
            (window as any).cvReady === true) {
          console.log(`✅ OpenCV.js loaded after ${attempts * 100}ms`);
          window.removeEventListener('opencv-ready', onOpenCVReady);
          clearTimeout(timeout);
          resolve();
        } else if (attempts >= maxAttempts) {
          window.removeEventListener('opencv-ready', onOpenCVReady);
          clearTimeout(timeout);
          reject(new Error('OpenCV.js failed to load within 120 seconds. The files may be too large or there may be a network issue.'));
        } else {
          setTimeout(checkOpenCV, 100);
        }
      };
      
      // Set overall timeout for large files
      const timeout = setTimeout(() => {
        window.removeEventListener('opencv-ready', onOpenCVReady);
        reject(new Error('OpenCV.js loading timeout - this can happen with large files over slow connections'));
      }, 130000); // 130 second total timeout for large files

      checkOpenCV();
    });
  }

  private async loadHaarCascades(): Promise<void> {
    const cv = (window as any).cv;
    
    if (!cv || !cv.CascadeClassifier) {
      throw new Error('OpenCV.js not properly loaded - CascadeClassifier not available');
    }

    try {
      console.log('📥 Loading Haar cascade files from Netlify deployment...');
      
      // Load face cascade from Netlify
      console.log('Loading face cascade from Netlify...');
      const faceResponse = await this.fetchWithRetry('https://quiet-gnome-7a845c.netlify.app/models/haarcascade_frontalface_default.xml');
      const faceXmlText = await faceResponse.text();
      console.log(`✅ Face cascade loaded (${faceXmlText.length} characters)`);
      
      // Load smile cascade from Netlify
      console.log('Loading smile cascade from Netlify...');
      const smileResponse = await this.fetchWithRetry('https://quiet-gnome-7a845c.netlify.app/models/haarcascade_smile.xml');
      const smileXmlText = await smileResponse.text();
      console.log(`✅ Smile cascade loaded (${smileXmlText.length} characters)`);
      
      // Check if we got actual XML content or placeholder content
      if (faceXmlText.includes('This file contains the description of some very simple features') ||
          smileXmlText.includes('This file contains the description of Haar-like features')) {
        throw new Error('Haar cascade files contain placeholder content. Please ensure actual XML files are uploaded to Netlify.');
      }
      
      // Validate XML content
      if (!faceXmlText.includes('<opencv_storage>')) {
        throw new Error('Invalid face cascade XML content - missing opencv_storage tag');
      }
      
      if (!smileXmlText.includes('<opencv_storage>')) {
        throw new Error('Invalid smile cascade XML content - missing opencv_storage tag');
      }
      
      // Create file names for OpenCV's virtual file system
      const faceFileName = 'haarcascade_frontalface_default.xml';
      const smileFileName = 'haarcascade_smile.xml';
      
      // Write files to OpenCV's virtual file system
      cv.FS_createDataFile('/', faceFileName, faceXmlText, true, false, false);
      cv.FS_createDataFile('/', smileFileName, smileXmlText, true, false, false);
      
      console.log('✅ Cascade files written to OpenCV virtual file system');
      
      // Create cascade classifiers
      this.faceCascade = new cv.CascadeClassifier();
      this.smileCascade = new cv.CascadeClassifier();
      
      // Load the classifiers
      const faceLoaded = this.faceCascade.load(faceFileName);
      const smileLoaded = this.smileCascade.load(smileFileName);
      
      if (!faceLoaded) {
        throw new Error('Failed to load face cascade classifier - file may be corrupted');
      }
      
      if (!smileLoaded) {
        throw new Error('Failed to load smile cascade classifier - file may be corrupted');
      }
      
      console.log('🎯 Both Haar cascade classifiers loaded and ready!');
      console.log('📍 Using Netlify-hosted cascade files for maximum reliability');
      
    } catch (error) {
      console.error('❌ Error loading Haar cascades:', error);
      throw error;
    }
  }

  private async fetchWithRetry(url: string, maxRetries: number = 5): Promise<Response> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        console.log(`Attempting to fetch ${url} (attempt ${i + 1}/${maxRetries})`);
        const response = await fetch(url, {
          mode: 'cors',
          cache: 'default'
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return response;
      } catch (error) {
        console.warn(`Fetch attempt ${i + 1} failed:`, error);
        
        if (i === maxRetries - 1) {
          throw new Error(`Failed to fetch ${url} after ${maxRetries} attempts: ${error}`);
        }
        
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      }
    }
    
    throw new Error('Unexpected error in fetchWithRetry');
  }

  async detectSmileInFrame(canvas: HTMLCanvasElement, currentTime: number): Promise<{ hasSmile: boolean; confidence: number; faceCount: number; isGenuineSmile: boolean }> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.detectionMethod !== 'opencv' || !this.faceCascade || !this.smileCascade) {
      throw new Error('OpenCV detection not available - initialization failed');
    }

    return await this.detectWithOpenCV(canvas, currentTime);
  }

  private async detectWithOpenCV(canvas: HTMLCanvasElement, currentTime: number): Promise<{ hasSmile: boolean; confidence: number; faceCount: number; isGenuineSmile: boolean }> {
    const cv = (window as any).cv;
    
    if (!cv || !cv.Mat) {
      throw new Error('OpenCV.js not available');
    }
    
    try {
      // Get image data from canvas
      const ctx = canvas.getContext('2d')!;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // Convert to OpenCV Mat
      const src = cv.matFromImageData(imageData);
      const gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      
      // Detect faces with optimized parameters for real detection
      const faces = new cv.RectVector();
      this.faceCascade.detectMultiScale(
        gray, 
        faces, 
        1.1,    // Scale factor
        3,      // Min neighbors
        0,      // Flags
        new cv.Size(30, 30),   // Min size
        new cv.Size(300, 300)  // Max size
      );
      
      const faceCount = faces.size();
      let bestSmileConfidence = 0;
      let totalSmiles = 0;
      
      console.log(`👤 OpenCV detected ${faceCount} faces at ${currentTime.toFixed(1)}s`);
      
      // For each detected face, check for smiles
      for (let i = 0; i < faceCount; i++) {
        const face = faces.get(i);
        const faceROI = gray.roi(face);
        
        // Detect smiles within the face region
        const smiles = new cv.RectVector();
        this.smileCascade.detectMultiScale(
          faceROI, 
          smiles, 
          1.8,    // Scale factor (higher = faster but less sensitive)
          20,     // Min neighbors (higher = more strict)
          0,      // Flags
          new cv.Size(25, 15),   // Min size for smile
          new cv.Size(120, 80)   // Max size for smile
        );
        
        const smileCount = smiles.size();
        
        if (smileCount > 0) {
          totalSmiles++;
          // Calculate confidence based on number of smile detections
          // More detections = higher confidence, but cap it reasonably
          const smileConfidence = Math.min(0.95, 0.7 + (smileCount * 0.05));
          bestSmileConfidence = Math.max(bestSmileConfidence, smileConfidence);
          
          console.log(`😊 REAL SMILE DETECTED! Face ${i + 1}: ${smileCount} smile detection(s), confidence: ${(smileConfidence * 100).toFixed(1)}%`);
        }
        
        // Cleanup
        faceROI.delete();
        smiles.delete();
      }
      
      // Cleanup OpenCV objects
      src.delete();
      gray.delete();
      faces.delete();
      
      const hasSmile = totalSmiles > 0;
      const isGenuineSmile = bestSmileConfidence > 0.75;
      
      if (hasSmile) {
        console.log(`🎯 GENUINE OpenCV DETECTION: ${totalSmiles} smile(s) found! Best confidence: ${(bestSmileConfidence * 100).toFixed(1)}% at ${currentTime.toFixed(1)}s`);
      }
      
      return {
        hasSmile,
        confidence: bestSmileConfidence,
        faceCount,
        isGenuineSmile
      };
      
    } catch (error) {
      console.error('❌ OpenCV detection error:', error);
      throw error;
    }
  }

  isUsingRealDetection(): boolean {
    return this.detectionMethod === 'opencv' && this.initialized;
  }

  getDetectionMethod(): string {
    if (this.detectionMethod === 'opencv') {
      return 'Real OpenCV Haar Cascades (Netlify CDN)';
    } else {
      return 'Detection Failed - OpenCV Not Available';
    }
  }

  clearHistory(): void {
    // No history to clear for real OpenCV detection
  }

  cleanup(): void {
    this.clearHistory();
    
    // Cleanup OpenCV classifiers
    if (this.faceCascade) {
      try {
        this.faceCascade.delete();
      } catch (e) {
        console.warn('Error deleting face cascade:', e);
      }
      this.faceCascade = null;
    }
    if (this.smileCascade) {
      try {
        this.smileCascade.delete();
      } catch (e) {
        console.warn('Error deleting smile cascade:', e);
      }
      this.smileCascade = null;
    }
  }
}

export const faceDetectionService = new FaceDetectionService();