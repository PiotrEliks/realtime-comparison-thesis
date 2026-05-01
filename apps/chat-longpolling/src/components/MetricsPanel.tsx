import React, { useState, useEffect } from 'react';
import { Download, RefreshCw, BarChart3 } from 'lucide-react';
import { useChat } from '../contexts/ChatContext';

export const MetricsPanel: React.FC = () => {
  const { metrics } = useChat();
  const [metricsData, setMetricsData] = useState(metrics.getMetrics());

  useEffect(() => {
    const interval = setInterval(() => {
      setMetricsData(metrics.getMetrics());
    }, 1000);

    return () => clearInterval(interval);
  }, [metrics]);

  const downloadCSV = () => {
    const csv = metrics.exportToCSV();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-metrics-${new Date().toISOString()}.csv`;
    a.click();
  };

  return (
    <div className="p-4 bg-white border-t border-slate-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-slate-800">Performance Metrics</h3>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => metrics.reset()}
            className="p-2 hover:bg-slate-100 rounded-lg"
            title="Reset metrics"
          >
            <RefreshCw className="w-4 h-4 text-slate-600" />
          </button>
          <button
            onClick={downloadCSV}
            className="p-2 hover:bg-slate-100 rounded-lg"
            title="Download CSV"
          >
            <Download className="w-4 h-4 text-slate-600" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Avg Latency"
          value={`${metricsData.averageLatency.toFixed(0)}ms`}
          color="blue"
        />
        <MetricCard
          label="Uptime"
          value={`${metricsData.connectionUptime.toFixed(1)}%`}
          color="green"
        />
        <MetricCard
          label="Messages Sent"
          value={metricsData.messagesSent.toString()}
          color="purple"
        />
        <MetricCard
          label="Failed"
          value={metricsData.failedMessages.toString()}
          color="red"
        />
      </div>
    </div>
  );
};

const MetricCard: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div className="p-3 bg-slate-50 rounded-lg">
    <p className="text-xs text-slate-500 mb-1">{label}</p>
    <p className={`text-2xl font-bold text-${color}-600`}>{value}</p>
  </div>
);