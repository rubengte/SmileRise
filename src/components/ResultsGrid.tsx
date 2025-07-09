import React from 'react';
import { Download, DownloadCloud, Clock, Zap, Star } from 'lucide-react';
import { ExtractedFrame } from '../types';
import { downloadAllFrames } from '../utils/downloadUtils'; 

interface ResultsGridProps {
  frames: ExtractedFrame[];
  onSaveFrame: (frame: ExtractedFrame) => void; 
}

const ResultsGrid: React.FC<ResultsGridProps> = ({ frames, onSaveFrame }) => {
  if (frames.length === 0) {
    return null; 
  }

  const handleDownloadAll = async () => {
    await downloadAllFrames(frames);
  };

  const formatTimestamp = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-orange-600';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return 'Excellent';
    if (confidence >= 0.6) return 'Good';
    return 'Fair';
  };

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-semibold text-gray-800">
            Extracted Smiling Faces ({frames.length})
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Sorted by smile confidence • Best smiles first
          </p>
        </div>
        
        {frames.length > 1 && (
          <button
            onClick={handleDownloadAll}
            className="inline-flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors shadow-sm hover:shadow-md"
          >
            <DownloadCloud className="w-4 h-4 mr-2" />
            Download All (ZIP)
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {frames.map((frame, index) => (
          <div key={frame.id} className="relative group bg-gray-50 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-all duration-200">
            {/* Best smile indicator */}
            {index === 0 && frames.length > 1 && (
              <div className="absolute top-2 left-2 z-10 bg-yellow-500 text-white px-2 py-1 rounded-full text-xs font-medium flex items-center">
                <Star className="w-3 h-3 mr-1" />
                Best
              </div>
            )}
            
            <div className="aspect-video">
              <img
                src={frame.dataUrl}
                alt={`Smiling face at ${formatTimestamp(frame.timestamp)}`}
                className="w-full h-full object-cover"
              />
            </div>
            
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-200 flex items-center justify-center">
              <button
                onClick={() => onSaveFrame(frame)} 
                className="opacity-0 group-hover:opacity-100 transition-opacity bg-white text-gray-800 px-3 py-2 rounded-lg shadow-lg hover:bg-gray-50 transform hover:scale-105"
              >
                <Download className="w-4 h-4 mr-1 inline" />
                Download
              </button>
            </div>

            <div className="p-3 bg-white">
              <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                <div className="flex items-center">
                  <Clock className="w-3 h-3 mr-1" />
                  {formatTimestamp(frame.timestamp)}
                </div>
                <div className={`flex items-center font-medium ${getConfidenceColor(frame.confidence)}`}>
                  <Zap className="w-3 h-3 mr-1" />
                  {Math.round(frame.confidence * 100)}%
                </div>
              </div>
              <div className="text-xs text-gray-500">
                Quality: {getConfidenceLabel(frame.confidence)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {frames.length > 0 && (
        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h4 className="text-sm font-medium text-blue-800 mb-2">Processing Summary</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="font-semibold text-blue-900">{frames.length}</div>
              <div className="text-blue-700">Total Smiles</div>
            </div>
            <div>
              <div className="font-semibold text-blue-900">
                {frames.filter(f => f.confidence >= 0.8).length}
              </div>
              <div className="text-blue-700">Excellent Quality</div>
            </div>
            <div>
              <div className="font-semibold text-blue-900">
                {Math.round(frames[0]?.confidence * 100 || 0)}%
              </div>
              <div className="text-blue-700">Best Smile</div>
            </div>
            <div>
              <div className="font-semibold text-blue-900">
                {Math.round((frames.reduce((sum, f) => sum + f.confidence, 0) / frames.length) * 100) || 0}%
              </div>
              <div className="text-blue-700">Average Quality</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResultsGrid;

