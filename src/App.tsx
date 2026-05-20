import React, { useEffect, useState, useRef } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import SettingsModal from "./components/SettingsModal";
import EpisodeViewer from "./components/EpisodeViewer";
import { Settings, Loader2, PlaySquare, Home, Search, History, User, Clapperboard, ChevronRight } from "lucide-react";
import Admin from "./Admin";

type TabAction = 'home' | 'search' | 'history' | 'profile';

const PROVIDERS = [
  { id: 'reelshort', name: 'ReelShort', color: 'ffb400' },
  { id: 'goodshort', name: 'GoodShort', color: '7c3aed' },
  { id: 'freereels', name: 'FreeReels', color: '2563eb' },
  { id: 'netshort', name: 'NetShort', color: '16a34a' },
  { id: 'dotdrama', name: 'DotDrama', color: 'db2777' },
  { id: 'stardusttv', name: 'Stardust', color: '4f46e5' },
  { id: 'meloshort', name: 'MeloShort', color: 'd97706' },
  { id: 'dramabite', name: 'DramaBite', color: 'be185d' },
];

function MainApp() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<TabAction>('home');
  const [activeProvider, setActiveProvider] = useState<string>('reelshort');
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [userData, setUserData] = useState<any>(null);
  const [appSettings, setAppSettings] = useState<any>({ vipPrice: 0, popupText: "", popupImageUrl: "" });
  const [showVipModal, setShowVipModal] = useState(false);
  
  useEffect(() => {
    const token = localStorage.getItem('fypmini_token');
    if (!token) {
      setCurrentUser(null);
      setUserData(null);
      setIsAuthChecking(false);
      return;
    }

    fetch('/api/user/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => {
      if (data.user) {
        setCurrentUser(data.user);
        setUserData(data.user);
      } else {
        setCurrentUser(null);
        setUserData(null);
      }
    })
    .catch(() => {
      setCurrentUser(null);
      setUserData(null);
    })
    .finally(() => {
      setIsAuthChecking(false);
    });
  }, []);

  useEffect(() => {
    const fetchSettings = async () => {
       try {
         const res = await fetch('/api/admin/settings');
         const data = await res.json();
         setAppSettings(data.settings || { vipPrice: 0, popupText: "", popupImageUrl: "" });
       } catch (e) {
         console.error("Failed to load settings");
       }
    };
    fetchSettings();
  }, []);

  const [watchHistory, setWatchHistory] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('fypmini_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Use openedSeries to render EpisodeViewer
  const [openedSeries, setOpenedSeries] = useState<any | null>(null);

  // Initialize from local storage
  useEffect(() => {
    const stored = localStorage.getItem("fypmini_key");
    if (stored) {
      setApiKey(stored.trim());
    } else {
      setShowSettings(true);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('fypmini_history', JSON.stringify(watchHistory));
  }, [watchHistory]);

  const handleOpenSeries = (video: any) => {
    setWatchHistory(prev => {
      const filtered = prev.filter(v => v.id !== video.id);
      return [video, ...filtered].slice(0, 50); // Keep last 50
    });
    setOpenedSeries(video);
  };

  // Fetch videos (series) when API key or provider is set
  useEffect(() => {
    if (!apiKey) return;

    const fetchVideos = async () => {
      setLoading(true);
      setError(null);
      setVideos([]); // clear before fetching new provider
      try {
        const response = await fetch(`/api/videos?provider=${activeProvider}`, {
          headers: {
            "x-api-key": apiKey,
          },
        });

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error(`Provider ${activeProvider} is not currently available.`);
          }
          throw new Error("Failed to load videos. Check your API key.");
        }

        const resData = await response.json();
        
        let fetchedVideos = [];
        if (Array.isArray(resData)) {
          fetchedVideos = resData;
        } else if (resData.data && Array.isArray(resData.data)) {
          fetchedVideos = resData.data;
        } else if (resData.items && Array.isArray(resData.items)) {
          fetchedVideos = resData.items;
        } else {
          fetchedVideos = [resData];
        }

        setVideos(fetchedVideos);
      } catch (err: any) {
        console.error("Fetch error:", err);
        setError(err.message || "An error occurred");
        if (err.message.includes("API key")) {
          setShowSettings(true);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchVideos();
  }, [apiKey, activeProvider]);

  const handleSaveKey = (newKey: string) => {
    const trimmedKey = newKey.trim();
    localStorage.setItem("fypmini_key", trimmedKey);
    setApiKey(trimmedKey);
    setShowSettings(false);
  };

  const renderVideoGrid = (videoList: any[]) => (
    <div className="grid grid-cols-2 gap-3 p-3">
      {videoList.map((video, idx) => (
        <button 
          key={`${video.id || "video"}-${idx}`} 
          onClick={() => handleOpenSeries(video)}
          className="aspect-[3/4] relative bg-zinc-900 overflow-hidden rounded-xl shadow-lg ring-1 ring-white/10 group focus:outline-none focus:ring-2 focus:ring-gold-500 transition-all duration-300 hover:-translate-y-1 hover:shadow-gold-500/20"
        >
          <img 
            src={video.cover || video.thumbnail || video.cover_url || video.shortPlayCover || video.poster || video.image || `https://api.dicebear.com/7.x/shapes/svg?seed=${video.id}`} 
            alt={video.title || video.shortPlayName || video.name || "Video Cover"} 
            referrerPolicy="no-referrer"
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 flex flex-col justify-end p-2.5 text-left">
            <h3 className="text-white font-semibold text-[13px] leading-tight line-clamp-2 mb-1.5 drop-shadow-md">
              {video.title || video.shortPlayName || video.name || video.chapter_name || "Untitled Series"}
            </h3>
            <div className="flex items-center gap-1.5 text-[11px] font-medium">
               <div className="flex items-center gap-1 text-gold-400 bg-gold-400/20 px-1.5 py-0.5 rounded-md backdrop-blur-md border border-gold-500/20">
                 <PlaySquare className="w-3 h-3" />
                 <span>{video.episode ? `${video.episode} Eps` : 'Play'}</span>
               </div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );

  return (
    <div className="w-full h-[100dvh] bg-zinc-950 overflow-hidden flex justify-center font-sans text-zinc-50 selection:bg-gold-500/30">
      <div className="w-full max-w-[420px] h-full relative bg-black shadow-2xl ring-1 ring-zinc-900 flex flex-col">
        {openedSeries ? (
          <EpisodeViewer 
            seriesId={openedSeries.id} 
            seriesTitle={openedSeries.title} 
            provider={activeProvider}
            apiKey={apiKey!} 
            onClose={() => setOpenedSeries(null)} 
          />
        ) : (
          <>
            {/* Top Navigation Bar */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-gradient-to-r from-gold-600 via-gold-500 to-gold-600 shadow-md border-b border-gold-400/50 shrink-0 z-20">
              <div className="flex items-center gap-2">
                 <div className="w-5 h-5 rounded-sm flex items-center justify-center bg-black shrink-0 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />
                    <Clapperboard className="w-3 h-3 text-gold-500" />
                 </div>
                <h1 className="text-[16px] font-extrabold text-black tracking-widest leading-none drop-shadow-sm">FYPMINI</h1>
              </div>
              <button 
                onClick={() => setShowVipModal(true)} 
                className="px-2.5 py-1 bg-black text-gold-400 hover:text-gold-300 text-[10px] font-bold rounded shadow-sm border border-gold-500/50 uppercase tracking-wider transition-colors"
              >
                VIP
              </button>
            </div>

            {/* Provider List (Horizontal Scroll) */}
            <div className="w-full flex items-center overflow-x-auto no-scrollbar gap-2.5 px-2 py-1.5 bg-zinc-950 border-b border-zinc-900 shrink-0 z-10">
               {PROVIDERS.map((provider) => {
                 const isActive = activeProvider === provider.id;
                 return (
                   <button 
                     key={provider.id}
                     onClick={() => setActiveProvider(provider.id)}
                     className={`flex flex-col items-center gap-0.5 shrink-0 group transition-all`}
                   >
                     <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isActive ? 'ring-2 ring-gold-500 ring-offset-1 ring-offset-zinc-950 scale-105' : 'ring-1 ring-zinc-800 hover:ring-zinc-600'}`}>
                        <img 
                          src={`https://api.dicebear.com/7.x/initials/svg?seed=${provider.name}&backgroundColor=${provider.color}&textColor=ffffff`} 
                          alt={provider.name}
                          className="w-full h-full rounded-full object-cover p-0.5"
                        />
                     </div>
                     <span className={`text-[8.5px] font-medium transition-colors ${isActive ? 'text-gold-500' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
                       {provider.name}
                     </span>
                   </button>
                 )
               })}
            </div>

            {/* List Array Area */}
            <div className="w-full flex-1 overflow-y-scroll no-scrollbar relative bg-zinc-950 pb-16">
               {activeTab === 'home' && (
                  <div className="flex flex-col flex-1 h-full">
                  {loading ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-950">
                      <Loader2 className="w-8 h-8 animate-spin text-gold-500 mb-4" />
                      <p className="text-zinc-400 font-medium text-sm">Loading feed...</p>
                    </div>
                  ) : error && videos.length === 0 ? (
                    <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-zinc-950">
                      <div className="w-16 h-16 bg-red-500/10 text-red-400 rounded-full flex items-center justify-center mb-4">
                        <Settings className="w-8 h-8" />
                      </div>
                      <p className="text-zinc-300 font-medium mb-2">{error}</p>
                      <button 
                        onClick={() => setShowSettings(true)}
                        className="px-6 py-2 bg-gold-500 text-black font-semibold rounded-full hover:bg-gold-400 transition-colors mt-4 text-sm"
                      >
                        Update API Key
                      </button>
                    </div>
                  ) : videos.length > 0 ? (
                     renderVideoGrid(videos)
                  ) : (
                    <div className="w-full h-full min-h-[50vh] flex flex-col items-center justify-center bg-zinc-950">
                      <p className="text-zinc-500 text-sm">No videos available.</p>
                    </div>
                  )}
                  </div>
               )}

               {/* Search Tab */}
               {activeTab === 'search' && (
                 <div className="w-full min-h-full flex flex-col pt-4">
                    <div className="px-4 mb-4">
                      <input 
                        type="text" 
                        placeholder="Search video titles..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 outline-none focus:border-gold-500/50 transition-colors"
                      />
                    </div>
                    {searchQuery.trim() === "" ? (
                       <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-zinc-500 min-h-[40vh]">
                         <Search className="w-12 h-12 mb-4 opacity-20" />
                         <p>Search for your favorite videos</p>
                       </div>
                    ) : (
                       renderVideoGrid(videos.filter(v => {
                         const title = v.title || v.name || v.chapter_name || "";
                         return title.toLowerCase().includes(searchQuery.toLowerCase());
                       }))
                    )}
                 </div>
               )}

               {/* History Tab */}
               {activeTab === 'history' && (
                 <div className="w-full min-h-full flex flex-col pt-4">
                    <div className="px-4 mb-4 flex items-center justify-between">
                       <h2 className="text-lg font-bold text-white">Watch History</h2>
                       {watchHistory.length > 0 && (
                         <button 
                           onClick={() => setWatchHistory([])}
                           className="text-xs text-zinc-500 hover:text-zinc-300"
                         >
                           Clear All
                         </button>
                       )}
                    </div>
                    {watchHistory.length === 0 ? (
                       <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-zinc-500 min-h-[40vh]">
                         <History className="w-12 h-12 mb-4 opacity-20" />
                         <p>No history yet. Start watching!</p>
                       </div>
                    ) : (
                       renderVideoGrid(watchHistory)
                    )}
                 </div>
               )}

               {activeTab === 'profile' && (
                 <div className="w-full min-h-full p-4 flex flex-col bg-zinc-950">
                    {isAuthChecking ? (
                       <div className="flex-1 flex items-center justify-center">
                         <Loader2 className="w-8 h-8 animate-spin text-gold-500" />
                       </div>
                    ) : !currentUser ? (
                      <div className="flex flex-col items-center justify-center flex-1 min-h-[50vh] text-center">
                        <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mb-6 ring-4 ring-zinc-800">
                          <User className="w-10 h-10 text-zinc-600" />
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">Guest User</h2>
                        <p className="text-zinc-400 text-sm mb-8 px-4">Login to sync your watch history and upgrade your viewing limits.</p>
                        <button 
                          onClick={() => {
                            localStorage.removeItem('fypmini_token');
                            window.location.reload();
                          }}
                          className="flex items-center gap-3 bg-white text-black px-6 py-3 rounded-full font-semibold hover:bg-zinc-200 transition-colors shadow-lg shadow-white/10"
                        >
                          <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                          </svg>
                          Continue with Google
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        <div className="flex items-center gap-4 mb-8 mt-4 bg-zinc-900 border border-zinc-800 p-4 rounded-2xl relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-32 h-32 bg-gold-500/10 blur-3xl rounded-full pointer-events-none" />
                          <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-gold-600 to-gold-400 p-0.5">
                            <div className="w-full h-full bg-zinc-950 rounded-full flex items-center justify-center border-2 border-zinc-950 overflow-hidden">
                               <img src={currentUser?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser?.uid}`} alt="Avatar" className="w-full h-full object-cover rounded-full" />
                            </div>
                          </div>
                          <div className="flex-1">
                            <h2 className="text-xl font-bold text-white mb-0.5 max-w-[150px] truncate">{currentUser?.displayName || "User"}</h2>
                            <p className="text-zinc-400 text-xs font-mono max-w-[150px] truncate">{currentUser?.email || "No email"}</p>
                          </div>
                          <button 
                            onClick={() => {
  localStorage.removeItem('fypmini_token');
  window.location.reload();
}}
                            className="px-3 py-1.5 text-xs font-semibold text-red-400 bg-red-400/10 rounded-lg hover:bg-red-400/20"
                          >
                            Logout
                          </button>
                        </div>

                        <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3 px-1">Account Limits</h3>
                        <div className="grid grid-cols-2 gap-3 mb-8">
                           <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex flex-col items-start">
                             <div className="text-zinc-400 text-xs font-medium mb-1">Daily Views</div>
                             <div className="text-xl font-bold text-white">{userData?.dailyViews || 0} <span className="text-sm text-zinc-500 font-normal">/ {userData?.dailyViewsMax || 42}</span></div>
                             <div className="w-full h-1.5 bg-zinc-800 rounded-full mt-3 overflow-hidden">
                               <div className="h-full bg-gold-500 rounded-full" style={{ width: `${Math.min(100, ((userData?.dailyViews || 0) / (userData?.dailyViewsMax || 1)) * 100)}%` }} />
                             </div>
                           </div>
                           <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex flex-col items-start justify-between">
                             <div className="text-zinc-400 text-xs font-medium mb-1">Account Tier</div>
                             <div className="text-lg font-bold text-gold-400 flex items-center gap-1.5">
                               {(userData?.accountTier || 'free').toUpperCase()}
                             </div>
                             <button onClick={() => setShowVipModal(true)} className="text-xs text-white bg-white/10 hover:bg-white/20 px-2 py-1 rounded w-full mt-2 font-medium transition-colors">
                               Upgrade
                             </button>
                           </div>
                        </div>

                        <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3 px-1">App Settings</h3>
                        <div className="space-y-2">
                           <button 
                             onClick={() => setShowSettings(true)}
                             className="w-full flex items-center justify-between bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 p-4 rounded-xl transition-colors"
                           >
                             <div className="flex items-center gap-3">
                               <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
                                 <Settings className="w-4 h-4 text-gold-500" />
                               </div>
                               <span className="font-medium text-sm text-zinc-200">API Settings</span>
                             </div>
                             <ChevronRight className="w-4 h-4 text-zinc-500" />
                           </button>
                           <button 
                             onClick={() => {
                               localStorage.removeItem('fypmini_history');
                               setWatchHistory([]);
                             }}
                             className="w-full flex items-center justify-between bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 p-4 rounded-xl transition-colors"
                           >
                             <div className="flex items-center gap-3">
                               <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
                                 <History className="w-4 h-4 text-zinc-400" />
                               </div>
                               <span className="font-medium text-sm text-zinc-200">Clear Watch History</span>
                             </div>
                             <ChevronRight className="w-4 h-4 text-zinc-500" />
                           </button>
                        </div>
                      </div>
                    )}
                 </div>
               )}
            </div>

            {/* Bottom Navigation Bar */}
            <div className="absolute bottom-0 left-0 right-0 h-[60px] bg-zinc-950/90 backdrop-blur-lg border-t border-zinc-900 flex items-center justify-around z-20 pb-safe">
              {[
                { id: 'home', icon: Home, label: 'Home' },
                { id: 'search', icon: Search, label: 'Search' },
                { id: 'history', icon: History, label: 'History' },
                { id: 'profile', icon: User, label: 'Profile' },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as TabAction)}
                    className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${
                      isActive ? 'text-white' : 'text-zinc-500 hover:text-zinc-400'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? 'text-gold-500' : ''}`} strokeWidth={isActive ? 2.5 : 2} />
                    <span className={`text-[10px] font-medium ${isActive ? 'text-gold-500' : ''}`}>
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {showSettings && (
        <SettingsModal 
          onClose={() => setShowSettings(false)} 
          onSave={handleSaveKey} 
          currentKey={apiKey || ""}
        />
      )}

      {/* VIP Upgrade Modal */}
      {showVipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-[340px] overflow-hidden shadow-2xl relative">
              <div className="absolute top-0 right-0 w-48 h-48 bg-gold-500/20 blur-3xl rounded-full pointer-events-none" />
              
              <div className="p-6 relative text-center">
                 <div className="w-16 h-16 bg-gradient-to-tr from-gold-600 to-gold-400 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-gold-500/30">
                    <svg className="w-8 h-8 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                 </div>
                 
                 <h2 className="text-2xl font-bold text-white mb-2">Upgrade to VIP</h2>
                 <p className="text-sm text-zinc-400 mb-6 drop-shadow">
                    {appSettings.popupText || "Unlock unlimited viewing completely ad-free. Support creators!"}
                 </p>
                 
                 {appSettings.popupImageUrl && (
                    <div className="w-full h-32 rounded-xl bg-zinc-800 mb-6 overflow-hidden border border-zinc-700/50">
                       <img src={appSettings.popupImageUrl} alt="VIP Banner" className="w-full h-full object-cover" />
                    </div>
                 )}
                 
                 <div className="space-y-3 mb-6 text-left">
                    {['Unlimited Daily Views', 'Ad-free Experience', 'High Quality Streaming'].map((feature, i) => (
                       <div key={i} className="flex items-center gap-3">
                          <div className="w-5 h-5 rounded-full bg-gold-500/20 flex items-center justify-center shrink-0">
                             <svg className="w-3 h-3 text-gold-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                             </svg>
                          </div>
                          <span className="text-sm text-zinc-300 font-medium">{feature}</span>
                       </div>
                    ))}
                 </div>
                 
                 <button 
                   onClick={() => {
                     alert("Payment gateway integration pending!");
                     setShowVipModal(false);
                   }}
                   className="w-full bg-gold-500 text-black font-bold py-3.5 rounded-xl hover:bg-gold-400 transition-colors shadow-lg shadow-gold-500/20 active:scale-95"
                 >
                    Get VIP for Rp {appSettings.vipPrice?.toLocaleString() || 0}
                 </button>
                 <button 
                   onClick={() => setShowVipModal(false)}
                   className="w-full mt-3 text-zinc-500 text-sm font-medium hover:text-zinc-300 transition-colors py-2"
                 >
                    Maybe Later
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}

export function AuthScreen({ onLoginSuccess }: { onLoginSuccess: (user: any, token: string) => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }
      
      onLoginSuccess(data.user, data.token);
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full h-[100dvh] bg-zinc-950 flex items-center justify-center font-sans text-zinc-50">
      <div className="w-full max-w-[420px] h-full relative bg-black shadow-2xl flex flex-col items-center justify-center p-8">
         <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mb-6 ring-4 ring-zinc-800">
           <Clapperboard className="w-10 h-10 text-gold-500" />
         </div>
         <h2 className="text-2xl font-bold text-white mb-2">Welcome to FYPMINI</h2>
         <p className="text-zinc-400 text-sm mb-8 text-center px-4">Watch exclusive short dramas.</p>
         
         <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
           {error && (
             <div className="bg-red-500/10 border border-red-500/50 text-red-500 text-xs p-3 rounded-lg text-center">
               {error}
             </div>
           )}
           <input 
             type="email"
             value={email}
             onChange={(e) => setEmail(e.target.value)}
             placeholder="Email Address"
             required
             className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 outline-none focus:border-gold-500/50 transition-colors"
           />
           <input 
             type="password"
             value={password}
             onChange={(e) => setPassword(e.target.value)}
             placeholder="Password"
             required
             className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 outline-none focus:border-gold-500/50 transition-colors"
           />
           <button 
             type="submit"
             disabled={loading}
             className="w-full mt-2 bg-gold-500 text-black px-6 py-3.5 rounded-full font-bold hover:bg-gold-400 transition-colors shadow-lg shadow-gold-500/20 active:scale-95 disabled:opacity-50 flex justify-center items-center h-12"
           >
             {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isLogin ? 'Log In' : 'Create Account')}
           </button>
         </form>

         <button 
           onClick={() => {
             setIsLogin(!isLogin);
             setError(null);
           }} 
           className="mt-6 text-sm text-zinc-400 hover:text-white transition-colors"
         >
           {isLogin ? "Don't have an account? Sign up" : "Already have an account? Log in"}
         </button>
      </div>
    </div>
  );
}

export default function App() {
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem('fypmini_token');
    if (!token) {
      setIsAuthChecking(false);
      return;
    }

    fetch('/api/user/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => {
      if (data.user) {
        setUser(data.user);
      } else {
        localStorage.removeItem('fypmini_token');
      }
    })
    .catch(() => {
      localStorage.removeItem('fypmini_token');
    })
    .finally(() => {
      setIsAuthChecking(false);
    });
  }, []);

  const handleLoginSuccess = (userObj: any, token: string) => {
    localStorage.setItem('fypmini_token', token);
    setUser(userObj);
  };

  if (isAuthChecking) {
    return (
      <div className="w-full h-[100dvh] bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gold-500" />
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <Routes>
      <Route path="/" element={<MainApp />} />
      <Route path="/admin" element={<Admin />} />
    </Routes>
  );
}
