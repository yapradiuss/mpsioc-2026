"use client";

import { useState, useRef, useEffect } from "react";
import { Lightbulb, LightbulbOff, MapPin, Zap, AlertCircle, CheckCircle2, Maximize2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Streetlight {
  id: string;
  name: string;
  location: string;
  status: "online" | "offline" | "maintenance";
  brightness: number;
  lastUpdate: string;
  device_id?: string;
  device_name?: string;
  device_status?: string;
  status_power?: string;
  dim_value?: number;
  latitude?: string;
  longitude?: string;
}

interface StreetlightStatusProps {
  initialPosition?: { x: number; y: number };
  initialSize?: { width: number; height: number };
  disableInternalPositioning?: boolean; // When true, widget is wrapped in DraggableWidget
}

// Helper function to map API status to widget status
// ERP returns status_power as 0 | 1 (number); legacy API may use "ON" | "OFF" (string)
const mapStatus = (deviceStatus?: string, powerStatus?: string | number): "online" | "offline" | "maintenance" => {
  if (deviceStatus === "MAINTENANCE" || deviceStatus === "INACTIVE") {
    return "maintenance";
  }
  const isOn = powerStatus === "ON" || powerStatus === 1 || powerStatus === "1" || deviceStatus === "ACTIVE";
  if (isOn) return "online";
  return "offline";
};

// Helper function to format time ago
const formatTimeAgo = (timestamp: string | Date): string => {
  if (!timestamp) return "N/A";
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
};

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

export default function StreetlightStatus({ 
  initialPosition = { x: 100, y: 200 },
  initialSize = { width: 380, height: 600 },
  disableInternalPositioning = false
}: StreetlightStatusProps) {
  const [position, setPosition] = useState(initialPosition);
  const [size, setSize] = useState(initialSize);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const [streetlights, setStreetlights] = useState<Streetlight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const cacheRef = useRef(new Map<string, { data: Streetlight[]; timestamp: number }>());

  const MIN_WIDTH = 300;
  const MAX_WIDTH = 800;
  const MIN_HEIGHT = 400;
  const MAX_HEIGHT = 800;

  // When inside DraggableWidget, sync size from parent so content scales with box
  useEffect(() => {
    if (disableInternalPositioning && initialSize && (initialSize.width !== size.width || initialSize.height !== size.height)) {
      setSize(initialSize);
    }
  }, [disableInternalPositioning, initialSize?.width, initialSize?.height]);

  // Fetch streetlight data from API
  const fetchStreetlightStatus = async (forceRefresh = false) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const apiUrl = '/api/loranet/streetlight';
      const now = Date.now();
      const cacheKey = 'all_streetlights';
      const cached = cacheRef.current.get(cacheKey);
      
      // Check frontend cache if not forcing refresh
      if (!forceRefresh && cached && (now - cached.timestamp) < CACHE_TTL) {
        console.log('[FRONTEND CACHE HIT] Streetlights');
        setStreetlights(cached.data);
        setIsLoading(false);
        setLastRefresh(new Date(cached.timestamp));
        return;
      }
      
      console.log('[FETCHING] Streetlight data from API');
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch streetlight data: ${response.status} ${response.statusText}`);
      }
      
      const apiData = await response.json();
      
      if (!apiData.success) {
        throw new Error(apiData.message || 'Failed to retrieve streetlight data');
      }
      
      // Map API response to Streetlight interface (ERP: status_power 0|1, dim_value "180"|"180W")
      const mappedStreetlights: Streetlight[] = (apiData.data || []).map((item: any) => {
        const status = mapStatus(item.device_status, item.status_power);
        const rawDim = item.dim_value ?? item.lantern_power;
        const brightnessNum = typeof rawDim === "number" ? rawDim : parseInt(String(rawDim).replace(/\D/g, ""), 10) || (item.status_power === 1 || item.status_power === "ON" ? 100 : 0);
        const location = item.latitude && item.longitude && Number(item.latitude) !== 0 && Number(item.longitude) !== 0
          ? `${parseFloat(item.latitude).toFixed(6)}, ${parseFloat(item.longitude).toFixed(6)}`
          : item.device_name || "Unknown Location";

        return {
          id: item.device_id || item.name || item.id || `SL-${Math.random().toString(36).substr(2, 9)}`,
          name: item.device_name || item.name || "Unknown Streetlight",
          location,
          status,
          brightness: Math.min(100, Math.max(0, brightnessNum)),
          lastUpdate: item.date_updated || item.modified || new Date().toISOString(),
          device_id: item.device_id ?? item.name,
          device_name: item.device_name,
          device_status: item.device_status,
          status_power: item.status_power != null ? String(item.status_power) : undefined,
          dim_value: item.dim_value,
          latitude: item.latitude,
          longitude: item.longitude,
        };
      });
      
      // Store in frontend cache
      cacheRef.current.set(cacheKey, {
        data: mappedStreetlights,
        timestamp: now,
      });
      
      setStreetlights(mappedStreetlights);
      setLastRefresh(new Date());
      console.log(`[SUCCESS] Loaded ${mappedStreetlights.length} streetlights`);
    } catch (err: any) {
      console.error('Error fetching streetlight data:', err);
      setError(err.message || 'Failed to load streetlight data');
      
      // Fallback to cached data if available
      const cached = cacheRef.current.get('all_streetlights');
      if (cached) {
        console.log('[FALLBACK] Using cached streetlight data');
        setStreetlights(cached.data);
        setLastRefresh(new Date(cached.timestamp));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Initial fetch and set up auto-refresh
  useEffect(() => {
    fetchStreetlightStatus();
    
    // Auto-refresh every 15 minutes
    const interval = setInterval(() => {
      fetchStreetlightStatus(true); // Force refresh after 15 minutes
    }, CACHE_TTL);

    return () => clearInterval(interval);
  }, []);

  const onlineCount = streetlights.filter(s => s.status === "online").length;
  const offlineCount = streetlights.filter(s => s.status === "offline").length;
  const maintenanceCount = streetlights.filter(s => s.status === "maintenance").length;

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only allow dragging from the header
    if (e.target instanceof HTMLElement && !e.target.closest('[data-drag-handle]')) {
      return;
    }
    
    if (!cardRef.current) return;
    
    e.preventDefault();
    const rect = cardRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setIsDragging(true);
  };

  useEffect(() => {
    if (disableInternalPositioning) return; // Disable internal drag/resize when wrapped
    
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizing) {
        const deltaX = e.clientX - resizeStart.x;
        const deltaY = e.clientY - resizeStart.y;
        
        const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, resizeStart.width + deltaX));
        const newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, resizeStart.height + deltaY));
        
        setSize({ width: newWidth, height: newHeight });
      } else if (isDragging) {
        const newX = e.clientX - dragOffset.x;
        const newY = e.clientY - dragOffset.y;

        // Constrain to viewport
        const maxX = window.innerWidth - size.width;
        const maxY = window.innerHeight - size.height;

        setPosition({
          x: Math.max(0, Math.min(newX, maxX)),
          y: Math.max(0, Math.min(newY, maxY)),
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, isResizing, dragOffset, resizeStart, size, disableInternalPositioning]);

  const getStatusIcon = (status: Streetlight["status"]) => {
    switch (status) {
      case "online":
        return <Lightbulb className="h-4 w-4 text-green-400" />;
      case "offline":
        return <LightbulbOff className="h-4 w-4 text-red-400" />;
      case "maintenance":
        return <AlertCircle className="h-4 w-4 text-yellow-400" />;
    }
  };

  const getStatusBadge = (status: Streetlight["status"]) => {
    switch (status) {
      case "online":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">Online</Badge>;
      case "offline":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">Offline</Badge>;
      case "maintenance":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">Maintenance</Badge>;
    }
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!cardRef.current) return;
    
    const rect = cardRef.current.getBoundingClientRect();
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: rect.width,
      height: rect.height,
    });
    setIsResizing(true);
  };

  // Determine if card is wide enough for 2-column layout
  const isWide = size.width >= 600;
  const isCompact = size.width < 350;

  const REF_WIDTH = 380;
  const REF_HEIGHT = 600;
  const scaleX = size.width / REF_WIDTH;
  const scaleY = size.height / REF_HEIGHT;

  return (
    <div
      ref={cardRef}
      className={`${disableInternalPositioning ? "relative w-full h-full overflow-hidden" : ""} ${!disableInternalPositioning ? "fixed" : ""} z-[90] select-none ${!disableInternalPositioning && isDragging ? "cursor-grabbing" : ""} ${!disableInternalPositioning && isResizing ? "cursor-nwse-resize" : ""}`}
      style={{
        ...(disableInternalPositioning ? { width: "100%", height: "100%" } : {
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: `${size.width}px`,
          height: "auto",
          minHeight: `${size.height}px`,
        }),
        userSelect: "none",
        WebkitUserSelect: "none",
        MozUserSelect: "none",
        msUserSelect: "none",
      }}
    >
      {disableInternalPositioning ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: REF_WIDTH,
            height: REF_HEIGHT,
            transform: `scale(${scaleX}, ${scaleY})`,
            transformOrigin: "0 0",
          }}
        >
      <Card className="bg-background/10 backdrop-blur-2xl border border-white/10 shadow-lg flex flex-col h-full overflow-hidden">
        <CardHeader 
          data-drag-handle
          className="pb-3 border-b border-white/10 select-none flex-shrink-0"
          onMouseDown={disableInternalPositioning ? undefined : handleMouseDown}
          style={{ cursor: disableInternalPositioning ? "default" : "grab" }}
        >
          <div className="flex items-center justify-between">
            <CardTitle className={`text-white font-semibold flex items-center gap-2 ${isCompact ? "text-sm" : "text-lg"}`}>
              <Zap className={`text-yellow-400 ${isCompact ? "h-4 w-4" : "h-5 w-5"}`} />
              {!isCompact && "Streetlight Status"}
              {isCompact && "Streetlights"}
            </CardTitle>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchStreetlightStatus(true)}
                disabled={isLoading}
                className="p-1 hover:bg-white/10 rounded transition-colors disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw className={`h-4 w-4 text-white/70 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <div className="flex items-center gap-1 text-xs text-white/70">
                <span className={`w-2 h-2 rounded-full ${isLoading ? 'bg-yellow-400' : 'bg-green-400'} ${!isLoading ? 'animate-pulse' : ''}`}></span>
                {isLoading ? 'Loading...' : 'Live'}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4 flex-1 overflow-y-auto max-h-[600px]">
          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-400" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Summary Stats */}
          <div className={`grid gap-2 mb-4 ${isCompact ? "grid-cols-3" : isWide ? "grid-cols-3" : "grid-cols-3"}`}>
            <div className="bg-white/5 rounded-lg p-2 text-center">
              <div className={`flex items-center justify-center gap-1 mb-1 ${isCompact ? "flex-col" : ""}`}>
                <CheckCircle2 className={`text-green-400 ${isCompact ? "h-3 w-3" : "h-4 w-4"}`} />
                <span className={`font-bold text-white ${isCompact ? "text-lg" : "text-2xl"}`}>{onlineCount}</span>
              </div>
              <p className={`text-white/70 ${isCompact ? "text-[10px]" : "text-xs"}`}>Online</p>
            </div>
            <div className="bg-white/5 rounded-lg p-2 text-center">
              <div className={`flex items-center justify-center gap-1 mb-1 ${isCompact ? "flex-col" : ""}`}>
                <LightbulbOff className={`text-red-400 ${isCompact ? "h-3 w-3" : "h-4 w-4"}`} />
                <span className={`font-bold text-white ${isCompact ? "text-lg" : "text-2xl"}`}>{offlineCount}</span>
              </div>
              <p className={`text-white/70 ${isCompact ? "text-[10px]" : "text-xs"}`}>Offline</p>
            </div>
            <div className="bg-white/5 rounded-lg p-2 text-center">
              <div className={`flex items-center justify-center gap-1 mb-1 ${isCompact ? "flex-col" : ""}`}>
                <AlertCircle className={`text-yellow-400 ${isCompact ? "h-3 w-3" : "h-4 w-4"}`} />
                <span className={`font-bold text-white ${isCompact ? "text-lg" : "text-2xl"}`}>{maintenanceCount}</span>
              </div>
              <p className={`text-white/70 ${isCompact ? "text-[10px]" : "text-xs"}`}>Maintenance</p>
            </div>
          </div>

          {/* Streetlight List */}
          {isLoading && streetlights.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="flex flex-col items-center gap-2">
                <RefreshCw className="h-6 w-6 text-white/50 animate-spin" />
                <p className="text-sm text-white/70">Loading streetlights...</p>
              </div>
            </div>
          ) : streetlights.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm text-white/70">No streetlight data available</p>
            </div>
          ) : (
            <div className="space-y-2">
              {streetlights.slice(0, isCompact ? 5 : isWide ? 20 : 10).map((streetlight) => (
                <div
                  key={streetlight.id}
                  className="bg-white/5 rounded-lg p-3 hover:bg-white/10 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      {getStatusIcon(streetlight.status)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className={`font-medium text-white truncate ${isCompact ? "text-xs" : "text-sm"}`}>
                            {streetlight.name}
                          </p>
                          {getStatusBadge(streetlight.status)}
                        </div>
                        <div className="flex items-center gap-2 text-white/60">
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          <p className={`text-white/60 truncate ${isCompact ? "text-[10px]" : "text-xs"}`}>
                            {streetlight.location}
                          </p>
                        </div>
                        <div className="flex items-center gap-4 mt-2">
                          <div className="flex items-center gap-1">
                            <Zap className="h-3 w-3 text-yellow-400" />
                            <p className={`text-white/70 ${isCompact ? "text-[10px]" : "text-xs"}`}>
                              {streetlight.brightness}%
                            </p>
                          </div>
                          {lastRefresh && (
                            <p className={`text-white/50 ${isCompact ? "text-[10px]" : "text-xs"}`}>
                              {formatTimeAgo(lastRefresh)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {streetlights.length > (isCompact ? 5 : isWide ? 20 : 10) && (
                <p className="text-center text-xs text-white/50 pt-2">
                  Showing {isCompact ? 5 : isWide ? 20 : 10} of {streetlights.length} streetlights
                </p>
              )}
            </div>
          )}
        </CardContent>
        
        {/* Resize Handle */}
        <div
          className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-center justify-center group"
          onMouseDown={handleResizeStart}
          style={{
            background: "linear-gradient(to top left, transparent 0%, transparent 45%, rgba(255,255,255,0.1) 45%, rgba(255,255,255,0.1) 100%)",
          }}
        >
          <Maximize2 className="h-3 w-3 text-white/40 group-hover:text-white/70 transition-colors" />
        </div>
      </Card>
      </div>
      ) : (
      <Card className="bg-background/10 backdrop-blur-2xl border border-white/10 shadow-lg flex flex-col">
        <CardHeader 
          data-drag-handle
          className="pb-3 border-b border-white/10 select-none flex-shrink-0"
          onMouseDown={handleMouseDown}
          style={{ cursor: "grab" }}
        >
          <div className="flex items-center justify-between">
            <CardTitle className={`text-white font-semibold flex items-center gap-2 ${isCompact ? "text-sm" : "text-lg"}`}>
              <Zap className={`text-yellow-400 ${isCompact ? "h-4 w-4" : "h-5 w-5"}`} />
              {!isCompact && "Streetlight Status"}
              {isCompact && "Streetlights"}
            </CardTitle>
            <div className="flex items-center gap-2">
              <button onClick={() => fetchStreetlightStatus(true)} disabled={isLoading} className="p-1 hover:bg-white/10 rounded transition-colors disabled:opacity-50" title="Refresh">
                <RefreshCw className={`h-4 w-4 text-white/70 ${isLoading ? "animate-spin" : ""}`} />
              </button>
              <div className="flex items-center gap-1 text-xs text-white/70">
                <span className={`w-2 h-2 rounded-full ${isLoading ? "bg-yellow-400" : "bg-green-400"} ${!isLoading ? "animate-pulse" : ""}`}></span>
                {isLoading ? "Loading..." : "Live"}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4 flex-1 overflow-y-auto max-h-[600px]">
          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-400" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
          <div className={`grid gap-2 mb-4 ${isCompact ? "grid-cols-3" : "grid-cols-3"}`}>
            <div className="bg-white/5 rounded-lg p-2 text-center"><div className={`flex items-center justify-center gap-1 mb-1 ${isCompact ? "flex-col" : ""}`}><CheckCircle2 className={`text-green-400 ${isCompact ? "h-3 w-3" : "h-4 w-4"}`} /><span className={`font-bold text-white ${isCompact ? "text-lg" : "text-2xl"}`}>{onlineCount}</span></div><p className={`text-white/70 ${isCompact ? "text-[10px]" : "text-xs"}`}>Online</p></div>
            <div className="bg-white/5 rounded-lg p-2 text-center"><div className={`flex items-center justify-center gap-1 mb-1 ${isCompact ? "flex-col" : ""}`}><LightbulbOff className={`text-red-400 ${isCompact ? "h-3 w-3" : "h-4 w-4"}`} /><span className={`font-bold text-white ${isCompact ? "text-lg" : "text-2xl"}`}>{offlineCount}</span></div><p className={`text-white/70 ${isCompact ? "text-[10px]" : "text-xs"}`}>Offline</p></div>
            <div className="bg-white/5 rounded-lg p-2 text-center"><div className={`flex items-center justify-center gap-1 mb-1 ${isCompact ? "flex-col" : ""}`}><AlertCircle className={`text-yellow-400 ${isCompact ? "h-3 w-3" : "h-4 w-4"}`} /><span className={`font-bold text-white ${isCompact ? "text-lg" : "text-2xl"}`}>{maintenanceCount}</span></div><p className={`text-white/70 ${isCompact ? "text-[10px]" : "text-xs"}`}>Maintenance</p></div>
          </div>
          {isLoading && streetlights.length === 0 ? (
            <div className="flex items-center justify-center py-8"><RefreshCw className="h-6 w-6 text-white/50 animate-spin" /><p className="text-sm text-white/70">Loading streetlights...</p></div>
          ) : streetlights.length === 0 ? (
            <div className="flex items-center justify-center py-8"><p className="text-sm text-white/70">No streetlight data available</p></div>
          ) : (
            <div className="space-y-2">
              {streetlights.slice(0, isCompact ? 5 : isWide ? 20 : 10).map((streetlight) => (
                <div key={streetlight.id} className="bg-white/5 rounded-lg p-3 hover:bg-white/10 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      {getStatusIcon(streetlight.status)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className={`font-medium text-white truncate ${isCompact ? "text-xs" : "text-sm"}`}>{streetlight.name}</p>
                          {getStatusBadge(streetlight.status)}
                        </div>
                        <div className="flex items-center gap-2 text-white/60">
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          <p className={`text-white/60 truncate ${isCompact ? "text-[10px]" : "text-xs"}`}>{streetlight.location}</p>
                        </div>
                        <div className="flex items-center gap-4 mt-2">
                          <div className="flex items-center gap-1"><Zap className="h-3 w-3 text-yellow-400" /><p className={`text-white/70 ${isCompact ? "text-[10px]" : "text-xs"}`}>{streetlight.brightness}%</p></div>
                          {lastRefresh && <p className={`text-white/50 ${isCompact ? "text-[10px]" : "text-xs"}`}>{formatTimeAgo(lastRefresh)}</p>}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {streetlights.length > (isCompact ? 5 : isWide ? 20 : 10) && <p className="text-center text-xs text-white/50 pt-2">Showing {isCompact ? 5 : isWide ? 20 : 10} of {streetlights.length} streetlights</p>}
            </div>
          )}
        </CardContent>
        <div className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-center justify-center group" onMouseDown={handleResizeStart} style={{ background: "linear-gradient(to top left, transparent 0%, transparent 45%, rgba(255,255,255,0.1) 45%, rgba(255,255,255,0.1) 100%)" }}>
          <Maximize2 className="h-3 w-3 text-white/40 group-hover:text-white/70 transition-colors" />
        </div>
      </Card>
      )}
    </div>
  );
}

