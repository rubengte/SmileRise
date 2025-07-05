export interface ExtractedFrame {
  id: string;
  dataUrl: string;
  timestamp: number;
  confidence: number;
}

export interface ProcessingStats {
  totalFrames: number;
  processedFrames: number;
  smilingFaces: number;
  isProcessing: boolean;
}

export interface ProcessingOptions {
  extractAll: boolean;
  maxExtract: number;
}