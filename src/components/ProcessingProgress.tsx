import React from 'react';
import { Loader2, Smile } from 'lucide-react';
import { ProcessingStats } from '../types';

interface ProcessingProgressProps {
  stats: ProcessingStats;
}

const ProcessingProgress: React.FC<ProcessingProgressProps> = ({ stats }) => {
  const progress = stats.totalFrames > 0 ? (stats.processedFrames / stats.totalFrames) * 100 : 0;

  if (!stats.isProcessing && stats.processedFrames === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800 flex items-center">
          {stats.isProcessing ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin text-blue-600" />
              Processing Video...
            </>
          ) : (
            <>
              <Smile className="w-5 h-5 mr-2 text-green-600" />
              Processing Complete!
            </>
          )}
        </h3>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Progress</span>
          <span>{Math.round(progress)}%</span>
        </div>
        
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="text-center">
            <div className="font-semibold text-lg text-blue-600">{stats.processedFrames}</div>
            <div className="text-gray-600">Frames Processed</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-lg text-green-600">{stats.smilingFaces}</div>
            <div className="text-gray-600">Smiles Found</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-lg text-gray-700">{stats.totalFrames}</div>
            <div className="text-gray-600">Total Frames</div>
          </div>
        </div>
        
        {stats.isProcessing && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center text-sm text-yellow-800">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              <span className="font-medium">Keep this tab active for optimal processing speed</span>
            </div>
            <p className="text-xs text-yellow-700 mt-1">
              Browser may throttle background tabs, slowing down video analysis
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProcessingProgress;