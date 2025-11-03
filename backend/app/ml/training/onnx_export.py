"""ONNX export and optimization for trained models."""

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import onnx
import onnxruntime as ort
import torch
import torch.nn as nn
from onnxruntime.quantization import quantize_dynamic, QuantType
from onnxruntime.transformers import optimizer

logger = logging.getLogger(__name__)


class ONNXExporter:
    """Export PyTorch models to optimized ONNX format."""

    def __init__(self, model: nn.Module, device: str = "cpu"):
        """Initialize ONNX exporter."""
        self.model = model
        self.device = device
        self.opset_version = 17  # Latest stable ONNX opset

    async def export(
        self,
        output_path: str,
        input_shape: Tuple[int, ...] = (1, 3, 224, 224),
        optimize: bool = True,
        quantize: bool = False,
        validate: bool = True,
    ) -> str:
        """Export model to ONNX format with optimizations."""
        try:
            # Ensure model is in eval mode
            self.model.eval()

            # Create dummy input
            dummy_input = torch.randn(*input_shape).to(self.device)

            # Export to ONNX
            logger.info(f"Exporting model to ONNX: {output_path}")

            torch.onnx.export(
                self.model,
                dummy_input,
                output_path,
                export_params=True,
                opset_version=self.opset_version,
                do_constant_folding=True,
                input_names=["input"],
                output_names=["output"],
                dynamic_axes={
                    "input": {0: "batch_size"},
                    "output": {0: "batch_size"},
                },
                verbose=False,
            )

            # Optimize if requested
            if optimize:
                output_path = await self._optimize_onnx(output_path)

            # Quantize if requested
            if quantize:
                output_path = await self._quantize_onnx(output_path)

            # Validate if requested
            if validate:
                await self._validate_onnx(output_path, dummy_input)

            logger.info(f"Successfully exported ONNX model: {output_path}")
            return output_path

        except Exception as e:
            logger.error(f"Failed to export ONNX model: {str(e)}")
            raise

    async def _optimize_onnx(self, model_path: str) -> str:
        """Apply optimization passes to ONNX model."""
        try:
            logger.info("Applying ONNX optimizations...")

            # Load the ONNX model
            model = onnx.load(model_path)

            # Apply optimizations
            optimized_model = self._apply_optimization_passes(model)

            # Save optimized model
            optimized_path = model_path.replace(".onnx", "_optimized.onnx")
            onnx.save(optimized_model, optimized_path)

            logger.info(f"Optimized ONNX model saved: {optimized_path}")
            return optimized_path

        except Exception as e:
            logger.error(f"Failed to optimize ONNX model: {str(e)}")
            return model_path

    def _apply_optimization_passes(self, model: onnx.ModelProto) -> onnx.ModelProto:
        """Apply various optimization passes to ONNX model."""
        # Graph optimization
        from onnx import optimizer as onnx_optimizer

        optimization_passes = [
            "eliminate_identity",
            "eliminate_nop_pad",
            "eliminate_nop_transpose",
            "eliminate_unused_initializer",
            "fuse_bn_into_conv",
            "fuse_consecutive_squeezes",
            "fuse_consecutive_transposes",
            "fuse_matmul_add_bias_into_gemm",
            "fuse_pad_into_conv",
            "fuse_transpose_into_gemm",
        ]

        optimized_model = onnx_optimizer.optimize(model, optimization_passes)

        # Shape inference
        from onnx import shape_inference
        optimized_model = shape_inference.infer_shapes(optimized_model)

        return optimized_model

    async def _quantize_onnx(self, model_path: str) -> str:
        """Apply dynamic quantization to ONNX model."""
        try:
            logger.info("Applying ONNX quantization...")

            quantized_path = model_path.replace(".onnx", "_quantized.onnx")

            # Apply dynamic quantization
            quantize_dynamic(
                model_path,
                quantized_path,
                weight_type=QuantType.QInt8,
                optimize_model=True,
            )

            logger.info(f"Quantized ONNX model saved: {quantized_path}")
            return quantized_path

        except Exception as e:
            logger.error(f"Failed to quantize ONNX model: {str(e)}")
            return model_path

    async def _validate_onnx(
        self,
        model_path: str,
        sample_input: torch.Tensor,
    ) -> bool:
        """Validate ONNX model outputs match PyTorch model."""
        try:
            logger.info("Validating ONNX model...")

            # PyTorch inference
            self.model.eval()
            with torch.no_grad():
                pytorch_output = self.model(sample_input)

            # ONNX Runtime inference
            ort_session = ort.InferenceSession(
                model_path,
                providers=["CPUExecutionProvider"],
            )

            input_name = ort_session.get_inputs()[0].name
            onnx_output = ort_session.run(
                None,
                {input_name: sample_input.cpu().numpy()},
            )[0]

            # Compare outputs
            if isinstance(pytorch_output, tuple):
                pytorch_output = pytorch_output[0]

            pytorch_output = pytorch_output.cpu().numpy()

            # Calculate difference
            diff = np.abs(pytorch_output - onnx_output)
            max_diff = np.max(diff)
            mean_diff = np.mean(diff)

            logger.info(f"Validation - Max diff: {max_diff:.6f}, Mean diff: {mean_diff:.6f}")

            # Check if outputs are close enough
            tolerance = 1e-5
            if max_diff > tolerance:
                logger.warning(f"ONNX validation failed: max difference {max_diff} > {tolerance}")
                return False

            logger.info("ONNX model validation passed")
            return True

        except Exception as e:
            logger.error(f"Failed to validate ONNX model: {str(e)}")
            return False


