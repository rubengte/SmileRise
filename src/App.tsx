import React, { useState, useCallback, useEffect } from 'react';
import { Smile, AlertCircle, Info, Brain, CheckCircle } from 'lucide-react';
import VideoUpload from './components/VideoUpload';
import ProcessingOptionsComponent from './components/ProcessingOptions';
import ProcessingProgress from './components/ProcessingProgress';
import ResultsGrid from './components/ResultsGrid';
import { VideoProcessor } from './utils/videoProcessor';
import { faceDetectionService } from './utils/faceDetection';
import { ExtractedFrame, ProcessingStats, ProcessingOptions } from './types';

function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [processingOptions, setProcessingOptions] = useState<ProcessingOptions>({
    extractAll: false,
    maxExtract: 5
  });
  const [processingStats, setProcessingStats] = useState<ProcessingStats>({
    totalFrames: 0,
    processedFrames: 0,
    smilingFaces: 0,
    isProcessing: false
  });
  const [extractedFrames, setExtractedFrames] = useState<ExtractedFrame[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isRealDetection, setIsRealDetection] = useState<boolean | null>(null);

  useEffect(() => {
    const initializeDetection = async () => {
      try {
        await faceDetectionService.initialize();
        setIsRealDetection(faceDetectionService.isUsingRealDetection());
      } catch (err) {
        console.error("Error initializing faceDetectionService:", err);
        setError(err instanceof Error ? err.message : 'Failed to initialize detection service.');
        setIsRealDetection(false);
      }
    };
    initializeDetection();
  }, []);

  const handleVideoSelect = useCallback((file: File) => {
    // Validate file size (max 10GB for high-quality videos)
    const maxSize = 10 * 1024 * 1024 * 1024; // 10GB
    if (file.size > maxSize) {
      setError('Video file is too large. Please choose a file smaller than 10GB.');
      return;
    }

    setSelectedFile(file);
    setError(null);
    setExtractedFrames([]);
    setProcessingStats({
      totalFrames: 0,
      processedFrames: 0,
      smilingFaces: 0,
      isProcessing: false
    });
  }, []);

  const handleStartProcessing = useCallback(async () => {
    if (!selectedFile) return;

    setError(null);
    setExtractedFrames([]);
    
    setProcessingStats(prev => ({ ...prev, isProcessing: true }));
    
    try {
      const processor = new VideoProcessor();
      
      const frames = await processor.processVideo(
        selectedFile,
        processingOptions,
        setProcessingStats
      );
      
      setExtractedFrames(frames);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during processing');
    } finally {
        setProcessingStats(prev => ({ ...prev, isProcessing: false }));
    }
  }, [selectedFile, processingOptions]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="p-3 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full mr-3">
              <Smile className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Real Smile Detection Pro
            </h1>
          </div>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto">
            Select high-quality videos (up to 10GB, 30+ minutes) and automatically extract genuine smiling faces using 
            <strong> hybrid ML + computer vision technology</strong>. <br>Combines Face-API.js machine learning with geometric analysis for superior accuracy.
          </p>
        </div>

        {/* Detection Status Banner */}
        {isRealDetection !== null && (
          <div className={`mb-6 p-4 border rounded-lg flex items-start ${
            isRealDetection 
              ? 'bg-green-50 border-green-200' 
              : 'bg-red-50 border-red-200'
          }`}>
            {isRealDetection ? (
              <CheckCircle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5 text-green-600" />
            ) : (
              <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5 text-red-600" />
            )}
            <div className={`text-sm ${isRealDetection ? 'text-green-800' : 'text-red-800'}`}>
              <strong>
                {isRealDetection 
                  ? '🎯 Advanced Face-API.js machine learning + Geometric Analysis ACTIVE!' 
                  : '❌ Face-API.js Detection Failed!'
                }
              </strong>
              <p className="mt-1">
                {isRealDetection 
                  ? 'This hybrid approach analyzes facial landmarks, expressions, and geometric features for superior accuracy in smile detection'
                  : 'Failed to load Face-API.js models. The models may be loading from CDN - please wait a moment and refresh if needed.'
                }
              </p>
              <p className="mt-1 text-xs opacity-75">
                Detection method: {faceDetectionService.getDetectionMethod()}
              </p>
              {isRealDetection && (
                <p className="mt-1 text-xs opacity-75">
                  Using CDN-hosted Face-API.js models for reliable global access
                </p>
              )}
            </div>
          </div>
        )}

        {/* Info Banner */}
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start">
          <Info className="w-5 h-5 text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <strong>Open sourse technology :</strong> you can contribute and make this code grow stronger and more precise. All files are on GitHub.
          </div>
        </div>

        {/* Processing Tips Banner */}
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start">
          <Info className="w-5 h-5 text-green-600 mr-2 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-green-800">
            <strong>💡 Processing Tips for Best Results:</strong>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li><strong>Keep this browser tab active</strong> during processing (don't switch tabs or minimize)</li>
              <li><strong>On mobile:</strong> Keep your screen on and this app in the foreground</li>
              <li><strong>For long videos (30+ min):</strong> Consider plugging in your device to prevent sleep mode</li>
              <li><strong>Processing runs locally</strong> - your video never leaves your device for privacy</li>
            </ul>
            <p className="mt-2 text-xs text-green-700">
              Browser background throttling can slow down or pause video processing. Staying active ensures optimal performance!
            </p>
          </div>
        </div>
        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
            <AlertCircle className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-red-800 font-medium">Error</h4>
              <p className="text-red-700 text-sm mt-1">{error}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Upload Section */}
          <div className="lg:col-span-2">
            <VideoUpload 
              onVideoSelect={handleVideoSelect}
              isProcessing={processingStats.isProcessing}
            />
          </div>

          {/* Options Section */}
          <div className="space-y-6">
            <ProcessingOptionsComponent
              options={processingOptions}
              onChange={setProcessingOptions}
              disabled={processingStats.isProcessing}
            />

            {selectedFile && !processingStats.isProcessing && processingStats.processedFrames === 0 && (
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">Ready to Process</h3>
                <div className="space-y-2 text-sm text-gray-600 mb-4">
                  <p><strong>File:</strong> {selectedFile.name}</p>
                  <p><strong>Size:</strong> {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB</p>
                  <p><strong>Mode:</strong> {processingOptions.extractAll ? 'Extract all smiles' : `Best ${processingOptions.maxExtract} smiles`}</p>
                </div>
                <button
                  onClick={handleStartProcessing}
                  disabled={!isRealDetection}
                  className={`w-full px-4 py-3 rounded-lg transition-all transform font-medium shadow-sm ${
                    isRealDetection 
                      ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white hover:scale-105 hover:shadow-md'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {isRealDetection ? 'Start Real OpenCV Processing' : 'OpenCV Loading...'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Progress Section */}
        <div className="mb-8">
          <ProcessingProgress stats={processingStats} />
        </div>

        {/* Results Section */}
        <ResultsGrid frames={extractedFrames} />

        {/* Info Footer */}
        <div className="mt-12 text-center text-gray-500 text-sm">
          <p>This app processes videos client-side using Face-api.js machine learning combined with computer vision. No data is sent to external servers.</p>
          <p className="mt-1">Supports high-quality videos up to 10GB and 30+ minutes. Outputs full quality frames and so the better the video resolution the better the frames extracted .</p>
          <p className="mt-1">Open source files available on GitHub.</p>
        </div>
      </div>
    </div>
  );
}

export default App;
