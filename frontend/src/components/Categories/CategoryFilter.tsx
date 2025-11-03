/**
 * CategoryFilter Component
 *
 * Filter component for searching and filtering categories
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Input, Button, Space, Typography, Badge } from 'antd';
import { SearchOutlined, CloseCircleOutlined } from '@ant-design/icons';

// Simple debounce implementation to avoid external dependency
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
}

const { Text } = Typography;

interface CategoryFilterProps {
  onSearch: (searchTerm: string) => void;
  totalCount: number;
  filteredCount: number;
  loading?: boolean;
}

/**
 * CategoryFilter - Real-time search filter for categories
 *
 * Features:
 * - Real-time search with debouncing
 * - Clear filter button
 * - Result counter showing filtered vs total
 * - Loading state indication
 * - Keyboard shortcuts (Cmd/Ctrl+K to focus, ESC to clear)
 */
export const CategoryFilter: React.FC<CategoryFilterProps> = ({
  onSearch,
  totalCount,
  filteredCount,
  loading = false,
}) => {
  const [searchValue, setSearchValue] = useState('');
  const searchInputRef = useRef<any>(null);

  // Create debounced search function
  const debouncedSearch = useCallback(
    debounce((value: string) => {
      onSearch(value);
    }, 300),
    [onSearch]
  );

  /**
   * Handle search input change
   */
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchValue(value);
    debouncedSearch(value);
  };

  /**
   * Clear search filter
   */
  const handleClearSearch = () => {
    setSearchValue('');
    onSearch('');
    searchInputRef.current?.focus();
  };

  /**
   * Setup keyboard shortcuts
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K to focus search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      // ESC to clear search when focused
      if (e.key === 'Escape' && document.activeElement === searchInputRef.current?.input) {
        handleClearSearch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  /**
   * Determine if filter is active
   */
  const isFiltered = searchValue.length > 0;

  /**
   * Format result text
   */
  const getResultText = () => {
    if (loading) {
      return 'Zoeken...';
    }

    if (isFiltered) {
      return (
        <>
          Toont <Badge count={filteredCount} style={{ backgroundColor: '#52c41a' }} /> van{' '}
          <Badge count={totalCount} style={{ backgroundColor: '#1890ff' }} /> categorieën
        </>
      );
    }

    return (
      <>
        Totaal <Badge count={totalCount} style={{ backgroundColor: '#1890ff' }} /> categorieën
      </>
    );
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
        {/* Search Input */}
        <Space>
          <Input
            ref={searchInputRef}
            placeholder="Zoek categorieën... (⌘K)"
            prefix={<SearchOutlined />}
            suffix={
              isFiltered && (
                <CloseCircleOutlined
                  style={{ cursor: 'pointer', color: '#999' }}
                  onClick={handleClearSearch}
                />
              )
            }
            value={searchValue}
            onChange={handleSearchChange}
            style={{ width: 300 }}
            allowClear
          />

          {/* Clear Filter Button */}
          {isFiltered && (
            <Button onClick={handleClearSearch} icon={<CloseCircleOutlined />}>
              Filter wissen
            </Button>
          )}
        </Space>

        {/* Result Counter */}
        <Text type="secondary" style={{ fontSize: 14 }}>
          {getResultText()}
        </Text>
      </Space>

      {/* Filter Active Indicator */}
      {isFiltered && filteredCount === 0 && !loading && (
        <div
          style={{
            marginTop: 8,
            padding: '8px 12px',
            background: '#fff2e8',
            border: '1px solid #ffbb96',
            borderRadius: 4,
          }}
        >
          <Text type="warning">
            Geen categorieën gevonden voor "{searchValue}". Probeer een andere zoekterm.
          </Text>
        </div>
      )}
    </div>
  );
};

export default CategoryFilter;