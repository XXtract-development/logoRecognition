import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  LinearProgress,
  IconButton,
  Tooltip,
  Alert,
  AlertTitle,
  Button,
  CircularProgress,
  Tabs,
  Tab,
  Badge,
  Avatar,
  Stack,
} from '@mui/material';
import {
  CheckCircle,
  Warning,
  Error,
  Refresh,
  TrendingUp,
  Assessment,
  FilterList,
  School,
  Speed,
  Visibility,
} from '@mui/icons-material';

interface LogoSufficiency {
  category: string;
  value: string;
  annotations: number;
  confidence: number;
  confidence_level: string;
  is_ready_95: boolean;
  is_ready_99: boolean;
  needed_annotations: number;
}

interface DashboardSummary {
  total_logos: number;
  ready_for_95: number;
  ready_for_99: number;
  insufficient: number;
  total_annotations: number;
}

interface AnnotationSufficiencyDashboardProps {
  onSelectLogo?: (category: string, value: string) => void;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

const AnnotationSufficiencyDashboard: React.FC<AnnotationSufficiencyDashboardProps> = ({
  onSelectLogo,
  autoRefresh = true,
  refreshInterval = 60000, // 1 minute
}) => {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [logos, setLogos] = useState<LogoSufficiency[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState(0);
  const [sortBy, setSortBy] = useState<'confidence' | 'annotations' | 'needed'>('confidence');
  const [filterReady, setFilterReady] = useState<'all' | 'ready' | 'not_ready'>('all');

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/annotation-metrics/batch-sufficiency');

      if (!response.ok) {
        throw new (window as any).Error('Failed to fetch dashboard data');
      }

      const data = await response.json();
      setSummary(data.summary);
      setLogos(data.details);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();

    if (autoRefresh) {
      const interval = setInterval(fetchDashboardData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, []);

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 95) return '#10B981';
    if (confidence >= 85) return '#3B82F6';
    if (confidence >= 70) return '#F59E0B';
    if (confidence >= 50) return '#EF4444';
    return '#991B1B';
  };

  const getConfidenceIcon = (level: string) => {
    if (level === 'excellent' || level === 'very_high') {
      return <CheckCircle sx={{ color: '#10B981', fontSize: 18 }} />;
    }
    if (level === 'high' || level === 'moderate') {
      return <Warning sx={{ color: '#F59E0B', fontSize: 18 }} />;
    }
    return <Error sx={{ color: '#991B1B', fontSize: 18 }} />;
  };

  const filterLogos = (logos: LogoSufficiency[]) => {
    let filtered = [...logos];

    // Apply filter
    if (filterReady === 'ready') {
      filtered = filtered.filter(l => l.is_ready_95);
    } else if (filterReady === 'not_ready') {
      filtered = filtered.filter(l => !l.is_ready_95);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'confidence':
          return a.confidence - b.confidence; // Low to high (show what needs work)
        case 'annotations':
          return b.annotations - a.annotations; // High to low
        case 'needed':
          return b.needed_annotations - a.needed_annotations; // High to low
        default:
          return 0;
      }
    });

