"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Car, TrendingUp, Maximize2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// Use relative URL so Next.js rewrites proxy to backend
const VEHICLE_COUNTING_API = "/api/vehicle-counting";

interface VehicleCountingProps {
  initialPosition?: { x: number; y: number };
  initialSize?: { width: number; height: number };
  disableInternalPositioning?: boolean;
}

interface ChartDataPoint {
  date: string;
  C01: number;
  C02: number;
  C03: number;
  C04: number;
  C05: number;
  C06: number;
}

interface Camera {
  id: string;
  name: string;
  code: string;
}

// Chart colors for each camera
const CAMERA_COLORS: Record<string, string> = {
  C01: "#ef4444", // Red
  C02: "#3b82f6", // Blue
  C03: "#22c55e", // Green
  C04: "#f59e0b", // Amber
  C05: "#8b5cf6", // Purple
  C06: "#ec4899", // Pink
};

// Camera names for legend
const CAMERA_NAMES: Record<string, string> = {
  C01: "APEC Bomba",
  C02: "Hospital Cyberjaya",
  C03: "Persiaran Semarak Api",
  C04: "Radius Cyberjaya",
  C05: "Setia Eco Glades",
  C06: "Station MRT Cyberjaya",
};

export default function VehicleCounting({
  initialPosition,
  initialSize = { width: 600, height: 500 },
  disableInternalPositioning = false,
}: VehicleCountingProps) {
  const [position, setPosition] = useState(initialPosition || { x: 100, y: 200 });
  const [size, setSize] = useState(initialSize);
  const [isMounted, setIsMounted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const cardRef = useRef<HTMLDivElement>(null);

  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const MIN_WIDTH = 400;
  const MAX_WIDTH = 1200;
  const MIN_HEIGHT = 350;
  const MAX_HEIGHT = 900;

  useEffect(() => {
    setIsMounted(true);
    if (!initialPosition && typeof window !== "undefined") {
      setPosition({ x: window.innerWidth - 650, y: 200 });
    }
  }, [initialPosition]);

  // When inside DraggableWidget, sync size from parent so content scales with box
  useEffect(() => {
    if (disableInternalPositioning && initialSize && (initialSize.width !== size.width || initialSize.height !== size.height)) {
      setSize(initialSize);
    }
  }, [disableInternalPositioning, initialSize?.width, initialSize?.height]);

  // Fetch vehicle counting data (only show loading on first load)
  const fetchData = useCallback(async (showLoading = true) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    try {
      if (showLoading) setIsLoading(true);
      setError(null);

      const response = await fetch(`${VEHICLE_COUNTING_API}/last-7-days`, { signal });

      let data: { success?: boolean; data?: { chartData?: unknown[]; cameras?: Camera[] }; message?: string } = {};
      try {
        const text = await response.text();
        if (text) data = JSON.parse(text);
      } catch {
        throw new Error("Invalid response from server");
      }

      if (!response.ok) {
        const msg = data?.message || (data as { error?: string })?.error || `Failed to fetch (${response.status})`;
        throw new Error(msg);
      }

      const payload = data?.data;
      const raw = Array.isArray(payload?.chartData) ? payload.chartData : [];
      const cams = Array.isArray(payload?.cameras) ? payload.cameras : [];
      const camerasToUse = cams.length ? cams : Object.entries(CAMERA_NAMES).map(([id, name]) => ({ id, name, code: id }));

      const chart: ChartDataPoint[] = raw.map((day: unknown) => {
        const d = day as Record<string, unknown>;
        return {
          date: String(d.date ?? ""),
          C01: Number(d.C01 ?? 0),
          C02: Number(d.C02 ?? 0),
          C03: Number(d.C03 ?? 0),
          C04: Number(d.C04 ?? 0),
          C05: Number(d.C05 ?? 0),
          C06: Number(d.C06 ?? 0),
        };
      });
      setChartData(chart);
      setCameras(camerasToUse);
      const total = chart.reduce((sum: number, day: ChartDataPoint) => {
        return sum + day.C01 + day.C02 + day.C03 + day.C04 + day.C05 + day.C06;
      }, 0);
      setTotalCount(total);
    } catch (err: any) {
      if (err.name === "AbortError") return;
      console.error("Error fetching vehicle counting data:", err);
      setError(err.message || "Failed to load vehicle counting data");
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(true);
    const interval = setInterval(() => fetchData(false), 5 * 60 * 1000);
    return () => {
      clearInterval(interval);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchData]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disableInternalPositioning) return;

    if (e.target instanceof HTMLElement && !e.target.closest("[data-drag-handle]")) {
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
    if (disableInternalPositioning) return;

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

  const handleResizeStart = (e: React.MouseEvent) => {
    if (disableInternalPositioning) return;
    
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

  // Format date for display (full format)
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  // Format date for X-axis (compact format showing month/day)
  const formatDateForAxis = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const getName = (key: string) => cameras.find((c) => c.id === key)?.name ?? CAMERA_NAMES[key] ?? key;
      return (
        <div className="bg-black/90 backdrop-blur-sm border border-white/20 rounded-lg p-3 shadow-lg">
          <p className="text-white font-semibold mb-2">{formatDate(label)}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-white/70 truncate">{getName(entry.dataKey)}:</span>
              <span className="text-white font-medium">{entry.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const REF_WIDTH = 600;
  const REF_HEIGHT = 500;
  const scaleX = size.width / REF_WIDTH;
  const scaleY = size.height / REF_HEIGHT;
  const isCompact = size.width < 500;

  return (
    <div
      ref={cardRef}
      className={`${disableInternalPositioning ? "relative" : "fixed"} z-[90] select-none overflow-hidden ${
        !disableInternalPositioning && isDragging ? "cursor-grabbing" : ""
      } ${!disableInternalPositioning && isResizing ? "cursor-nwse-resize" : ""}`}
      style={{
        ...(disableInternalPositioning
          ? {}
          : {
              left: `${position.x}px`,
              top: `${position.y}px`,
            }),
        width: `${size.width}px`,
        height: `${size.height}px`,
        userSelect: "none",
      }}
    >
      {/* Scale wrapper: content is laid out at REF size then scaled to box so it always fits */}
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
      <Card className="bg-background/10 backdrop-blur-2xl border border-white/10 shadow-lg h-full w-full flex flex-col overflow-hidden">
        <CardHeader
          data-drag-handle
          className="pb-3 cursor-grab active:cursor-grabbing border-b border-white/10 select-none flex-shrink-0 px-4 pt-4"
          onMouseDown={disableInternalPositioning ? undefined : handleMouseDown}
          style={{ cursor: disableInternalPositioning ? "default" : "grab" }}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-white font-semibold flex items-center gap-2 text-base">
              <Car className="text-cyan-400 h-5 w-5 flex-shrink-0" />
              <span className="truncate">{!isCompact && "Vehicle Counting"}
              {isCompact && "Vehicles"}</span>
            </CardTitle>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-xs">
                Last 7 Days
              </Badge>
              <button
                onClick={() => fetchData()}
                className="p-1 hover:bg-white/10 rounded transition-colors"
                title="Refresh data"
              >
                <RefreshCw className="text-white/70 h-4 w-4" />
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4 flex-1 overflow-hidden flex flex-col min-h-0 px-4 pb-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-2 mb-4 flex-shrink-0">
            <div className="bg-white/5 rounded-lg p-2 text-center min-w-0">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Car className="h-4 w-4 text-cyan-400 flex-shrink-0" />
                <span className="font-bold text-white text-lg">{totalCount.toLocaleString()}</span>
              </div>
              <p className="text-xs text-white/70">Total Vehicles</p>
            </div>
            <div className="bg-white/5 rounded-lg p-2 text-center min-w-0">
              <div className="flex items-center justify-center gap-1 mb-1">
                <TrendingUp className="h-4 w-4 text-green-400 flex-shrink-0" />
                <span className="font-bold text-white text-lg">{Math.round(totalCount / 7).toLocaleString()}</span>
              </div>
              <p className="text-xs text-white/70">Daily Average</p>
            </div>
            <div className="bg-white/5 rounded-lg p-2 text-center min-w-0">
              <div className="flex items-center justify-center gap-1 mb-1">
                <span className="font-bold text-white text-lg">6</span>
              </div>
              <p className="text-xs text-white/70">Cameras</p>
            </div>
          </div>

          {/* Line Chart - fills remaining space */}
          <div className="flex-1 min-h-0 flex flex-col">
            {isLoading ? (
              <div className="flex items-center justify-center flex-1 min-h-[200px]">
                <RefreshCw className="h-8 w-8 text-cyan-400 animate-spin" />
              </div>
            ) : error ? (
              <div className="flex items-center justify-center flex-1 min-h-[200px] text-red-400 text-sm">
                <p>{error}</p>
              </div>
            ) : !chartData.length ? (
              <div className="flex flex-col items-center justify-center flex-1 min-h-[200px] text-white/60 gap-2 text-sm">
                <Car className="h-10 w-10 text-cyan-400/60" />
                <p>No vehicle data for last 7 days</p>
              </div>
            ) : (
              <div className="w-full flex-1 min-h-0" style={{ minHeight: 200 }}>
                <ResponsiveContainer width="100%" height="100%" key={`vehicle-chart-${size.width}-${size.height}`}>
                  <LineChart
                    data={chartData}
                    margin={{ top: 5, right: 10, left: 0, bottom: 50 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis
                      dataKey="date"
                      stroke="rgba(255,255,255,0.5)"
                      fontSize={10}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                      tickFormatter={(value) => formatDateForAxis(value)}
                    />
                    <YAxis stroke="rgba(255,255,255,0.5)" fontSize={10} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: "10px" }}
                      formatter={(value) => (
                        <span style={{ color: "rgba(255,255,255,0.8)" }}>
                          {(cameras.find((c) => c.id === value)?.name ?? CAMERA_NAMES[value]) || value}
                        </span>
                      )}
                    />
                    {Object.keys(CAMERA_COLORS).map((cameraId) => (
                      <Line
                        key={cameraId}
                        type="monotone"
                        dataKey={cameraId}
                        name={cameraId}
                        stroke={CAMERA_COLORS[cameraId]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      </div>

      {/* Resize handle outside scale so it stays grabbable */}
      {!disableInternalPositioning && (
        <div
          className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-center justify-center group z-10"
          onMouseDown={handleResizeStart}
          style={{
            background:
              "linear-gradient(to top left, transparent 0%, transparent 45%, rgba(255,255,255,0.1) 45%, rgba(255,255,255,0.1) 100%)",
          }}
        >
          <Maximize2 className="h-3 w-3 text-white/40 group-hover:text-white/70 transition-colors" />
        </div>
      )}
    </div>
  );
}
