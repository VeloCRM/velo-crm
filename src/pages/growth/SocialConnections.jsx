import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { fetchAgencySetting, fetchAllAgencySettings } from '../../lib/agency_settings';
import {
  listSocialConnections,
  upsertSocialConnection,
  deleteSocialConnection,
} from '../../lib/social_connections';

const platformDefs = [
  { id: 'meta', name: 'Meta / Instagram', icon: '📸', color: '#e879a8', prompt: 'Input: username only' },
  { id: 'google', name: 'Google Maps', icon: '📍', color: '#10b981', prompt: 'Input: business name + city OR Google Maps URL' },
  { id: 'tiktok', name: 'TikTok', icon: '🎵', color: '#06b6d4', prompt: 'Input: username only' },
  { id: 'twitter', name: 'Twitter / X', icon: '🐦', color: '#3b82f6', prompt: 'Input: username' },
  { id: 'linkedin', name: 'LinkedIn', icon: '💼', color: '#0ea5e9', prompt: 'Company page URL (Manual Entry Required)', isManualOnly: true },
  { id: 'youtube', name: 'YouTube', icon: '▶️', color: '#ef4444', prompt: 'Input: channel URL or @handle' },
  { id: 'snapchat', name: 'Snapchat', icon: '👻', color: '#eab308', prompt: 'Input: username' },
];

