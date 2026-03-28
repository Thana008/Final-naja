import React from 'react';

function SearchResults({ data }) {
  if (!data) return null;

  return (
    <div className="results-container" style={{ width: '100%', maxWidth: '800px', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      


      {/* Detected Objects Labels */}
      {data.labels && data.labels.length > 0 && (
         <div className="glass-panel">
            <h3 style={{ margin: '0 0 1rem 0', display:'flex', alignItems:'center', gap:'0.5rem', color:'#f8fafc', fontSize: '0.9rem' }}>🏷️ Tags</h3>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {data.labels.map((lbl, idx) => (
                    <div key={idx} style={{ padding: '0.5rem 1rem', background: idx===0?'#3b82f6':'rgba(255,255,255,0.05)', borderRadius: '50px', fontWeight: idx===0?'bold':'normal', fontSize: '0.85rem' }}>
                         <span style={{ textTransform: 'uppercase', letterSpacing: '1px' }}>{lbl.description}</span>
                         <span style={{ marginLeft: '8px', opacity: 0.6, fontSize: '0.75rem' }}>{Math.round(lbl.score * 100)}%</span>
                    </div>
                ))}
            </div>
         </div>
      )}

      {/* Web Search Results (Multi-Source) */}
      {data.web_results && data.web_results.length > 0 && (
        <div className="glass-panel text-left">
           <h3 style={{ margin: '0 0 1.5rem 0', display:'flex', alignItems:'center', gap:'0.5rem', color:'#f8fafc' }}>🌐 Similar Items Found on the Web</h3>
           <p style={{ marginBottom: '1.5rem', color: '#94a3b8', fontSize: '0.9rem' }}>
             Searching for "<strong style={{color:'#3b82f6'}}>{data.labels?.[0]?.description}{data.labels?.[1] ? ` ${data.labels[1].description}` : ''}</strong>" — 
             {data.web_results.length} results from <strong>Openverse</strong>, <strong>Wikimedia</strong>, <strong>Wikipedia</strong>, and <strong>DuckDuckGo</strong>.
           </p>
           
           <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1.5rem' }}>
             {data.web_results.map((item, idx) => {
                const sourceColors = { Openverse: '#10b981', Wikimedia: '#a855f7', Wikipedia: '#3b82f6', DuckDuckGo: '#f59e0b' };
                const sourceColor = sourceColors[item.source] || '#3b82f6';
                return (
                <a key={idx} href={item.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', transition: 'transform 0.2s, border-color 0.2s', cursor: 'pointer' }}
                       onMouseEnter={e => { e.currentTarget.style.transform='translateY(-4px)'; e.currentTarget.style.borderColor=sourceColor; }}
                       onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.08)'; }}>
                    {item.image && (
                      <div style={{ width: '100%', height: '160px', overflow: 'hidden', background: '#1e293b' }}>
                        <img src={item.image} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    )}
                    <div style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '0.95rem', color: '#e2e8f0', flex: 1 }}>{item.title?.slice(0, 60)}</div>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#94a3b8', lineHeight: '1.4', marginBottom: '0.75rem' }}>{item.snippet?.slice(0, 120)}{item.snippet?.length > 120 ? '...' : ''}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: '50px', background: `${sourceColor}22`, color: sourceColor, fontWeight: 'bold' }}>{item.source || 'Web'}</span>
                        <span style={{ fontSize: '0.75rem', color: sourceColor }}>View →</span>
                      </div>
                    </div>
                  </div>
                </a>
                );
             })}
           </div>
        </div>
      )}
      
    </div>
  );
}

export default SearchResults;
