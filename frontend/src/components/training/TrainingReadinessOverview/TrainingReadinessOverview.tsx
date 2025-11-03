import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Table, Button, Input, Select, Space, Tag, Progress, Alert, Spin, Badge } from 'antd';
import {
  SearchOutlined,
  DownloadOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { debounce } from 'lodash';
import type { ColumnsType } from 'antd/es/table';

import {
  CategoryValueReadiness,
  TrainingReadinessOverviewProps,
  ReadinessFilters,
} from './types';
import {
  calculateReadinessStats,
  exportToCSV,
  downloadCSV,
  filterReadinessItems,
  sortReadinessItems,
  formatReadinessForDisplay,
  getReadyItems,
} from './utils';
import { fetchReadinessData, connectWebSocket, fetchCategories } from './api';
import styles from './TrainingReadinessOverview.module.css';

const { Option } = Select;

const TrainingReadinessOverview: React.FC<TrainingReadinessOverviewProps> = ({
  onTrainSelected,
  onExportCSV,
  minimumSamples = 10,
}) => {
  // State management
  const [items, setItems] = useState<CategoryValueReadiness[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ReadinessFilters>({
    status: 'all',
    category: null,
    searchTerm: '',
  });
  const [sortBy, setSortBy] = useState<'category' | 'value' | 'readiness' | 'needed' | 'updated'>('readiness');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [categories, setCategories] = useState<Array<{ code: string; label: string }>>([]);
  const [wsConnection, setWsConnection] = useState<WebSocket | null>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  // Load data on mount with cleanup
  useEffect(() => {
    let mounted = true;

    // Load data on mount
    const init = async () => {
      if (mounted) {
        try {
          await loadData();
          await loadCategories();
        } catch (error) {
          console.error('[TrainingReadinessOverview] Error in init:', error);
          // Ensure loading state is reset even if init fails
          if (mounted) {
            setIsLoading(false);
          }
        }
      }
    };

    init();

    // Don't setup WebSocket since backend doesn't support it
    // const ws = setupWebSocket();

    return () => {
      mounted = false;
      // Cancel any in-flight requests when component unmounts
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // Force loading to false on unmount
      setIsLoading(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load readiness data with cancellation support
  const loadData = async () => {
    console.log('[TrainingReadinessOverview] Starting loadData...');
    try {
      setIsLoading(true);
      setError(null);

      // Create a new abort controller for this request
      const controller = new AbortController();
      abortControllerRef.current = controller;

      console.log('[TrainingReadinessOverview] Fetching readiness data...');
      const response = await fetchReadinessData({}, controller.signal);
      console.log('[TrainingReadinessOverview] Response received:', response);

      // Always update state if we got a successful response
      setItems(response.data || []);
      setIsLoading(false);
      console.log('[TrainingReadinessOverview] Data loaded successfully, isLoading set to false');
    } catch (err: any) {
      console.error('[TrainingReadinessOverview] Error loading data:', err);
      // Always set loading to false on error, even if aborted
      setIsLoading(false);

      // Only set error state if not aborted
      if (!abortControllerRef.current?.signal.aborted && !err?.message?.includes('abort')) {
        setError(err instanceof Error ? err.message : 'Failed to load readiness data');
        console.log('[TrainingReadinessOverview] Error state set, isLoading set to false');
      } else {
        console.log('[TrainingReadinessOverview] Request was aborted, but still setting isLoading to false');
      }
    }
  };

  // Load categories for filtering
  const loadCategories = async () => {
    try {
      const cats = await fetchCategories();
      setCategories(cats);
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  };

  // Setup WebSocket connection
  const setupWebSocket = () => {
    const ws = connectWebSocket(
      (message) => {
        if (message.type === 'update') {
          setItems((prevItems) => {
            const index = prevItems.findIndex((item) => item.id === message.payload.id);
            if (index >= 0) {
              const newItems = [...prevItems];
              newItems[index] = message.payload;
              return newItems;
            }
            return prevItems;
          });
        } else if (message.type === 'add') {
          setItems((prevItems) => [...prevItems, message.payload]);
        } else if (message.type === 'delete') {
          setItems((prevItems) => prevItems.filter((item) => item.id !== message.payload.id));
        }
      },
      (error) => {
        console.error('WebSocket error:', error);
      }
    );
    setWsConnection(ws);
    return ws;
  };

  // Debounced search
  const debouncedSearch = useMemo(
    () =>
      debounce((value: string) => {
        setFilters((prev) => ({ ...prev, searchTerm: value }));
      }, 300),
    []
  );

  // Filter and sort items
  const processedItems = useMemo(() => {
    const filtered = filterReadinessItems(items, filters);
    return sortReadinessItems(filtered, sortBy, sortDirection);
  }, [items, filters, sortBy, sortDirection]);

  // Calculate statistics
  const stats = useMemo(() => calculateReadinessStats(processedItems), [processedItems]);

  // Get ready items
  const readyItems = useMemo(() => getReadyItems(processedItems), [processedItems]);

  // Handle sort change
  const handleSortChange = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDirection('asc');
    }
  };

  // Handle export
  const handleExport = () => {
    if (onExportCSV) {
      onExportCSV();
    } else {
      const csv = exportToCSV(processedItems);
      downloadCSV(csv);
    }
  };

  // Handle train all ready
  const handleTrainAllReady = () => {
    if (onTrainSelected && readyItems.length > 0) {
      onTrainSelected(readyItems);
    }
  };

  // Get status icon
  const getStatusIcon = (status: CategoryValueReadiness['status']) => {
    switch (status) {
      case 'ready':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'almost_ready':
        return <WarningOutlined style={{ color: '#faad14' }} />;
      case 'needs_work':
        return <CloseCircleOutlined style={{ color: '#f5222d' }} />;
    }
  };

  // Get status tag
  const getStatusTag = (status: CategoryValueReadiness['status']) => {
    switch (status) {
      case 'ready':
        return <Tag color="success">Ready</Tag>;
      case 'almost_ready':
        return <Tag color="warning">Almost Ready</Tag>;
      case 'needs_work':
        return <Tag color="error">Needs Work</Tag>;
    }
  };

  // Table columns
  const columns: ColumnsType<CategoryValueReadiness> = [
    {
      title: 'Category',
      dataIndex: ['category', 'label'],
      key: 'category',
      sorter: true,
      render: (text, record) => (
        <Space>
          <span>{record.category.label}</span>
          <Tag>{record.category.code}</Tag>
        </Space>
      ),
    },
    {
      title: 'Value',
      dataIndex: ['value', 'label'],
      key: 'value',
      sorter: true,
      render: (text, record) => (
        <Space>
          <span>{record.value.label}</span>
          <Tag>{record.value.code}</Tag>
        </Space>
      ),
    },
    {
      title: 'Readiness',
      key: 'readiness',
      sorter: true,
      width: 200,
      render: (_, record) => {
        const formatted = formatReadinessForDisplay(record);
        return (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Progress
              percent={record.readinessPercentage}
              status={record.status === 'ready' ? 'success' : record.status === 'almost_ready' ? 'active' : 'exception'}
              strokeColor={record.status === 'ready' ? '#52c41a' : record.status === 'almost_ready' ? '#faad14' : '#f5222d'}
            />
            <span>{formatted.displayPercentage}</span>
          </Space>
        );
      },
    },
    {
      title: 'Annotations',
      key: 'annotations',
      render: (_, record) => {
        const formatted = formatReadinessForDisplay(record);
        return (
          <Space direction="vertical">
            <span>{formatted.displayCount}</span>
            <span style={{ fontSize: '12px', color: '#666' }}>
              Natural: {record.naturalSamples} | Augmented: {record.augmentedSamples}
            </span>
          </Space>
        );
      },
    },
    {
      title: 'Status',
      key: 'status',
      filters: [
        { text: 'Ready', value: 'ready' },
        { text: 'Almost Ready', value: 'almost_ready' },
        { text: 'Needs Work', value: 'needs_work' },
      ],
      render: (_, record) => (
        <Space>
          {getStatusIcon(record.status)}
          {getStatusTag(record.status)}
        </Space>
      ),
    },
    {
      title: 'Needed',
      key: 'needed',
      sorter: true,
      render: (_, record) => {
        const formatted = formatReadinessForDisplay(record);
        return (
          <Badge
            count={record.annotationsNeeded}
            showZero={false}
            style={{ backgroundColor: record.annotationsNeeded > 0 ? '#f5222d' : '#52c41a' }}
          >
            <span>{formatted.displayNeeded}</span>
          </Badge>
        );
      },
    },
    {
      title: 'Last Updated',
      dataIndex: 'lastUpdated',
      key: 'lastUpdated',
      sorter: true,
      render: (date) => new Date(date).toLocaleDateString(),
    },
  ];

  // Render loading state
  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <Spin size="large" data-testid="loading-spinner" />
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <Alert
        message="Failed to load readiness data"
        description={error}
        type="error"
        action={
          <Button size="small" danger onClick={loadData}>
            Retry
          </Button>
        }
      />
    );
  }

  // Render empty state
  if (!isLoading && items.length === 0) {
    return (
      <div className={styles.container} role="region" aria-label="Training Readiness Overview">
        <Alert
          message="No Training Data Available"
          description="Start adding annotations to your categories and values to begin training models."
          type="info"
          showIcon
        />
      </div>
    );
  }

  return (
    <div className={styles.container} role="region" aria-label="Training Readiness Overview">
      {/* Header with stats */}
      <div className={styles.header}>
        <h2 id="readiness-overview-title">Training Readiness Overview</h2>
        <Space className={styles.stats} role="status" aria-live="polite">
          <Badge count={stats.ready} style={{ backgroundColor: '#52c41a' }}>
            <span>Ready</span>
          </Badge>
          <Badge count={stats.almostReady} style={{ backgroundColor: '#faad14' }}>
            <span>Almost</span>
          </Badge>
          <Badge count={stats.needsWork} style={{ backgroundColor: '#f5222d' }}>
            <span>Needs Work</span>
          </Badge>
          <span>Avg: {stats.avgReadiness}%</span>
        </Space>
      </div>

      {/* Filters and actions */}
      <div className={styles.toolbar}>
        <Space>
          <Input
            placeholder="Search..."
            prefix={<SearchOutlined />}
            onChange={(e) => debouncedSearch(e.target.value)}
            style={{ width: 200 }}
            aria-label="Search category-value combinations"
          />

          <Select
            placeholder="Category"
            allowClear
            onChange={(value) => setFilters((prev) => ({ ...prev, category: value }))}
            style={{ width: 150 }}
            data-testid="category-filter"
            aria-label="Filter by category"
          >
            {categories.map((cat) => (
              <Option key={cat.code} value={cat.code}>
                {cat.label}
              </Option>
            ))}
          </Select>

          <Button
            data-testid="filter-all"
            type={filters.status === 'all' ? 'primary' : 'default'}
            onClick={() => setFilters((prev) => ({ ...prev, status: 'all' }))}
            aria-label="Show all items"
            aria-pressed={filters.status === 'all'}
          >
            All
          </Button>
          <Button
            data-testid="filter-ready"
            type={filters.status === 'ready' ? 'primary' : 'default'}
            onClick={() => setFilters((prev) => ({ ...prev, status: 'ready' }))}
            aria-label="Show ready items only"
            aria-pressed={filters.status === 'ready'}
          >
            Ready
          </Button>
          <Button
            data-testid="filter-almost_ready"
            type={filters.status === 'almost_ready' ? 'primary' : 'default'}
            onClick={() => setFilters((prev) => ({ ...prev, status: 'almost_ready' }))}
            aria-label="Show almost ready items only"
            aria-pressed={filters.status === 'almost_ready'}
          >
            Almost
          </Button>
          <Button
            data-testid="filter-needs_work"
            type={filters.status === 'needs_work' ? 'primary' : 'default'}
            onClick={() => setFilters((prev) => ({ ...prev, status: 'needs_work' }))}
            aria-label="Show items needing work only"
            aria-pressed={filters.status === 'needs_work'}
          >
            Needs Work
          </Button>
        </Space>

        <Space>
          <Button
            type="primary"
            icon={<RocketOutlined />}
            onClick={handleTrainAllReady}
            disabled={readyItems.length === 0}
          >
            Train All Ready ({readyItems.length})
          </Button>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>
            Export to CSV
          </Button>
          <Button icon={<ReloadOutlined />} onClick={loadData} loading={isLoading}>
            Refresh
          </Button>
        </Space>
      </div>

      {/* Table */}
      <Table
        columns={columns}
        dataSource={processedItems}
        rowKey="id"
        loading={isLoading}
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          showTotal: (total) => `Total ${total} items`,
        }}
        onChange={(pagination, filters, sorter) => {
          if (Array.isArray(sorter)) return;
          if (sorter.field) {
            const field = sorter.field as typeof sortBy;
            handleSortChange(field);
          }
        }}
        rowClassName={(record) => `readiness-row-${record.id}`}
        data-testid="readiness-table"
      />
    </div>
  );
};

export default TrainingReadinessOverview;