"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, FileText, Shield, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { logPageView } from "@/lib/audit-logger";
import { API_BASE_URL } from "@/lib/api";

type ActionType = 
  | "CREATE" 
  | "UPDATE" 
  | "DELETE" 
  | "VIEW" 
  | "LOGIN" 
  | "LOGOUT" 
  | "PERMISSION_CHANGE"
  | "SETTINGS_CHANGE";

type ActionCategory = "USER" | "SYSTEM" | "SECURITY" | "DATA";

interface AuditLog {
  id: number;
  timestamp: string;
  user_id?: string;
  user_name?: string;
  user_email?: string;
  action: ActionType;
  category: ActionCategory;
  resource?: string;
  description?: string;
  ip_address?: string;
  user_agent?: string;
  status: "SUCCESS" | "FAILED";
  metadata?: any;
}

interface AuditLogsResponse {
  success: boolean;
  data: AuditLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface AuditStats {
  total: number;
  success: number;
  failed: number;
  security: number;
}

const categoryColors: Record<ActionCategory, string> = {
  USER: "bg-blue-100 text-blue-800",
  SYSTEM: "bg-orange-100 text-orange-800",
  SECURITY: "bg-red-100 text-red-800",
  DATA: "bg-green-100 text-green-800",
};

// Memoized helper functions
const getInitials = (name?: string, email?: string): string => {
  if (name) {
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }
  if (email) {
    return email.substring(0, 2).toUpperCase();
  }
  return '??';
};

const formatTimestamp = (timestamp: string): string => {
  try {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return timestamp;
  }
};

export default function AuditTrailPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<AuditStats>({
    total: 0,
    success: 0,
    failed: 0,
    security: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });

  // Request cancellation
  const abortControllerRef = useRef<AbortController | null>(null);
  const statsAbortControllerRef = useRef<AbortController | null>(null);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Log page view once
  useEffect(() => {
    logPageView('/admin/audit-trail', 'Audit Trail');
  }, []);