export default function SocialConnections({ orgId }) {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rapidApiKey, setRapidApiKey] = useState(null);
  
  // Modal state
  const [activeModal, setActiveModal] = useState(null); // stores platform id
  const [modalStep, setModalStep] = useState('input'); // 'input', 'loading', 'preview', 'manual'
  const [fetchIdentifier, setFetchIdentifier] = useState('');
  const [fetchError, setFetchError] = useState(null);
  const [previewData, setPreviewData] = useState(null);

  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    page_name: '',
    profile_url: '',
    followers_count: '',
    following_count: '',
    posts_count: '',
    profile_pic_url: '',
    bio: '',
    engagement_rate: '',
    notes: ''
  });

  useEffect(() => {
    if (orgId && supabase) {
      fetchConnections();
      fetchGlobalSettings();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const fetchGlobalSettings = async () => {
    try {
      const row = await fetchAgencySetting('rapidapi_key');
      if (row?.value) setRapidApiKey(row.value);
    } catch {
      // No agency_settings row is OK; the page falls back to manual entry.
    }
  };

  const fetchConnections = async () => {
    setLoading(true);
    try {
      const data = await listSocialConnections();
      setConnections(data);
    } catch (err) {
      console.error('Error fetching connections:', err);
    } finally {
      setLoading(false);
    }
  };

  const openModal = (platformId) => {
    setFormData({
      page_name: '',
      profile_url: '',
      followers_count: '',
      following_count: '',
      posts_count: '',
      profile_pic_url: '',
      bio: '',
      engagement_rate: '',
      notes: ''
    });
    setFetchIdentifier('');
    setFetchError(null);
    setPreviewData(null);
    setActiveModal(platformId);

    const pDef = platformDefs.find(p => p.id === platformId);
    if (pDef?.isManualOnly) {
      setModalStep('manual');
    } else {
      setModalStep('input');
    }
  };

  const handleFetchData = async (e) => {
    e.preventDefault();
    if (!fetchIdentifier) return;
    setModalStep('loading');
    setFetchError(null);

    try {
      let result = null;
      if (['meta', 'tiktok', 'youtube', 'twitter', 'snapchat', 'google'].includes(activeModal)) {
        let token = null;
        if (activeModal === 'twitter') {
          const settings = await fetchAllAgencySettings();
          token = settings?.[0]?.twitter_bearer_token;
        } else if (activeModal === 'google') {
          const settings = await fetchAllAgencySettings();
          token = settings?.[0]?.google_places_api_key;
        } else if (['meta', 'tiktok', 'youtube'].includes(activeModal)) {
          token = rapidApiKey;
          if (!token) throw new Error('RapidAPI access is missing! Add key in settings API panel.');
        }

        const { data: { session } } = await supabase.auth.getSession();
        const jwt = session?.access_token;
        if (!jwt) throw new Error('Not authenticated');

        const proxyRes = await fetch('/api/social-fetch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}` },
          body: JSON.stringify({ platform: activeModal, username: fetchIdentifier, token })
        });
        
        const proxyData = await proxyRes.json();
        if (!proxyRes.ok || !proxyData.success) {
          throw new Error(proxyData.error || 'Proxy fetch failed');
        }

        result = {
          page_name: proxyData.name || fetchIdentifier,
          profile_url: activeModal === 'tiktok' ? `https://www.tiktok.com/@${fetchIdentifier}` :
                       activeModal === 'meta' ? `https://www.instagram.com/${fetchIdentifier}` :
                       activeModal === 'twitter' ? `https://twitter.com/${fetchIdentifier}` :
                       activeModal === 'snapchat' ? `https://www.snapchat.com/add/${fetchIdentifier}` :
                       activeModal === 'youtube' ? `https://www.youtube.com/${fetchIdentifier.startsWith('@') ? fetchIdentifier : '@'+fetchIdentifier}` : 
                       activeModal === 'google' ? `https://google.com/maps/place/?q=place_id:${proxyData.place_id}` : fetchIdentifier,
          followers_count: proxyData.followers || 0,
          following_count: 0,
          posts_count: proxyData.posts || 0,
          profile_pic_url: proxyData.profilePic || '',
          bio: proxyData.bio || '',
          engagement_rate: proxyData.rating || 0
        };
      }

      if (result) {
        setPreviewData(result);
        setFormData(prev => ({
          ...prev,
          page_name: result.page_name || prev.page_name,
          profile_url: result.profile_url || prev.profile_url,
          followers_count: result.followers_count || prev.followers_count,
          following_count: result.following_count || prev.following_count,
          posts_count: result.posts_count || prev.posts_count,
          profile_pic_url: result.profile_pic_url || prev.profile_pic_url,
          bio: result.bio || prev.bio,
          engagement_rate: result.engagement_rate || prev.engagement_rate
        }));
        setModalStep('preview');
      } else {
        throw new Error('No compatible result created');
      }
    } catch (err) {
      console.error('Fetch error:', err);
      // Seamlessly fallback to manual
      setFetchError(err.message || 'Fetch failed');
      setFormData(prev => ({ ...prev, page_name: fetchIdentifier }));
      setModalStep('manual');
    }
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    if (!supabase || !orgId) return;
    setSaving(true);
    try {
      await upsertSocialConnection(activeModal, formData);
      await fetchConnections();
      setActiveModal(null);
    } catch (err) {
      console.error('Error saving:', err);
      alert('Failed to save connection');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async (platformId) => {
    if (!supabase) return;
    try {
      await deleteSocialConnection(platformId);
      await fetchConnections();
    } catch (err) {
      console.error('Error disconnecting:', err);
    }
  };

  const refreshPlatformData = async (platformId) => {
    const connection = connections.find(c => c.platform === platformId);
    if (!connection) return;
    
    // Auto-open modal, repopulate fetchIdentifier with username or URL to try refresh
    setFetchIdentifier(connection.profile_url || connection.page_name);
    setActiveModal(platformId);
    setModalStep('loading');
    
    // Hack: Wait a micro-tick so modal renders, then trigger fetch (just call it without an event)
    setTimeout(() => {
       fetchPlatformDataBypass(platformId, connection.profile_url || connection.page_name);
    }, 100);
  };

  // Helper hook to reuse fetch logic via button
  const fetchPlatformDataBypass = async (platformId, identifier) => {
     try {
        setFetchIdentifier(identifier);
        document.getElementById('hidden-fetch-btn')?.click();
     } catch(e) {}
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Styles for hover and animations */}
      <style>{`
        .soc-card { transition: all 0.2s ease; }
        .soc-card:hover { 
           transform: translateY(-2px); 
           box-shadow: 0 8px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05); 
        }
        .soc-btn { transition: all 0.2s ease; }
        .soc-btn:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
        .soc-btn:active:not(:disabled) { transform: translateY(0); }
        .soc-input {
           background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
           color: white; transition: all 0.2s ease; box-sizing: border-box;
        }
        .soc-input:focus {
           outline: none; border-color: rgba(255,255,255,0.3); background: rgba(255,255,255,0.06);
           box-shadow: 0 0 0 2px rgba(255,255,255,0.05);
        }
        .soc-textarea { resize: vertical; min-height: 80px; }
        .spinner {
           border: 3px solid rgba(255,255,255,0.1); border-radius: 50%; border-top: 3px solid #3b82f6; 
           width: 24px; height: 24px; animation: spin 1s linear infinite; display: inline-block;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>

      {/* Summary Bar */}
      <div style={{
        background: 'linear-gradient(90deg, #1e293b 0%, #0f172a 100%)',
        borderRadius: 16, padding: '20px 24px', border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
           <div style={{ 
             width: 48, height: 48, borderRadius: 12, background: 'rgba(59,130,246,0.1)', color: '#3b82f6',
             display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, border: '1px solid rgba(59,130,246,0.2)'
           }}>✨</div>
           <div>
              <h3 style={{ margin: 0, color: '#f8fafc', fontSize: 16, fontWeight: 600 }}>Active Connections</h3>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: 14, marginTop: 4 }}>
                 <strong style={{ color: '#e2e8f0' }}>{connections.length}</strong> platform{connections.length !== 1 ? 's' : ''} connected
              </p>
           </div>
        </div>
        <div style={{ color: '#64748b', fontSize: 13, textAlign: 'right', maxWidth: 300, lineHeight: 1.5 }}>
           AI Growth Agent uses this connection data to compare platforms and recommend where to focus.
        </div>
      </div>

      {loading ? (
         <div style={{ color: '#94a3b8', textAlign: 'center', padding: '60px 0', fontSize: 15 }}>Loading connections...</div>
      ) : (
         <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
           {!rapidApiKey && (
             <div style={{ background: 'rgba(239,68,68,0.05)', padding: '16px 20px', borderRadius: 12, border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 20 }}>⚠️</span>
                <div style={{ flex: 1 }}>
                   <div style={{ color: '#f8fafc', fontWeight: 600, fontSize: 14 }}>Setup Required: RapidAPI Key Missing</div>
                   <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>Auto-fetching for Meta, TikTok, and YouTube is disabled until a RapidAPI key is configured.</div>
                </div>
                <a href="/settings/agencyai" style={{ background: '#ef4444', color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Go to Settings</a>
             </div>
           )}

           <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
           {platformDefs.map(p => {
             const connection = connections.find(c => c.platform === p.id);
             const isConnected = !!connection;

             return (
               <div key={p.id} className="soc-card" style={{
                 background: '#101422', borderRadius: 16, padding: 24, border: `1px solid rgba(255,255,255,0.06)`,
                 borderLeft: `4px solid ${p.color}`, display: 'flex', flexDirection: 'column', gap: 20
               }}>
                 
                 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                       <div style={{ 
                         width: 44, height: 44, borderRadius: 12, background: `rgba(255,255,255,0.04)`, 
                         display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, border: '1px solid rgba(255,255,255,0.05)'
                       }}>
                          {p.icon}
                       </div>
                       <div>
                          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#f8fafc', margin: 0 }}>
                            {p.name}
                          </h3>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                             <div style={{ 
                               width: 8, height: 8, borderRadius: '50%', background: isConnected ? '#10b981' : '#475569',
                               boxShadow: isConnected ? '0 0 8px rgba(16,185,129,0.4)' : 'none'
                             }} />
                             <span style={{ fontSize: 13, color: isConnected ? '#10b981' : '#64748b', fontWeight: 500 }}>
                               {isConnected ? 'Connected' : p.isManualOnly ? 'Manual Entry Required' : 'Not Connected'}
                             </span>
                          </div>
                       </div>
                    </div>
                 </div>

                 {isConnected && connection.page_name ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                       <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px 16px', borderRadius: 10, fontSize: 14, color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 10 }}>
                          {connection.profile_pic_url && <img src={connection.profile_pic_url} alt="Profile" style={{width: 24, height: 24, borderRadius: '50%'}} />}
                          <span>Connected as <strong style={{ color: '#fff' }}>{connection.page_name}</strong></span>
                       </div>
                       <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '8px 12px', borderRadius: 6 }}>
                             <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Followers</div>
                             <div style={{ fontSize: 14, color: '#f8fafc', fontWeight: 600 }}>{(connection.followers_count || 0).toLocaleString()}</div>
                          </div>
                          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '8px 12px', borderRadius: 6 }}>
                             <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Posts/Videos</div>
                             <div style={{ fontSize: 14, color: '#f8fafc', fontWeight: 600 }}>{(connection.posts_count || 0).toLocaleString()}</div>
                          </div>
                       </div>
                       {connection.last_synced_at && (
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: -4 }}>
                             Last synced: {new Date(connection.last_synced_at).toLocaleString()}
                          </div>
                       )}
                    </div>
                 ) : (
                    <div style={{ flex: 1 }} />
                 )}

                 <div style={{ display: 'flex', gap: 12, marginTop: 'auto' }}>
                    {isConnected ? (
                       <>
                         <button onClick={() => refreshPlatformData(p.id)} className="soc-btn" style={{
                           padding: '10px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', color: '#e2e8f0',
                           border: '1px solid rgba(255,255,255,0.1)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
                         }}>
                           Refresh
                         </button>
                         <button onClick={() => handleDisconnect(p.id)} className="soc-btn" style={{
                           flex: 1, padding: '10px 0', borderRadius: 10, background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                           border: '1px solid rgba(239,68,68,0.2)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
                         }}>
                           Disconnect
                         </button>
                       </>
                    ) : (
                       <button onClick={() => openModal(p.id)} className="soc-btn" style={{
                         flex: 1, padding: '10px 0', borderRadius: 10, background: p.color, color: '#fff', border: 'none',
                         fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                         opacity: 0.9, textShadow: '0 1px 2px rgba(0,0,0,0.2)'
                       }}>
                         {p.isManualOnly ? 'Add Manually' : 'Connect'}
                       </button>
                    )}
                 </div>
               </div>
             );
           })}
         </div>
         </div>
      )}

      {/* Dynamic Modal Framework */}
      {activeModal && (
         <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}>
            <div style={{ background: '#0f172a', padding: '32px', borderRadius: '24px', width: '100%', maxWidth: '460px', border: `1px solid rgba(255,255,255,0.1)`, borderTop: `4px solid ${platformDefs.find(p => p.id === activeModal)?.color || '#3b82f6'}`, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', maxHeight: '90vh', overflowY: 'auto' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                 <div>
                   <h2 style={{ color: '#f8fafc', margin: 0, fontSize: 22, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
                     <span style={{ fontSize: 24 }}>{platformDefs.find(p => p.id === activeModal)?.icon}</span>
                     Connect {platformDefs.find(p => p.id === activeModal)?.name}
                   </h2>
                 </div>
                 <button onClick={() => setActiveModal(null)} className="soc-btn" style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'#94a3b8', cursor:'pointer', fontSize: 20, width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                   &times;
                 </button>
               </div>
               
               {/* STEP 1: Input Fetching Identifier */}
               {modalStep === 'input' && (
                  <form onSubmit={handleFetchData} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                     <p style={{ color: '#94a3b8', fontSize: 14, margin: 0 }}>
                       {platformDefs.find(p => p.id === activeModal)?.prompt}
                     </p>
                     <input className="soc-input" required autoFocus value={fetchIdentifier} onChange={e => setFetchIdentifier(e.target.value)} placeholder="Enter details to auto-fetch..." style={{ padding: '14px', borderRadius: 10, fontSize: 15 }} />
                     
                     <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                       <button type="button" onClick={() => setModalStep('manual')} className="soc-btn" style={{ flex: 1, padding: '12px 0', borderRadius: 10, background: 'transparent', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 600, cursor: 'pointer' }}>
                         Skip to Manual
                       </button>
                       <button type="submit" id="hidden-fetch-btn" className="soc-btn" style={{ flex: 2, padding: '12px 0', borderRadius: 10, background: platformDefs.find(p => p.id === activeModal)?.color, color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
                         Fetch Details
                       </button>
                     </div>
                  </form>
               )}

               {/* STEP 2: Loading Phase */}
               {modalStep === 'loading' && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '40px 0' }}>
                     <div className="spinner" />
                     <div style={{ color: '#cbd5e1', fontSize: 15 }}>Connecting to platform...</div>
                  </div>
               )}

               {/* STEP 3: Preview Fetched Data */}
               {modalStep === 'preview' && previewData && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                     <div style={{ background: 'rgba(255,255,255,0.04)', padding: 16, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                           {previewData.profile_pic_url && <img src={previewData.profile_pic_url} alt="pic" style={{width: 56, height: 56, borderRadius: '50%'}} />}
                           <div>
                              <div style={{ color: '#fff', fontWeight: 600, fontSize: 16 }}>{previewData.page_name}</div>
                              {previewData.bio && <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>{previewData.bio.slice(0, 60)}...</div>}
                           </div>
                        </div>
                        <div style={{ display: 'flex', gap: 16 }}>
                           <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 11, color: '#64748b' }}>Followers</div>
                              <div style={{ color: '#fff' }}>{previewData.followers_count?.toLocaleString()}</div>
                           </div>
                           <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 11, color: '#64748b' }}>Following</div>
                              <div style={{ color: '#fff' }}>{previewData.following_count?.toLocaleString()}</div>
                           </div>
                           <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 11, color: '#64748b' }}>Posts / Vids</div>
                              <div style={{ color: '#fff' }}>{previewData.posts_count?.toLocaleString()}</div>
                           </div>
                        </div>
                     </div>
                     <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                       <button onClick={() => setModalStep('manual')} className="soc-btn" style={{ flex: 1, padding: '12px 0', borderRadius: 10, background: 'transparent', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 600, cursor: 'pointer' }}>
                         Edit Manually
                       </button>
                       <button onClick={() => handleSave()} disabled={saving} className="soc-btn" style={{ flex: 2, padding: '12px 0', borderRadius: 10, background: platformDefs.find(p => p.id === activeModal)?.color, color: '#fff', border: 'none', fontWeight: 600, cursor: saving ?'not-allowed':'pointer' }}>
                         {saving ? 'Saving...' : 'Confirm & Save'}
                       </button>
                     </div>
                  </div>
               )}

               {/* STEP 4: Manual Fallback / Edit */}
               {modalStep === 'manual' && (
                  <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                     {fetchError && (
                        <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', fontSize: 13 }}>
                           ⚠️ {fetchError} — Please enter details manually below.
                        </div>
                     )}
                     
                     <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div style={{ gridColumn: '1 / -1' }}>
                           <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, marginBottom: 8, fontWeight: 500 }}>Account Name *</label>
                           <input className="soc-input" required value={formData.page_name} onChange={e => setFormData({...formData, page_name: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: 8 }} />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                           <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, marginBottom: 8, fontWeight: 500 }}>Profile URL</label>
                           <input className="soc-input" type="url" value={formData.profile_url} onChange={e => setFormData({...formData, profile_url: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: 8 }} />
                        </div>
                        <div>
                           <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, marginBottom: 8, fontWeight: 500 }}>Followers Count</label>
                           <input className="soc-input" type="number" value={formData.followers_count} onChange={e => setFormData({...formData, followers_count: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: 8 }} />
                        </div>
                        <div>
                           <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, marginBottom: 8, fontWeight: 500 }}>Posts Count</label>
                           <input className="soc-input" type="number" value={formData.posts_count} onChange={e => setFormData({...formData, posts_count: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: 8 }} />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                           <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, marginBottom: 8, fontWeight: 500 }}>Notes</label>
                           <textarea className="soc-input" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: 8, minHeight: '60px' }} />
                        </div>
                     </div>

                     <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                       <button type="button" onClick={() => setActiveModal(null)} className="soc-btn" style={{ flex: 1, padding: '12px 0', borderRadius: 10, background: 'transparent', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>Cancel</button>
                       <button type="submit" disabled={saving} className="soc-btn" style={{ flex: 2, padding: '12px 0', borderRadius: 10, background: platformDefs.find(p => p.id === activeModal)?.color, color: '#fff', border: 'none', fontWeight: 600, cursor: saving?'not-allowed':'pointer' }}>
                         {saving ? 'Saving...' : 'Save Connection'}
                       </button>
                     </div>
                  </form>
               )}
            </div>
         </div>
      )}
    </div>
  );
}
