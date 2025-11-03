"""
Complete Virus Scanning Implementation
Integrates with ClamAV and multiple security scanners
"""

import os
import subprocess
import hashlib
import requests
import time
import json
from typing import Dict, List, Optional, Any, Union, BinaryIO
from dataclasses import dataclass, asdict
from enum import Enum
import logging
from pathlib import Path
import tempfile
import magic
import yara
from concurrent.futures import ThreadPoolExecutor, as_completed

logger = logging.getLogger(__name__)


class ScanResult(Enum):
    """Scan result types"""
    CLEAN = "clean"
    INFECTED = "infected"
    SUSPICIOUS = "suspicious"
    ERROR = "error"
    TIMEOUT = "timeout"


class ThreatLevel(Enum):
    """Threat severity levels"""
    NONE = 0
    LOW = 1
    MEDIUM = 2
    HIGH = 3
    CRITICAL = 4


@dataclass
class VirusScanResult:
    """Virus scan result"""
    filename: str
    result: ScanResult
    threat_level: ThreatLevel
    threats_found: List[str]
    scanner_used: str
    scan_time: float
    file_size: int
    file_hash: str
    mime_type: str
    additional_info: Dict[str, Any] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        data = asdict(self)
        data['result'] = self.result.value
        data['threat_level'] = self.threat_level.value
        return data

    def is_safe(self) -> bool:
        """Check if file is safe"""
        return self.result == ScanResult.CLEAN

    def is_dangerous(self) -> bool:
        """Check if file is dangerous"""
        return self.result in [ScanResult.INFECTED, ScanResult.SUSPICIOUS]


class ClamAVScanner:
    """ClamAV antivirus scanner integration"""

    def __init__(self):
        self.clamd_socket = "/tmp/clamd.socket"
        self.clamscan_path = "/usr/bin/clamscan"
        self.is_available = self._check_availability()

    def _check_availability(self) -> bool:
        """Check if ClamAV is available"""
        try:
            # Check for clamscan binary
            result = subprocess.run(
                [self.clamscan_path, "--version"],
                capture_output=True,
                text=True,
                timeout=10
            )
            return result.returncode == 0
        except (subprocess.TimeoutExpired, FileNotFoundError):
            logger.warning("ClamAV not found or not responding")
            return False

    def scan_file(self, file_path: str) -> VirusScanResult:
        """Scan file with ClamAV"""
        start_time = time.time()

        if not self.is_available:
            return VirusScanResult(
                filename=os.path.basename(file_path),
                result=ScanResult.ERROR,
                threat_level=ThreatLevel.NONE,
                threats_found=["Scanner not available"],
                scanner_used="ClamAV",
                scan_time=0.0,
                file_size=0,
                file_hash="",
                mime_type=""
            )

        try:
            # Get file info
            file_size = os.path.getsize(file_path)
            file_hash = self._calculate_hash(file_path)
            mime_type = magic.from_file(file_path, mime=True)

            # Run ClamAV scan
            result = subprocess.run(
                [self.clamscan_path, "--no-summary", "--infected", file_path],
                capture_output=True,
                text=True,
                timeout=60  # 1 minute timeout
            )

            scan_time = time.time() - start_time

            if result.returncode == 0:
                # Clean file
                return VirusScanResult(
                    filename=os.path.basename(file_path),
                    result=ScanResult.CLEAN,
                    threat_level=ThreatLevel.NONE,
                    threats_found=[],
                    scanner_used="ClamAV",
                    scan_time=scan_time,
                    file_size=file_size,
                    file_hash=file_hash,
                    mime_type=mime_type
                )
            elif result.returncode == 1:
                # Infected file
                threats = self._parse_clam_output(result.stdout)
                return VirusScanResult(
                    filename=os.path.basename(file_path),
                    result=ScanResult.INFECTED,
                    threat_level=ThreatLevel.HIGH,
                    threats_found=threats,
                    scanner_used="ClamAV",
                    scan_time=scan_time,
                    file_size=file_size,
                    file_hash=file_hash,
                    mime_type=mime_type
                )
            else:
                # Error occurred
                return VirusScanResult(
                    filename=os.path.basename(file_path),
                    result=ScanResult.ERROR,
                    threat_level=ThreatLevel.NONE,
                    threats_found=[f"ClamAV error: {result.stderr}"],
                    scanner_used="ClamAV",
                    scan_time=scan_time,
                    file_size=file_size,
                    file_hash=file_hash,
                    mime_type=mime_type
                )

        except subprocess.TimeoutExpired:
            return VirusScanResult(
                filename=os.path.basename(file_path),
                result=ScanResult.TIMEOUT,
                threat_level=ThreatLevel.MEDIUM,
                threats_found=["Scan timeout"],
                scanner_used="ClamAV",
                scan_time=60.0,
                file_size=0,
                file_hash="",
                mime_type=""
            )
        except Exception as e:
            return VirusScanResult(
                filename=os.path.basename(file_path),
                result=ScanResult.ERROR,
                threat_level=ThreatLevel.NONE,
                threats_found=[f"Scan error: {str(e)}"],
                scanner_used="ClamAV",
                scan_time=time.time() - start_time,
                file_size=0,
                file_hash="",
                mime_type=""
            )

    def _parse_clam_output(self, output: str) -> List[str]:
        """Parse ClamAV output to extract threat names"""
        threats = []
        for line in output.strip().split('\n'):
            if 'FOUND' in line:
                # Extract threat name
                parts = line.split(':')
                if len(parts) >= 2:
                    threat = parts[1].strip().replace(' FOUND', '')
                    threats.append(threat)
        return threats

    def _calculate_hash(self, file_path: str) -> str:
        """Calculate SHA256 hash of file"""
        try:
            sha256_hash = hashlib.sha256()
            with open(file_path, "rb") as f:
                for chunk in iter(lambda: f.read(4096), b""):
                    sha256_hash.update(chunk)
            return sha256_hash.hexdigest()
        except Exception:
            return ""


