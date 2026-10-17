"""File storage. Keys are content-addressed and never overwritten, so every version is kept."""
from pathlib import Path

from ..config import settings


class LocalStorage:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def put(self, key: str, data: bytes) -> None:
        path = self.root / key
        if path.exists():
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def get(self, key: str) -> bytes:
        return (self.root / key).read_bytes()


class S3Storage:
    def __init__(self):
        import boto3  # only needed in production

        self.bucket = settings.s3_bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint or None,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
        )
        try:
            self.client.head_bucket(Bucket=self.bucket)
        except Exception:
            self.client.create_bucket(Bucket=self.bucket)

    def put(self, key: str, data: bytes) -> None:
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data)

    def get(self, key: str) -> bytes:
        return self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()


def make_key(sha256: str) -> str:
    return f"{sha256[:2]}/{sha256}"


storage = S3Storage() if settings.storage_backend == "s3" else LocalStorage(settings.local_storage_dir)
