/**
 * Image Library Component
 * Epic 2.3: Display and browse uploaded images with filtering and sorting
 */
import React, { useMemo, useCallback } from 'react';
import {
  Card,
  Input,
  Select,
  Button,
  Row,
  Col,
  Checkbox,
  Tag,
  Empty,
  Spin,
  Tooltip,
  Pagination,
} from 'antd';
import {
  AppstoreOutlined,
  UnorderedListOutlined,
  SearchOutlined,
  FilterOutlined,
  SortAscendingOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useTrainingStore } from '@/stores/trainingStore';
import { setImageHoldout } from '@/services/trainingService';
import type { TrainingImage, ImageFilters, ImageSort } from '@/types/training.types';

const { Search } = Input;

interface ImageLibraryProps {
  images: TrainingImage[];
  loading?: boolean;
  onImageClick?: (image: TrainingImage) => void;
}

export const ImageLibrary: React.FC<ImageLibraryProps> = ({
  images,
  loading = false,
  onImageClick,
}) => {
  const { t } = useTranslation();
  const {
    selectedImageIds,
    toggleImageSelection,
    selectAllImages,
    clearSelection,
    viewMode,
    setViewMode,
    filters,
    setFilters,
    sort,
    setSort,
    categories,
    updateImage,
  } = useTrainingStore();

  // Toggle holdout status for an image (Epic 7, Story 7.1).
  const handleToggleHoldout = useCallback(
    async (image: TrainingImage) => {
      const next = !image.holdout;
      // Optimistic update so the badge reflects the new state immediately.
      updateImage(image.id, { holdout: next });
      try {
        await setImageHoldout(image.id, next);
      } catch {
        // Revert on failure.
        updateImage(image.id, { holdout: !next });
      }
    },
    [updateImage]
  );

  const [currentPage, setCurrentPage] = React.useState(1);
  const pageSize = viewMode === 'grid' ? 24 : 10;

  // Filter and sort images
  const filteredImages = useMemo(() => {
    let result = [...images];

    // Apply filters
    if (filters.status) {
      result = result.filter((img) => img.annotationStatus === filters.status);
    }
    if (filters.categoryId) {
      result = result.filter((img) => img.categoryId === filters.categoryId);
    }
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter((img) =>
        img.originalName.toLowerCase().includes(searchLower)
      );
    }

    // Apply sort
    result.sort((a, b) => {
      const aVal = a[sort.field];
      const bVal = b[sort.field];
      const modifier = sort.order === 'asc' ? 1 : -1;

      if (aVal instanceof Date && bVal instanceof Date) {
        return (aVal.getTime() - bVal.getTime()) * modifier;
      }
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.localeCompare(bVal) * modifier;
      }
      if (aVal < bVal) return -1 * modifier;
      if (aVal > bVal) return 1 * modifier;
      return 0;
    });

    return result;
  }, [images, filters, sort]);

  // Paginate
  const paginatedImages = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredImages.slice(start, start + pageSize);
  }, [filteredImages, currentPage, pageSize]);

  // Handle search
  const handleSearch = useCallback(
    (value: string) => {
      setFilters({ ...filters, search: value || undefined });
      setCurrentPage(1);
    },
    [filters, setFilters]
  );

  // Handle status filter
  const handleStatusFilter = useCallback(
    (value: string | undefined) => {
      setFilters({ ...filters, status: value as ImageFilters['status'] });
      setCurrentPage(1);
    },
    [filters, setFilters]
  );

  // Handle category filter
  const handleCategoryFilter = useCallback(
    (value: string | undefined) => {
      setFilters({ ...filters, categoryId: value });
      setCurrentPage(1);
    },
    [filters, setFilters]
  );

  // Handle sort change
  const handleSortChange = useCallback(
    (value: string) => {
      const [field, order] = value.split('-') as [ImageSort['field'], ImageSort['order']];
      setSort({ field, order });
    },
    [setSort]
  );

  // Get status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'complete':
        return 'green';
      case 'partial':
        return 'orange';
      default:
        return 'default';
    }
  };

  // Format file size — guard against missing/NaN sizes so library cards never
  // render "NaN MB" (Epic 8, Story 8.6 hardening).
  const formatSize = (bytes?: number) => {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes)) {
      return t('training.sizeUnknown', { defaultValue: '—' });
    }
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Format date — the API exposes `createdAt`; older callers expect
  // `uploadedAt`. Accept either and guard against invalid values so cards never
  // render "Invalid Date" (Epic 8, Story 8.6 hardening).
  const formatDate = (image: TrainingImage) => {
    const raw = image.uploadedAt ?? image.createdAt;
    if (!raw) return t('training.dateUnknown', { defaultValue: '—' });
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return t('training.dateUnknown', { defaultValue: '—' });
    }
    return parsed.toLocaleDateString();
  };

  // Render grid item
  const renderGridItem = (image: TrainingImage) => {
    const isSelected = selectedImageIds.includes(image.id);

    return (
      <Col xs={12} sm={8} md={6} lg={4} key={image.id}>
        <Card
          hoverable
          data-testid="image-card"
          data-image-id={image.id}
          className={`image-card ${isSelected ? 'selected ring-2 ring-blue-500' : ''}`}
          cover={
            <div className="relative aspect-video overflow-hidden bg-neutral-100">
              <img
                src={image.thumbnailUrl}
                alt={image.originalName}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <Checkbox
                className="absolute top-2 left-2"
                checked={isSelected}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggleImageSelection(image.id)}
              />
              <Tag
                color={getStatusColor(image.annotationStatus)}
                className="absolute top-2 right-2"
              >
                {image.annotationCount > 0 ? image.annotationCount : '-'}
              </Tag>
              {image.holdout && (
                <Tag
                  data-testid="holdout-badge"
                  color="#2F5A7A"
                  className="absolute bottom-2 left-2"
                >
                  {t('training.holdout', 'Holdout')}
                </Tag>
              )}
            </div>
          }
          onClick={() => onImageClick?.(image)}
          styles={{ body: { padding: '8px' } }}
        >
          <Tooltip title={image.originalName}>
            <div className="truncate text-sm font-medium">{image.originalName}</div>
          </Tooltip>
          <div className="text-xs text-gray-500 mt-1">
            {formatSize(image.size)} • {formatDate(image)}
          </div>
          {image.categoryName && (
            <Tag className="mt-1" style={{ fontSize: '10px' }}>
              {image.categoryName}
            </Tag>
          )}
          <Button
            data-testid="holdout-toggle"
            size="small"
            className="mt-2"
            type={image.holdout ? 'primary' : 'default'}
            onClick={(e) => {
              e.stopPropagation();
              handleToggleHoldout(image);
            }}
          >
            {image.holdout
              ? t('training.removeFromHoldout', 'Remove from holdout')
              : t('training.markAsHoldout', 'Mark as holdout')}
          </Button>
        </Card>
      </Col>
    );
  };

  // Render list item
  const renderListItem = (image: TrainingImage) => {
    const isSelected = selectedImageIds.includes(image.id);

    return (
      <div
        key={image.id}
        className={`flex items-center gap-4 p-3 border-b hover:bg-neutral-50 cursor-pointer ${
          isSelected ? 'bg-blue-50' : ''
        }`}
        onClick={() => onImageClick?.(image)}
      >
        <Checkbox
          checked={isSelected}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggleImageSelection(image.id)}
        />
        <img
          src={image.thumbnailUrl}
          alt={image.originalName}
          className="w-16 h-12 object-cover rounded"
        />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{image.originalName}</div>
          <div className="text-sm text-gray-500">
            {formatSize(image.size)} • {formatDate(image)}
          </div>
        </div>
        {image.categoryName && <Tag>{image.categoryName}</Tag>}
        <Tag color={getStatusColor(image.annotationStatus)}>
          {image.annotationStatus === 'complete'
            ? t('training.complete', 'Complete')
            : image.annotationStatus === 'partial'
            ? t('training.partial', 'Partial')
            : t('training.notAnnotated', 'Not Annotated')}
        </Tag>
        <div className="text-sm text-gray-500">
          {image.annotationCount} {t('training.annotations', 'annotations')}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="image-library">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <Search
          placeholder={t('training.searchImages', 'Search images...')}
          allowClear
          onSearch={handleSearch}
          onChange={(e) => !e.target.value && handleSearch('')}
          style={{ width: 250 }}
          prefix={<SearchOutlined />}
        />

        <Select
          placeholder={t('training.filterByStatus', 'Filter by status')}
          allowClear
          onChange={handleStatusFilter}
          style={{ width: 150 }}
          suffixIcon={<FilterOutlined />}
        >
          <Select.Option value="none">{t('training.notAnnotated', 'Not Annotated')}</Select.Option>
          <Select.Option value="partial">{t('training.partial', 'Partial')}</Select.Option>
          <Select.Option value="complete">{t('training.complete', 'Complete')}</Select.Option>
        </Select>

        <Select
          placeholder={t('training.filterByCategory', 'Filter by category')}
          allowClear
          onChange={handleCategoryFilter}
          style={{ width: 180 }}
        >
          {categories.map((cat) => (
            <Select.Option key={cat.id} value={cat.id}>
              <span style={{ color: cat.color }}>●</span> {cat.name}
            </Select.Option>
          ))}
        </Select>

        <Select
          value={`${sort.field}-${sort.order}`}
          onChange={handleSortChange}
          style={{ width: 180 }}
          suffixIcon={<SortAscendingOutlined />}
        >
          <Select.Option value="uploadedAt-desc">{t('training.newestFirst', 'Newest First')}</Select.Option>
          <Select.Option value="uploadedAt-asc">{t('training.oldestFirst', 'Oldest First')}</Select.Option>
          <Select.Option value="filename-asc">{t('training.nameAZ', 'Name A-Z')}</Select.Option>
          <Select.Option value="filename-desc">{t('training.nameZA', 'Name Z-A')}</Select.Option>
          <Select.Option value="size-desc">{t('training.largestFirst', 'Largest First')}</Select.Option>
          <Select.Option value="size-asc">{t('training.smallestFirst', 'Smallest First')}</Select.Option>
        </Select>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          {selectedImageIds.length > 0 && (
            <Button size="small" onClick={clearSelection}>
              {t('training.clearSelection', 'Clear')} ({selectedImageIds.length})
            </Button>
          )}
          {filteredImages.length > 0 && (
            <Button
              size="small"
              onClick={() =>
                selectedImageIds.length === filteredImages.length
                  ? clearSelection()
                  : selectAllImages()
              }
            >
              {selectedImageIds.length === filteredImages.length
                ? t('training.deselectAll', 'Deselect All')
                : t('training.selectAll', 'Select All')}
            </Button>
          )}
        </div>

        <Button.Group>
          <Button
            type={viewMode === 'grid' ? 'primary' : 'default'}
            icon={<AppstoreOutlined />}
            onClick={() => setViewMode('grid')}
          />
          <Button
            type={viewMode === 'list' ? 'primary' : 'default'}
            icon={<UnorderedListOutlined />}
            onClick={() => setViewMode('list')}
          />
        </Button.Group>
      </div>

      {/* Results count */}
      <div className="text-sm text-gray-500 mb-3">
        {t('training.showingImages', 'Showing')} {paginatedImages.length} {t('common.of', 'of')}{' '}
        {filteredImages.length} {t('training.images', 'images')}
      </div>

      {/* Content */}
      {filteredImages.length === 0 ? (
        <Empty
          description={
            filters.search || filters.status || filters.categoryId
              ? t('training.noMatchingImages', 'No images match your filters')
              : t('training.noImages', 'No images uploaded yet')
          }
        />
      ) : viewMode === 'grid' ? (
        <Row gutter={[12, 12]}>{paginatedImages.map(renderGridItem)}</Row>
      ) : (
        <div className="border rounded">{paginatedImages.map(renderListItem)}</div>
      )}

      {/* Pagination */}
      {filteredImages.length > pageSize && (
        <div className="flex justify-center mt-4">
          <Pagination
            current={currentPage}
            total={filteredImages.length}
            pageSize={pageSize}
            onChange={setCurrentPage}
            showSizeChanger={false}
            showQuickJumper
          />
        </div>
      )}
    </div>
  );
};

ImageLibrary.displayName = 'ImageLibrary';