class YaraScanner:
    """YARA rules-based scanner"""

    def __init__(self, rules_dir: str = "rules/yara"):
        self.rules_dir = rules_dir
        self.compiled_rules = None
        self.is_available = self._load_rules()

    def _load_rules(self) -> bool:
        """Load and compile YARA rules"""
        try:
            rules_path = Path(self.rules_dir)
            if not rules_path.exists():
                logger.warning(f"YARA rules directory not found: {self.rules_dir}")
                return False

            # Find all .yar files
            rule_files = list(rules_path.glob("*.yar"))
            if not rule_files:
                logger.warning("No YARA rules found")
                return False

            # Compile rules
            rules_dict = {}
            for rule_file in rule_files:
                rules_dict[rule_file.stem] = str(rule_file)

            self.compiled_rules = yara.compile(filepaths=rules_dict)
            logger.info(f"Loaded {len(rule_files)} YARA rule files")
            return True

        except Exception as e:
            logger.error(f"Failed to load YARA rules: {e}")
            return False

    def scan_file(self, file_path: str) -> VirusScanResult:
        """Scan file with YARA rules"""
        start_time = time.time()

        if not self.is_available:
            return VirusScanResult(
                filename=os.path.basename(file_path),
                result=ScanResult.ERROR,
                threat_level=ThreatLevel.NONE,
                threats_found=["YARA scanner not available"],
                scanner_used="YARA",
                scan_time=0.0,
                file_size=0,
                file_hash="",
                mime_type=""
            )

        try:
            # Get file info
            file_size = os.path.getsize(file_path)
            file_hash = self._calculate_hash(file_path)
            mime_type = magic.from_file(file_path, mime=True)

            # Scan with YARA
            matches = self.compiled_rules.match(file_path)
            scan_time = time.time() - start_time

            if matches:
                threats = [match.rule for match in matches]
                threat_level = self._assess_threat_level(matches)

                return VirusScanResult(
                    filename=os.path.basename(file_path),
                    result=ScanResult.SUSPICIOUS,
                    threat_level=threat_level,
                    threats_found=threats,
                    scanner_used="YARA",
                    scan_time=scan_time,
                    file_size=file_size,
                    file_hash=file_hash,
                    mime_type=mime_type,
                    additional_info={"matches": [m.rule for m in matches]}
                )
            else:
                return VirusScanResult(
                    filename=os.path.basename(file_path),
                    result=ScanResult.CLEAN,
                    threat_level=ThreatLevel.NONE,
                    threats_found=[],
                    scanner_used="YARA",
                    scan_time=scan_time,
                    file_size=file_size,
                    file_hash=file_hash,
                    mime_type=mime_type
                )

        except Exception as e:
            return VirusScanResult(
                filename=os.path.basename(file_path),
                result=ScanResult.ERROR,
                threat_level=ThreatLevel.NONE,
                threats_found=[f"YARA scan error: {str(e)}"],
                scanner_used="YARA",
                scan_time=time.time() - start_time,
                file_size=0,
                file_hash="",
                mime_type=""
            )

    def _assess_threat_level(self, matches) -> ThreatLevel:
        """Assess threat level based on YARA matches"""
        high_threat_rules = ['malware', 'trojan', 'virus', 'backdoor']
        medium_threat_rules = ['suspicious', 'packer', 'obfuscated']

        for match in matches:
            rule_name = match.rule.lower()
            if any(threat in rule_name for threat in high_threat_rules):
                return ThreatLevel.HIGH
            elif any(threat in rule_name for threat in medium_threat_rules):
                return ThreatLevel.MEDIUM

        return ThreatLevel.LOW

    def _calculate_hash(self, file_path: str) -> str:
        """Calculate SHA256 hash of file"""
        try:
            sha256_hash = hashlib.sha256()
            with open(file_path, "rb") as f:
                for chunk in iter(lambda: f.read(4096), b""):
                    sha256_hash.update(chunk)
            return sha256_hash.hexdigest()
        except Exception:
            return ""


