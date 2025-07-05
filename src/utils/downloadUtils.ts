import JSZip from 'jszip';
import { ExtractedFrame } from '../types';

export async function downloadFrame(frame: ExtractedFrame): Promise<void> {
  const link = document.createElement('a');
  link.download = `smile-frame-${frame.timestamp.toFixed(2)}s.jpg`;
  link.href = frame.dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function downloadAllFrames(frames: ExtractedFrame[]): Promise<void> {
  if (frames.length === 0) return;

  const zip = new JSZip();
  
  for (const frame of frames) {
    // Convert data URL to blob
    const response = await fetch(frame.dataUrl);
    const blob = await response.blob();
    
    const filename = `smile-frame-${frame.timestamp.toFixed(2)}s.jpg`;
    zip.file(filename, blob);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  
  const link = document.createElement('a');
  link.download = `extracted-smiles-${Date.now()}.zip`;
  link.href = URL.createObjectURL(zipBlob);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(link.href);
}