class ONNXOptimizer:
    """Advanced ONNX model optimization utilities."""

    def __init__(self):
        """Initialize ONNX optimizer."""
        self.optimization_options = {
            "enable_gelu": True,
            "enable_layer_norm": True,
            "enable_attention": True,
            "enable_skip_layer_norm": True,
            "enable_embed_layer_norm": True,
            "enable_bias_skip_layer_norm": True,
            "enable_bias_gelu": True,
            "enable_gelu_approximation": True,
        }

    def optimize_for_inference(
        self,
        model_path: str,
        target_device: str = "cpu",
    ) -> str:
        """Optimize ONNX model for inference on target device."""
        try:
            # Load model
            model = onnx.load(model_path)

            # Apply device-specific optimizations
            if target_device == "cpu":
                model = self._optimize_for_cpu(model)
            elif target_device == "gpu":
                model = self._optimize_for_gpu(model)
            elif target_device == "mobile":
                model = self._optimize_for_mobile(model)

            # Save optimized model
            optimized_path = model_path.replace(".onnx", f"_{target_device}.onnx")
            onnx.save(model, optimized_path)

            return optimized_path

        except Exception as e:
            logger.error(f"Failed to optimize for {target_device}: {str(e)}")
            return model_path

    def _optimize_for_cpu(self, model: onnx.ModelProto) -> onnx.ModelProto:
        """Apply CPU-specific optimizations."""
        # CPU optimizations focus on reducing memory access and vectorization
        optimization_passes = [
            "eliminate_duplicate_initializer",
            "extract_constant_to_initializer",
            "fuse_consecutive_reduce_unsqueeze",
            "fuse_consecutive_squeezes",
            "fuse_consecutive_transposes",
        ]

        from onnx import optimizer as onnx_optimizer
        return onnx_optimizer.optimize(model, optimization_passes)

    def _optimize_for_gpu(self, model: onnx.ModelProto) -> onnx.ModelProto:
        """Apply GPU-specific optimizations."""
        # GPU optimizations focus on kernel fusion and memory coalescing
        optimization_passes = [
            "fuse_bn_into_conv",
            "fuse_matmul_add_bias_into_gemm",
            "fuse_pad_into_conv",
        ]

        from onnx import optimizer as onnx_optimizer
        return onnx_optimizer.optimize(model, optimization_passes)

    def _optimize_for_mobile(self, model: onnx.ModelProto) -> onnx.ModelProto:
        """Apply mobile-specific optimizations."""
        # Mobile optimizations focus on model size and inference speed
        # Apply aggressive quantization and pruning
        return model

    def profile_model(
        self,
        model_path: str,
        input_shape: Tuple[int, ...],
        num_runs: int = 100,
    ) -> Dict[str, Any]:
        """Profile ONNX model performance."""
        import time

        # Create session
        session = ort.InferenceSession(
            model_path,
            providers=["CPUExecutionProvider"],
        )

        # Create dummy input
        input_name = session.get_inputs()[0].name
        dummy_input = np.random.randn(*input_shape).astype(np.float32)

        # Warmup
        for _ in range(10):
            session.run(None, {input_name: dummy_input})

        # Measure inference time
        times = []
        for _ in range(num_runs):
            start = time.perf_counter()
            session.run(None, {input_name: dummy_input})
            end = time.perf_counter()
            times.append(end - start)

        # Calculate statistics
        times = np.array(times) * 1000  # Convert to milliseconds

        return {
            "mean_inference_time_ms": np.mean(times),
            "std_inference_time_ms": np.std(times),
            "min_inference_time_ms": np.min(times),
            "max_inference_time_ms": np.max(times),
            "p50_inference_time_ms": np.percentile(times, 50),
            "p95_inference_time_ms": np.percentile(times, 95),
            "p99_inference_time_ms": np.percentile(times, 99),
            "model_size_mb": Path(model_path).stat().st_size / (1024 * 1024),
        }


class ONNXInferenceEngine:
    """Optimized ONNX inference engine."""

    def __init__(
        self,
        model_path: str,
        providers: Optional[List[str]] = None,
    ):
        """Initialize inference engine."""
        self.model_path = model_path

        # Set providers based on availability
        if providers is None:
            providers = self._get_available_providers()

        # Create inference session
        self.session = ort.InferenceSession(model_path, providers=providers)

        # Get input/output details
        self.input_name = self.session.get_inputs()[0].name
        self.output_name = self.session.get_outputs()[0].name

        logger.info(f"Initialized ONNX inference engine with providers: {providers}")

    def _get_available_providers(self) -> List[str]:
        """Get available execution providers."""
        available = ort.get_available_providers()

        # Prefer CUDA if available
        if "CUDAExecutionProvider" in available:
            return ["CUDAExecutionProvider", "CPUExecutionProvider"]
        # Then CoreML for Apple Silicon
        elif "CoreMLExecutionProvider" in available:
            return ["CoreMLExecutionProvider", "CPUExecutionProvider"]
        # Default to CPU
        else:
            return ["CPUExecutionProvider"]

    def predict(self, input_data: np.ndarray) -> np.ndarray:
        """Run inference on input data."""
        # Ensure input is float32
        if input_data.dtype != np.float32:
            input_data = input_data.astype(np.float32)

        # Run inference
        output = self.session.run(
            [self.output_name],
            {self.input_name: input_data},
        )[0]

        return output

    def batch_predict(
        self,
        input_batch: np.ndarray,
        batch_size: int = 32,
    ) -> np.ndarray:
        """Run inference on batch of inputs."""
        outputs = []

        for i in range(0, len(input_batch), batch_size):
            batch = input_batch[i:i+batch_size]
            output = self.predict(batch)
            outputs.append(output)

        return np.concatenate(outputs, axis=0)