class VirusTotalScanner:
    """VirusTotal API integration"""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv('VIRUSTOTAL_API_KEY')
        self.base_url = "https://www.virustotal.com/vtapi/v2"
        self.is_available = self.api_key is not None

    def scan_file_hash(self, file_hash: str) -> VirusScanResult:
        """Scan file hash against VirusTotal database"""
        start_time = time.time()

        if not self.is_available:
            return VirusScanResult(
                filename="",
                result=ScanResult.ERROR,
                threat_level=ThreatLevel.NONE,
                threats_found=["VirusTotal API key not available"],
                scanner_used="VirusTotal",
                scan_time=0.0,
                file_size=0,
                file_hash=file_hash,
                mime_type=""
            )

        try:
            # Query VirusTotal
            params = {
                'apikey': self.api_key,
                'resource': file_hash
            }

            response = requests.get(
                f"{self.base_url}/file/report",
                params=params,
                timeout=30
            )

            scan_time = time.time() - start_time

            if response.status_code == 200:
                data = response.json()

                if data['response_code'] == 1:
                    # File found in database
                    positives = data.get('positives', 0)
                    total = data.get('total', 0)

                    if positives > 0:
                        # Extract threat names
                        threats = []
                        scans = data.get('scans', {})
                        for scanner, result in scans.items():
                            if result.get('detected'):
                                threats.append(f"{scanner}: {result.get('result', 'Unknown')}")

                        # Assess threat level
                        detection_ratio = positives / total if total > 0 else 0
                        if detection_ratio > 0.5:
                            threat_level = ThreatLevel.CRITICAL
                        elif detection_ratio > 0.3:
                            threat_level = ThreatLevel.HIGH
                        elif detection_ratio > 0.1:
                            threat_level = ThreatLevel.MEDIUM
                        else:
                            threat_level = ThreatLevel.LOW

                        return VirusScanResult(
                            filename="",
                            result=ScanResult.INFECTED,
                            threat_level=threat_level,
                            threats_found=threats,
                            scanner_used="VirusTotal",
                            scan_time=scan_time,
                            file_size=0,
                            file_hash=file_hash,
                            mime_type="",
                            additional_info={
                                "positives": positives,
                                "total": total,
                                "scan_date": data.get('scan_date'),
                                "permalink": data.get('permalink')
                            }
                        )
                    else:
                        # Clean file
                        return VirusScanResult(
                            filename="",
                            result=ScanResult.CLEAN,
                            threat_level=ThreatLevel.NONE,
                            threats_found=[],
                            scanner_used="VirusTotal",
                            scan_time=scan_time,
                            file_size=0,
                            file_hash=file_hash,
                            mime_type="",
                            additional_info={
                                "positives": 0,
                                "total": total,
                                "scan_date": data.get('scan_date')
                            }
                        )
                else:
                    # File not found in database
                    return VirusScanResult(
                        filename="",
                        result=ScanResult.ERROR,
                        threat_level=ThreatLevel.NONE,
                        threats_found=["File not found in VirusTotal database"],
                        scanner_used="VirusTotal",
                        scan_time=scan_time,
                        file_size=0,
                        file_hash=file_hash,
                        mime_type=""
                    )
            else:
                return VirusScanResult(
                    filename="",
                    result=ScanResult.ERROR,
                    threat_level=ThreatLevel.NONE,
                    threats_found=[f"VirusTotal API error: {response.status_code}"],
                    scanner_used="VirusTotal",
                    scan_time=scan_time,
                    file_size=0,
                    file_hash=file_hash,
                    mime_type=""
                )

        except Exception as e:
            return VirusScanResult(
                filename="",
                result=ScanResult.ERROR,
                threat_level=ThreatLevel.NONE,
                threats_found=[f"VirusTotal error: {str(e)}"],
                scanner_used="VirusTotal",
                scan_time=time.time() - start_time,
                file_size=0,
                file_hash=file_hash,
                mime_type=""
            )