    return filtered;
  };

  const getTabLogos = () => {
    switch (selectedTab) {
      case 0: // All
        return filterLogos(logos);
      case 1: // Need Work
        return filterLogos(logos.filter(l => l.confidence < 70));
      case 2: // In Progress
        return filterLogos(logos.filter(l => l.confidence >= 70 && l.confidence < 95));
      case 3: // Ready
        return filterLogos(logos.filter(l => l.is_ready_95));
      default:
        return [];
    }
  };

  if (loading && !summary) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (error && !summary) {
    return (
      <Alert severity="error">
        <AlertTitle>Error Loading Dashboard</AlertTitle>
        {error}
      </Alert>
    );
  }

  return (
    <Box>
      {/* Summary Cards */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" gutterBottom variant="body2">
                    Total Logos
                  </Typography>
                  <Typography variant="h4">
                    {summary?.total_logos || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {summary?.total_annotations || 0} total annotations
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: '#3B82F6', width: 48, height: 48 }}>
                  <Assessment />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" gutterBottom variant="body2">
                    Ready (95%)
                  </Typography>
                  <Typography variant="h4">
                    {summary?.ready_for_95 || 0}
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={((summary?.ready_for_95 || 0) / (summary?.total_logos || 1)) * 100}
                    sx={{
                      mt: 1,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: '#e0e0e0',
                      '& .MuiLinearProgress-bar': {
                        backgroundColor: '#10B981',
                      },
                    }}
                  />
                </Box>
                <Avatar sx={{ bgcolor: '#10B981', width: 48, height: 48 }}>
                  <CheckCircle />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" gutterBottom variant="body2">
                    Optimal (99%)
                  </Typography>
                  <Typography variant="h4">
                    {summary?.ready_for_99 || 0}
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={((summary?.ready_for_99 || 0) / (summary?.total_logos || 1)) * 100}
                    sx={{
                      mt: 1,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: '#e0e0e0',
                      '& .MuiLinearProgress-bar': {
                        backgroundColor: '#059669',
                      },
                    }}
                  />
                </Box>
                <Avatar sx={{ bgcolor: '#059669', width: 48, height: 48 }}>
                  <TrendingUp />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" gutterBottom variant="body2">
                    Need Work
                  </Typography>
                  <Typography variant="h4">
                    {summary?.insufficient || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Below 50% confidence
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: '#EF4444', width: 48, height: 48 }}>
                  <Warning />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs and Filters */}
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Tabs value={selectedTab} onChange={(e, v) => setSelectedTab(v)}>
              <Tab
                label={
                  <Badge badgeContent={logos.length} color="primary">
                    All Logos
                  </Badge>
                }
              />
              <Tab
                label={
                  <Badge badgeContent={logos.filter(l => l.confidence < 70).length} color="error">
                    Need Work
                  </Badge>
                }
              />
              <Tab
                label={
                  <Badge badgeContent={logos.filter(l => l.confidence >= 70 && l.confidence < 95).length} color="warning">
                    In Progress
                  </Badge>
                }
              />
              <Tab
                label={
                  <Badge badgeContent={logos.filter(l => l.is_ready_95).length} color="success">
                    Ready
                  </Badge>
                }
              />
            </Tabs>

            <Box display="flex" gap={1}>
              <Tooltip title="Refresh Data">
                <IconButton onClick={fetchDashboardData} size="small">
                  <Refresh />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          {/* Data Table */}
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Logo</TableCell>
                  <TableCell align="center">Status</TableCell>
                  <TableCell align="right">Confidence</TableCell>
                  <TableCell align="right">Annotations</TableCell>
                  <TableCell align="right">Needed</TableCell>
                  <TableCell align="center">95%</TableCell>
                  <TableCell align="center">99%</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {getTabLogos().map((logo) => (
                  <TableRow
                    key={`${logo.category}-${logo.value}`}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => onSelectLogo?.(logo.category, logo.value)}
                  >
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={1}>
                        {getConfidenceIcon(logo.confidence_level)}
                        <Box>
                          <Typography variant="body2" fontWeight="medium">
                            {logo.value}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {logo.category}
                          </Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={logo.confidence_level}
                        size="small"
                        sx={{
                          backgroundColor: getConfidenceColor(logo.confidence) + '20',
                          color: getConfidenceColor(logo.confidence),
                          fontWeight: 'medium',
                        }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Box display="flex" alignItems="center" justifyContent="flex-end" gap={1}>
                        <LinearProgress
                          variant="determinate"
                          value={logo.confidence}
                          sx={{
                            width: 60,
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: '#e0e0e0',
                            '& .MuiLinearProgress-bar': {
                              backgroundColor: getConfidenceColor(logo.confidence),
                            },
                          }}
                        />
                        <Typography variant="body2" fontWeight="medium">
                          {logo.confidence}%
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">
                        {logo.annotations}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      {logo.needed_annotations > 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          +{logo.needed_annotations}
                        </Typography>
                      ) : (
                        <Typography variant="body2" color="success.main">
                          ✓
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      {logo.is_ready_95 ? (
                        <CheckCircle sx={{ color: '#10B981', fontSize: 20 }} />
                      ) : (
                        <Box sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: '#e0e0e0' }} />
                      )}
                    </TableCell>
                    <TableCell align="center">
                      {logo.is_ready_99 ? (
                        <CheckCircle sx={{ color: '#059669', fontSize: 20 }} />
                      ) : (
                        <Box sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: '#e0e0e0' }} />
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={0.5} justifyContent="center">
                        <Tooltip title="View Details">
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectLogo?.(logo.category, logo.value);
                            }}
                          >
                            <Visibility fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {logo.is_ready_95 && (
                          <Tooltip title="Start Training">
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                // Trigger training
                              }}
                            >
                              <School fontSize="small" color="success" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {getTabLogos().length === 0 && (
            <Box display="flex" justifyContent="center" p={4}>
              <Typography color="text.secondary">
                No logos found in this category
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default AnnotationSufficiencyDashboard;