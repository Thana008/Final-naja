import React, { useState, useRef, useCallback } from 'react';
import Webcam from 'react-webcam';
import { Upload, Camera, Search } from 'lucide-react';

const ImageUploader = ({ onSearch, loading, loadingMsg }) => {
  const [mode, setMode] = useState('upload'); // 'upload' | 'camera'
  const [imagePreview, setImagePreview] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const webcamRef = useRef(null);

  // Convert any image file to JPEG via canvas (fixes WebP/AVIF/BMP unsupported by backend Jimp)
  const convertToJpeg = (file) => {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          const jpegFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
          URL.revokeObjectURL(url);
          resolve(jpegFile);
        }, 'image/jpeg', 0.92);
      };
      img.src = url;
    });
  };

  // Handle standard file upload
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      const pUrl = URL.createObjectURL(file);
      setImagePreview(pUrl);
      const jpegFile = await convertToJpeg(file);
      setSelectedFile(jpegFile);
    }
  };

  const handleCapture = useCallback(() => {
    if (!webcamRef.current) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (imageSrc) {
      setImagePreview(imageSrc);
      
      // Convert base64 Data URL to a File Object
      fetch(imageSrc)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], `capture_${Date.now()}.jpeg`, { type: 'image/jpeg' });
          setSelectedFile(file);
        });
    }
  }, [webcamRef]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (selectedFile) {
      onSearch(selectedFile);
    }
  };

  const resetImage = () => {
    setImagePreview(null);
    setSelectedFile(null);
  };

  return (
    <div className="uploader-container glass-panel" style={{ width: '100%', maxWidth: '600px', marginBottom: '2rem' }}>
      <div className="tab-buttons" style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', justifyContent: 'center' }}>
         <button type="button" onClick={() => {setMode('upload'); resetImage()}} className="btn" style={{ padding: '0.75rem 1.5rem', borderRadius: '50px', background: mode==='upload'?'#3b82f6':'rgba(255,255,255,0.05)', color: 'white', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Upload size={18}/> Upload
         </button>
         <button type="button" onClick={() => {setMode('camera'); resetImage()}} className="btn" style={{ padding: '0.75rem 1.5rem', borderRadius: '50px', background: mode==='camera'?'#3b82f6':'rgba(255,255,255,0.05)', color: 'white', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Camera size={18}/> Live Camera
         </button>
      </div>

      <form onSubmit={handleSubmit} className="uploader-form">
        {!imagePreview ? (
          <div className="upload-area" style={{ position: 'relative' }}>
             {mode === 'camera' ? (
                <div style={{ position: 'relative', width: '100%', borderRadius: '12px', overflow: 'hidden', minHeight: '300px', background: '#000', display: 'flex', justifyContent: 'center' }}>
                    <Webcam
                        audio={false}
                        ref={webcamRef}
                        screenshotFormat="image/jpeg"
                        videoConstraints={{ facingMode: "environment" }}
                        style={{ width: '100%', height: 'auto', objectFit: 'cover' }}
                    />
                    <button type="button" onClick={handleCapture} className="btn" style={{ position: 'absolute', bottom: '1rem', left: '50%', transform: 'translateX(-50%)', background: '#ef4444', color: 'white', padding: '0.75rem 2rem', borderRadius: '50px', zIndex: 10, fontWeight: 'bold' }}>
                        📸 Snap
                    </button>
                </div>
             ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3rem 1rem' }}>
                  <Upload size={48} color="#94a3b8" />
                  <p style={{ marginTop: '1rem' }}>Drag & drop or Click to upload</p>
                  <p style={{fontSize:'0.85rem', color:'#64748b'}}>JPEG, PNG (Max 5MB)</p>
                  <input type="file" accept="image/*" onChange={handleFileChange} />
                </div>
             )}
          </div>
        ) : (
          <div className="preview-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <img src={imagePreview} alt="Preview" className="image-preview" style={{ width: '100%', maxHeight: '400px', objectFit: 'contain', borderRadius: '12px' }} />
            <div className="preview-actions" style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
               <button type="button" onClick={resetImage} style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', color: 'white' }} disabled={loading}>
                 Retake/Clear
               </button>
               <button type="submit" style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', background: '#3b82f6', color: 'white', display: 'flex', gap: '0.5rem', alignItems: 'center', fontWeight: 'bold' }} disabled={loading}>
                 {loading ? (loadingMsg || 'Analyzing...') : <><Search size={18} /> Deep Analyze Image</>}
               </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
};

export default ImageUploader;
