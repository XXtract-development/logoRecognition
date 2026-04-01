/**
 * Category Manager Component
 * Epic 2.4: Create, edit, and manage logo categories
 */
import React, { useState, useCallback } from 'react';
import {
  Button,
  Table,
  Tag,
  Space,
  Modal,
  Form,
  Input,
  Select,
  ColorPicker,
  message,
  Popconfirm,
  Typography,
  Empty,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  MergeCellsOutlined,
  FolderOutlined,
} from '@ant-design/icons';
// Color type used internally by antd ColorPicker
import { useTranslation } from 'react-i18next';
import { useTrainingStore } from '@/stores/trainingStore';
import {
  createCategory,
  updateCategory,
  deleteCategory,
  mergeCategories,
} from '@/services/trainingService';
import type { Category, CategoryFormData } from '@/types/training.types';

const { Text, Title } = Typography;
const { TextArea } = Input;

export const CategoryManager: React.FC = () => {
  const { t } = useTranslation();
  const { categories, addCategory, updateCategory: updateCategoryInStore, removeCategory } =
    useTrainingStore();

  const [form] = Form.useForm();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [mergeModalVisible, setMergeModalVisible] = useState(false);
  const [mergeSource, setMergeSource] = useState<string>('');
  const [mergeTarget, setMergeTarget] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Open create modal
  const handleCreate = useCallback(() => {
    setEditingCategory(null);
    form.resetFields();
    form.setFieldsValue({ color: '#007AFF' });
    setModalVisible(true);
  }, [form]);

  // Open edit modal
  const handleEdit = useCallback(
    (category: Category) => {
      setEditingCategory(category);
      form.setFieldsValue({
        name: category.name,
        description: category.description,
        parentId: category.parentId,
        color: category.color,
      });
      setModalVisible(true);
    },
    [form]
  );

  // Handle form submit
  const handleSubmit = useCallback(async () => {
    try {
      const values = await form.validateFields();
      setIsSubmitting(true);

      const formData: CategoryFormData = {
        name: values.name,
        description: values.description,
        parentId: values.parentId,
        color: typeof values.color === 'string' ? values.color : values.color?.toHexString() || '#007AFF',
      };

      if (editingCategory) {
        // Update existing
        const updated = await updateCategory(editingCategory.id, formData);
        updateCategoryInStore(editingCategory.id, updated);
        message.success(t('categories.updateSuccess', 'Category updated successfully'));
      } else {
        // Create new
        const created = await createCategory(formData);
        addCategory(created);
        message.success(t('categories.createSuccess', 'Category created successfully'));
      }

      setModalVisible(false);
      form.resetFields();
      setEditingCategory(null);
    } catch (error) {
      if (error instanceof Error) {
        message.error(error.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [form, editingCategory, addCategory, updateCategoryInStore, t]);

  // Handle delete
  const handleDelete = useCallback(
    async (id: string) => {
      const category = categories.find((c) => c.id === id);
      if (category && category.imageCount > 0) {
        message.error(
          t('categories.cannotDelete', 'Cannot delete category with assigned images')
        );
        return;
      }

      try {
        await deleteCategory(id);
        removeCategory(id);
        message.success(t('categories.deleteSuccess', 'Category deleted successfully'));
      } catch (error) {
        message.error(t('categories.deleteError', 'Failed to delete category'));
      }
    },
    [categories, removeCategory, t]
  );

  // Handle merge
  const handleMerge = useCallback(async () => {
    if (!mergeSource || !mergeTarget) {
      message.warning(t('categories.selectBoth', 'Please select both categories'));
      return;
    }

    if (mergeSource === mergeTarget) {
      message.warning(t('categories.cannotMergeSame', 'Cannot merge a category with itself'));
      return;
    }

    try {
      await mergeCategories(mergeSource, mergeTarget);

      // Update local state - increase target count, remove source
      const sourceCategory = categories.find((c) => c.id === mergeSource);
      const targetCategory = categories.find((c) => c.id === mergeTarget);

      if (sourceCategory && targetCategory) {
        updateCategoryInStore(mergeTarget, {
          imageCount: targetCategory.imageCount + sourceCategory.imageCount,
        });
        removeCategory(mergeSource);
      }

      setMergeModalVisible(false);
      setMergeSource('');
      setMergeTarget('');
      message.success(t('categories.mergeSuccess', 'Categories merged successfully'));
    } catch (error) {
      message.error(t('categories.mergeError', 'Failed to merge categories'));
    }
  }, [mergeSource, mergeTarget, categories, updateCategoryInStore, removeCategory, t]);

  // Table columns
  const columns = [
    {
      title: t('categories.color', 'Color'),
      dataIndex: 'color',
      key: 'color',
      width: 80,
      render: (color: string) => (
        <div
          className="w-6 h-6 rounded-full border"
          style={{ backgroundColor: color }}
        />
      ),
    },
    {
      title: t('categories.name', 'Name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: Category) => (
        <div>
          <div className="font-medium">{name}</div>
          {record.description && (
            <Text type="secondary" className="text-sm">
              {record.description}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: t('categories.parent', 'Parent'),
      dataIndex: 'parentId',
      key: 'parentId',
      render: (parentId: string | undefined) => {
        if (!parentId) return '-';
        const parent = categories.find((c) => c.id === parentId);
        return parent ? (
          <Tag>
            <FolderOutlined /> {parent.name}
          </Tag>
        ) : (
          '-'
        );
      },
    },
    {
      title: t('categories.images', 'Images'),
      dataIndex: 'imageCount',
      key: 'imageCount',
      width: 100,
      render: (count: number) => (
        <Tag color={count > 0 ? 'blue' : 'default'}>{count}</Tag>
      ),
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      width: 150,
      render: (_: unknown, record: Category) => (
        <Space>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          />
          <Popconfirm
            title={t('categories.confirmDelete', 'Delete this category?')}
            description={
              record.imageCount > 0
                ? t('categories.hasImages', 'This category has images assigned.')
                : t('categories.confirmDeleteDesc', 'This action cannot be undone.')
            }
            onConfirm={() => handleDelete(record.id)}
            okText={t('common.delete', 'Delete')}
            cancelText={t('common.cancel', 'Cancel')}
            disabled={record.imageCount > 0}
          >
            <Button
              type="text"
              size="small"
              icon={<DeleteOutlined />}
              danger
              disabled={record.imageCount > 0}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="category-manager">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <Title level={5} className="mb-0">
          {t('categories.title', 'Categories')} ({categories.length})
        </Title>
        <Space>
          <Button icon={<MergeCellsOutlined />} onClick={() => setMergeModalVisible(true)}>
            {t('categories.merge', 'Merge')}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            {t('categories.create', 'New Category')}
          </Button>
        </Space>
      </div>

      {/* Table */}
      {categories.length > 0 ? (
        <Table
          dataSource={categories}
          columns={columns}
          rowKey="id"
          pagination={false}
          size="middle"
        />
      ) : (
        <Empty
          description={t('categories.empty', 'No categories yet')}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            {t('categories.createFirst', 'Create First Category')}
          </Button>
        </Empty>
      )}

      {/* Create/Edit Modal */}
      <Modal
        title={
          editingCategory
            ? t('categories.edit', 'Edit Category')
            : t('categories.create', 'Create Category')
        }
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
          setEditingCategory(null);
        }}
        confirmLoading={isSubmitting}
        okText={editingCategory ? t('common.save', 'Save') : t('common.create', 'Create')}
        cancelText={t('common.cancel', 'Cancel')}
      >
        <Form form={form} layout="vertical" className="mt-4">
          <Form.Item
            name="name"
            label={t('categories.name', 'Name')}
            rules={[
              { required: true, message: t('categories.nameRequired', 'Name is required') },
              { max: 50, message: t('categories.nameTooLong', 'Name must be less than 50 characters') },
            ]}
          >
            <Input placeholder={t('categories.namePlaceholder', 'e.g., Technology')} />
          </Form.Item>

          <Form.Item
            name="description"
            label={t('categories.description', 'Description')}
            rules={[
              { max: 200, message: t('categories.descTooLong', 'Description must be less than 200 characters') },
            ]}
          >
            <TextArea
              rows={2}
              placeholder={t('categories.descPlaceholder', 'Optional description...')}
            />
          </Form.Item>

          <Form.Item name="parentId" label={t('categories.parent', 'Parent Category')}>
            <Select
              placeholder={t('categories.selectParent', 'Select parent (optional)')}
              allowClear
            >
              {categories
                .filter((c) => c.id !== editingCategory?.id)
                .map((cat) => (
                  <Select.Option key={cat.id} value={cat.id}>
                    <span style={{ color: cat.color }}>●</span> {cat.name}
                  </Select.Option>
                ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="color"
            label={t('categories.color', 'Color')}
            rules={[{ required: true, message: t('categories.colorRequired', 'Color is required') }]}
          >
            <ColorPicker format="hex" showText />
          </Form.Item>
        </Form>
      </Modal>

      {/* Merge Modal */}
      <Modal
        title={t('categories.mergeCategories', 'Merge Categories')}
        open={mergeModalVisible}
        onOk={handleMerge}
        onCancel={() => {
          setMergeModalVisible(false);
          setMergeSource('');
          setMergeTarget('');
        }}
        okText={t('categories.merge', 'Merge')}
        cancelText={t('common.cancel', 'Cancel')}
      >
        <div className="py-4">
          <Text className="block mb-4">
            {t('categories.mergeDescription', 'Select the category to merge and the target category. All images from the source will be moved to the target.')}
          </Text>

          <Form layout="vertical">
            <Form.Item label={t('categories.sourceCategory', 'Source (will be deleted)')}>
              <Select
                placeholder={t('categories.selectSource', 'Select source category')}
                value={mergeSource || undefined}
                onChange={setMergeSource}
              >
                {categories.map((cat) => (
                  <Select.Option key={cat.id} value={cat.id}>
                    <span style={{ color: cat.color }}>●</span> {cat.name} ({cat.imageCount} images)
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item label={t('categories.targetCategory', 'Target (will receive images)')}>
              <Select
                placeholder={t('categories.selectTarget', 'Select target category')}
                value={mergeTarget || undefined}
                onChange={setMergeTarget}
              >
                {categories
                  .filter((c) => c.id !== mergeSource)
                  .map((cat) => (
                    <Select.Option key={cat.id} value={cat.id}>
                      <span style={{ color: cat.color }}>●</span> {cat.name} ({cat.imageCount} images)
                    </Select.Option>
                  ))}
              </Select>
            </Form.Item>
          </Form>
        </div>
      </Modal>
    </div>
  );
};

CategoryManager.displayName = 'CategoryManager';
