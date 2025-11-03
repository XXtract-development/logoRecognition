// API service for training jobs (US-014)
import {
  TrainingJobRequest,
  TrainingJobResponse,
  TrainingJobStatus,
  TrainingSummary,
  DatasetVersion,
} from '../../types/training';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api/v1';

class TrainingJobService {
  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      // Add auth token if available
      ...(localStorage.getItem('authToken') && {
        Authorization: `Bearer ${localStorage.getItem('authToken')}`,
      }),
    };
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || `HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  // Create a new training job
  async createTrainingJob(request: TrainingJobRequest): Promise<TrainingJobResponse> {
    const response = await fetch(`${API_BASE_URL}/training/jobs`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(request),
    });
    return this.handleResponse<TrainingJobResponse>(response);
  }

  // Get list of training jobs
  async getTrainingJobs(
    page = 1,
    limit = 20,
    status?: string
  ): Promise<{ jobs: TrainingJobStatus[]; total: number; page: number }> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      ...(status && { status }),
    });

    const response = await fetch(`${API_BASE_URL}/training/jobs?${params}`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }

  // Get single training job details
  async getTrainingJob(jobId: string): Promise<TrainingJobStatus> {
    const response = await fetch(`${API_BASE_URL}/training/jobs/${jobId}`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse<TrainingJobStatus>(response);
  }

  // Cancel a training job
  async cancelTrainingJob(jobId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/training/jobs/${jobId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to cancel job: ${response.statusText}`);
    }
  }

  // Retry a failed training job
  async retryTrainingJob(jobId: string): Promise<TrainingJobResponse> {
    const response = await fetch(`${API_BASE_URL}/training/jobs/${jobId}/retry`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    return this.handleResponse<TrainingJobResponse>(response);
  }

  // Get training job summary/report
  async getTrainingJobSummary(jobId: string): Promise<TrainingSummary> {
    const response = await fetch(`${API_BASE_URL}/training/jobs/${jobId}/report`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse<TrainingSummary>(response);
  }

  // Download training job logs
  async downloadTrainingLogs(jobId: string): Promise<Blob> {
    const response = await fetch(`${API_BASE_URL}/training/jobs/${jobId}/logs`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to download logs: ${response.statusText}`);
    }

    return response.blob();
  }

  // Get training job artifacts
  async getTrainingArtifacts(jobId: string): Promise<{
    modelPath: string;
    embeddingsPath: string;
    reportPdf: string;
    reportJson: string;
  }> {
    const response = await fetch(`${API_BASE_URL}/training/jobs/${jobId}/artifacts`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }

  // Check if a dataset can be used for training
  async validateDatasetForTraining(datasetVersionId: string): Promise<{
    isValid: boolean;
    errors: string[];
  }> {
    const response = await fetch(
      `${API_BASE_URL}/training/annotations/${datasetVersionId}/validate`,
      {
        headers: this.getHeaders(),
      }
    );
    return this.handleResponse(response);
  }

  // Get dataset version details (from US-013)
  async getDatasetVersion(datasetVersionId: string): Promise<DatasetVersion> {
    const response = await fetch(
      `${API_BASE_URL}/training/annotations/${datasetVersionId}`,
      {
        headers: this.getHeaders(),
      }
    );
    return this.handleResponse<DatasetVersion>(response);
  }

  // Get dataset audit trail (from US-013)
  async getDatasetAuditTrail(
    datasetVersionId: string
  ): Promise<Array<{ timestamp: string; action: string; userId: string; details: any }>> {
    const response = await fetch(
      `${API_BASE_URL}/training/annotations/${datasetVersionId}/audit`,
      {
        headers: this.getHeaders(),
      }
    );
    return this.handleResponse(response);
  }

  // Get available dataset versions
  async getAvailableDatasetVersions(): Promise<DatasetVersion[]> {
    const response = await fetch(`${API_BASE_URL}/training/annotations`, {
      headers: this.getHeaders(),
    });
    const data = await this.handleResponse<DatasetVersion[]>(response);
    // Filter to only show final versions that can be used for training
    return data.filter((version) => version.status === 'final');
  }

  // Export training job report as PDF
  async exportReportPdf(jobId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/training/jobs/${jobId}/report/pdf`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to export PDF: ${response.statusText}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `training-report-${jobId}.pdf`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  // Export training job report as JSON
  async exportReportJson(jobId: string): Promise<void> {
    const summary = await this.getTrainingJobSummary(jobId);
    const dataStr = JSON.stringify(summary, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const a = document.createElement('a');
    a.href = dataUri;
    a.download = `training-report-${jobId}.json`;
    a.click();
  }
}

// Export singleton instance
const trainingJobService = new TrainingJobService();
export default trainingJobService;