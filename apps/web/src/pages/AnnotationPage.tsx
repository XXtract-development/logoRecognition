/**
 * Annotation Page
 * Epic 4: Training Annotation
 * Interactive canvas for annotating images with bounding boxes
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  Button,
  Select,
  Typography,
  message,
  Spin,
  Alert,
  Tooltip,
  Tag,
  Modal,
  Drawer,
} from 'antd';
import {
  ArrowLeftOutlined,
  SaveOutlined,
  UndoOutlined,
  RedoOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  ExpandOutlined,
  BorderOutlined,
  AimOutlined,
  DeleteOutlined,
  CheckOutlined,
  QuestionCircleOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnnotationCanvas } from '@/components/annotation/AnnotationCanvas';
import { useTrainingStore } from '@/stores/trainingStore';
import {
  fetchImages,
  fetchAnnotations,
  fetchCategories,
  createAnnotation,
  deleteAnnotation,
  smartDetect,
} from '@/services/trainingService';
import type { Annotation, AnnotationFormData } from '@/types/training.types';

const { Title, Text } = Typography;

type AnnotationTool = 'select' | 'box' | 'smart';

const AnnotationPage: React.FC = () => {
  const navigate = useNavigate();
  const { imageId } = useParams<{ imageId: string }>();
  const { t } = useTranslation();

  // Stores
  const {
    images,
    setImages,
    currentImage,
    setCurrentImage,
    annotations,
    setAnnotations,
    addAnnotation,
    removeAnnotation,
    selectedAnnotationId,
    selectAnnotation,
    categories,
    setCategories,
  } = useTrainingStore();

  // Local state
  const [loading, setLoading] = useState(true);
  const [activeTool, setActiveTool] = useState<AnnotationTool>('box');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [zoom, setZoom] = useState(100);
  const [undoStack, setUndoStack] = useState<Annotation[][]>([]);
  const [redoStack, setRedoStack] = useState<Annotation[][]>([]);
  const [showHelp, setShowHelp] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [smartDetecting, setSmartDetecting] = useState(false);

  // Load data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Load images and categories if not already loaded
        if (images.length === 0) {
          const [imagesData, categoriesData] = await Promise.all([
            fetchImages(),
            fetchCategories(),
          ]);
          setImages(imagesData);
          setCategories(categoriesData);
        } else if (categories.length === 0) {
          const categoriesData = await fetchCategories();
          setCategories(categoriesData);
        }

        // Find current image
        const img = images.find((i) => i.id === imageId);
        if (img) {
          setCurrentImage(img);
          // Load annotations for this image
          const annotationsData = await fetchAnnotations(img.id);
          setAnnotations(annotationsData);
        }

        // Set default category
        if (categories.length > 0 && !selectedCategoryId) {
          setSelectedCategoryId(categories[0].id);
        }
      } catch (error) {
        message.error(t('annotation.loadError', 'Failed to load image'));
      } finally {
        setLoading(false);
      }
    };

    if (imageId) {
      loadData();
    }
  }, [imageId, images, categories, setImages, setCategories, setCurrentImage, setAnnotations, selectedCategoryId, t]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'b':
          setActiveTool('box');
          break;
        case 'v':
          setActiveTool('select');
          break;
        case 's':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleSave();
          } else {
            setActiveTool('smart');
          }
          break;
        case 'delete':
        case 'backspace':
          if (selectedAnnotationId) {
            handleDeleteAnnotation(selectedAnnotationId);
          }
          break;
        case 'z':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.shiftKey) {
              handleRedo();
            } else {
              handleUndo();
            }
          }
          break;
        case 'escape':
          selectAnnotation(null);
          break;
        case '[':
        case 'arrowleft':
          if (!e.ctrlKey && !e.metaKey) {
            handlePrevImage();
          }
          break;
        case ']':
        case 'arrowright':
          if (!e.ctrlKey && !e.metaKey) {
            handleNextImage();
          }
          break;
        case '?':
          setShowHelp(true);
          break;
        case '+':
        case '=':
          setZoom((z) => Math.min(400, z + 25));
          break;
        case '-':
          setZoom((z) => Math.max(50, z - 25));
          break;
        case '0':
          setZoom(100);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAnnotationId, selectAnnotation]);

  // Handle box creation
  const handleBoxCreated = useCallback(
    async (box: { x: number; y: number; width: number; height: number }) => {
      if (!selectedCategoryId) {
        message.warning(t('annotation.selectCategory', 'Please select a category first'));
        return;
      }

      if (!currentImage) return;

      const category = categories.find((c) => c.id === selectedCategoryId);
      if (!category) return;

      // Save current state for undo
      setUndoStack((prev) => [...prev, annotations]);
      setRedoStack([]);

      const annotationData: AnnotationFormData = {
        categoryId: selectedCategoryId,
        type: 'bounding_box',
        boundingBox: box,
      };

      try {
        const newAnnotation = await createAnnotation(currentImage.id, annotationData);
        addAnnotation(newAnnotation);
        message.success(t('annotation.created', 'Annotation created'));
      } catch (error) {
        message.error(t('annotation.createError', 'Failed to create annotation'));
      }
    },
    [selectedCategoryId, currentImage, categories, annotations, addAnnotation, t]
  );

  // Handle smart detection
  const handleSmartClick = useCallback(
    async (x: number, y: number) => {
      if (!currentImage || !selectedCategoryId) {
        message.warning(t('annotation.selectCategory', 'Please select a category first'));
        return;
      }

      setSmartDetecting(true);
      try {
        const result = await smartDetect(currentImage.id, x, y);

        if (result.success && result.boundingBox) {
          // Show confirmation modal or auto-create
          const category = categories.find((c) => c.id === selectedCategoryId);

          Modal.confirm({
            title: t('annotation.confirmDetection', 'Confirm Detection'),
            content: (
              <div>
                <p>{t('annotation.detectedWith', 'Detected with')} {((result.confidence || 0) * 100).toFixed(0)}% {t('annotation.confidence', 'confidence')}</p>
                <p>{t('annotation.assignTo', 'Assign to')}: <Tag color={category?.color}>{category?.name}</Tag></p>
              </div>
            ),
            onOk: () => handleBoxCreated(result.boundingBox!),
            okText: t('common.accept', 'Accept'),
            cancelText: t('common.cancel', 'Cancel'),
          });
        } else {
          message.warning(t('annotation.noDetection', 'Could not detect logo boundary'));
        }
      } catch (error) {
        message.error(t('annotation.smartDetectError', 'Smart detection failed'));
      } finally {
        setSmartDetecting(false);
      }
    },
    [currentImage, selectedCategoryId, categories, handleBoxCreated, t]
  );

  // Handle delete annotation
  const handleDeleteAnnotation = useCallback(
    async (id: string) => {
      if (!currentImage) return;

      // Save current state for undo
      setUndoStack((prev) => [...prev, annotations]);
      setRedoStack([]);

      try {
        await deleteAnnotation(currentImage.id, id);
        removeAnnotation(id);
        message.success(t('annotation.deleted', 'Annotation deleted'));
      } catch (error) {
        message.error(t('annotation.deleteError', 'Failed to delete annotation'));
      }
    },
    [currentImage, annotations, removeAnnotation, t]
  );

  // Undo/Redo
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;

    const previousState = undoStack[undoStack.length - 1];
    setRedoStack((prev) => [...prev, annotations]);
    setAnnotations(previousState);
    setUndoStack((prev) => prev.slice(0, -1));
  }, [undoStack, annotations, setAnnotations]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;

    const nextState = redoStack[redoStack.length - 1];
    setUndoStack((prev) => [...prev, annotations]);
    setAnnotations(nextState);
    setRedoStack((prev) => prev.slice(0, -1));
  }, [redoStack, annotations, setAnnotations]);

  // Save all annotations
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      // In real app, would batch save annotations
      message.success(t('annotation.saved', 'Annotations saved'));
    } catch (error) {
      message.error(t('annotation.saveError', 'Failed to save annotations'));
    } finally {
      setIsSaving(false);
    }
  }, [t]);

  // Navigate to previous/next image
  const currentIndex = images.findIndex((i) => i.id === imageId);

  const handlePrevImage = useCallback(() => {
    if (currentIndex > 0) {
      navigate(`/training/annotate/${images[currentIndex - 1].id}`);
    }
  }, [currentIndex, images, navigate]);

  const handleNextImage = useCallback(() => {
    if (currentIndex < images.length - 1) {
      navigate(`/training/annotate/${images[currentIndex + 1].id}`);
    }
  }, [currentIndex, images, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (!currentImage) {
    return (
      <div className="min-h-screen bg-neutral-50 p-4">
        <Alert
          message={t('annotation.imageNotFound', 'Image not found')}
          type="error"
          showIcon
          action={
            <Button onClick={() => navigate('/training')}>
              {t('common.goBack', 'Go Back')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col">
      {/* Header Toolbar */}
      <div className="bg-neutral-800 border-b border-neutral-700 px-4 py-2">
        <div className="flex items-center justify-between">
          {/* Left: Back and title */}
          <div className="flex items-center gap-4">
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/training')}
              className="text-white"
            />
            <div>
              <Text className="text-white font-medium">{currentImage.originalName}</Text>
              <div className="text-neutral-400 text-sm">
                {annotations.length} {t('annotation.annotations', 'annotations')}
              </div>
            </div>
          </div>

          {/* Center: Tools */}
          <div className="flex items-center gap-2">
            <Tooltip title={`${t('annotation.selectTool', 'Select')} (V)`}>
              <Button
                type={activeTool === 'select' ? 'primary' : 'text'}
                icon={<ExpandOutlined />}
                onClick={() => setActiveTool('select')}
                className={activeTool !== 'select' ? 'text-white' : ''}
              />
            </Tooltip>
            <Tooltip title={`${t('annotation.boxTool', 'Bounding Box')} (B)`}>
              <Button
                type={activeTool === 'box' ? 'primary' : 'text'}
                icon={<BorderOutlined />}
                onClick={() => setActiveTool('box')}
                className={activeTool !== 'box' ? 'text-white' : ''}
              />
            </Tooltip>
            <Tooltip title={`${t('annotation.smartTool', 'Smart Click')} (S)`}>
              <Button
                type={activeTool === 'smart' ? 'primary' : 'text'}
                icon={<AimOutlined />}
                onClick={() => setActiveTool('smart')}
                loading={smartDetecting}
                className={activeTool !== 'smart' ? 'text-white' : ''}
              />
            </Tooltip>

            <div className="w-px h-6 bg-neutral-600 mx-2" />

            {/* Category selector */}
            <Select
              value={selectedCategoryId || undefined}
              onChange={setSelectedCategoryId}
              placeholder={t('annotation.selectCategory', 'Select category')}
              style={{ width: 180 }}
              dropdownStyle={{ backgroundColor: '#262626' }}
            >
              {categories.map((cat) => (
                <Select.Option key={cat.id} value={cat.id}>
                  <span style={{ color: cat.color }}>●</span> {cat.name}
                </Select.Option>
              ))}
            </Select>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <Tooltip title={`${t('common.undo', 'Undo')} (Ctrl+Z)`}>
              <Button
                type="text"
                icon={<UndoOutlined />}
                onClick={handleUndo}
                disabled={undoStack.length === 0}
                className="text-white"
              />
            </Tooltip>
            <Tooltip title={`${t('common.redo', 'Redo')} (Ctrl+Shift+Z)`}>
              <Button
                type="text"
                icon={<RedoOutlined />}
                onClick={handleRedo}
                disabled={redoStack.length === 0}
                className="text-white"
              />
            </Tooltip>

            <div className="w-px h-6 bg-neutral-600 mx-2" />

            {/* Zoom controls */}
            <Button
              type="text"
              icon={<ZoomOutOutlined />}
              onClick={() => setZoom((z) => Math.max(50, z - 25))}
              className="text-white"
            />
            <span className="text-white text-sm w-12 text-center">{zoom}%</span>
            <Button
              type="text"
              icon={<ZoomInOutlined />}
              onClick={() => setZoom((z) => Math.min(400, z + 25))}
              className="text-white"
            />

            <div className="w-px h-6 bg-neutral-600 mx-2" />

            <Tooltip title={t('annotation.help', 'Keyboard Shortcuts')}>
              <Button
                type="text"
                icon={<QuestionCircleOutlined />}
                onClick={() => setShowHelp(true)}
                className="text-white"
              />
            </Tooltip>

            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={isSaving}
            >
              {t('common.save', 'Save')}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas */}
        <div className="flex-1 relative overflow-auto bg-neutral-800 flex items-center justify-center">
          <AnnotationCanvas
            image={currentImage}
            annotations={annotations}
            selectedAnnotationId={selectedAnnotationId}
            activeTool={activeTool}
            zoom={zoom}
            selectedCategory={categories.find((c) => c.id === selectedCategoryId)}
            onBoxCreated={handleBoxCreated}
            onSmartClick={handleSmartClick}
            onAnnotationSelect={selectAnnotation}
          />
        </div>

        {/* Right Sidebar - Annotations List */}
        <div className="w-64 bg-neutral-800 border-l border-neutral-700 overflow-y-auto">
          <div className="p-3 border-b border-neutral-700">
            <Text className="text-white font-medium">
              {t('annotation.annotations', 'Annotations')} ({annotations.length})
            </Text>
          </div>
          <div className="p-2">
            {annotations.length === 0 ? (
              <Text className="text-neutral-400 text-sm block text-center py-8">
                {t('annotation.noAnnotations', 'No annotations yet')}
              </Text>
            ) : (
              <div className="space-y-2">
                {annotations.map((ann) => (
                  <div
                    key={ann.id}
                    className={`p-2 rounded cursor-pointer transition-colors ${
                      selectedAnnotationId === ann.id
                        ? 'bg-blue-600/30 border border-blue-500'
                        : 'bg-neutral-700 hover:bg-neutral-600'
                    }`}
                    onClick={() => selectAnnotation(ann.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: categories.find((c) => c.id === ann.categoryId)?.color || '#888' }}
                        />
                        <Text className="text-white text-sm">{ann.categoryName}</Text>
                      </div>
                      <Button
                        type="text"
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAnnotation(ann.id);
                        }}
                        className="text-neutral-400 hover:text-red-500"
                      />
                    </div>
                    {ann.validated && (
                      <Tag color="green" className="mt-1" icon={<CheckOutlined />}>
                        {t('annotation.validated', 'Validated')}
                      </Tag>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="bg-neutral-800 border-t border-neutral-700 px-4 py-2">
        <div className="flex items-center justify-between">
          <Button
            icon={<LeftOutlined />}
            onClick={handlePrevImage}
            disabled={currentIndex <= 0}
          >
            {t('annotation.previous', 'Previous')}
          </Button>
          <Text className="text-neutral-400">
            {currentIndex + 1} / {images.length}
          </Text>
          <Button
            icon={<RightOutlined />}
            onClick={handleNextImage}
            disabled={currentIndex >= images.length - 1}
          >
            {t('annotation.next', 'Next')}
          </Button>
        </div>
      </div>

      {/* Help Drawer */}
      <Drawer
        title={t('annotation.keyboardShortcuts', 'Keyboard Shortcuts')}
        open={showHelp}
        onClose={() => setShowHelp(false)}
        placement="right"
      >
        <div className="space-y-4">
          <div>
            <Title level={5}>{t('annotation.tools', 'Tools')}</Title>
            <table className="w-full text-sm">
              <tbody>
                <tr><td className="py-1"><code>B</code></td><td>{t('annotation.boxTool', 'Bounding Box')}</td></tr>
                <tr><td className="py-1"><code>S</code></td><td>{t('annotation.smartTool', 'Smart Click')}</td></tr>
                <tr><td className="py-1"><code>V</code></td><td>{t('annotation.selectTool', 'Select')}</td></tr>
              </tbody>
            </table>
          </div>
          <div>
            <Title level={5}>{t('annotation.actions', 'Actions')}</Title>
            <table className="w-full text-sm">
              <tbody>
                <tr><td className="py-1"><code>Ctrl+S</code></td><td>{t('common.save', 'Save')}</td></tr>
                <tr><td className="py-1"><code>Ctrl+Z</code></td><td>{t('common.undo', 'Undo')}</td></tr>
                <tr><td className="py-1"><code>Ctrl+Shift+Z</code></td><td>{t('common.redo', 'Redo')}</td></tr>
                <tr><td className="py-1"><code>Delete</code></td><td>{t('annotation.deleteSelected', 'Delete Selected')}</td></tr>
                <tr><td className="py-1"><code>Escape</code></td><td>{t('annotation.deselect', 'Deselect')}</td></tr>
              </tbody>
            </table>
          </div>
          <div>
            <Title level={5}>{t('annotation.navigation', 'Navigation')}</Title>
            <table className="w-full text-sm">
              <tbody>
                <tr><td className="py-1"><code>[</code> / <code>←</code></td><td>{t('annotation.previous', 'Previous Image')}</td></tr>
                <tr><td className="py-1"><code>]</code> / <code>→</code></td><td>{t('annotation.next', 'Next Image')}</td></tr>
                <tr><td className="py-1"><code>+</code> / <code>-</code></td><td>{t('annotation.zoom', 'Zoom In/Out')}</td></tr>
                <tr><td className="py-1"><code>0</code></td><td>{t('annotation.resetZoom', 'Reset Zoom')}</td></tr>
                <tr><td className="py-1"><code>Space + Drag</code></td><td>{t('annotation.pan', 'Pan')}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </Drawer>
    </div>
  );
};

export default AnnotationPage;
