"""
CDN Manager for CloudFront Integration
Provides global content delivery with edge caching
"""

import os
import uuid
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime

import boto3
from botocore.exceptions import ClientError, BotoCoreError

logger = logging.getLogger(__name__)


class CDNManager:
    """Manages CloudFront CDN distribution for MinIO storage."""

    def __init__(self):
        """Initialize CDN manager with AWS credentials."""
        # AWS configuration
        self.aws_region = os.getenv('AWS_REGION', 'us-east-1')
        self.aws_access_key = os.getenv('AWS_ACCESS_KEY_ID')
        self.aws_secret_key = os.getenv('AWS_SECRET_ACCESS_KEY')

        # CloudFront configuration
        self.distribution_id = os.getenv('CLOUDFRONT_DISTRIBUTION_ID')
        self.cdn_domain = os.getenv('CDN_DOMAIN', 'cdn.logorecognition.com')

        # MinIO origin configuration
        self.minio_domain = os.getenv('MINIO_DOMAIN', 'minio.logorecognition.com')
        self.minio_port = int(os.getenv('MINIO_PORT', 9000))

        # Initialize CloudFront client
        if self.aws_access_key and self.aws_secret_key:
            self.cloudfront = boto3.client(
                'cloudfront',
                region_name=self.aws_region,
                aws_access_key_id=self.aws_access_key,
                aws_secret_access_key=self.aws_secret_key
            )
        else:
            # Use default credentials (IAM role, etc.)
            self.cloudfront = boto3.client('cloudfront', region_name=self.aws_region)

        # Metrics
        self.invalidation_count = 0

    def create_distribution(self) -> Dict:
        """
        Create CloudFront distribution with optimal settings.

        Returns:
            Distribution configuration dictionary
        """
        caller_reference = str(uuid.uuid4())

        distribution_config = {
            'CallerReference': caller_reference,
            'Comment': 'Logo Recognition CDN - A++ Performance',
            'Enabled': True,
            'IsIPV6Enabled': True,
            'HttpVersion': 'http2and3',  # HTTP/2 and HTTP/3 support
            'PriceClass': 'PriceClass_All',  # Use all edge locations

            # Origins configuration
            'Origins': {
                'Quantity': 1,
                'Items': [
                    {
                        'Id': 'minio-origin',
                        'DomainName': self.minio_domain,
                        'CustomOriginConfig': {
                            'HTTPPort': self.minio_port,
                            'HTTPSPort': 443,
                            'OriginProtocolPolicy': 'http-only',
                            'OriginSslProtocols': {
                                'Quantity': 3,
                                'Items': ['TLSv1', 'TLSv1.1', 'TLSv1.2']
                            },
                            'OriginReadTimeout': 30,
                            'OriginKeepaliveTimeout': 5
                        },
                        'ConnectionAttempts': 3,
                        'ConnectionTimeout': 10,
                        'OriginShield': {
                            'Enabled': True,
                            'OriginShieldRegion': self.aws_region
                        }
                    }
                ]
            },

            # Default cache behavior
            'DefaultCacheBehavior': {
                'TargetOriginId': 'minio-origin',
                'ViewerProtocolPolicy': 'redirect-to-https',
                'TrustedSigners': {
                    'Enabled': False,
                    'Quantity': 0
                },
                'TrustedKeyGroups': {
                    'Enabled': False,
                    'Quantity': 0
                },
                'AllowedMethods': {
                    'Quantity': 7,
                    'Items': ['GET', 'HEAD', 'OPTIONS', 'PUT', 'POST', 'PATCH', 'DELETE'],
                    'CachedMethods': {
                        'Quantity': 3,
                        'Items': ['GET', 'HEAD', 'OPTIONS']
                    }
                },
                'Compress': True,
                'SmoothStreaming': False,
                'DefaultTTL': 86400,  # 1 day
                'MinTTL': 0,
                'MaxTTL': 31536000,  # 1 year
                'ForwardedValues': {
                    'QueryString': True,
                    'Cookies': {'Forward': 'none'},
                    'Headers': {
                        'Quantity': 5,
                        'Items': [
                            'Origin',
                            'Access-Control-Request-Method',
                            'Access-Control-Request-Headers',
                            'CloudFront-Forwarded-Proto',
                            'CloudFront-Viewer-Country'
                        ]
                    }
                },
                'FieldLevelEncryptionId': '',
                'CachePolicyId': '658327ea-f89d-4fab-a63d-7e88639e58f6',  # Managed-CachingOptimized
                'OriginRequestPolicyId': '88a5eaf4-2fd4-4709-b370-b4c650ea3fcf',  # Managed-CORS-S3Origin
                'ResponseHeadersPolicyId': '5cc3b908-e619-4fd7-8ded-e970acd68fa5'  # Managed-CORS-With-Preflight
            },

            # Cache behaviors for specific patterns
            'CacheBehaviors': {
                'Quantity': 2,
                'Items': [
                    {
                        'PathPattern': '*.jpg',
                        'TargetOriginId': 'minio-origin',
                        'ViewerProtocolPolicy': 'https-only',
                        'TrustedSigners': {
                            'Enabled': False,
                            'Quantity': 0
                        },
                        'TrustedKeyGroups': {
                            'Enabled': False,
                            'Quantity': 0
                        },
                        'AllowedMethods': {
                            'Quantity': 2,
                            'Items': ['GET', 'HEAD'],
                            'CachedMethods': {
                                'Quantity': 2,
                                'Items': ['GET', 'HEAD']
                            }
                        },
                        'Compress': True,
                        'DefaultTTL': 604800,  # 7 days for images
                        'MinTTL': 0,
                        'MaxTTL': 31536000,  # 1 year
                        'ForwardedValues': {
                            'QueryString': False,
                            'Cookies': {'Forward': 'none'},
                            'Headers': {'Quantity': 0}
                        },
                        'FieldLevelEncryptionId': ''
                    },
                    {
                        'PathPattern': '*.png',
                        'TargetOriginId': 'minio-origin',
                        'ViewerProtocolPolicy': 'https-only',
                        'TrustedSigners': {
                            'Enabled': False,
                            'Quantity': 0
                        },
                        'TrustedKeyGroups': {
                            'Enabled': False,
                            'Quantity': 0
                        },
                        'AllowedMethods': {
                            'Quantity': 2,
                            'Items': ['GET', 'HEAD'],
                            'CachedMethods': {
                                'Quantity': 2,
                                'Items': ['GET', 'HEAD']
                            }
                        },
                        'Compress': True,
                        'DefaultTTL': 604800,  # 7 days for images
                        'MinTTL': 0,
                        'MaxTTL': 31536000,  # 1 year
                        'ForwardedValues': {
                            'QueryString': False,
                            'Cookies': {'Forward': 'none'},
                            'Headers': {'Quantity': 0}
                        },
                        'FieldLevelEncryptionId': ''
                    }
                ]
            },

            # Custom error responses
            'CustomErrorResponses': {
                'Quantity': 3,
                'Items': [
                    {
                        'ErrorCode': 403,
                        'ResponsePagePath': '/error-403.html',
                        'ResponseCode': '403',
                        'ErrorCachingMinTTL': 10
                    },
                    {
                        'ErrorCode': 404,
                        'ResponsePagePath': '/error-404.html',
                        'ResponseCode': '404',
                        'ErrorCachingMinTTL': 10
                    },
                    {
                        'ErrorCode': 500,
                        'ResponsePagePath': '/error-500.html',
                        'ResponseCode': '500',
                        'ErrorCachingMinTTL': 0
                    }
                ]
            },

            # Logging configuration
            'Logging': {
                'Enabled': True,
                'IncludeCookies': False,
                'Bucket': f'{self.cdn_domain}-logs.s3.amazonaws.com',
                'Prefix': 'cdn-logs/'
            },

            # Web ACL for AWS WAF (optional)
            'WebACLId': '',

            # Viewer certificate
            'ViewerCertificate': {
                'CloudFrontDefaultCertificate': True,
                'MinimumProtocolVersion': 'TLSv1.2_2021',
                'CertificateSource': 'cloudfront'
            },

            # Restrictions
            'Restrictions': {
                'GeoRestriction': {
                    'RestrictionType': 'none',
                    'Quantity': 0
                }
            }
        }

        try:
            response = self.cloudfront.create_distribution(
                DistributionConfig=distribution_config
            )

            distribution = response['Distribution']
            self.distribution_id = distribution['Id']

            logger.info(f"Created CloudFront distribution: {self.distribution_id}")
            logger.info(f"Distribution domain: {distribution['DomainName']}")

            return {
                'id': distribution['Id'],
                'domain': distribution['DomainName'],
                'status': distribution['Status'],
                'arn': distribution['ARN'],
                'created': datetime.utcnow().isoformat()
            }

        except ClientError as e:
            logger.error(f"Failed to create distribution: {e}")
            raise

    async def invalidate_cache(
        self,
        paths: List[str],
        caller_reference: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Invalidate CDN cache for updated files.

        Args:
            paths: List of paths to invalidate (e.g., ['/path/to/file.jpg', '/*'])
            caller_reference: Unique identifier for this invalidation

        Returns:
            Invalidation details
        """
        if not self.distribution_id:
            logger.warning("No distribution ID configured, skipping invalidation")
            return {'status': 'skipped', 'reason': 'no_distribution_id'}

        if not caller_reference:
            caller_reference = str(uuid.uuid4())

        try:
            response = self.cloudfront.create_invalidation(
                DistributionId=self.distribution_id,
                InvalidationBatch={
                    'Paths': {
                        'Quantity': len(paths),
                        'Items': paths
                    },
                    'CallerReference': caller_reference
                }
            )

            invalidation = response['Invalidation']
            self.invalidation_count += 1

            logger.info(f"Created invalidation {invalidation['Id']} for {len(paths)} paths")

            return {
                'id': invalidation['Id'],
                'status': invalidation['Status'],
                'paths': paths,
                'created': invalidation['CreateTime'].isoformat()
            }

        except ClientError as e:
            logger.error(f"Failed to create invalidation: {e}")
            raise

    def get_distribution_info(self) -> Optional[Dict[str, Any]]:
        """
        Get CloudFront distribution information.

        Returns:
            Distribution details or None if not configured
        """
        if not self.distribution_id:
            return None

        try:
            response = self.cloudfront.get_distribution(Id=self.distribution_id)
            distribution = response['Distribution']
            config = distribution['DistributionConfig']

            return {
                'id': distribution['Id'],
                'domain': distribution['DomainName'],
                'status': distribution['Status'],
                'enabled': config['Enabled'],
                'comment': config.get('Comment', ''),
                'last_modified': distribution['LastModifiedTime'].isoformat(),
                'origins': [
                    {
                        'id': origin['Id'],
                        'domain': origin['DomainName']
                    }
                    for origin in config['Origins']['Items']
                ],
                'price_class': config.get('PriceClass', 'PriceClass_All'),
                'http_version': config.get('HttpVersion', 'http2'),
                'ipv6_enabled': config.get('IsIPV6Enabled', False)
            }

        except ClientError as e:
            logger.error(f"Failed to get distribution info: {e}")
            return None

    def update_distribution_config(
        self,
        updates: Dict[str, Any]
    ) -> bool:
        """
        Update CloudFront distribution configuration.

        Args:
            updates: Dictionary of configuration updates

        Returns:
            True if successful
        """
        if not self.distribution_id:
            logger.warning("No distribution ID configured")
            return False

        try:
            # Get current configuration
            response = self.cloudfront.get_distribution_config(Id=self.distribution_id)
            config = response['DistributionConfig']
            etag = response['ETag']

            # Apply updates
            for key, value in updates.items():
                if key in config:
                    config[key] = value

            # Update distribution
            self.cloudfront.update_distribution(
                DistributionConfig=config,
                Id=self.distribution_id,
                IfMatch=etag
            )

            logger.info(f"Updated distribution {self.distribution_id} configuration")
            return True

        except ClientError as e:
            logger.error(f"Failed to update distribution: {e}")
            return False

    def get_metrics(self) -> Dict[str, Any]:
        """Get CDN metrics."""
        return {
            'distribution_id': self.distribution_id,
            'cdn_domain': self.cdn_domain,
            'invalidation_count': self.invalidation_count,
            'origin_domain': self.minio_domain,
            'origin_port': self.minio_port
        }