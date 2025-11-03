import * as ort from 'onnxruntime-node';

export interface OptimizationConfig {
  graphOptimizationLevel: 'all' | 'basic' | 'extended' | 'disabled';
  executionMode: 'sequential' | 'parallel';
  interOpNumThreads: number;
  intraOpNumThreads: number;
  enableMemoryPattern: boolean;
  enableCpuMemArena: boolean;
  enableProfiling: boolean;
}

export class ONNXOptimizer {
  private session: ort.InferenceSession | null = null;
  private readonly config: OptimizationConfig;
  private warmupCompleted = false;
  private modelCache = new Map<string, Float32Array>();

  constructor(config: Partial<OptimizationConfig> = {}) {
    this.config = {
      graphOptimizationLevel: 'all',
      executionMode: 'parallel',
      interOpNumThreads: 4,
      intraOpNumThreads: 4,
      enableMemoryPattern: true,
      enableCpuMemArena: true,
      enableProfiling: false,
      ...config,
    };
  }

  async loadModel(modelPath: string): Promise<void> {
    const sessionOptions: ort.InferenceSession.SessionOptions = {
      executionProviders: this.getExecutionProviders(),
      graphOptimizationLevel: this.mapOptimizationLevel(),
      executionMode: this.config.executionMode === 'parallel'
        ? ort.InferenceSession.ExecutionMode.PARALLEL
        : ort.InferenceSession.ExecutionMode.SEQUENTIAL,
      interOpNumThreads: this.config.interOpNumThreads,
      intraOpNumThreads: this.config.intraOpNumThreads,
      enableMemoryPattern: this.config.enableMemoryPattern,
      enableCpuMemArena: this.config.enableCpuMemArena,
      enableProfiling: this.config.enableProfiling,
    };

    this.session = await ort.InferenceSession.create(modelPath, sessionOptions);

    // Perform model warmup
    await this.warmupModel();
  }

  private getExecutionProviders(): string[] {
    // Check for available providers
    const providers: string[] = [];

    // Try CUDA first for GPU acceleration
    if (this.isGPUAvailable()) {
      providers.push('cuda');
    }

    // CoreML for Apple Silicon
    if (process.platform === 'darwin') {
      providers.push('coreml');
    }

    // Always include CPU as fallback
    providers.push('cpu');

    return providers;
  }

  private isGPUAvailable(): boolean {
    // Check if CUDA is available
    try {
      const { exec } = require('child_process');
      exec('nvidia-smi', (error: any) => {
        return !error;
      });
      return true;
    } catch {
      return false;
    }
  }

  private mapOptimizationLevel(): ort.InferenceSession.GraphOptimizationLevel {
    switch (this.config.graphOptimizationLevel) {
      case 'disabled':
        return ort.InferenceSession.GraphOptimizationLevel.DISABLED;
      case 'basic':
        return ort.InferenceSession.GraphOptimizationLevel.BASIC;
      case 'extended':
        return ort.InferenceSession.GraphOptimizationLevel.EXTENDED;
      case 'all':
      default:
        return ort.InferenceSession.GraphOptimizationLevel.ALL;
    }
  }

  private async warmupModel(): Promise<void> {
    if (!this.session || this.warmupCompleted) return;

    console.log('Warming up model...');

    // Create dummy input for warmup
    const inputName = this.session.inputNames[0];
    const inputShape = await this.getInputShape();
    const dummyInput = new Float32Array(
      inputShape.reduce((a, b) => a * b, 1)
    );

    // Run inference 5 times for warmup
    for (let i = 0; i < 5; i++) {
      await this.session.run({
        [inputName]: new ort.Tensor('float32', dummyInput, inputShape),
      });
    }

    this.warmupCompleted = true;
    console.log('Model warmup completed');
  }

  private async getInputShape(): Promise<number[]> {
    if (!this.session) throw new Error('Model not loaded');

    // Get input metadata
    const inputName = this.session.inputNames[0];
    const input = this.session.inputMetadata[inputName];

    // Return shape or default
    return input.shape || [1, 3, 640, 640];
  }

  async predict(input: Float32Array, useCache = true): Promise<Float32Array> {
    if (!this.session) {
      throw new Error('Model not loaded');
    }

    // Check cache
    const cacheKey = this.generateCacheKey(input);
    if (useCache && this.modelCache.has(cacheKey)) {
      return this.modelCache.get(cacheKey)!;
    }

    const inputShape = await this.getInputShape();
    const inputTensor = new ort.Tensor('float32', input, inputShape);

    const results = await this.session.run({
      [this.session.inputNames[0]]: inputTensor,
    });

    const output = results[this.session.outputNames[0]];
    const outputData = output.data as Float32Array;

    // Cache result
    if (useCache) {
      this.modelCache.set(cacheKey, outputData);

      // Limit cache size
      if (this.modelCache.size > 100) {
        const firstKey = this.modelCache.keys().next().value;
        this.modelCache.delete(firstKey);
      }
    }

    return outputData;
  }

  private generateCacheKey(input: Float32Array): string {
    // Simple hash for caching
    let hash = 0;
    for (let i = 0; i < Math.min(input.length, 100); i++) {
      hash = ((hash << 5) - hash) + input[i];
      hash = hash & hash;
    }
    return hash.toString();
  }

  async dispose(): Promise<void> {
    if (this.session) {
      await this.session.release();
      this.session = null;
    }
    this.modelCache.clear();
    this.warmupCompleted = false;
  }

  getPerformanceMetrics() {
    return {
      cacheSize: this.modelCache.size,
      warmupCompleted: this.warmupCompleted,
      config: this.config,
    };
  }
}