class ComprehensiveVirusScanner:
    """Main virus scanner that orchestrates multiple scanning engines"""

    def __init__(self,
                 use_clamav: bool = True,
                 use_yara: bool = True,
                 use_virustotal: bool = True,
                 virustotal_api_key: Optional[str] = None):

        self.scanners = []

        if use_clamav:
            clamav = ClamAVScanner()
            if clamav.is_available:
                self.scanners.append(clamav)

        if use_yara:
            yara_scanner = YaraScanner()
            if yara_scanner.is_available:
                self.scanners.append(yara_scanner)

        if use_virustotal:
            vt_scanner = VirusTotalScanner(virustotal_api_key)
            if vt_scanner.is_available:
                self.scanners.append(vt_scanner)

        logger.info(f"Initialized virus scanner with {len(self.scanners)} engines")

    def scan_file(self, file_path: str, parallel: bool = True) -> Dict[str, VirusScanResult]:
        """
        Scan file with all available scanners

        Args:
            file_path: Path to file to scan
            parallel: Whether to run scanners in parallel

        Returns:
            Dictionary of scanner name -> scan result
        """
        if not self.scanners:
            return {
                'error': VirusScanResult(
                    filename=os.path.basename(file_path),
                    result=ScanResult.ERROR,
                    threat_level=ThreatLevel.NONE,
                    threats_found=["No scanners available"],
                    scanner_used="None",
                    scan_time=0.0,
                    file_size=0,
                    file_hash="",
                    mime_type=""
                )
            }

        if parallel:
            return self._scan_parallel(file_path)
        else:
            return self._scan_sequential(file_path)

    def _scan_parallel(self, file_path: str) -> Dict[str, VirusScanResult]:
        """Run all scanners in parallel"""
        results = {}

        with ThreadPoolExecutor(max_workers=len(self.scanners)) as executor:
            # Submit all scan jobs
            future_to_scanner = {}
            for scanner in self.scanners:
                if isinstance(scanner, VirusTotalScanner):
                    # For VirusTotal, first calculate hash
                    file_hash = self._calculate_hash(file_path)
                    future = executor.submit(scanner.scan_file_hash, file_hash)
                else:
                    future = executor.submit(scanner.scan_file, file_path)

                future_to_scanner[future] = scanner.__class__.__name__

            # Collect results
            for future in as_completed(future_to_scanner):
                scanner_name = future_to_scanner[future]
                try:
                    result = future.result()
                    results[scanner_name] = result
                except Exception as e:
                    logger.error(f"Scanner {scanner_name} failed: {e}")
                    results[scanner_name] = VirusScanResult(
                        filename=os.path.basename(file_path),
                        result=ScanResult.ERROR,
                        threat_level=ThreatLevel.NONE,
                        threats_found=[f"Scanner error: {str(e)}"],
                        scanner_used=scanner_name,
                        scan_time=0.0,
                        file_size=0,
                        file_hash="",
                        mime_type=""
                    )

        return results

    def _scan_sequential(self, file_path: str) -> Dict[str, VirusScanResult]:
        """Run scanners sequentially"""
        results = {}

        for scanner in self.scanners:
            scanner_name = scanner.__class__.__name__
            try:
                if isinstance(scanner, VirusTotalScanner):
                    file_hash = self._calculate_hash(file_path)
                    result = scanner.scan_file_hash(file_hash)
                else:
                    result = scanner.scan_file(file_path)

                results[scanner_name] = result

            except Exception as e:
                logger.error(f"Scanner {scanner_name} failed: {e}")
                results[scanner_name] = VirusScanResult(
                    filename=os.path.basename(file_path),
                    result=ScanResult.ERROR,
                    threat_level=ThreatLevel.NONE,
                    threats_found=[f"Scanner error: {str(e)}"],
                    scanner_used=scanner_name,
                    scan_time=0.0,
                    file_size=0,
                    file_hash="",
                    mime_type=""
                )

        return results

    def scan_bytes(self, file_bytes: bytes, filename: str = "unknown") -> Dict[str, VirusScanResult]:
        """
        Scan file bytes by writing to temporary file

        Args:
            file_bytes: File content as bytes
            filename: Original filename

        Returns:
            Dictionary of scanner name -> scan result
        """
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            temp_file.write(file_bytes)
            temp_path = temp_file.name

        try:
            results = self.scan_file(temp_path)

            # Update filenames in results
            for result in results.values():
                result.filename = filename

            return results

        finally:
            # Clean up temporary file
            try:
                os.unlink(temp_path)
            except Exception:
                pass

    def get_consensus_result(self, scan_results: Dict[str, VirusScanResult]) -> VirusScanResult:
        """
        Get consensus result from multiple scanners

        Args:
            scan_results: Results from multiple scanners

        Returns:
            Consensus scan result
        """
        if not scan_results:
            return VirusScanResult(
                filename="",
                result=ScanResult.ERROR,
                threat_level=ThreatLevel.NONE,
                threats_found=["No scan results"],
                scanner_used="Consensus",
                scan_time=0.0,
                file_size=0,
                file_hash="",
                mime_type=""
            )

        # Count votes
        infected_count = 0
        suspicious_count = 0
        clean_count = 0
        error_count = 0

        all_threats = []
        max_threat_level = ThreatLevel.NONE
        total_scan_time = 0.0

        # Get file info from first valid result
        filename = ""
        file_size = 0
        file_hash = ""
        mime_type = ""

        for result in scan_results.values():
            if result.filename:
                filename = result.filename
            if result.file_size:
                file_size = result.file_size
            if result.file_hash:
                file_hash = result.file_hash
            if result.mime_type:
                mime_type = result.mime_type

            total_scan_time += result.scan_time

            if result.result == ScanResult.INFECTED:
                infected_count += 1
                all_threats.extend(result.threats_found)
            elif result.result == ScanResult.SUSPICIOUS:
                suspicious_count += 1
                all_threats.extend(result.threats_found)
            elif result.result == ScanResult.CLEAN:
                clean_count += 1
            else:
                error_count += 1

            # Track maximum threat level
            if result.threat_level.value > max_threat_level.value:
                max_threat_level = result.threat_level

        # Determine consensus
        total_valid = infected_count + suspicious_count + clean_count

        if total_valid == 0:
            consensus_result = ScanResult.ERROR
        elif infected_count > 0:
            consensus_result = ScanResult.INFECTED
        elif suspicious_count > 0:
            consensus_result = ScanResult.SUSPICIOUS
        else:
            consensus_result = ScanResult.CLEAN
            max_threat_level = ThreatLevel.NONE

        return VirusScanResult(
            filename=filename,
            result=consensus_result,
            threat_level=max_threat_level,
            threats_found=list(set(all_threats)),  # Remove duplicates
            scanner_used="Consensus",
            scan_time=total_scan_time,
            file_size=file_size,
            file_hash=file_hash,
            mime_type=mime_type,
            additional_info={
                "scanner_votes": {
                    "infected": infected_count,
                    "suspicious": suspicious_count,
                    "clean": clean_count,
                    "error": error_count
                },
                "individual_results": {k: v.to_dict() for k, v in scan_results.items()}
            }
        )

    def _calculate_hash(self, file_path: str) -> str:
        """Calculate SHA256 hash of file"""
        try:
            sha256_hash = hashlib.sha256()
            with open(file_path, "rb") as f:
                for chunk in iter(lambda: f.read(4096), b""):
                    sha256_hash.update(chunk)
            return sha256_hash.hexdigest()
        except Exception:
            return ""

    def get_scanner_status(self) -> Dict[str, bool]:
        """Get status of all configured scanners"""
        status = {}

        clamav = ClamAVScanner()
        status['ClamAV'] = clamav.is_available

        yara_scanner = YaraScanner()
        status['YARA'] = yara_scanner.is_available

        vt_scanner = VirusTotalScanner()
        status['VirusTotal'] = vt_scanner.is_available

        return status


