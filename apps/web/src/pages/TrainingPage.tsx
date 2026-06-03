/**
 * Training Page
 * Epic 2: Image Upload & Management
 * Main page for uploading, viewing, and managing training images
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  Card,
  Typography,
  Tabs,
  Button,
  Space,
  message,
  Modal,
  Select,
  Progress,
  Alert,
} from 'antd';
import {
  UploadOutlined,
  FolderOutlined,
  TagsOutlined,
  DeleteOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ImageLibrary } from '@/components/training/ImageLibrary';
import { BatchUploader } from '@/components/training/BatchUploader';
import { CategoryManager } from '@/components/training/CategoryManager';
import { useTrainingStore } from '@/stores/trainingStore';
import {
  fetchImages,
  fetchCategories,
  deleteImages,
  assignImagesToCategory,
} from '@/services/trainingService';
import type { TrainingImage } from '@/types/training.types';

const { Title, Text } = Typography;

const TrainingPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('library');
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [selectedCategoryForAssign, setSelectedCategoryForAssign] = useState<string>('');
  const [batchPickerVisible, setBatchPickerVisible] = useState(false);

  const {
    images,
    setImages,
    selectedImageIds,
    clearSelection,
    categories,
    setCategories,
    isLoading,
    setLoading,
    uploadProgress,
    isUploading,
  } = useTrainingStore();

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [imagesData, categoriesData] = await Promise.all([
          fetchImages(),
          fetchCategories(),
        ]);
        setImages(imagesData);
        setCategories(categoriesData);
      } catch (error) {
        message.error(t('training.loadError', 'Failed to load data'));
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [setImages, setCategories, setLoading, t]);

  // Handle bulk delete
  const handleBulkDelete = useCallback(async () => {
    if (selectedImageIds.length === 0) return;

    Modal.confirm({
      title: t('training.confirmDelete', 'Delete Images'),
      content: t('training.confirmDeleteContent', {
        count: selectedImageIds.length,
        defaultValue: `Are you sure you want to delete ${selectedImageIds.length} image(s)?`,
      }),
      okText: t('common.delete', 'Delete'),
      okType: 'danger',
      cancelText: t('common.cancel', 'Cancel'),
      onOk: async () => {
        try {
          await deleteImages(selectedImageIds);
          setImages(images.filter((img) => !selectedImageIds.includes(img.id)));
          clearSelection();
          message.success(t('training.deleteSuccess', 'Images deleted successfully'));
        } catch (error) {
          message.error(t('training.deleteError', 'Failed to delete images'));
        }
      },
    });
  }, [selectedImageIds, images, setImages, clearSelection, t]);

  // Handle bulk assign to category
  const handleBulkAssign = useCallback(async () => {
    if (!selectedCategoryForAssign) {
      message.warning(t('training.selectCategory', 'Please select a category'));
      return;
    }

    try {
      await assignImagesToCategory(selectedImageIds, selectedCategoryForAssign);
      const category = categories.find((c) => c.id === selectedCategoryForAssign);

      // Update local state
      setImages(
        images.map((img) =>
          selectedImageIds.includes(img.id)
            ? { ...img, categoryId: selectedCategoryForAssign, categoryName: category?.name }
            : img
        )
      );

      clearSelection();
      setAssignModalVisible(false);
      setSelectedCategoryForAssign('');
      message.success(t('training.assignSuccess', 'Images assigned to category'));
    } catch (error) {
      message.error(t('training.assignError', 'Failed to assign images'));
    }
  }, [selectedImageIds, selectedCategoryForAssign, categories, images, setImages, clearSelection, t]);

  // Handle image click to open annotation
  const handleImageClick = useCallback(
    (image: TrainingImage) => {
      navigate(`/training/annotate/${image.id}`);
    },
    [navigate]
  );

  // Stats
  const stats = {
    total: images.length,
    annotated: images.filter((img) => img.annotationStatus === 'complete').length,
    partial: images.filter((img) => img.annotationStatus === 'partial').length,
    none: images.filter((img) => img.annotationStatus === 'none').length,
  };

  return (
    <div className="min-h-screen bg-neutral-50 p-4">
      <div className="max-w-7xl mx-auto">
        <Space direction="vertical" size="large" className="w-full">
          {/* Header */}
          <Card className="shadow-sm">
            <div className="flex justify-between items-start flex-wrap gap-4">
              <div>
                <Title level={2} className="mb-2">
                  {t('training.title', 'Training Data')}
                </Title>
                <Text type="secondary">
                  {t('training.description', 'Upload and manage images for logo detection training')}
                </Text>
              </div>
              <Space>
                <Button onClick={() => setBatchPickerVisible(true)}>
                  {t('training.startTraining', 'Start Training')}
                </Button>
                <Button
                  type="primary"
                  icon={<UploadOutlined />}
                  onClick={() => setActiveTab('upload')}
                >
                  {t('training.uploadImages', 'Upload Images')}
                </Button>
              </Space>
            </div>

            {/* Stats */}
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-neutral-100 rounded">
                <div className="text-2xl font-bold">{stats.total}</div>
                <div className="text-sm text-gray-500">{t('training.totalImages', 'Total Images')}</div>
              </div>
              <div className="text-center p-3 bg-green-50 rounded">
                <div className="text-2xl font-bold text-green-600">{stats.annotated}</div>
                <div className="text-sm text-gray-500">{t('training.complete', 'Complete')}</div>
              </div>
              <div className="text-center p-3 bg-yellow-50 rounded">
                <div className="text-2xl font-bold text-yellow-600">{stats.partial}</div>
                <div className="text-sm text-gray-500">{t('training.partial', 'Partial')}</div>
              </div>
              <div className="text-center p-3 bg-red-50 rounded">
                <div className="text-2xl font-bold text-red-600">{stats.none}</div>
                <div className="text-sm text-gray-500">{t('training.notAnnotated', 'Not Annotated')}</div>
              </div>
            </div>
          </Card>

          {/* Upload Progress */}
          {isUploading && uploadProgress && (
            <Alert
              message={t('training.uploading', 'Uploading images...')}
              description={
                <div>
                  <Progress
                    percent={Math.round((uploadProgress.completed / uploadProgress.total) * 100)}
                    status="active"
                  />
                  <Text>
                    {uploadProgress.completed} / {uploadProgress.total} {t('training.imagesUploaded', 'images uploaded')}
                    {uploadProgress.failed > 0 && (
                      <span className="text-red-500 ml-2">
                        ({uploadProgress.failed} {t('training.failed', 'failed')})
                      </span>
                    )}
                  </Text>
                </div>
              }
              type="info"
              showIcon
            />
          )}

          {/* Bulk Actions Bar */}
          {selectedImageIds.length > 0 && (
            <Card className="shadow-sm bg-blue-50">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <Text strong>
                  {selectedImageIds.length} {t('training.imagesSelected', 'image(s) selected')}
                </Text>
                <Space>
                  <Button
                    icon={<TagsOutlined />}
                    onClick={() => setAssignModalVisible(true)}
                  >
                    {t('training.assignCategory', 'Assign Category')}
                  </Button>
                  <Button icon={<ExportOutlined />}>
                    {t('training.export', 'Export')}
                  </Button>
                  <Button danger icon={<DeleteOutlined />} onClick={handleBulkDelete}>
                    {t('common.delete', 'Delete')}
                  </Button>
                  <Button onClick={clearSelection}>
                    {t('training.clearSelection', 'Clear Selection')}
                  </Button>
                </Space>
              </div>
            </Card>
          )}

          {/* Main Content Tabs */}
          <Card className="shadow-sm">
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              items={[
                {
                  key: 'library',
                  label: (
                    <span>
                      <FolderOutlined />
                      {t('training.tabs.library', 'Image Library')}
                    </span>
                  ),
                  children: (
                    <ImageLibrary
                      images={images}
                      loading={isLoading}
                      onImageClick={handleImageClick}
                    />
                  ),
                },
                {
                  key: 'upload',
                  label: (
                    <span>
                      <UploadOutlined />
                      {t('training.tabs.upload', 'Upload')}
                    </span>
                  ),
                  children: <BatchUploader onComplete={() => setActiveTab('library')} />,
                },
                {
                  key: 'categories',
                  label: (
                    <span>
                      <TagsOutlined />
                      {t('training.tabs.categories', 'Categories')}
                    </span>
                  ),
                  children: <CategoryManager />,
                },
              ]}
            />
          </Card>
        </Space>
      </div>

      {/* Assign Category Modal */}
      <Modal
        title={t('training.assignToCategory', 'Assign to Category')}
        open={assignModalVisible}
        onOk={handleBulkAssign}
        onCancel={() => {
          setAssignModalVisible(false);
          setSelectedCategoryForAssign('');
        }}
        okText={t('common.assign', 'Assign')}
        cancelText={t('common.cancel', 'Cancel')}
      >
        <div className="py-4">
          <Text className="block mb-2">
            {t('training.selectCategoryFor', 'Select a category for')} {selectedImageIds.length}{' '}
            {t('training.images', 'image(s)')}:
          </Text>
          <Select
            style={{ width: '100%' }}
            placeholder={t('training.selectCategory', 'Select a category')}
            value={selectedCategoryForAssign || undefined}
            onChange={setSelectedCategoryForAssign}
            showSearch
            optionFilterProp="children"
          >
            {categories.map((cat) => (
              <Select.Option key={cat.id} value={cat.id}>
                <span style={{ color: cat.color }}>●</span> {cat.name}
              </Select.Option>
            ))}
          </Select>
        </div>
      </Modal>

      {/* Batch Image Picker — holdout images are excluded (Epic 7, Story 7.1) */}
      <Modal
        title={t('training.composeBatch', 'Compose training batch')}
        open={batchPickerVisible}
        onCancel={() => setBatchPickerVisible(false)}
        footer={null}
      >
        <div data-testid="batch-image-picker" className="py-2">
          <Text type="secondary" className="block mb-3">
            {t(
              'training.batchPickerHint',
              'Holdout images are excluded from training batches.'
            )}
          </Text>
          {images.filter((img) => !img.holdout).length === 0 ? (
            <Text type="secondary">
              {t('training.noTrainableImages', 'No trainable images available.')}
            </Text>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {images
                .filter((img) => !img.holdout)
                .map((img) => (
                  <div
                    key={img.id}
                    data-image-id={img.id}
                    className="border rounded p-1 text-xs truncate"
                  >
                    <img
                      src={img.thumbnailUrl}
                      alt={img.originalName}
                      className="w-full h-16 object-cover rounded mb-1"
                    />
                    {img.originalName}
                  </div>
                ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default TrainingPage;
