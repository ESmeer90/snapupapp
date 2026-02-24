import React, { useState, useEffect, useCallback } from 'react';
import {
  triggerDataCleanup, getCleanupHistory, getCronSchedules, toggleCronSchedule,
  timeAgo, type CleanupSummary, type CleanupTaskResult
} from '@/lib/api';
import {
  Loader2, Play, Eye, CheckCircle2, XCircle, Clock, Shield, Trash2,
  Archive, Bell, AlertTriangle, Database, Calendar, ToggleLeft, ToggleRight,
  RefreshCw, ChevronDown, ChevronUp, Timer, Zap
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

const TASK_CONFIG: Record<string, { label: string; icon: React.ReactNode; description: string; color: string }> = {
  purge_delivery_addresses_90d: {
    label: 'Delivery Addresses',
    icon: <Shield className="w-4 h-4" />,
    description: 'POPIA: Delete addresses for completed orders >90 days',
    color: 'text-red-600 bg-red-50',
  },
  purge_cancelled_orders_1yr: {
    label: 'Cancelled Orders',
    icon: <Trash2 className="w-4 h-4" />,
    description: 'Purge cancelled orders older than 1 year + child records',
    color: 'text-amber-600 bg-amber-50',
  },
  purge_read_notifications_30d: {
    label: 'Read Notifications',
    icon: <Bell className="w-4 h-4" />,
    description: 'Clean up read notifications older than 30 days',
    color: 'text-blue-600 bg-blue-50',
  },
  purge_expired_price_alerts_60d: {
    label: 'Expired Price Alerts',
    icon: <AlertTriangle className="w-4 h-4" />,
    description: 'Remove triggered price alerts older than 60 days',
    color: 'text-purple-600 bg-purple-50',
  },
  archive_email_logs_6mo: {
    label: 'Email Logs Archive',
    icon: <Archive className="w-4 h-4" />,
    description: 'Archive email logs >6 months (body stripped for POPIA)',
    color: 'text-indigo-600 bg-indigo-50',
  },
  purge_old_cron_logs_90d: {
    label: 'Old Cron Logs',
    icon: <Database className="w-4 h-4" />,
    description: 'Clean up cron job logs older than 90 days',
    color: 'text-gray-600 bg-gray-50',
  },
};

const AdminMaintenanceTab: React.FC = () => {
  const [running, setRunning] = useState(false);
  const [dryRunning, setDryRunning] = useState(false);
  const [lastResult, setLastResult] = useState<CleanupSummary | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [togglingSchedule, setTogglingSchedule] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const [historyRes, schedulesRes] = await Promise.allSettled([
        getCleanupHistory(),
        getCronSchedules(),
      ]);
      if (historyRes.status === 'fulfilled') setHistory(historyRes.value);
      if (schedulesRes.status === 'fulfilled') setSchedules(schedulesRes.value);
    } catch (err: any) {
      console.error('Failed to load maintenance data:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRun = async (dryRun: boolean) => {
    if (dryRun) setDryRunning(true);
    else setRunning(true);

    try {
      const result = await triggerDataCleanup(dryRun);
      setLastResult(result);
      toast({
        title: dryRun ? 'Dry Run Complete' : 'Cleanup Complete',
        description: `${result.total_deleted} records ${dryRun ? 'would be' : ''} deleted, ${result.total_archived} archived in ${(result.total_duration_ms / 1000).toFixed(1)}s`,
      });
      if (!dryRun) loadData();
    } catch (err: any) {
      toast({ title: 'Cleanup Failed', description: err.message || 'An error occurred', variant: 'destructive' });
    } finally {
      setRunning(false);
      setDryRunning(false);
    }
  };

  const handleToggleSchedule = async (id: string, currentActive: boolean) => {
    setTogglingSchedule(id);
    try {
      await toggleCronSchedule(id, !currentActive);
      setSchedules(prev => prev.map(s => s.id === id ? { ...s, is_active: !currentActive } : s));
      toast({ title: !currentActive ? 'Schedule Activated' : 'Schedule Paused' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setTogglingSchedule(null);
    }
  };

  const renderTaskResult = (task: CleanupTaskResult) => {
    const config = TASK_CONFIG[task.task] || { label: task.task, icon: <Database className="w-4 h-4" />, description: '', color: 'text-gray-600 bg-gray-50' };
    const hasError = !!task.error;
    return (
      <div key={task.task} className={`flex items-center justify-between p-3 rounded-xl border ${hasError ? 'border-red-200 bg-red-50/50' : 'border-gray-100 bg-white'}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${config.color}`}>{config.icon}</div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">{config.label}</p>
            <p className="text-xs text-gray-500 truncate">{config.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {hasError ? (
            <div className="flex items-center gap-1.5">
              <XCircle className="w-4 h-4 text-red-500" />
              <span className="text-xs text-red-600 font-medium max-w-[120px] truncate">{task.error}</span>
            </div>
          ) : (
            <div className="text-right">
              <p className="text-sm font-bold text-gray-900">{task.deleted.toLocaleString()}</p>
              {task.archived !== undefined && task.archived > 0 && (
                <p className="text-[10px] text-indigo-600">+{task.archived} archived</p>
              )}
            </div>
          )}
          <span className="text-[10px] text-gray-400 font-mono">{task.duration_ms}ms</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* POPIA Compliance Banner */}
      <div className="flex items-start gap-3 p-4 bg-gradient-to-r from-red-50 to-amber-50 border border-red-200 rounded-2xl">
        <Shield className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-bold text-red-900">POPIA Data Maintenance</h4>
          <p className="text-xs text-red-700 mt-1">
            Automated cleanup ensures compliance with the Protection of Personal Information Act. 
            Delivery addresses are purged after 90 days, cancelled orders after 1 year, and email logs are archived after 6 months.
            Runs daily at 03:00 UTC or can be triggered manually below.
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => handleRun(true)}
          disabled={dryRunning || running}
          className="flex items-center gap-2 px-5 py-2.5 bg-white border-2 border-blue-200 text-blue-700 font-semibold rounded-xl hover:bg-blue-50 transition-all disabled:opacity-50 text-sm"
        >
          {dryRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
          Dry Run (Preview)
        </button>
        <button
          onClick={() => handleRun(false)}
          disabled={running || dryRunning}
          className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-all disabled:opacity-50 text-sm shadow-lg shadow-red-200"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Run Cleanup Now
        </button>
        <button
          onClick={loadData}
          disabled={historyLoading}
          className="flex items-center gap-2 px-4 py-2.5 text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-all text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${historyLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Last Result */}
      {lastResult && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-bold text-gray-900">
                  {lastResult.dry_run ? 'Dry Run Results' : 'Cleanup Results'}
                </h3>
                {lastResult.dry_run && (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 rounded-full uppercase">Preview Only</span>
                )}
              </div>
              <span className="text-xs text-gray-400">{lastResult.completed_at ? new Date(lastResult.completed_at).toLocaleString('en-ZA') : ''}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="text-center p-3 bg-red-50 rounded-xl">
                <p className="text-2xl font-black text-red-700">{lastResult.total_deleted.toLocaleString()}</p>
                <p className="text-[10px] text-red-600 font-medium uppercase mt-0.5">{lastResult.dry_run ? 'Would Delete' : 'Deleted'}</p>
              </div>
              <div className="text-center p-3 bg-indigo-50 rounded-xl">
                <p className="text-2xl font-black text-indigo-700">{lastResult.total_archived.toLocaleString()}</p>
                <p className="text-[10px] text-indigo-600 font-medium uppercase mt-0.5">{lastResult.dry_run ? 'Would Archive' : 'Archived'}</p>
              </div>
              <div className="text-center p-3 bg-amber-50 rounded-xl">
                <p className="text-2xl font-black text-amber-700">{lastResult.total_errors}</p>
                <p className="text-[10px] text-amber-600 font-medium uppercase mt-0.5">Errors</p>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-xl">
                <p className="text-2xl font-black text-gray-700">{(lastResult.total_duration_ms / 1000).toFixed(1)}s</p>
                <p className="text-[10px] text-gray-600 font-medium uppercase mt-0.5">Duration</p>
              </div>
            </div>
          </div>
          <div className="p-5 space-y-2">
            {lastResult.tasks.map(renderTaskResult)}
          </div>
        </div>
      )}

      {/* Cron Schedules */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-blue-600" />
          <h3 className="text-base font-bold text-gray-900">Cron Schedules</h3>
        </div>
        {schedules.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No cron schedules configured</p>
        ) : (
          <div className="space-y-3">
            {schedules.map(schedule => (
              <div key={schedule.id} className={`flex items-center justify-between p-4 rounded-xl border ${schedule.is_active ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-200 bg-gray-50/50'}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-bold text-gray-900 font-mono">{schedule.function_name}</p>
                    <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full uppercase ${schedule.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'}`}>
                      {schedule.is_active ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">{schedule.description}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] text-gray-400 font-mono flex items-center gap-1">
                      <Timer className="w-3 h-3" /> {schedule.schedule_expression}
                    </span>
                    {schedule.last_manual_run && (
                      <span className="text-[10px] text-gray-400">
                        Last manual: {timeAgo(schedule.last_manual_run)}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleToggleSchedule(schedule.id, schedule.is_active)}
                  disabled={togglingSchedule === schedule.id}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl disabled:opacity-50 transition-all ${
                    schedule.is_active
                      ? 'text-amber-600 bg-amber-50 hover:bg-amber-100'
                      : 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
                  }`}
                >
                  {togglingSchedule === schedule.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : schedule.is_active ? (
                    <ToggleRight className="w-3.5 h-3.5" />
                  ) : (
                    <ToggleLeft className="w-3.5 h-3.5" />
                  )}
                  {schedule.is_active ? 'Pause' : 'Activate'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cleanup History */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-gray-600" />
          <h3 className="text-base font-bold text-gray-900">Cleanup History</h3>
          <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">{history.length}</span>
        </div>
        {historyLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
            <Database className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-gray-900">No cleanup history yet</p>
            <p className="text-xs text-gray-500 mt-1">Run a cleanup to see results here</p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((job) => {
              const isExpanded = expandedJob === job.id;
              const result = job.result || {};
              const statusColor = job.status === 'completed' ? 'bg-emerald-100 text-emerald-700'
                : job.status === 'partial' ? 'bg-amber-100 text-amber-700'
                : job.status === 'running' ? 'bg-blue-100 text-blue-700'
                : job.status === 'failed' ? 'bg-red-100 text-red-700'
                : 'bg-gray-100 text-gray-600';

              return (
                <div key={job.id} className="border border-gray-100 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedJob(isExpanded ? null : job.id)}
                    className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-all text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {job.status === 'completed' ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" /> :
                       job.status === 'running' ? <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" /> :
                       job.status === 'failed' ? <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" /> :
                       <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full uppercase ${statusColor}`}>{job.status}</span>
                          {result.dry_run && <span className="px-1.5 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 rounded-full uppercase">Dry Run</span>}
                          <span className="text-xs text-gray-400">{job.started_at ? timeAgo(job.started_at) : ''}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          {result.total_deleted !== undefined && (
                            <span className="text-xs text-gray-600">
                              <span className="font-bold text-red-600">{result.total_deleted}</span> deleted
                            </span>
                          )}
                          {result.total_archived !== undefined && result.total_archived > 0 && (
                            <span className="text-xs text-gray-600">
                              <span className="font-bold text-indigo-600">{result.total_archived}</span> archived
                            </span>
                          )}
                          {result.total_duration_ms !== undefined && (
                            <span className="text-xs text-gray-400">{(result.total_duration_ms / 1000).toFixed(1)}s</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </button>
                  {isExpanded && result.tasks && (
                    <div className="p-3 pt-0 space-y-1.5">
                      {result.tasks.map((task: CleanupTaskResult) => renderTaskResult(task))}
                      <div className="flex items-center gap-2 pt-2 text-[10px] text-gray-400">
                        <span>Triggered by: {result.triggered_by || 'unknown'}</span>
                        {job.completed_at && <span>Completed: {new Date(job.completed_at).toLocaleString('en-ZA')}</span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminMaintenanceTab;