# Convenience functions
def scan_file(file_path: str,
              use_consensus: bool = True,
              parallel: bool = True) -> Union[VirusScanResult, Dict[str, VirusScanResult]]:
    """
    Convenience function to scan a file

    Args:
        file_path: Path to file to scan
        use_consensus: Whether to return consensus result or all results
        parallel: Whether to run scanners in parallel

    Returns:
        Single consensus result or dictionary of all results
    """
    scanner = ComprehensiveVirusScanner()
    results = scanner.scan_file(file_path, parallel=parallel)

    if use_consensus:
        return scanner.get_consensus_result(results)
    else:
        return results


def scan_bytes(file_bytes: bytes,
               filename: str = "unknown",
               use_consensus: bool = True) -> Union[VirusScanResult, Dict[str, VirusScanResult]]:
    """
    Convenience function to scan file bytes

    Args:
        file_bytes: File content as bytes
        filename: Original filename
        use_consensus: Whether to return consensus result or all results

    Returns:
        Single consensus result or dictionary of all results
    """
    scanner = ComprehensiveVirusScanner()
    results = scanner.scan_bytes(file_bytes, filename)

    if use_consensus:
        return scanner.get_consensus_result(results)
    else:
        return results


def get_scanner_status() -> Dict[str, bool]:
    """Get status of all available scanners"""
    scanner = ComprehensiveVirusScanner()
    return scanner.get_scanner_status()