  // Fetch audit logs with cancellation support
  const fetchLogs = useCallback(async () => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '50',
      });

      if (debouncedSearchQuery) params.append('search', debouncedSearchQuery);
      if (actionFilter !== 'all') params.append('action', actionFilter);
      if (categoryFilter !== 'all') params.append('category', categoryFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const response = await fetch(`${API_BASE_URL}/api/audit-trail?${params.toString()}`, {
        signal,
      });
      
      // Check if request was aborted
      if (signal.aborted) return;

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        if (signal.aborted) return;
        throw new Error(`Failed to fetch audit logs: ${response.status} ${response.statusText}`);
      }
      
      if (signal.aborted) return;

      if (!response.ok) {
        const errorMessage = data.message || data.error || `Failed to fetch audit logs: ${response.status}`;
        const hint = data.hint ? `\n\nHint: ${data.hint}` : '';
        throw new Error(errorMessage + hint);
      }
      
      if (data.success) {
        setLogs(data.data);
        setPagination(data.pagination);
      } else {
        throw new Error(data.message || 'Failed to fetch audit logs');
      }
    } catch (err: any) {
      // Ignore abort errors
      if (err.name === 'AbortError') return;
      
      setError(err.message || 'Failed to load audit logs');
      setLogs([]);
    } finally {
      if (!signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [currentPage, debouncedSearchQuery, actionFilter, categoryFilter, statusFilter]);

  // Fetch stats with cancellation support
  const fetchStats = useCallback(async () => {
    // Cancel previous request
    if (statsAbortControllerRef.current) {
      statsAbortControllerRef.current.abort();
    }

    statsAbortControllerRef.current = new AbortController();
    const signal = statsAbortControllerRef.current.signal;

    setIsLoadingStats(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/audit-trail/stats`, {
        signal,
      });
      
      if (signal.aborted) return;

      const data = await response.json();
      
      if (signal.aborted) return;

      if (!response.ok) {
        return;
      }
      
      if (data.success) {
        setStats(data.data);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        // Silently fail for stats
      }
    } finally {
      if (!signal.aborted) {
        setIsLoadingStats(false);
      }
    }
  }, []);

  // Fetch data when filters change
  useEffect(() => {
    fetchLogs();
    
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchLogs]);

  // Fetch stats on mount
  useEffect(() => {
    fetchStats();
    
    return () => {
      if (statsAbortControllerRef.current) {
        statsAbortControllerRef.current.abort();
      }
    };
  }, [fetchStats]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery, actionFilter, categoryFilter, statusFilter]);

  // Memoized filtered logs count
  const paginationInfo = useMemo(() => {
    const start = ((pagination.page - 1) * pagination.limit) + 1;
    const end = Math.min(pagination.page * pagination.limit, pagination.total);
    return { start, end, total: pagination.total };
  }, [pagination]);

  // Memoized table rows
  const tableRows = useMemo(() => {
    return logs.map((log) => (
      <TableRow key={log.id}>
        <TableCell className="font-mono text-sm">
          {formatTimestamp(log.timestamp)}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarFallback>
                {getInitials(log.user_name, log.user_email)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="font-medium">
                {log.user_name || 'Unknown User'}
              </div>
              <div className="text-sm text-muted-foreground">
                {log.user_email || 'N/A'}
              </div>
            </div>
          </div>
        </TableCell>
        <TableCell>
          <Badge
            variant="outline"
            className={categoryColors[log.category]}
          >
            {log.category}
          </Badge>
        </TableCell>
        <TableCell className="font-medium">
          {log.resource || 'N/A'}
        </TableCell>
        <TableCell className="max-w-[300px]">
          <div className="truncate" title={log.description}>
            {log.description || 'N/A'}
          </div>
        </TableCell>
        <TableCell className="font-mono text-sm">
          {log.ip_address || 'N/A'}
        </TableCell>
        <TableCell>
          <Badge
            variant={log.status === "SUCCESS" ? "default" : "destructive"}
            className={
              log.status === "SUCCESS"
                ? "bg-green-500"
                : "bg-red-500"
            }
          >
            {log.status}
          </Badge>
        </TableCell>
      </TableRow>
    ));
  }, [logs]);

  // Memoized pagination handlers
  const handlePreviousPage = useCallback(() => {
    setCurrentPage(prev => Math.max(1, prev - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage(prev => Math.min(pagination.totalPages, prev + 1));
  }, [pagination.totalPages]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Audit Trail</h1>
        <p className="text-muted-foreground">
          Track and monitor all system activities and user actions.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Logs</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="text-2xl font-bold">{stats.total}</div>
                <p className="text-xs text-muted-foreground">
                  All audit entries
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Successful</CardTitle>
            <Shield className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="text-2xl font-bold text-green-600">{stats.success}</div>
                <p className="text-xs text-muted-foreground">
                  Successful actions
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <Shield className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
                <p className="text-xs text-muted-foreground">
                  Failed attempts
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Security Events</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="text-2xl font-bold">{stats.security}</div>
                <p className="text-xs text-muted-foreground">
                  Security-related actions
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Audit Logs Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Audit Logs</CardTitle>
              <CardDescription>
                Complete history of all system activities
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search logs..."
                  className="pl-8 w-[250px]"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="CREATE">Create</SelectItem>
                  <SelectItem value="UPDATE">Update</SelectItem>
                  <SelectItem value="DELETE">Delete</SelectItem>
                  <SelectItem value="VIEW">View</SelectItem>
                  <SelectItem value="LOGIN">Login</SelectItem>
                  <SelectItem value="LOGOUT">Logout</SelectItem>
                  <SelectItem value="PERMISSION_CHANGE">Permission Change</SelectItem>
                  <SelectItem value="SETTINGS_CHANGE">Settings Change</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="USER">User</SelectItem>
                  <SelectItem value="SYSTEM">System</SelectItem>
                  <SelectItem value="SECURITY">Security</SelectItem>
                  <SelectItem value="DATA">Data</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="SUCCESS">Success</SelectItem>
                  <SelectItem value="FAILED">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-800">
              {error}
            </div>
          )}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : logs.length > 0 ? (
                  tableRows
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {error ? 'Failed to load audit logs' : 'No audit logs found matching your filters.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          
          {/* Pagination */}
          {!isLoading && logs.length > 0 && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                Showing {paginationInfo.start} to {paginationInfo.end} of {paginationInfo.total} entries
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePreviousPage}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <div className="text-sm text-muted-foreground">
                  Page {pagination.page} of {pagination.totalPages}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={currentPage === pagination.totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
