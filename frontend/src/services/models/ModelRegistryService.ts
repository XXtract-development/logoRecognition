// API service for model registry (US-015)
import {
  ModelVersion,
  ModelActivation,
  SmokeTestConfiguration,
  SmokeTestRun,
  DetectionResult,
} from '../../types/models';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api/v1';

class ModelRegistryService {
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

  // Get list of all models
  async getModels(): Promise<ModelVersion[]> {
    const response = await fetch(`${API_BASE_URL}/models`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse<ModelVersion[]>(response);
  }

  // Get single model details
  async getModel(modelId: string): Promise<ModelVersion> {
    const response = await fetch(`${API_BASE_URL}/models/${modelId}`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse<ModelVersion>(response);
  }

  // Get current active model
  async getActiveModel(): Promise<ModelVersion | null> {
    const response = await fetch(`${API_BASE_URL}/models/active`, {
      headers: this.getHeaders(),
    });

    if (response.status === 404) {
      return null; // No active model
    }

    return this.handleResponse<ModelVersion>(response);
  }

  // Register a new model from training job
  async registerModelFromTrainingJob(trainingJobId: string): Promise<ModelVersion> {
    const response = await fetch(`${API_BASE_URL}/training/jobs/${trainingJobId}/register`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    return this.handleResponse<ModelVersion>(response);
  }

  // Update model metadata
  async updateModel(
    modelId: string,
    updates: Partial<ModelVersion>
  ): Promise<ModelVersion> {
    const response = await fetch(`${API_BASE_URL}/models/${modelId}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(updates),
    });
    return this.handleResponse<ModelVersion>(response);
  }

  // Deprecate a model
  async deprecateModel(modelId: string, reason: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/models/${modelId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
      body: JSON.stringify({ reason }),
    });

    if (!response.ok) {
      throw new Error(`Failed to deprecate model: ${response.statusText}`);
    }
  }

  // Activate a model
  async activateModel(modelId: string, releaseNotes: string): Promise<ModelActivation> {
    const response = await fetch(`${API_BASE_URL}/models/${modelId}/activate`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ releaseNotes }),
    });
    return this.handleResponse<ModelActivation>(response);
  }

  // Rollback to previous model
  async rollbackModel(modelId: string, reason: string): Promise<ModelActivation> {
    const response = await fetch(`${API_BASE_URL}/models/${modelId}/rollback`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ reason }),
    });
    return this.handleResponse<ModelActivation>(response);
  }

  // Get model activation history
  async getActivationHistory(
    modelId?: string
  ): Promise<ModelActivation[]> {
    const url = modelId
      ? `${API_BASE_URL}/models/${modelId}/activation-history`
      : `${API_BASE_URL}/models/activations`;

    const response = await fetch(url, {
      headers: this.getHeaders(),
    });
    return this.handleResponse<ModelActivation[]>(response);
  }

  // Get smoke test configurations
  async getSmokeTestConfigurations(): Promise<SmokeTestConfiguration[]> {
    const response = await fetch(`${API_BASE_URL}/models/smoke-tests/configurations`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse<SmokeTestConfiguration[]>(response);
  }

  // Run smoke test on a model
  async runSmokeTest(
    modelId: string,
    configurationId?: string
  ): Promise<SmokeTestRun> {
    const response = await fetch(`${API_BASE_URL}/models/${modelId}/smoke-test`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ configurationId }),
    });
    return this.handleResponse<SmokeTestRun>(response);
  }

  // Get smoke test results
  async getSmokeTestResult(
    modelId: string,
    runId: string
  ): Promise<SmokeTestRun> {
    const response = await fetch(
      `${API_BASE_URL}/models/${modelId}/smoke-test/${runId}`,
      {
        headers: this.getHeaders(),
      }
    );
    return this.handleResponse<SmokeTestRun>(response);
  }

  // Download model artifacts
  async downloadModel(modelId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/models/${modelId}/download`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to download model: ${response.statusText}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `model-${modelId}.pkl`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  // Download model embeddings
  async downloadEmbeddings(modelId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/models/${modelId}/embeddings`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to download embeddings: ${response.statusText}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `embeddings-${modelId}.npz`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  // Test recognition with a model
  async testRecognition(
    modelId: string,
    images: File[]
  ): Promise<DetectionResult[]> {
    const formData = new FormData();
    images.forEach((image) => formData.append('images', image));

    const response = await fetch(`${API_BASE_URL}/models/${modelId}/recognize`, {
      method: 'POST',
      headers: {
        // Don't set Content-Type for FormData
        ...(localStorage.getItem('authToken') && {
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
        }),
      },
      body: formData,
    });
    return this.handleResponse<DetectionResult[]>(response);
  }

  // Get model comparison metrics
  async compareModels(
    modelIds: string[]
  ): Promise<Array<{ modelId: string; metrics: ModelVersion['metrics'] }>> {
    const params = new URLSearchParams();
    modelIds.forEach((id) => params.append('modelId', id));

    const response = await fetch(`${API_BASE_URL}/models/compare?${params}`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }

  // Export model registry
  async exportRegistry(format: 'csv' | 'json'): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/models/export?format=${format}`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to export registry: ${response.statusText}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `model-registry.${format}`;
    a.click();
    window.URL.revokeObjectURL(url);
  }
}

// Export singleton instance
const modelRegistryService = new ModelRegistryService();
export default modelRegistryService;