"""Load testing for WebSocket infrastructure."""
import asyncio
import time
import statistics
from typing import List
import websockets
import json


class WebSocketLoadTester:
    """Load tester for WebSocket connections."""

    def __init__(self, url: str = "ws://localhost:8000/ws"):
        self.url = url
        self.connections: List[websockets.WebSocketClientProtocol] = []
        self.latencies: List[float] = []
        self.errors = 0

    async def create_connection(self, client_id: str):
        """Create a WebSocket connection."""
        try:
            ws = await websockets.connect(f"{self.url}/{client_id}")
            self.connections.append(ws)
            return ws
        except Exception as e:
            self.errors += 1
            print(f"Connection failed for {client_id}: {e}")
            return None

    async def measure_latency(self, ws):
        """Measure round-trip latency."""
        if not ws:
            return

        start = time.time()
        await ws.send(json.dumps({"type": "ping"}))

        try:
            response = await asyncio.wait_for(ws.recv(), timeout=5.0)
            data = json.loads(response)
            if data.get("type") == "pong":
                latency = time.time() - start
                self.latencies.append(latency)
        except asyncio.TimeoutError:
            self.errors += 1

    async def load_test(self, num_connections: int = 100):
        """Run load test with specified number of connections."""
        print(f"Starting load test with {num_connections} connections...")

        # Create connections
        start_time = time.time()
        tasks = []
        for i in range(num_connections):
            task = self.create_connection(f"client_{i}")
            tasks.append(task)

        connections = await asyncio.gather(*tasks)
        connection_time = time.time() - start_time

        successful_connections = [c for c in connections if c is not None]
        print(f"Created {len(successful_connections)}/{num_connections} connections in {connection_time:.2f}s")

        # Measure latencies
        latency_tasks = []
        for ws in successful_connections[:10]:  # Sample 10 connections
            task = self.measure_latency(ws)
            latency_tasks.append(task)

        await asyncio.gather(*latency_tasks)

        # Calculate statistics
        if self.latencies:
            avg_latency = statistics.mean(self.latencies) * 1000  # Convert to ms
            p95_latency = statistics.quantiles(self.latencies, n=20)[18] * 1000
            max_latency = max(self.latencies) * 1000

            print(f"Latency - Avg: {avg_latency:.2f}ms, P95: {p95_latency:.2f}ms, Max: {max_latency:.2f}ms")

        # Cleanup
        for ws in successful_connections:
            await ws.close()

        return {
            "total_connections": num_connections,
            "successful_connections": len(successful_connections),
            "connection_time": connection_time,
            "avg_latency_ms": avg_latency if self.latencies else None,
            "errors": self.errors
        }


async def run_load_test():
    """Run the load test."""
    tester = WebSocketLoadTester()
    results = await tester.load_test(100)

    # Verify performance requirements
    assert results["successful_connections"] >= 100, "Failed to create 100 connections"
    assert results["connection_time"] < 10, "Connection time exceeds 10 seconds"
    if results["avg_latency_ms"]:
        assert results["avg_latency_ms"] < 500, "Average latency exceeds 500ms"

    print("\n✅ WebSocket load test passed!")
    return results


if __name__ == "__main__":
    asyncio.run(run_load_test())
