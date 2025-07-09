import React, { useCallback } from 'react';
import { Upload, Video } from 'lucide-react';

interface VideoUploadProps {
  onVideoSelect: (file: File) => void;
  isProcessing: boolean;
}

const VideoUpload: React.FC<VideoUploadProps> = ({ onVideoSelect, isProcessing }) => {
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    const videoFile = files.find(file => file.type.startsWith('video/'));
    
    if (videoFile) {
      onVideoSelect(videoFile);
    }
  }, [onVideoSelect]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onVideoSelect(file);
    }
  }, [onVideoSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div
      className="border-2 border-dashed border-blue-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors bg-gradient-to-br from-blue-50/50 to-indigo-50/50"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <div className="space-y-4">
        <div className="flex justify-center">
          <div className="p-4 bg-blue-100 rounded-full">
            <Video className="w-8 h-8 text-blue-600" />
          </div>
        </div>
        
        <div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">
            Upload High-Quality Video File
          </h3>
          <p className="text-gray-600 mb-4">
            Drag and drop your video here, or click to select
          </p>
          <p className="text-sm text-gray-500 mb-4">
            Supports MP4, AVI, MOV, WebM (up to 10GB, 30+ minutes)
          </p>
          <p className="text-xs text-blue-600 font-medium">
            Perfect for GoPro 2.7K/4K videos and long recordings
          </p>
        </div>

        <div>
          <label className="inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <Upload className="w-5 h-5 mr-2" />
            Choose Video File
            <input
              type="file"
              accept="video/mp4,video/avi,video/mov,video/quicktime,video/webm"
              onChange={handleFileSelect}
              disabled={isProcessing}
              className="hidden"
            />
          </label>
        </div>
      </div>
    </div>
  );
};

export default VideoUpload;
