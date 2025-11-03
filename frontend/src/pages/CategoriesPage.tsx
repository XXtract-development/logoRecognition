/**
 * CategoriesPageImproved Component
 *
 * Enhanced categories management page with modal editing, filtering, and improved columns
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Button,
  Space,
  message,
  Popconfirm,
  Typography,
  Card,
  Checkbox,
  Tooltip,
  Badge,
  Tag,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { categoryService } from '../services/categoryService';
import CategoryImportButton from '../components/Categories/CategoryImport/CategoryImportButton';
import CategoryModal, { CategoryFormData } from '../components/Categories/CategoryModal';
import CategoryFilter from '../components/Categories/CategoryFilter';
import type { Category } from '../types/category';

const { Title } = Typography;

/**
 * Enhanced Categories management page
 *
 * Features:
 * - List categories with annotation counts
 * - Filter/search functionality with real-time results
 * - Modal-based editing instead of inline
 * - Bulk operations support
 * - Improved column layout
 * - Sorting by name and annotation count
 */
export const CategoriesPageImproved: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [filtered, setFiltered] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'categorie' | 'annotation_count' | 'created_at'>(
    'categorie'
  );
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

  // Bulk selection state
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  /**
   * Fetch categories from API with search and sorting
   */
  const fetchCategories = useCallback(async () => {
    setLoading(true);

    try {
      const response = await categoryService.getCategoriesWithSearch(
        searchTerm,
        page,
        pageSize,
        sortBy,
        sortOrder
      );

      setCategories(response.categories);
      setTotal(response.total);
      setFiltered(response.filtered || response.total);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
      message.error('Fout bij ophalen van categorieën');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, searchTerm, sortBy, sortOrder]);

  /**
   * Load categories on mount and when filters change
   */
  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  /**
   * Handle search filter change
   */
  const handleSearch = useCallback((term: string) => {
    setSearchTerm(term);
    setPage(1); // Reset to first page on search
  }, []);

  /**
   * Handle successful import - refresh list
   */
  const handleImportSuccess = useCallback(() => {
    fetchCategories();
    message.success('Categorieën succesvol geïmporteerd');
  }, [fetchCategories]);

  /**
   * Handle create/edit category
   */
  const handleSaveCategory = async (formData: CategoryFormData) => {
    try {
      if (selectedCategory?.id) {
        // Update existing
        await categoryService.updateCategory(selectedCategory.id, formData);
        message.success('Categorie bijgewerkt');
      } else {
        // Create new
        await categoryService.createCategory(formData);
        message.success('Categorie aangemaakt');

        // Auto-scroll to new category
        setPage(1); // Go to first page where new category will appear
      }

      setModalVisible(false);
      setSelectedCategory(null);
      fetchCategories();
    } catch (error: any) {
      throw new Error(error?.response?.data?.detail || 'Fout bij opslaan categorie');
    }
  };

  /**
   * Handle edit category - open modal
   */
  const handleEdit = useCallback((category: Category) => {
    setSelectedCategory(category);
    setModalVisible(true);
  }, []);

  /**
   * Handle delete category
   */
  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await categoryService.deleteCategory(id);
        message.success('Categorie verwijderd');
        fetchCategories();
      } catch (error) {
        console.error('Failed to delete category:', error);
        message.error('Fout bij verwijderen van categorie');
      }
    },
    [fetchCategories]
  );

  /**
   * Handle bulk delete
   */
  const handleBulkDelete = useCallback(async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('Selecteer eerst categorieën om te verwijderen');
      return;
    }

    try {
      // In real implementation, this would be a bulk delete endpoint
      for (const key of selectedRowKeys) {
        await categoryService.deleteCategory(Number(key));
      }
      message.success(`${selectedRowKeys.length} categorieën verwijderd`);
      setSelectedRowKeys([]);
      fetchCategories();
    } catch (error) {
      message.error('Fout bij bulk verwijderen');
    }
  }, [selectedRowKeys, fetchCategories]);

  /**
   * Row selection configuration
   */
  const rowSelection = {
    selectedRowKeys,
    onChange: (newSelectedRowKeys: React.Key[]) => {
      setSelectedRowKeys(newSelectedRowKeys);
    },
  };

  /**
   * Table columns definition - improved layout
   */
  const columns: ColumnsType<Category> = [
    {
      title: '',
      key: 'selection',
      width: 50,
      fixed: 'left',
      render: () => null, // Handled by rowSelection
    },
    {
      title: 'Categorie',
      dataIndex: 'categorie',
      key: 'categorie',
      width: 180,
      sorter: true,
      sortOrder: sortBy === 'categorie' ? sortOrder : undefined,
      render: (text, record) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {record.categorie_naam ? (
            <>
              <span style={{ fontWeight: 500, fontSize: 14 }}>
                {record.categorie_naam}
              </span>
              <span style={{ fontSize: 12, color: '#999' }}>
                {text}
              </span>
            </>
          ) : (
            <span style={{ fontWeight: 500, fontSize: 14 }}>{text}</span>
          )}
        </div>
      ),
    },
    {
      title: 'Code',
      dataIndex: 'code',
      key: 'code',
      width: 140,
      render: (text, record) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {record.code_naam ? (
            <>
              <span style={{ fontWeight: 500, fontSize: 14 }}>
                {record.code_naam}
              </span>
              <code style={{ fontSize: 12, color: '#999' }}>
                {text}
              </code>
            </>
          ) : (
            <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 3, fontSize: 13 }}>
              {text}
            </code>
          )}
        </div>
      ),
    },
    {
      title: 'Annotations',
      dataIndex: 'annotation_count',
      key: 'annotation_count',
      width: 120,
      align: 'center',
      sorter: true,
      sortOrder: sortBy === 'annotation_count' ? sortOrder : undefined,
      render: (count: number) => (
        <Badge
          count={count || 0}
          showZero
          style={{
            backgroundColor: count > 0 ? '#52c41a' : '#d9d9d9',
          }}
        />
      ),
    },
    {
      title: 'Acties',
      key: 'actions',
      width: 120,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="Bewerken">
            <Button
              type="text"
              icon={<EditOutlined />}
              size="small"
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Popconfirm
            title="Categorie verwijderen"
            description={
              record.annotation_count > 0
                ? `Deze categorie heeft ${record.annotation_count} annotations. Weet je het zeker?`
                : 'Weet je zeker dat je deze categorie wilt verwijderen?'
            }
            onConfirm={() => record.id && handleDelete(record.id)}
            okText="Ja"
            cancelText="Nee"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="Verwijderen">
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                size="small"
                disabled={record.annotation_count > 10} // Protect categories with many annotations
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  /**
   * Handle table change (pagination, filters, sorting)
   */
  const handleTableChange = (pagination: any, filters: any, sorter: any) => {
    setPage(pagination.current);
    setPageSize(pagination.pageSize);

    if (sorter.field) {
      setSortBy(sorter.field);
      setSortOrder(sorter.order === 'descend' ? 'desc' : 'asc');
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <Card>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24,
          }}
        >
          <Title level={2} style={{ margin: 0 }}>
            <AppstoreOutlined /> Categorieën Beheer
          </Title>

          <Space>
            {selectedRowKeys.length > 0 && (
              <Popconfirm
                title={`${selectedRowKeys.length} categorieën verwijderen?`}
                onConfirm={handleBulkDelete}
                okText="Verwijderen"
                cancelText="Annuleren"
                okButtonProps={{ danger: true }}
              >
                <Button danger>
                  Verwijder {selectedRowKeys.length} geselecteerd
                </Button>
              </Popconfirm>
            )}

            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setSelectedCategory(null);
                setModalVisible(true);
              }}
            >
              Nieuwe Categorie
            </Button>

            <CategoryImportButton onSuccess={handleImportSuccess} />
          </Space>
        </div>

        {/* Filter */}
        <CategoryFilter
          onSearch={handleSearch}
          totalCount={total}
          filteredCount={filtered}
          loading={loading}
        />

        {/* Table */}
        <Table
          rowSelection={rowSelection}
          dataSource={categories}
          columns={columns}
          rowKey="id"
          loading={loading}
          onChange={handleTableChange}
          pagination={{
            current: page,
            pageSize: pageSize,
            total: filtered,
            showSizeChanger: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} van ${total} categorieën`,
            pageSizeOptions: ['10', '20', '50', '100'],
          }}
          scroll={{ x: 1000 }}
          rowClassName={(record) =>
            record.annotation_count === 0 ? 'category-row-unused' : ''
          }
        />

        {/* Category Modal */}
        <CategoryModal
          category={selectedCategory}
          visible={modalVisible}
          onClose={() => {
            setModalVisible(false);
            setSelectedCategory(null);
          }}
          onSave={handleSaveCategory}
        />
      </Card>

      <style>{`
        .category-row-unused {
          opacity: 0.7;
        }
        .category-row-unused:hover {
          opacity: 1;
        }
      `}</style>
    </div>
  );
};

export default CategoriesPageImproved;