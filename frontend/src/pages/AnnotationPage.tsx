import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  App as AntdApp,
  Button,
  Card,
  Col,
  Divider,
  Input,
  Modal,
  Row,
  Space,
  Spin,
  Typography,
  Tooltip,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckOutlined,
  DeleteOutlined,
  HistoryOutlined,
  SaveOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import InteractiveCanvas from '../components/InteractiveCanvas';
import BoundingBoxPanel from '../components/BoundingBoxPanel';
import SaveBanner from '../components/SaveBanner';
import VersionHistoryDrawer from '../components/VersionHistoryDrawer';
import ConflictResolutionModal from '../components/ConflictResolutionModal';
import { BoundingBox } from '../types/canvas';
import {
  AnnotationBox,
  AnnotationSaveResponse,
  ConflictResolutionOption,
} from '../types/annotations';
import { annotationService } from '../services/annotationService';
import imageService from '../services/imageService';
import { useTrainingStore } from '../store/trainingStore';
import useAppStore from '../store/appStore';
import { useAutosave } from '../hooks/useAutosave';
import { boundingBoxUtils } from '../utils/boundingBoxUtils';
import {
  clearDraftsFromIndexedDb,
  loadLatestDraftFromIndexedDb,
  saveDraftToIndexedDb,
} from '../utils/indexedDbDraft';

interface UploadedFile {
  file_id: string;
  filename: string;
  file_path?: string;
  url?: string;
}

interface LocationState {
  uploadedFiles?: UploadedFile[];
  datasetId?: string;
}

const AUTOSAVE_TAG = 'autosave';

const AnnotationPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [isHistoryOpen, setHistoryOpen] = useState(false);
  const [isConflictModalOpen, setConflictModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [imageMeta, setImageMeta] = useState<Record<string, { width: number; height: number }>>({});
  const [jumpToValue, setJumpToValue] = useState<string>('');
  const [isNavigating, setIsNavigating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const datasetInitialized = useRef(false);

  const {
    datasetId,
    setDatasetId,
    userId,
    setUserId,
    annotationsByImage,
    upsertAnnotations,
    removeAnnotation,
    saveResponse,
    setSaveResponse,
    conflicts,
    setConflicts,
    versionHistory,
    setVersionHistory,
    auditTrail,
    setAuditTrail,
    dirty,
    setDirty,
  } = useTrainingStore();

  const { user, featureFlags } = useAppStore((state) => ({
    user: state.user,
    featureFlags: state.featureFlags,
  }));

  const datasetVersioningEnabled = featureFlags?.trainingDatasetVersioning ?? true;

  const locationState = (location.state || {}) as LocationState;

  const currentFile = uploadedFiles[currentFileIndex];
  const currentAnnotations = useMemo(
    () => (currentFile ? annotationsByImage[currentFile.file_id] || [] : []),
    [annotationsByImage, currentFile]
  );

  const flattenedAnnotations = useMemo(
    () => Object.values(annotationsByImage).flat(),
    [annotationsByImage]
  );

  const toBoundingBox = useCallback(
    (annotation: AnnotationBox, index: number): BoundingBox => ({
      id: annotation.id,
      x: annotation.x,
      y: annotation.y,
      width: annotation.width,
      height: annotation.height,
      color: annotation.metadata?.color ?? boundingBoxUtils.generateColor(index),
      imageId: annotation.imageId,
      selected: annotation.id === selectedBoxId,
      created: annotation.created ? new Date(annotation.created) : new Date(),
      category: annotation.category,
      value: annotation.value,
      categoryId: annotation.categoryId,
      valueId: annotation.valueId,
      tags: annotation.tags,
      metadata: annotation.metadata,
      confidence: annotation.confidence,
      imageWidth: annotation.imageWidth ?? imageMeta[annotation.imageId]?.width,
      imageHeight: annotation.imageHeight ?? imageMeta[annotation.imageId]?.height,
    }),
    [imageMeta, selectedBoxId]
  );

  const boundingBoxesForCurrentImage = useMemo(
    () => currentAnnotations.map((annotation, index) => toBoundingBox(annotation, index)),
    [currentAnnotations, toBoundingBox]
  );

  const deriveAnnotation = useCallback(
    (box: BoundingBox, existing?: AnnotationBox): AnnotationBox => {
      const meta = imageMeta[box.imageId];
      return {
        id: box.id,
        imageId: box.imageId,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        category: (box.category ?? existing?.category ?? '').trim(),
        value: (box.value ?? existing?.value ?? '').trim(),
        categoryId: box.categoryId ?? existing?.categoryId,
        valueId: box.valueId ?? existing?.valueId,
        tags: box.tags ?? existing?.tags ?? [],
        metadata: { ...existing?.metadata, ...box.metadata, color: box.color },
        confidence: box.confidence ?? existing?.confidence,
        created: existing?.created ?? (box.created instanceof Date ? box.created.toISOString() : box.created),
        updated: new Date().toISOString(),
        imageWidth: meta?.width ?? existing?.imageWidth,
        imageHeight: meta?.height ?? existing?.imageHeight,
      };
    },
    [imageMeta]
  );

  const refreshVersionHistory = useCallback(async (): Promise<void> => {
    if (!datasetId) return;
    try {
      const versions = await annotationService.listVersions(datasetId);
      setVersionHistory(versions);
    } catch (error) {
      console.warn('Failed to load version history', error);
    }
  }, [datasetId, setVersionHistory]);

  const refreshAuditTrail = useCallback(async (): Promise<void> => {
    if (!datasetId) return;
    try {
      const entries = await annotationService.loadAudit(datasetId);
      setAuditTrail(entries);
    } catch (error) {
      console.warn('Failed to load audit trail', error);
    }
  }, [datasetId, setAuditTrail]);

  const applyAnnotationSet = useCallback(
    (annotations: AnnotationBox[]) => {
      useTrainingStore.setState({ annotationsByImage: {} });

      const grouped = annotations.reduce<Record<string, AnnotationBox[]>>((acc, annotation) => {
        acc[annotation.imageId] = acc[annotation.imageId] || [];
        acc[annotation.imageId].push(annotation);
        return acc;
      }, {});

      Object.entries(grouped).forEach(([imageId, items]) => {
        upsertAnnotations(imageId, items);
      });
      setDirty(false);
    },
    [setDirty, upsertAnnotations]
  );

  const buildSubmission = useCallback(
    (
      status: 'draft' | 'final',
      overrides?: {
        conflictResolutions?: Record<string, ConflictResolutionOption>;
        tags?: string[];
      }
    ) => {
      const state = useTrainingStore.getState();
      const annotations = Object.values(state.annotationsByImage)
        .flat()
        .map((annotation) => ({
          ...annotation,
          imageWidth: annotation.imageWidth ?? imageMeta[annotation.imageId]?.width,
          imageHeight: annotation.imageHeight ?? imageMeta[annotation.imageId]?.height,
        }));

      return {
        datasetId: state.datasetId,
        userId: state.userId,
        annotations,
        status,
        baseVersionId: state.saveResponse?.datasetVersionId,
        conflictResolutions: overrides?.conflictResolutions,
        tags: overrides?.tags,
        featureFlagSnapshot: featureFlags,
      };
    },
    [featureFlags, imageMeta]
  );

  const persistAnnotations = useCallback(
    async (
      status: 'draft' | 'final',
      options: {
        conflictResolutions?: Record<string, ConflictResolutionOption>;
        silent?: boolean;
        tags?: string[];
      } = {}
    ): Promise<AnnotationSaveResponse | undefined> => {
      if (!datasetId) {
        message.error('Dataset identifier missing. Unable to persist annotations.');
        return undefined;
      }

      const submission = buildSubmission(status, {
        conflictResolutions: options.conflictResolutions,
        tags: options.tags,
      });

      setIsSaving(true);
      try {
        const response = await annotationService.saveAnnotations(submission);

        if (response.status === 'conflict') {
          setConflicts(response.conflicts);
          setConflictModalOpen(true);
          if (!options.silent) {
            message.warning('Conflicts detected. Resolve them to continue saving.');
          }
          return response;
        }

        setSaveResponse(response);
        setDirty(false);

        if (status === 'draft') {
          await saveDraftToIndexedDb(datasetId, submission.annotations);
        } else {
          await clearDraftsFromIndexedDb(datasetId);
        }

        await Promise.all([refreshVersionHistory(), refreshAuditTrail()]);

        if (!options.silent) {
          if (response.status === 'noop') {
            message.info('No changes detected since last save.');
          } else if (status === 'draft') {
            message.success('Draft saved.');
          } else {
            message.success('Annotations saved successfully.');
          }
        }

        return response;
      } catch (error) {
        console.error('Failed to persist annotations', error);
        if (!options.silent) {
          message.error(status === 'draft' ? 'Autosave failed.' : 'Unable to save annotations.');
        }
        throw error;
      } finally {
        setIsSaving(false);
      }
    },
    [buildSubmission, datasetId, message, refreshAuditTrail, refreshVersionHistory, setConflicts, setDirty, setSaveResponse]
  );

  const { markDirty, flush } = useAutosave({
    enabled: uploadedFiles.length > 0,
    saveDraft: async () => {
      const state = useTrainingStore.getState();
      if (!state.dirty) {
        return;
      }
      await persistAnnotations('draft', { silent: true, tags: [AUTOSAVE_TAG] });
    },
  });

  useEffect(() => {
    const filesFromLocation = locationState.uploadedFiles;
    let files: UploadedFile[] = [];

    if (filesFromLocation && filesFromLocation.length > 0) {
      files = filesFromLocation;
      localStorage.setItem('uploadedFiles', JSON.stringify(files));
    } else {
      const cached = localStorage.getItem('uploadedFiles');
      if (cached) {
        try {
          files = JSON.parse(cached) as UploadedFile[];
        } catch (error) {
          console.error('Failed to parse cached uploaded files', error);
        }
      }
    }

    if (files.length === 0) {
      message.error('No uploaded files found. Please upload images first.');
      navigate('/upload');
      return;
    }

    setUploadedFiles(files);
    setLoading(false);
  }, [locationState.uploadedFiles, message, navigate]);

  useEffect(() => {
    if (datasetInitialized.current) {
      return;
    }
    datasetInitialized.current = true;
    const resolvedDatasetId = locationState.datasetId || datasetId || 'dataset-default';
    setDatasetId(resolvedDatasetId);
  }, [datasetId, locationState.datasetId, setDatasetId]);


  useEffect(() => {
    if (user?.id) {
      setUserId(user.id);
    }
  }, [setUserId, user]);

  useEffect(() => {
    const recoverDrafts = async () => {
      if (!datasetId) {
        return;
      }

      await refreshVersionHistory();
      await refreshAuditTrail();

      const latestDraft = await loadLatestDraftFromIndexedDb(datasetId);
      const latestVersion = useTrainingStore.getState().versionHistory[0];

      if (!latestDraft && !latestVersion) {
        return;
      }

      if (latestDraft && (!latestVersion || latestDraft.timestamp > Date.parse(latestVersion.createdAt))) {
        Modal.confirm({
          title: 'Resume from local autosave?',
          content: 'A more recent autosave was found. Would you like to continue from the local draft or load the server version?',
          okText: 'Use local draft',
          cancelText: latestVersion ? 'Use server version' : 'Discard',
          onOk: () => {
            applyAnnotationSet(latestDraft.annotations);
            message.success('Local draft recovered.');
          },
          onCancel: async () => {
            if (latestVersion) {
              const annotations = await annotationService.loadVersion(datasetId, latestVersion.datasetVersionId);
              applyAnnotationSet(annotations);
            }
          },
        });
      } else if (latestVersion) {
        const annotations = await annotationService.loadVersion(datasetId, latestVersion.datasetVersionId);
        applyAnnotationSet(annotations);
      }
    };

    void recoverDrafts();
  }, [applyAnnotationSet, datasetId, message, refreshAuditTrail, refreshVersionHistory]);

  const handleImageLoad = useCallback(
    (image: HTMLImageElement, displaySize?: { width: number; height: number }) => {
      if (!currentFile) return;

      // Store BOTH natural dimensions and display/canvas dimensions
      const naturalWidth = image.naturalWidth || image.width;
      const naturalHeight = image.naturalHeight || image.height;
      const displayWidth = displaySize?.width || naturalWidth;
      const displayHeight = displaySize?.height || naturalHeight;

      console.log('Image loaded:', {
        fileId: currentFile.file_id,
        natural: { width: naturalWidth, height: naturalHeight },
        display: { width: displayWidth, height: displayHeight }
      });

      setImageMeta((prev) => ({
        ...prev,
        [currentFile.file_id]: {
          width: displayWidth,  // Use DISPLAY dimensions for bounding box coordinates
          height: displayHeight,
          naturalWidth,          // Store natural dimensions for reference
          naturalHeight
        },
      }));
    },
    [currentFile]
  );

  const handleBoundingBoxCreate = useCallback(
    (box: BoundingBox) => {
      if (!currentFile) return;
      const existing = annotationsByImage[currentFile.file_id] || [];
      const annotation = deriveAnnotation(box);
      upsertAnnotations(currentFile.file_id, [...existing, annotation]);
      markDirty();
    },
    [annotationsByImage, currentFile, deriveAnnotation, markDirty, upsertAnnotations]
  );

  const handleBoundingBoxUpdate = useCallback(
    (id: string, box: BoundingBox) => {
      if (!currentFile) return;
      const existing = annotationsByImage[currentFile.file_id] || [];
      const updated = existing.map((annotation) =>
        annotation.id === id ? deriveAnnotation(box, annotation) : annotation
      );
      upsertAnnotations(currentFile.file_id, updated);
      markDirty();
    },
    [annotationsByImage, currentFile, deriveAnnotation, markDirty, upsertAnnotations]
  );

  const handleBoundingBoxDelete = useCallback(
    (id: string) => {
      if (!currentFile) return;
      removeAnnotation(currentFile.file_id, id);
      markDirty();
    },
    [currentFile, markDirty, removeAnnotation]
  );

  const handlePanelUpdate = useCallback(
    (id: string, updates: Partial<BoundingBox>) => {
      const target = boundingBoxesForCurrentImage.find((box) => box.id === id);
      if (!target) return;
      handleBoundingBoxUpdate(id, { ...target, ...updates });
    },
    [boundingBoxesForCurrentImage, handleBoundingBoxUpdate]
  );

  const handleSaveDraft = useCallback(async () => {
    await persistAnnotations('draft');
  }, [persistAnnotations]);

  const validateBeforeFinalSave = useCallback(() => {
    const invalid = flattenedAnnotations.filter(
      (annotation) => !annotation.category?.trim() || !annotation.value?.trim()
    );
    if (invalid.length > 0) {
      message.error('Complete category and value for every annotation before saving.');
      return false;
    }
    return true;
  }, [flattenedAnnotations, message]);

  const handleSaveFinal = useCallback(async () => {
    if (!datasetVersioningEnabled) {
      message.warning('Dataset versioning is disabled in this environment. Save draft instead.');
      return;
    }
    if (!validateBeforeFinalSave()) {
      return;
    }
    const response = await persistAnnotations('final');
    if (response?.status === 'saved') {
      message.success('Annotation batch saved as a new dataset version.');
    }
  }, [datasetVersioningEnabled, message, persistAnnotations, validateBeforeFinalSave]);

  const handleFinish = useCallback(async () => {
    if (!datasetVersioningEnabled) {
      message.warning('Dataset versioning is disabled in this environment. Save draft instead.');
      return;
    }
    if (!validateBeforeFinalSave()) {
      return;
    }
    const response = await persistAnnotations('final');
    if (response?.status === 'saved') {
      message.success('Annotation workflow complete.');
      await flush();
      navigate('/');
    }
  }, [datasetVersioningEnabled, flush, message, navigate, persistAnnotations, validateBeforeFinalSave]);

  const handleConflictResolution = useCallback(
    async (resolution: Record<string, ConflictResolutionOption>) => {
      setConflictModalOpen(false);
      await persistAnnotations('final', { conflictResolutions: resolution });
    },
    [persistAnnotations]
  );

  const goToPreviousFile = useCallback(async () => {
    if (isNavigating) return;
    try {
      setIsNavigating(true);
      setSelectedBoxId(null);
      setCurrentFileIndex((index) => Math.max(0, index - 1));
    } catch (error) {
      message.error('Failed to navigate to previous file');
      console.error('Navigation error:', error);
    } finally {
      setIsNavigating(false);
    }
  }, [isNavigating, message]);

  const goToNextFile = useCallback(async () => {
    if (isNavigating) return;
    try {
      setIsNavigating(true);
      setSelectedBoxId(null);
      setCurrentFileIndex((index) => Math.min(uploadedFiles.length - 1, index + 1));
    } catch (error) {
      message.error('Failed to navigate to next file');
      console.error('Navigation error:', error);
    } finally {
      setIsNavigating(false);
    }
  }, [isNavigating, uploadedFiles.length, message]);

  const handleJumpTo = useCallback(async () => {
    if (isNavigating) return;

    const targetIndex = parseInt(jumpToValue, 10) - 1; // Convert to 0-based index

    if (jumpToValue.trim() === '') {
      message.warning('Please enter an image number');
      return;
    }

    if (!isNaN(targetIndex) && targetIndex >= 0 && targetIndex < uploadedFiles.length) {
      try {
        setIsNavigating(true);
        setSelectedBoxId(null);
        setCurrentFileIndex(targetIndex);
        setJumpToValue('');
        message.success(`Jumped to file ${targetIndex + 1}`);
      } catch (error) {
        message.error('Failed to jump to image');
        console.error('Jump navigation error:', error);
      } finally {
        setIsNavigating(false);
      }
    } else {
      message.error(`Please enter a number between 1 and ${uploadedFiles.length}`);
    }
  }, [jumpToValue, uploadedFiles.length, message, isNavigating]);

  const handleDeleteImage = useCallback(async () => {
    if (!currentFile || isDeleting) return;

    Modal.confirm({
      title: 'Verwijder afbeelding',
      content: `Weet je zeker dat je "${currentFile.filename}" wilt verwijderen? Alle annotaties voor deze afbeelding worden ook verwijderd.`,
      okText: 'Ja, verwijder',
      okType: 'danger',
      cancelText: 'Annuleer',
      onOk: async () => {
        try {
          setIsDeleting(true);

          // Delete image from backend
          const success = await imageService.deleteImage(currentFile.file_id);

          if (!success) {
            message.error('Afbeelding kon niet worden verwijderd');
            return;
          }

          // Remove from local state
          const updatedFiles = uploadedFiles.filter((_, index) => index !== currentFileIndex);
          setUploadedFiles(updatedFiles);

          // Update localStorage
          if (updatedFiles.length > 0) {
            localStorage.setItem('uploadedFiles', JSON.stringify(updatedFiles));
          } else {
            localStorage.removeItem('uploadedFiles');
          }

          // Remove all annotations from store for this image
          upsertAnnotations(currentFile.file_id, []);

          message.success('Afbeelding succesvol verwijderd');

          // Navigate to next image or upload page
          if (updatedFiles.length === 0) {
            // No more images, go to upload page
            navigate('/upload');
          } else if (currentFileIndex >= updatedFiles.length) {
            // We were at the last image, go to the new last image
            setCurrentFileIndex(updatedFiles.length - 1);
          }
          // If we're not at the last image, currentFileIndex stays the same and shows the next image

        } catch (error) {
          console.error('Delete image error:', error);
          message.error('Er is een fout opgetreden bij het verwijderen');
        } finally {
          setIsDeleting(false);
        }
      },
    });
  }, [currentFile, currentFileIndex, uploadedFiles, isDeleting, navigate, message, upsertAnnotations]);

  // Keyboard navigation for arrow keys
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Prevent keyboard navigation if user is typing in an input field
      const activeElement = document.activeElement;
      if (
        activeElement &&
        (activeElement.tagName === 'INPUT' ||
         activeElement.tagName === 'TEXTAREA' ||
         activeElement.getAttribute('contenteditable') === 'true')
      ) {
        return;
      }

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          if (currentFileIndex > 0) {
            goToPreviousFile();
          }
          break;
        case 'ArrowRight':
          event.preventDefault();
          if (currentFileIndex < uploadedFiles.length - 1) {
            goToNextFile();
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentFileIndex, uploadedFiles.length, goToPreviousFile, goToNextFile]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!currentFile) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <Card>
          <Typography.Title level={4}>No files to annotate</Typography.Title>
          <Button type="primary" onClick={() => navigate('/upload')}>
            Go to Upload
          </Button>
        </Card>
      </div>
    );
  }

  const totalBoxes = flattenedAnnotations.length;
  const currentImageBoxes = currentAnnotations.length;

  const currentImageUrl = currentFile.url || `http://localhost:8000/files/${currentFile.filename}`;

  return (
    <div style={{ padding: '20px' }}>
      {/* Screen reader announcements */}
      <div
        id="navigation-announcement"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        style={{
          position: 'absolute',
          left: '-10000px',
          width: '1px',
          height: '1px',
          overflow: 'hidden',
        }}
      />
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card>
          <Row justify="space-between" align="middle">
            <Col>
              <Space>
                <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/upload')}>
                  Back to Upload
                </Button>
                <Typography.Title level={4} style={{ margin: 0 }}>
                  Dataset {datasetId}
                </Typography.Title>
              </Space>
            </Col>
            <Col>
              <Space>
                <Typography.Text type="secondary">
                  <span aria-live="polite" aria-atomic="true">
                    File {currentFileIndex + 1} of {uploadedFiles.length} · Boxes: {currentImageBoxes}
                  </span>
                </Typography.Text>
                <Button
                  icon={<SaveOutlined />}
                  onClick={handleSaveDraft}
                  loading={isSaving}
                >
                  Save Draft
                </Button>
                <Button
                  type="primary"
                  icon={<CheckOutlined />}
                  onClick={handleSaveFinal}
                  loading={isSaving}
                  disabled={!datasetVersioningEnabled}
                >
                  Save Final Version
                </Button>
                <Button
                  icon={<HistoryOutlined />}
                  onClick={() => setHistoryOpen(true)}
                  disabled={!datasetVersioningEnabled}
                >
                  Version History
                </Button>
              </Space>
            </Col>
          </Row>
        </Card>

        <SaveBanner
          response={saveResponse}
          onViewDetails={() => setHistoryOpen(true)}
          onOpenAudit={() => setHistoryOpen(true)}
        />

        <Row gutter={16} align="stretch">
          <Col span={16}>
            <Card
              title={`Annotating: ${currentFile.filename}`}
              extra={
                <Tooltip title="Verwijder deze afbeelding en al zijn annotaties">
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    onClick={handleDeleteImage}
                    loading={isDeleting}
                    disabled={isDeleting || isSaving}
                  >
                    Verwijder afbeelding
                  </Button>
                </Tooltip>
              }
            >
              <InteractiveCanvas
                imageUrl={currentImageUrl}
                imageId={currentFile.file_id}
                onBoundingBoxCreate={handleBoundingBoxCreate}
                onBoundingBoxUpdate={handleBoundingBoxUpdate}
                onBoundingBoxDelete={handleBoundingBoxDelete}
                zoom={1}
                maxBoxes={20}
                onImageLoad={handleImageLoad}
                externalBoundingBoxes={boundingBoxesForCurrentImage}
                selectedBoundingBoxId={selectedBoxId}
                onBoundingBoxSelect={setSelectedBoxId}
              />
            </Card>
          </Col>
          <Col span={8}>
            <BoundingBoxPanel
              boundingBoxes={boundingBoxesForCurrentImage}
              imageUrl={currentImageUrl}
              onUpdateBox={handlePanelUpdate}
              onDeleteBox={handleBoundingBoxDelete}
              onSelectBox={setSelectedBoxId}
              selectedBoxId={selectedBoxId}
              validationState={{
                total: currentImageBoxes,
                complete: currentAnnotations.filter((box) => box.category && box.value).length,
                hasErrors: currentAnnotations.some((box) => !box.category || !box.value),
              }}
            />
          </Col>
        </Row>

        <Card>
          <Row justify="space-between" align="middle">
            <Col>
              <Space>
                <Button
                  onClick={goToPreviousFile}
                  disabled={currentFileIndex === 0 || isNavigating}
                  loading={isNavigating}
                  aria-label="Navigate to previous file"
                  title="Navigate to previous file (Left Arrow)"
                >
                  ← Previous File
                </Button>
                <Button
                  onClick={goToNextFile}
                  disabled={currentFileIndex === uploadedFiles.length - 1 || isNavigating}
                  loading={isNavigating}
                  aria-label="Navigate to next file"
                  title="Navigate to next file (Right Arrow)"
                >
                  Next File →
                </Button>
                <Divider type="vertical" />
                <Input
                  placeholder="Go to #"
                  value={jumpToValue}
                  onChange={(e) => setJumpToValue(e.target.value)}
                  onPressEnter={handleJumpTo}
                  style={{ width: 80 }}
                  aria-label="Jump to image number"
                  title="Enter image number to jump to"
                  type="number"
                  min={1}
                  max={uploadedFiles.length}
                  disabled={isNavigating}
                />
                <Button
                  onClick={handleJumpTo}
                  disabled={isNavigating}
                  loading={isNavigating}
                  aria-label="Jump to entered image number"
                >
                  Jump
                </Button>
                <Tooltip
                  title={
                    <div>
                      <strong>Keyboard Shortcuts:</strong>
                      <br />← Arrow: Previous image
                      <br />→ Arrow: Next image
                      <br />Enter: Jump to image (in input field)
                    </div>
                  }
                  placement="top"
                >
                  <Typography.Text type="secondary" style={{ cursor: 'help' }}>
                    <InfoCircleOutlined /> Keyboard shortcuts available
                  </Typography.Text>
                </Tooltip>
              </Space>
            </Col>
            <Col>
              <Typography.Text>
                Total annotations: <Typography.Text strong>{totalBoxes}</Typography.Text>
              </Typography.Text>
            </Col>
            <Col>
              <Button
                type="primary"
                danger
                onClick={handleFinish}
                icon={<CheckOutlined />}
                disabled={totalBoxes === 0 || isSaving || !datasetVersioningEnabled}
                loading={isSaving}
              >
                Finish & Publish
              </Button>
            </Col>
          </Row>
          {totalBoxes === 0 && (
            <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
              Add at least one bounding box before finishing the workflow.
            </Typography.Paragraph>
          )}
        </Card>

        {auditTrail.length > 0 && (
          <Card title="Recent Activity">
            <Space direction="vertical">
              {auditTrail.slice(0, 5).map((entry) => (
                <Typography.Text key={entry.id ?? entry.timestamp}>
                  {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : ''} · {entry.action}{' '}
                  {entry.note ? `— ${entry.note}` : ''}
                </Typography.Text>
              ))}
            </Space>
          </Card>
        )}
      </Space>

      <VersionHistoryDrawer
        open={isHistoryOpen}
        versions={versionHistory}
        onClose={() => setHistoryOpen(false)}
        onLoadVersion={async (versionId) => {
          if (!datasetId) return;
          const annotations = await annotationService.loadVersion(datasetId, versionId);
          applyAnnotationSet(annotations);
        }}
      />

      <ConflictResolutionModal
        open={isConflictModalOpen}
        conflicts={conflicts}
        onResolve={handleConflictResolution}
        onCancel={() => setConflictModalOpen(false)}
      />
    </div>
  );
};

export default AnnotationPage;
