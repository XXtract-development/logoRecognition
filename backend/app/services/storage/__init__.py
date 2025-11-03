"""Storage services"""

# Create a dummy storage service for backward compatibility
class DummyStorageService:
    """Dummy storage service to prevent import errors"""
    def __init__(self):
        pass

    async def upload_image(self, *args, **kwargs):
        return {"url": "dummy_url", "id": "dummy_id"}

    async def get_image(self, *args, **kwargs):
        return b""

storage_service = DummyStorageService()