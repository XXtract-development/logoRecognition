#!/usr/bin/env python3
"""Explicit provisioning entrypoint; never imports application/startup code."""
import os
import sys

BUCKETS = ("training-images", "recognition-images", "thumbnails", "models")


def initialize_buckets(client):
    """Create missing buckets, reject any bucket policy, and verify list access.

    No policy writes/deletes: an unexpected policy requires explicit review.
    A bucket without a bucket policy is private by default in MinIO. Account
    IAM policy configuration remains a separate provisioning obligation.
    """
    for bucket in BUCKETS:
        if not client.bucket_exists(bucket):
            client.make_bucket(bucket)
        if not client.bucket_exists(bucket):
            raise RuntimeError("Bucket verification failed")
        try:
            policy = client.get_bucket_policy(bucket)
        except Exception as error:
            if getattr(error, "code", None) != "NoSuchBucketPolicy":
                raise RuntimeError("Private bucket policy could not be verified") from None
        else:
            if policy:
                raise RuntimeError("Unexpected bucket policy; explicit review required")
            # Empty successful response is not MinIO's no-policy confirmation.
            raise RuntimeError("Private bucket policy could not be verified")
        # MinIO's iterator is lazy. Advance it to actually verify read/list access.
        first = next(iter(client.list_objects(bucket, recursive=True)), None)
        if first is not None:
            # Read at most one byte from an existing object; no test writes/deletes.
            response = client.get_object(bucket, first.object_name, length=1)
            try:
                response.read(1)
            finally:
                response.close()
                response.release_conn()
    return BUCKETS


def main():
    try:
        from minio import Minio  # existing frozen ML-image dependency
        if os.environ.get("MINIO_ENDPOINT") != "minio:9000":
            raise ValueError("Dedicated internal endpoint required")
        access_key = os.environ["MINIO_ROOT_USER"]
        secret_key = os.environ["MINIO_ROOT_PASSWORD"]
        if not access_key or len(secret_key) < 32 or "minioadmin" in (access_key, secret_key):
            raise ValueError("Dedicated provisioning credentials required")
        client = Minio("minio:9000", access_key=access_key, secret_key=secret_key, secure=False)
        initialize_buckets(client)
    except Exception:
        # Provider/client errors may contain connection details; do not print them.
        print("Bucket initialization failed; verify private policies, access and connectivity.", file=sys.stderr)
        return 1
    print("Verified all four private buckets; no objects or policies removed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
