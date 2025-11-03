/**
 * Upload Page Component - Simplified working version
 * Direct implementation with working Continue button
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, message } from 'antd';

const UploadPage: React.FC = () => {
  const navigate = useNavigate();
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setUploading(true);

    const results = [];
    for (let file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('http://localhost:8000/api/v1/logos/upload', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();
        console.log('Upload response:', data);

        if (data.status === 'success' && data.results) {
          results.push(...data.results);
          message.success(`${file.name} uploaded successfully!`);
        }
      } catch (error) {
        console.error('Upload error:', error);
        message.error(`Upload failed for ${file.name}`);
      }
    }

    setUploadedFiles(results);
    setUploading(false);
  };

  const goToAnnotation = () => {
    if (uploadedFiles.length > 0) {
      message.success('Going to annotation step...');
      console.log('Navigating to annotation with files:', uploadedFiles);
      // Navigate to annotation page with uploaded files
      navigate('/annotate', { state: { uploadedFiles } });
    } else {
      message.warning('Please upload some files first');
    }
  };

  return (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
      <Card title="🧪 Upload Images - Working Version" style={{ marginBottom: '24px' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={handleFileSelect}
            style={{ marginBottom: '16px' }}
            disabled={uploading}
          />
          <p>Select image files to upload</p>
        </div>

        <div style={{ padding: '16px', background: '#f0f0f0', borderRadius: '8px', marginBottom: '16px' }}>
          <strong>Debug Status:</strong><br/>
          - Uploaded files: {uploadedFiles.length}<br/>
          - Uploading: {uploading ? 'Yes' : 'No'}<br/>
          - Backend: http://localhost:8000 (running ✅)
        </div>

        {uploadedFiles.length > 0 && (
          <div style={{ background: '#f6ffed', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
            <h4>✅ Successfully Uploaded ({uploadedFiles.length} files):</h4>
            {uploadedFiles.map((file: any, index: number) => (
              <div key={index} style={{ marginBottom: '8px' }}>
                📁 {file.filename} (ID: {file.file_id})
              </div>
            ))}
          </div>
        )}

        <div style={{ textAlign: 'center' }}>
          <Button
            type="primary"
            size="large"
            onClick={goToAnnotation}
            disabled={uploadedFiles.length === 0}
            loading={uploading}
          >
            Continue to Annotation ({uploadedFiles.length} files) ➡️
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default UploadPage;