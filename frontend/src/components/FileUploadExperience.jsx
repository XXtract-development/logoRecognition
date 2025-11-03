import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Progress, Card, List, Tag, Button, message, Spin, Alert, Modal } from 'antd';
import { InboxOutlined, CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined, DeleteOutlined, EyeOutlined, DownloadOutlined } from '@ant-design/icons';
import './FileUploadExperience.css';

const { Dragger } = Upload;

export const FileUploadExperience = ({ onUploadComplete, maxFiles = 10, maxFileSize = 10 * 1024 * 1024 }) => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [failedFiles, setFailedFiles] = useState([]);
  const [duplicates, setDuplicates] = useState([]);
  const [fileList, setFileList] = useState([]);
  const [jobId, setJobId] = useState(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewImage, setPreviewImage] = useState('');
  const [virusScanResults, setVirusScanResults] = useState([]);
  const ws = useRef(null);
  const progressInterval = useRef(null);

  // WebSocket connection for real-time updates
  const connectWebSocket = useCallback(() => {
    // WebSocket disabled until backend support is available
    // Silent mode - no console messages
    return;

    /* Disabled WebSocket code - will be re-enabled when backend supports it
    if (ws.current) return;

    try {
      const wsUrl = `${process.env.REACT_APP_WS_URL || 'ws://localhost:8000'}/ws/upload`;
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log('WebSocket connected');
      };

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        message.error('Connection error. Some updates may be delayed.');
      };

      ws.current.onclose = () => {
        console.log('WebSocket disconnected');
        ws.current = null;
        // Reconnection disabled
        // setTimeout(connectWebSocket, 3000);
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
    }
    */
  }, []);

  useEffect(() => {
    // WebSocket disabled - using polling instead
    // connectWebSocket();
    return () => {
      if (ws.current) {
        ws.current.close();
      }
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
  }, [connectWebSocket]);

  const handleWebSocketMessage = (data) => {
    switch (data.type) {
      case 'progress':
        setUploadProgress(prev => ({
          ...prev,
          [data.file_id]: data.progress
        }));
        break;
      case 'file_complete':
        if (data.success) {
          setUploadedFiles(prev => [...prev, data.result]);
        } else {
          setFailedFiles(prev => [...prev, data.result]);
        }
        break;
      case 'job_complete':
        handleUploadComplete(data);
        break;
      case 'virus_scan':
        setVirusScanResults(prev => [...prev, data.result]);
        if (!data.result.is_safe) {
          message.warning(`Virus detected in ${data.result.filename}: ${data.result.threats_found.join(', ')}`);
        }
        break;
      case 'duplicate_found':
        setDuplicates(prev => [...prev, data.duplicate]);
        break;
      default:
        console.log('Unknown WebSocket message type:', data.type);
    }
  };

  // Validate files before upload
  const validateFile = (file) => {
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];

    if (!validTypes.includes(file.type)) {
      message.error(`${file.name} is not a valid image type`);
      return false;
    }

    if (file.size > maxFileSize) {
      message.error(`${file.name} exceeds ${maxFileSize / (1024 * 1024)}MB size limit`);
      return false;
    }

    return true;
  };

  // Check for duplicates using perceptual hashing
  const checkDuplicates = async (files) => {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));

    try {
      const response = await fetch('/api/upload/check-duplicates', {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.duplicates && data.duplicates.length > 0) {
        setDuplicates(data.duplicates);
        return data.duplicates;
      }
      return [];
    } catch (error) {
      console.error('Duplicate check failed:', error);
      message.warning('Could not check for duplicates');
      return [];
    }
  };

  // Virus scan files before upload
  const scanFiles = async (files) => {
    const scanResults = [];

    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/security/virus-scan', {
          method: 'POST',
          body: formData,
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });

        if (response.ok) {
          const result = await response.json();
          scanResults.push(result);

          if (!result.is_safe) {
            message.error(`Virus detected in ${file.name}: ${result.threats_found.join(', ')}`);
          }
        }
      } catch (error) {
        console.error(`Virus scan failed for ${file.name}:`, error);
      }
    }

    setVirusScanResults(scanResults);
    return scanResults;
  };

  // Handle batch upload
  const handleBatchUpload = async (files) => {
    setUploading(true);
    setUploadProgress({});
    setUploadedFiles([]);
    setFailedFiles([]);
    setDuplicates([]);
    setVirusScanResults([]);

    // Validate all files
    const validFiles = files.filter(file => validateFile(file));

    if (validFiles.length === 0) {
      setUploading(false);
      return;
    }

    try {
      // Check for duplicates
      message.info('Checking for duplicates...');
      const duplicateFiles = await checkDuplicates(validFiles);
      const nonDuplicateFiles = validFiles.filter(
        file => !duplicateFiles.some(dup => dup.filename === file.name)
      );

      if (nonDuplicateFiles.length === 0) {
        message.warning('All files are duplicates');
        setUploading(false);
        return;
      }

      // Virus scan
      message.info('Scanning files for viruses...');
      const scanResults = await scanFiles(nonDuplicateFiles);
      const safeFiles = nonDuplicateFiles.filter((file, index) => {
        const scanResult = scanResults[index];
        return !scanResult || scanResult.is_safe;
      });

      if (safeFiles.length === 0) {
        message.error('All files failed virus scan');
        setUploading(false);
        return;
      }

      if (safeFiles.length < nonDuplicateFiles.length) {
        message.warning(`${nonDuplicateFiles.length - safeFiles.length} files removed due to security issues`);
      }

      // Create batch job
      const formData = new FormData();
      safeFiles.forEach(file => {
        formData.append('files', file);
      });

      const response = await fetch('/api/upload/batch', {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setJobId(data.job_id);
      message.success(`Batch upload started. Job ID: ${data.job_id}`);

      // Start progress polling as backup
      startProgressPolling(data.job_id);

    } catch (error) {
      console.error('Upload error:', error);
      message.error(`Upload failed: ${error.message}`);
      setUploading(false);
    }
  };

  // Progress polling (backup for WebSocket)
  const startProgressPolling = (jobId) => {
    progressInterval.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/upload/job/${jobId}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.status === 'completed') {
          clearInterval(progressInterval.current);
          handleUploadComplete(data);
        } else if (data.status === 'failed') {
          clearInterval(progressInterval.current);
          message.error('Upload job failed');
          setUploading(false);
        }

        // Update overall progress
        const progress = data.total_files > 0 ? (data.processed_files / data.total_files) * 100 : 0;
        setUploadProgress(prev => ({
          ...prev,
          overall: progress
        }));

      } catch (error) {
        console.error('Progress check failed:', error);
      }
    }, 2000);
  };

  // Handle upload completion
  const handleUploadComplete = (data) => {
    setUploading(false);
    clearInterval(progressInterval.current);

    // Separate successful and failed files
    const successful = data.results?.filter(r => r.status === 'success') || [];
    const failed = data.results?.filter(r => r.status === 'failed') || [];

    setUploadedFiles(prev => [...prev, ...successful]);
    setFailedFiles(prev => [...prev, ...failed]);

    if (successful.length > 0) {
      message.success(`Successfully uploaded ${successful.length} files`);
    }

    if (failed.length > 0) {
      message.error(`Failed to upload ${failed.length} files`);
    }

    // Callback to parent
    if (onUploadComplete) {
      onUploadComplete(data);
    }

    // Reset progress after delay
    setTimeout(() => {
      setUploadProgress({});
    }, 3000);
  };

  // Preview image
  const handlePreview = async (file) => {
    if (!file.url && !file.preview) {
      file.preview = await getBase64(file.originFileObj || file);
    }

    setPreviewImage(file.url || file.preview);
    setPreviewVisible(true);
  };

  // Convert file to base64 for preview
  const getBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  };

  // Remove file from list
  const handleRemove = (file) => {
    const newFileList = fileList.filter(item => item.uid !== file.uid);
    setFileList(newFileList);
  };

  // Export results
  const exportResults = (format) => {
    const data = {
      job_id: jobId,
      uploaded: uploadedFiles,
      failed: failedFiles,
      duplicates: duplicates,
      virus_scan_results: virusScanResults,
      total_files: uploadedFiles.length + failedFiles.length,
      success_rate: uploadedFiles.length / (uploadedFiles.length + failedFiles.length) || 0,
      timestamp: new Date().toISOString()
    };

    if (format === 'json') {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `upload-results-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else if (format === 'csv') {
      const csv = [
        'Filename,Status,Error,Upload Time,File Size,Virus Scan',
        ...uploadedFiles.map(f => `${f.filename},success,,${f.processed_at || ''},${f.file_size || ''},clean`),
        ...failedFiles.map(f => `${f.filename},failed,${f.error || ''},,, `)
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `upload-results-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  // Clear all results
  const clearResults = () => {
    setUploadedFiles([]);
    setFailedFiles([]);
    setDuplicates([]);
    setVirusScanResults([]);
    setFileList([]);
    setJobId(null);
  };

  // Upload props
  const uploadProps = {
    name: 'files',
    multiple: true,
    accept: 'image/*',
    maxCount: maxFiles,
    fileList: fileList,
    beforeUpload: (file, fileList) => {
      setFileList(fileList);
      return false; // Prevent automatic upload
    },
    onChange: ({ fileList: newFileList }) => {
      setFileList(newFileList);

      // Auto-upload when files are added
      if (newFileList.length > 0 && !uploading) {
        const files = newFileList.map(f => f.originFileObj || f).filter(Boolean);
        if (files.length > 0) {
          handleBatchUpload(files);
        }
      }
    },
    onPreview: handlePreview,
    onRemove: handleRemove,
    showUploadList: {
      showPreviewIcon: true,
      showRemoveIcon: !uploading,
      showDownloadIcon: false
    }
  };

  return (
    <div className="file-upload-experience">
      <Card title="Batch File Upload" className="upload-card">
        {!uploading ? (
          <Dragger {...uploadProps}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">Click or drag files to this area to upload</p>
            <p className="ant-upload-hint">
              Support for batch upload up to {maxFiles} images. Maximum file size: {maxFileSize / (1024 * 1024)}MB.
              Files are automatically scanned for viruses and duplicates.
            </p>
          </Dragger>
        ) : (
          <div className="upload-progress">
            <Spin indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />} />
            <h3>Processing Files...</h3>
            <Progress
              percent={Math.round(uploadProgress.overall || 0)}
              status="active"
              strokeColor={{
                '0%': '#108ee9',
                '100%': '#87d068',
              }}
            />
            <p>Job ID: {jobId}</p>
            <p>{Object.keys(uploadProgress).length - 1} files being processed</p>
          </div>
        )}
      </Card>

      {/* Virus Scan Results */}
      {virusScanResults.length > 0 && (
        <Alert
          message="Security Scan Results"
          description={
            <List
              size="small"
              dataSource={virusScanResults.filter(r => !r.is_safe)}
              renderItem={item => (
                <List.Item>
                  <Tag color="error">{item.filename}</Tag>
                  {item.threats_found.join(', ')}
                </List.Item>
              )}
            />
          }
          type={virusScanResults.some(r => !r.is_safe) ? "error" : "success"}
          showIcon
          closable
        />
      )}

      {/* Duplicate Warning */}
      {duplicates.length > 0 && (
        <Alert
          message="Duplicate Files Detected"
          description={
            <List
              size="small"
              dataSource={duplicates}
              renderItem={item => (
                <List.Item>
                  <Tag color="warning">{item.filename}</Tag>
                  matches {item.original_filename} (similarity: {Math.round(item.similarity * 100)}%)
                </List.Item>
              )}
            />
          }
          type="warning"
          showIcon
          closable
        />
      )}

      {/* Upload Results */}
      {(uploadedFiles.length > 0 || failedFiles.length > 0) && (
        <Card
          title="Upload Results"
          className="results-card"
          extra={
            <div>
              <Button
                onClick={() => exportResults('json')}
                size="small"
                style={{ marginRight: 8 }}
                icon={<DownloadOutlined />}
              >
                Export JSON
              </Button>
              <Button
                onClick={() => exportResults('csv')}
                size="small"
                style={{ marginRight: 8 }}
                icon={<DownloadOutlined />}
              >
                Export CSV
              </Button>
              <Button
                onClick={clearResults}
                size="small"
                icon={<DeleteOutlined />}
              >
                Clear
              </Button>
            </div>
          }
        >
          {uploadedFiles.length > 0 && (
            <div className="success-files">
              <h4>
                <CheckCircleOutlined style={{ color: '#52c41a' }} />
                Successful Uploads ({uploadedFiles.length})
              </h4>
              <List
                size="small"
                dataSource={uploadedFiles.slice(0, 10)}
                renderItem={item => (
                  <List.Item>
                    <Tag color="success">{item.filename}</Tag>
                    <span style={{ color: '#666' }}>{item.file_size ? `${(item.file_size / 1024).toFixed(1)}KB` : ''}</span>
                  </List.Item>
                )}
              />
              {uploadedFiles.length > 10 && (
                <p>... and {uploadedFiles.length - 10} more files</p>
              )}
            </div>
          )}

          {failedFiles.length > 0 && (
            <div className="failed-files">
              <h4>
                <CloseCircleOutlined style={{ color: '#f5222d' }} />
                Failed Uploads ({failedFiles.length})
              </h4>
              <List
                size="small"
                dataSource={failedFiles}
                renderItem={item => (
                  <List.Item>
                    <Tag color="error">{item.filename}</Tag>
                    <span style={{ color: '#999' }}>{item.error}</span>
                  </List.Item>
                )}
              />
            </div>
          )}

          {/* Summary Statistics */}
          <div className="upload-stats">
            <h4>Upload Statistics</h4>
            <p>Success Rate: {uploadedFiles.length + failedFiles.length > 0 ?
              Math.round((uploadedFiles.length / (uploadedFiles.length + failedFiles.length)) * 100) : 0}%</p>
            <p>Total Files Processed: {uploadedFiles.length + failedFiles.length}</p>
            <p>Duplicates Found: {duplicates.length}</p>
            <p>Security Issues: {virusScanResults.filter(r => !r.is_safe).length}</p>
          </div>
        </Card>
      )}

      {/* Image Preview Modal */}
      <Modal
        open={previewVisible}
        title="Image Preview"
        footer={null}
        onCancel={() => setPreviewVisible(false)}
      >
        <img alt="preview" style={{ width: '100%' }} src={previewImage} />
      </Modal>
    </div>
  );
};

export default FileUploadExperience;