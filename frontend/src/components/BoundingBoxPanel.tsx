import React, { useState, useEffect, useRef } from 'react';
import { Card, Select, Button, Space, Tag, Tooltip, Empty, Progress } from 'antd';
import { DeleteOutlined, EditOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { BoundingBox, CanvasSize } from '../types/canvas';
import useCategoryStore from '../stores/categoryStore';
import './BoundingBoxPanel.css';

interface BoundingBoxPanelProps {
  boundingBoxes: BoundingBox[];
  imageUrl: string;
  imageElement?: HTMLImageElement | null;
  imageDimensions?: CanvasSize | null;
  onUpdateBox: (id: string, updates: Partial<BoundingBox>) => void;
  onDeleteBox: (id: string) => void;
  onSelectBox: (id: string) => void;
  selectedBoxId?: string | null;
  validationState?: {
    total: number;
    complete: number;
    hasErrors: boolean;
  };
}

const BoundingBoxPanel: React.FC<BoundingBoxPanelProps> = ({
  boundingBoxes,
  imageUrl,
  imageElement,
  imageDimensions,
  onUpdateBox,
  onDeleteBox,
  onSelectBox,
  selectedBoxId,
  validationState
}) => {
  const [editingBox, setEditingBox] = useState<string | null>(null);
  const [tempValues, setTempValues] = useState<{ [key: string]: { category?: string; value?: string } }>({});
  const canvasRefs = useRef<{ [key: string]: HTMLCanvasElement | null }>({});
  const [localImage, setLocalImage] = useState<HTMLImageElement | null>(null);
  const previousBoxIdsRef = useRef<string[]>([]);
  const [autoFocusBoxId, setAutoFocusBoxId] = useState<string | null>(null);
  const editContainerRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const [recentlySavedBoxId, setRecentlySavedBoxId] = useState<string | null>(null);
  const saveIndicatorTimeout = useRef<number | null>(null);

  // Get categories from store
  const { categories, fetchAllCategories, loading: categoriesLoading } = useCategoryStore();

  // Fetch ALL categories on mount (no pagination limits for dropdown selection)
  useEffect(() => {
    fetchAllCategories();
  }, [fetchAllCategories]);

  // Log when categories are loaded for debugging
  useEffect(() => {
    if (categories.length > 0) {
      console.log('📦 BoundingBoxPanel: Categories loaded:', categories.length);
      console.log('📦 First 5 categories:', categories.slice(0, 5).map(c => c.categorie));
    }
  }, [categories]);

  // Load image locally in the panel if not provided
  useEffect(() => {
    if (!imageElement && imageUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        setLocalImage(img);
      };

      img.onerror = () => {
        // Try without crossOrigin as fallback
        const imgFallback = new Image();
        imgFallback.onload = () => {
          setLocalImage(imgFallback);
        };
        imgFallback.src = imageUrl;
      };

      img.src = imageUrl;
    } else if (imageElement) {
      setLocalImage(imageElement);
    }
  }, [imageElement, imageUrl]);

  // Extract and draw logo preview for each bounding box
  useEffect(() => {
    const imgToUse = localImage || imageElement;

    if (!imgToUse || boundingBoxes.length === 0) {
      return;
    }

    const drawPreviews = () => {
      const naturalWidth = imgToUse.naturalWidth || imgToUse.width;
      const naturalHeight = imgToUse.naturalHeight || imgToUse.height;

      if (!naturalWidth || !naturalHeight) {
        return;
      }

      boundingBoxes.forEach(box => {
        const canvas = canvasRefs.current[box.id];
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Box coordinates are in CANVAS/DISPLAY pixels
        // We need to map them to NATURAL image pixels for cropping
        const boxImageWidth = box.imageWidth || imageDimensions?.width || naturalWidth;
        const boxImageHeight = box.imageHeight || imageDimensions?.height || naturalHeight;

        // Calculate scale: how many natural pixels per canvas pixel
        const scaleX = naturalWidth / boxImageWidth;
        const scaleY = naturalHeight / boxImageHeight;

        console.log('Preview debug:', {
          boxId: box.id,
          boxCoords: { x: box.x, y: box.y, width: box.width, height: box.height },
          canvas: { width: boxImageWidth, height: boxImageHeight },
          natural: { width: naturalWidth, height: naturalHeight },
          scale: { x: scaleX, y: scaleY },
          cropArea: {
            x: Math.round(box.x * scaleX),
            y: Math.round(box.y * scaleY),
            width: Math.round(box.width * scaleX),
            height: Math.round(box.height * scaleY)
          }
        });

        // Set canvas size to match the bounding box aspect ratio
        const maxWidth = 150;
        const maxHeight = 100;
        const scale = Math.min(maxWidth / box.width, maxHeight / box.height);
        const canvasWidth = Math.floor(box.width * scale);
        const canvasHeight = Math.floor(box.height * scale);

        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        // Clear canvas first
        ctx.fillStyle = '#f5f5f5';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw the cropped image
        try {
          const sourceX = Math.max(0, Math.round(box.x * scaleX));
          const sourceY = Math.max(0, Math.round(box.y * scaleY));
          const sourceWidth = Math.max(1, Math.round(box.width * scaleX));
          const sourceHeight = Math.max(1, Math.round(box.height * scaleY));

          const clampedWidth = Math.min(sourceWidth, naturalWidth - sourceX);
          const clampedHeight = Math.min(sourceHeight, naturalHeight - sourceY);

          if (clampedWidth <= 0 || clampedHeight <= 0) {
            return;
          }

          ctx.drawImage(
            imgToUse,
            sourceX,
            sourceY,
            clampedWidth,
            clampedHeight,
            0,
            0,
            canvasWidth,
            canvasHeight
          );
        } catch (error) {
          console.error(`Error drawing preview for box ${box.id}:`, error);
        }
      });
    };

    // Wait for image to be fully loaded
    if (!imgToUse.complete || imgToUse.naturalWidth === 0) {
      const handleLoad = () => {
        drawPreviews();
      };
      imgToUse.addEventListener('load', handleLoad);
      return () => {
        imgToUse.removeEventListener('load', handleLoad);
      };
    } else {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(drawPreviews);
    }
  }, [boundingBoxes, imageDimensions, imageElement, localImage, imageUrl]);

  // Automatically open edit mode when a new bounding box is added
  // Keep ALL incomplete boxes in edit mode
  useEffect(() => {
    const previousIds = previousBoxIdsRef.current;
    const currentIds = boundingBoxes.map(box => box.id);

    const newBoxes = boundingBoxes.filter(box => !previousIds.includes(box.id));

    if (newBoxes.length > 0) {
      const latestBox = newBoxes[newBoxes.length - 1];

      // Only change editing box to the latest if no box is currently being edited
      // OR if the currently editing box is now complete
      const currentEditingBox = boundingBoxes.find(b => b.id === editingBox);
      const isCurrentComplete = currentEditingBox?.category && currentEditingBox?.value;

      if (!editingBox || isCurrentComplete) {
        setEditingBox(latestBox.id);
        setAutoFocusBoxId(latestBox.id);
      }

      // Initialize temp values for the new box
      setTempValues(prev => ({
        ...prev,
        [latestBox.id]: {
          category: latestBox.category || '',
          value: latestBox.value || ''
        }
      }));
    }

    previousBoxIdsRef.current = currentIds;
  }, [boundingBoxes, editingBox]);

  // Clear auto-focus tracking once focus target changes
  useEffect(() => {
    if (autoFocusBoxId && editingBox !== autoFocusBoxId) {
      setAutoFocusBoxId(null);
    }
  }, [autoFocusBoxId, editingBox]);

  useEffect(() => {
    return () => {
      if (saveIndicatorTimeout.current) {
        window.clearTimeout(saveIndicatorTimeout.current);
      }
    };
  }, []);

  const handleEdit = (boxId: string) => {
    setEditingBox(boxId);
    const box = boundingBoxes.find(b => b.id === boxId);
    if (box) {
      setTempValues({
        ...tempValues,
        [boxId]: {
          category: box.category || '',
          value: box.value || ''
        }
      });
    }
    setAutoFocusBoxId(boxId);
  };

  const handleSave = (boxId: string) => {
    const values = tempValues[boxId] || {};
    const trimmedCategory = values.category?.trim();
    const trimmedValue = values.value?.trim();

    if (!trimmedCategory || !trimmedValue) {
      return;
    }

    onUpdateBox(boxId, {
      category: trimmedCategory,
      value: trimmedValue
    });

    // Only clear editing state if this was the explicitly edited box
    if (editingBox === boxId) {
      setEditingBox(null);
      setAutoFocusBoxId(null);
    }

    // Remove from temp values after successful save
    const updatedValues = { ...tempValues };
    delete updatedValues[boxId];
    setTempValues(updatedValues);

    if (saveIndicatorTimeout.current) {
      window.clearTimeout(saveIndicatorTimeout.current);
    }
    setRecentlySavedBoxId(boxId);
    saveIndicatorTimeout.current = window.setTimeout(() => {
      setRecentlySavedBoxId(null);
    }, 2000);
  };

  const handleCancel = (boxId: string) => {
    // Clear editing state only if this was the explicitly edited box
    if (editingBox === boxId) {
      setEditingBox(null);
      setAutoFocusBoxId(null);
    }

    // Revert temp values back to box values
    const box = boundingBoxes.find(b => b.id === boxId);
    if (box) {
      setTempValues(prev => ({
        ...prev,
        [boxId]: {
          category: box.category || '',
          value: box.value || ''
        }
      }));
    }
  };

  const handleCategoryChange = (boxId: string, value: string) => {
    setTempValues({
      ...tempValues,
      [boxId]: {
        ...tempValues[boxId],
        category: value
      }
    });
  };

  const handleValueChange = (boxId: string, value: string) => {
    setTempValues({
      ...tempValues,
      [boxId]: {
        ...tempValues[boxId],
        value: value
      }
    });
  };

  const handleFieldBlur = (boxId: string) => {
    window.setTimeout(() => {
      const container = editContainerRefs.current[boxId];
      if (!container) return;

      const activeElement = document.activeElement as HTMLElement | null;
      if (activeElement && container.contains(activeElement)) {
        return;
      }

      const values = tempValues[boxId];
      const hasCategory = values?.category?.trim();
      const hasValue = values?.value?.trim();

      // Only auto-save if both fields are filled
      // If fields are empty, keep edit mode open (don't close it)
      if (hasCategory && hasValue) {
        handleSave(boxId);
      }
      // Don't close edit mode if fields are incomplete - let user fill them in
    }, 0);
  };

  // Get unique category options with format: "Categorie Naam (CATEGORIE_CODE)"
  const getUniqueCategoryOptions = () => {
    const uniqueCategories = Array.from(
      new Set(categories.map(cat => cat.categorie))
    );

    console.log('📊 Unique categories for dropdown:', uniqueCategories.length);

    return uniqueCategories.map(categorie => {
      // Find one category with this categorie value to get the naam
      const categoryData = categories.find(cat => cat.categorie === categorie);

      // Format: "Categorie Naam (CATEGORIE_CODE)" or just "CATEGORIE_CODE" if no naam
      const label = categoryData?.categorie_naam
        ? `${categoryData.categorie_naam} (${categorie})`
        : categorie;

      return {
        value: categorie,
        label: label
      };
    });
  };

  // Get code options for a selected category with format: "Code Naam (CODE)"
  const getCodeOptionsForCategory = (selectedCategory: string) => {
    if (!selectedCategory) {
      return [];
    }

    const matchingCategories = categories.filter(
      cat => cat.categorie === selectedCategory
    );

    return matchingCategories.map(cat => {
      // Format: "Code Naam (CODE)" or just "CODE" if no naam
      const label = cat.code_naam
        ? `${cat.code_naam} (${cat.code})`
        : cat.code;

      return {
        value: cat.code,
        label: label
      };
    });
  };

  const getBoxCompletion = (box: BoundingBox) => {
    const category = box.category ? box.category.trim() : '';
    const value = box.value ? box.value.trim() : '';
    return Boolean(category && value);
  };

  const totalBoxes = boundingBoxes.length;
  const completedBoxes = boundingBoxes.filter(getBoxCompletion).length;
  const progressPercent = totalBoxes === 0 ? 100 : Math.round((completedBoxes / totalBoxes) * 100);

  const displayValidation = validationState ?? {
    total: totalBoxes,
    complete: completedBoxes,
    hasErrors: totalBoxes > 0 && completedBoxes !== totalBoxes
  };

  if (boundingBoxes.length === 0) {
    return (
      <Card className="bounding-box-panel" title="📦 Bounding Boxes">
        <Empty
          description="No bounding boxes created yet"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <p style={{ color: '#999', fontSize: '12px' }}>
            Click and drag on the image to create bounding boxes
          </p>
        </Empty>
      </Card>
    );
  }

  return (
    <Card
      className="bounding-box-panel"
      title={`📦 Bounding Boxes (${boundingBoxes.length})`}
      styles={{ body: { padding: '12px' } }}
    >
      <div style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: '#555' }}>
            Categorized {displayValidation.complete} of {displayValidation.total}
          </span>
          {displayValidation.hasErrors && (
            <span style={{ color: '#fa8c16', fontSize: '12px' }}>
              ⚠️ Complete all boxes to continue
            </span>
          )}
        </div>
        <Progress
          percent={progressPercent}
          size="small"
          status={displayValidation.hasErrors ? 'exception' : 'normal'}
          showInfo={false}
          style={{ marginTop: '6px' }}
        />
      </div>
      <div className="box-list">
        {boundingBoxes.map((box, index) => {
          const isComplete = getBoxCompletion(box);
          const isSelected = selectedBoxId === box.id;

          // Show in edit mode if:
          // 1. Explicitly being edited (editingBox === box.id)
          // 2. OR box is incomplete (no category or value)
          const isEditing = editingBox === box.id || !isComplete;

          const values = tempValues[box.id] || {
            category: box.category || '',
            value: box.value || ''
          };

          return (
            <Card
              key={box.id}
              className={`box-item ${isSelected ? 'selected' : ''} ${isComplete ? '' : 'incomplete'}`}
              size="small"
              onClick={() => !isEditing && onSelectBox(box.id)}
              style={{
                marginBottom: '12px',
                border: isSelected ? '2px solid #1890ff' : '1px solid #d9d9d9',
                cursor: isEditing ? 'default' : 'pointer'
              }}
            >
              <div className="box-content">
                {/* Logo Preview */}
                <div className="logo-preview">
                  <canvas
                    key={`canvas-${box.id}`}
                    ref={el => {
                      // Always update ref to ensure we have the current canvas element
                      // This is important when navigating between images
                      canvasRefs.current[box.id] = el;
                    }}
                    className="preview-canvas"
                    style={{
                      border: '1px solid #d9d9d9',
                      borderRadius: '4px',
                      maxWidth: '150px',
                      maxHeight: '100px',
                      backgroundColor: '#f5f5f5',
                      display: 'block',
                      imageRendering: 'crisp-edges'
                    }}
                  />
                  <div className="box-number">#{index + 1}</div>
                </div>

                {/* Box Details */}
                <div className="box-details">
                  {isEditing ? (
                    <div
                      ref={(el) => {
                        editContainerRefs.current[box.id] = el;
                      }}
                    >
                      <Space
                        direction="vertical"
                        style={{ width: '100%' }}
                        size="small"
                      >
                        <Select
                          autoFocus={autoFocusBoxId === box.id}
                          value={values?.category || undefined}
                          options={getUniqueCategoryOptions()}
                          onChange={(value) => {
                            setTempValues({
                              ...tempValues,
                              [box.id]: {
                                category: value,
                                value: '' // Clear code when category changes
                              }
                            });
                          }}
                          placeholder="Selecteer categorie"
                          style={{ width: '100%' }}
                          onBlur={() => handleFieldBlur(box.id)}
                          showSearch
                          filterOption={(input, option) =>
                            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                          }
                          loading={categoriesLoading}
                          disabled={categoriesLoading}
                        />
                        <Select
                          value={values?.value || undefined}
                          options={getCodeOptionsForCategory(values?.category || '')}
                          onChange={(value) => handleValueChange(box.id, value)}
                          placeholder={values?.category ? 'Selecteer code' : 'Selecteer eerst een categorie'}
                          style={{ width: '100%' }}
                          onBlur={() => handleFieldBlur(box.id)}
                          showSearch
                          filterOption={(input, option) =>
                            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                          }
                          disabled={!values?.category || categoriesLoading}
                          notFoundContent={
                            values?.category
                              ? 'Geen codes gevonden voor deze categorie'
                              : 'Selecteer eerst een categorie'
                          }
                        />
                      </Space>
                    </div>
                  ) : (
                    <>
                      <div className="box-info">
                        <Tag color={box.color}>
                          {box.category || 'Uncategorized'}
                        </Tag>
                        {box.value && (
                          <span className="box-value">
                            Value: <strong>{box.value}</strong>
                          </span>
                        )}
                        {recentlySavedBoxId === box.id && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', color: '#52c41a', fontSize: '12px' }}>
                            <CheckOutlined style={{ marginLeft: '8px' }} />
                          </span>
                        )}
                        {!isComplete && (
                          <span style={{ marginLeft: '8px', color: '#fa8c16', fontSize: '12px' }}>
                            Missing category or value
                          </span>
                        )}
                      </div>
                      <div className="box-coords">
                        <span style={{ fontSize: '11px', color: '#999' }}>
                          Position: ({Math.round(box.x)}, {Math.round(box.y)}) |
                          Size: {Math.round(box.width)}×{Math.round(box.height)}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Actions */}
                <div className="box-actions">
                  {isEditing ? (
                    <Space>
                      <Tooltip title="Cancel">
                        <Button
                          size="small"
                          icon={<CloseOutlined />}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancel(box.id);
                          }}
                        />
                      </Tooltip>
                    </Space>
                  ) : (
                    <Space>
                      <Tooltip title="Edit">
                        <Button
                          size="small"
                          icon={<EditOutlined />}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(box.id);
                          }}
                        />
                      </Tooltip>
                      <Tooltip title="Delete">
                        <Button
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteBox(box.id);
                          }}
                        />
                      </Tooltip>
                    </Space>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </Card>
  );
};

export default BoundingBoxPanel;
