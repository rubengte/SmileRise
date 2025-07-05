import React from 'react';
import { ProcessingOptions } from '../types';

interface ProcessingOptionsProps {
  options: ProcessingOptions;
  onChange: (options: ProcessingOptions) => void;
  disabled: boolean;
}

const ProcessingOptionsComponent: React.FC<ProcessingOptionsProps> = ({
  options,
  onChange,
  disabled
}) => {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">
        Extraction Options
      </h3>
      
      <div className="space-y-4">
        <div className="flex items-center">
          <input
            type="checkbox"
            id="extractAll"
            checked={options.extractAll}
            onChange={(e) => onChange({ ...options, extractAll: e.target.checked })}
            disabled={disabled}
            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
          />
          <label htmlFor="extractAll" className="ml-2 text-sm font-medium text-gray-700">
            Extract all smiling faces
          </label>
        </div>

        {!options.extractAll && (
          <div className="ml-6 space-y-2">
            <label htmlFor="maxExtract" className="block text-sm font-medium text-gray-700">
              Maximum frames to extract:
            </label>
            <input
              type="number"
              id="maxExtract"
              min="1"
              max="100"
              value={options.maxExtract}
              onChange={(e) => onChange({ ...options, maxExtract: parseInt(e.target.value) || 10 })}
              disabled={disabled}
              className="block w-32 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ProcessingOptionsComponent;