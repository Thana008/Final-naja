import React, { useState, useEffect } from 'react';
import ImageUploader from './components/ImageUploader';
import SearchResults from './components/SearchResults';

function App() {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error, setError] = useState(null);
  const [backendReady, setBackendReady] = useState(false);

  // Check backend health
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/health');
        const data = await res.json();
        setBackendReady(data.ai_ready);
      } catch (err) {
         // ignore
      }
    };
    checkHealth();
    const int = setInterval(checkHealth, 5000);
    return () => clearInterval(int);
  }, []);

  const handleSearch = async (file) => {
    setLoading(true);
    setError(null);
    setResults(null);
    
    try {
      setLoadingMsg('Uploading encrypted image to Private Server...');
      
      const formData = new FormData();
      formData.append('image', file);

      setLoadingMsg('Extracting OCR Text, Translating, and looking for similar vectors...');

      const response = await fetch('http://localhost:5000/api/analyze', {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `Server Error: ${response.status}`);
      }
      
      setResults(data);

    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  };

  return (
    <>
      <div className="bg-mesh"></div>
      <div className="app-container">
        <header className="header" style={{ marginBottom: '2rem' }}>
          <h1 className="title">VisionAI Enterprise</h1>
          <p className="subtitle">Self-hosted Object Recognition, OCR, Translation & Reverse Vector Search</p>
          {!backendReady && <div style={{ fontSize: '0.8rem', color: '#eab308', background: 'rgba(234, 179, 8, 0.1)', padding: '0.5rem 1rem', borderRadius: '50px', display: 'inline-block', marginTop: '1rem' }}>⚠️ Server AI Models Downloading/Booting... Please wait ~1-2 mins on first run</div>}
          {backendReady && <div style={{ fontSize: '0.8rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '0.5rem 1rem', borderRadius: '50px', display: 'inline-block', marginTop: '1rem' }}>✅ Server AI Neural Engine Ready</div>}
        </header>

        <main style={{width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
          <ImageUploader onSearch={handleSearch} loading={loading} loadingMsg={loadingMsg} />
          
          {error && <div className="glass-panel" style={{color: '#ef4444', marginTop: '1.5rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)'}}>{error}</div>}
          
          {results && <SearchResults data={results} />}
        </main>
      </div>
    </>
  );
}

export default App;
