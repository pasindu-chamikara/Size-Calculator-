'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Script from 'next/script';
import { determineSize } from '@/lib/size-chart';

declare global {
  interface Window {
    Pose: any;
    Camera: any;
    drawConnectors: any;
    drawLandmarks: any;
    POSE_CONNECTIONS: any;
  }
}

export default function SizeCalculator() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [heightInches, setHeightInches] = useState<number>(68); // Default 5'8"
  const [measurements, setMeasurements] = useState({ shoulder: 0, chest: 0, length: 0, sleeve: 0 });
  const [recommendedSize, setRecommendedSize] = useState<string>('-');
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scriptsLoaded, setScriptsLoaded] = useState(false);
  
  // Camera selection state
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  // Scanning state
  const [scanProgress, setScanProgress] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const isLockedRef = useRef(false);
  const framesCollected = useRef(0);
  const accumulatedMeasurements = useRef({ shoulder: 0, length: 0, sleeve: 0 });

  // Sync ref with state
  useEffect(() => {
    isLockedRef.current = isLocked;
  }, [isLocked]);

  // Fetch available cameras
  useEffect(() => {
    async function getDevices() {
      try {
        // Request permission first to get labels. Try 'environment' (back camera) first for mobile.
        try {
          await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        } catch (e) {
          // Fallback to any camera if environment camera is not available (e.g., desktop)
          await navigator.mediaDevices.getUserMedia({ video: true });
        }
        
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = allDevices.filter(device => device.kind === 'videoinput');
        
        // On mobile, try to automatically select the back camera if we can identify it by label
        const backCamera = videoDevices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment'));
        
        setDevices(videoDevices);
        
        if (backCamera) {
          setSelectedDeviceId(backCamera.deviceId);
        } else if (videoDevices.length > 0) {
          setSelectedDeviceId(videoDevices[0].deviceId);
        }
      } catch (e) {
        console.error("Error fetching devices:", e);
      }
    }
    getDevices();
  }, []);

  const onResults = useCallback((results: any) => {
    if (!canvasRef.current || !videoRef.current) return;

    const canvasCtx = canvasRef.current.getContext('2d');
    if (!canvasCtx) return;

    const canvasWidth = canvasRef.current.width;
    const canvasHeight = canvasRef.current.height;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    canvasCtx.drawImage(results.image, 0, 0, canvasWidth, canvasHeight);

    drawSilhouetteGuide(canvasCtx, canvasWidth, canvasHeight);

    if (results.poseLandmarks && window.drawConnectors && window.POSE_CONNECTIONS) {
      window.drawConnectors(canvasCtx, results.poseLandmarks, window.POSE_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
      window.drawLandmarks(canvasCtx, results.poseLandmarks, { color: '#FF0000', lineWidth: 1, radius: 2 });
      
      if (!isLockedRef.current) {
        calculateSize(results.poseLandmarks, canvasWidth, canvasHeight);
      }
    }
    
    canvasCtx.restore();
  }, [heightInches]);

  const drawSilhouetteGuide = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.ellipse(width / 2, height * 0.2, width * 0.1, height * 0.1, 0, 0, 2 * Math.PI);
    ctx.rect(width * 0.35, height * 0.3, width * 0.3, height * 0.4);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  const calculateSize = (landmarks: any[], canvasWidth: number, canvasHeight: number) => {
    const nose = landmarks[0];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftElbow = landmarks[13];
    const rightElbow = landmarks[14];
    const leftHeel = landmarks[29];
    const rightHeel = landmarks[30];
    
    // Ensure critical points are visible
    if (leftShoulder.visibility < 0.5 || rightShoulder.visibility < 0.5 || nose.visibility < 0.5) return;
    
    // Enforce full body visibility for accurate scaling
    if (leftHeel.visibility < 0.4 && rightHeel.visibility < 0.4) {
      setError("Please step back so your full body (head to feet) is in the frame.");
      setScanProgress(0);
      framesCollected.current = 0;
      accumulatedMeasurements.current = { shoulder: 0, length: 0, sleeve: 0 };
      return;
    } else {
      setError(null);
    }

    // Helper for precise 2D Euclidean Distance
    const getDistance = (lm1: any, lm2: any) => {
      const dx = (lm1.x - lm2.x) * canvasWidth;
      const dy = (lm1.y - lm2.y) * canvasHeight;
      return Math.sqrt(dx * dx + dy * dy);
    };

    // Calculate actual distances even if leaning
    const shoulderPxWidth = getDistance(leftShoulder, rightShoulder);
    
    const midShoulder = { x: (leftShoulder.x + rightShoulder.x)/2, y: (leftShoulder.y + rightShoulder.y)/2 };
    const midHip = { x: (leftHip.x + rightHip.x)/2, y: (leftHip.y + rightHip.y)/2 };
    const torsoPxLength = getDistance(midShoulder, midHip) * 1.15;
    
    const leftSleevePx = getDistance(leftShoulder, leftElbow);
    const rightSleevePx = getDistance(rightShoulder, rightElbow);
    const sleevePxLength = ((leftSleevePx + rightSleevePx) / 2) * 0.8;
    
    // Height from Nose to lowest Heel (accounting for tilt)
    const lowestHeel = leftHeel.y > rightHeel.y ? leftHeel : rightHeel;
    const heightPx = getDistance(nose, lowestHeel) * 1.05; // ~5% addition to account for top of head

    if (heightPx === 0) return;

    const pixelsPerInch = heightPx / heightInches;
    
    const shoulderInches = shoulderPxWidth / pixelsPerInch;
    const chestInches = shoulderInches * 2.1; 
    const lengthInches = (leftHip.visibility > 0.5) ? torsoPxLength / pixelsPerInch : 0;
    const sleeveInches = (leftElbow.visibility > 0.5) ? sleevePxLength / pixelsPerInch : 0;

    // Reject wild anomalies
    if (shoulderInches > 5 && shoulderInches < 30) {
      framesCollected.current += 1;
      accumulatedMeasurements.current.shoulder += shoulderInches;
      accumulatedMeasurements.current.length += lengthInches;
      accumulatedMeasurements.current.sleeve += sleeveInches;

      const progress = Math.min(Math.floor((framesCollected.current / 60) * 100), 100);
      setScanProgress(progress);

      if (progress >= 100) {
        setIsLocked(true);
        const avgShoulder = accumulatedMeasurements.current.shoulder / 60;
        const avgChest = avgShoulder * 2.1;
        const avgLength = accumulatedMeasurements.current.length / 60;
        const avgSleeve = accumulatedMeasurements.current.sleeve / 60;

        setMeasurements({
          shoulder: Math.round(avgShoulder * 10) / 10,
          chest: Math.round(avgChest * 10) / 10,
          length: Math.round(avgLength * 10) / 10,
          sleeve: Math.round(avgSleeve * 10) / 10
        });
        
        setRecommendedSize(determineSize(avgShoulder, avgChest, avgLength));
      } else {
        setMeasurements({
          shoulder: Math.round(shoulderInches * 10) / 10,
          chest: Math.round(chestInches * 10) / 10,
          length: Math.round(lengthInches * 10) / 10,
          sleeve: Math.round(sleeveInches * 10) / 10
        });
        setRecommendedSize(determineSize(shoulderInches, chestInches, lengthInches));
      }
    }
  };

  const handleRestart = () => {
    setIsLocked(false);
    setScanProgress(0);
    framesCollected.current = 0;
    accumulatedMeasurements.current = { shoulder: 0, length: 0, sleeve: 0 };
    setRecommendedSize('-');
  };

  useEffect(() => {
    if (!scriptsLoaded || !selectedDeviceId) return;
    
    let activeStream: MediaStream | null = null;
    let animationFrameId: number;
    let isActive = true;

    const startCamera = async () => {
      try {
        activeStream = await navigator.mediaDevices.getUserMedia({ 
          video: { deviceId: { exact: selectedDeviceId } } 
        });
        
        setHasPermission(true);
        setError(null);

        if (videoRef.current) {
          videoRef.current.srcObject = activeStream;
          await videoRef.current.play();
        }
        
        const pose = new window.Pose({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        });

        pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          smoothSegmentation: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        pose.onResults(onResults);
        setIsTracking(true);

        const processVideo = async () => {
          if (!isActive) return;
          if (videoRef.current && videoRef.current.readyState >= 2) {
            await pose.send({ image: videoRef.current });
          }
          animationFrameId = requestAnimationFrame(processVideo);
        };
        
        processVideo();

      } catch (err: any) {
        setHasPermission(false);
        setError("Camera permission denied or camera not found.");
        console.error(err);
      }
    };

    startCamera();

    return () => {
      isActive = false;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
      setIsTracking(false);
    };
  }, [onResults, scriptsLoaded, selectedDeviceId]);

  return (
    <>
      <Script 
        src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js" 
        strategy="lazyOnload"
      />
      <Script 
        src="https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js" 
        strategy="lazyOnload"
      />
      <Script 
        src="https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js" 
        strategy="lazyOnload"
        onLoad={() => setScriptsLoaded(true)}
      />
      
      <div className="flex flex-col items-center gap-6 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-lg mt-10 text-black">
        <div className="flex justify-between items-center w-full">
          <h2 className="text-3xl font-bold text-gray-800">Real-Time Size Calculator</h2>
          {isLocked && (
            <button 
              onClick={handleRestart}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition font-medium"
            >
              Restart Calculation
            </button>
          )}
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4 w-full bg-gray-50 p-4 rounded-lg border">
          <div className="flex-1 flex flex-col justify-center space-y-4">
            {devices.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Camera</label>
                <select 
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  {devices.map((device, idx) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Camera ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your Height (inches)</label>
              <input 
                type="number" 
                value={heightInches}
                onChange={(e) => {
                  setHeightInches(Number(e.target.value) || 0);
                  if (isLocked) handleRestart();
                }}
                className="w-full px-3 py-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. 68 for 5'8&quot;"
              />
              <p className="text-xs text-gray-500 mt-1">Enter your exact height to calibrate the measurement scale.</p>
            </div>
          </div>
          
          <div className={`flex-1 p-4 rounded-md flex flex-col justify-center items-center border transition-colors ${isLocked ? 'bg-green-100 border-green-300' : 'bg-blue-50 border-blue-100'}`}>
            <p className={`text-sm font-semibold mb-1 ${isLocked ? 'text-green-700' : 'text-blue-600'}`}>
              {isLocked ? 'Final Recommended Size' : 'Calculating Size...'}
            </p>
            <p className={`text-4xl font-bold ${isLocked ? 'text-green-800' : 'text-blue-800'}`}>{recommendedSize}</p>
          </div>
        </div>

        {/* Progress Bar */}
        {!isLocked && (
          <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden mt-2">
            <div 
              className="bg-blue-600 h-4 rounded-full transition-all duration-300" 
              style={{ width: `${scanProgress}%` }}
            ></div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 w-full gap-4">
          <div className="bg-gray-100 rounded-lg p-4">
            <h3 className="font-semibold text-gray-700 mb-2">
              {isLocked ? 'Locked Measurements' : 'Live Measurements'}
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center border-b pb-2">
                <span className="text-gray-600">Shoulder Width:</span>
                <span className="font-mono font-medium">{measurements.shoulder}&quot;</span>
              </div>
              <div className="flex justify-between items-center border-b pb-2">
                <span className="text-gray-600">Estimated Chest:</span>
                <span className="font-mono font-medium">{measurements.chest}&quot;</span>
              </div>
              <div className="flex justify-between items-center border-b pb-2">
                <span className="text-gray-600">T-Shirt Length:</span>
                <span className="font-mono font-medium">{measurements.length}&quot;</span>
              </div>
              <div className="flex justify-between items-center border-b pb-2">
                <span className="text-gray-600">Sleeve Length:</span>
                <span className="font-mono font-medium">{measurements.sleeve}&quot;</span>
              </div>
            </div>
            <div className="mt-4 text-sm text-gray-500">
              <p><strong>Instructions:</strong></p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Step back so your full body is in the frame.</li>
                <li>Align your body with the dashed guide.</li>
                <li>Stand still until the progress bar reaches 100%.</li>
              </ul>
            </div>
          </div>

          <div className="relative rounded-lg overflow-hidden bg-black aspect-video md:aspect-[4/3] flex items-center justify-center">
            {error && <div className="text-red-500 z-10 absolute text-center px-4">{error}</div>}
            {!isTracking && !error && <div className="text-white z-10 absolute animate-pulse">Initializing Camera...</div>}
            {isLocked && <div className="absolute inset-0 bg-green-500 bg-opacity-20 z-10 pointer-events-none flex items-center justify-center border-4 border-green-500">
              <span className="bg-green-600 text-white px-4 py-2 rounded-full font-bold shadow-lg">SCAN COMPLETE</span>
            </div>}
            
            <video 
              ref={videoRef} 
              className="hidden" 
              playsInline
            />
            <canvas 
              ref={canvasRef} 
              width={640} 
              height={480}
              className="w-full h-full object-cover transform -scale-x-100" 
            />
          </div>
        </div>
      </div>
    </>
  );
}
