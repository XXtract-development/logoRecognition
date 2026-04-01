/**
 * EmptyState - Reusable empty state component with guidance
 * Provides helpful context and actions when there's no data
 */
import React from 'react';
import { Button, Typography, Space } from 'antd';
import {
  InboxOutlined,
  PictureOutlined,
  TagsOutlined,
  RocketOutlined,
  CameraOutlined,
  BulbOutlined,
} from '@ant-design/icons';
import { useThemeStore } from '@/stores/themeStore';

const { Title, Paragraph, Text } = Typography;

// Icon mapping for different empty state types
const iconMap = {
  images: PictureOutlined,
  categories: TagsOutlined,
  models: RocketOutlined,
  recognition: CameraOutlined,
  default: InboxOutlined,
};

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  type?: 'primary' | 'default' | 'dashed';
  icon?: React.ReactNode;
}

export interface EmptyStateTip {
  text: string;
}

export interface EmptyStateProps {
  type?: keyof typeof iconMap;
  icon?: React.ReactNode;
  title: string;
  description: string;
  actions?: EmptyStateAction[];
  tips?: EmptyStateTip[];
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  type = 'default',
  icon,
  title,
  description,
  actions = [],
  tips = [],
  className = '',
}) => {
  const { isDarkMode } = useThemeStore();
  const IconComponent = iconMap[type];

  return (
    <div
      className={`flex flex-col items-center justify-center py-16 px-8 text-center ${className}`}
      role="status"
      aria-label={title}
    >
      {/* Icon */}
      <div
        className={`mb-6 p-6 rounded-full ${
          isDarkMode ? 'bg-neutral-800' : 'bg-neutral-100'
        }`}
      >
        {icon || (
          <IconComponent
            style={{
              fontSize: 48,
              color: isDarkMode ? '#525252' : '#a3a3a3',
            }}
          />
        )}
      </div>

      {/* Title */}
      <Title
        level={4}
        className={`mb-2 ${isDarkMode ? 'text-neutral-200' : 'text-neutral-800'}`}
      >
        {title}
      </Title>

      {/* Description */}
      <Paragraph
        className={`max-w-md mb-6 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}
      >
        {description}
      </Paragraph>

      {/* Actions */}
      {actions.length > 0 && (
        <Space wrap className="mb-6">
          {actions.map((action, index) => (
            <Button
              key={index}
              type={action.type || (index === 0 ? 'primary' : 'default')}
              icon={action.icon}
              onClick={action.onClick}
              size="large"
            >
              {action.label}
            </Button>
          ))}
        </Space>
      )}

      {/* Tips Section */}
      {tips.length > 0 && (
        <div
          className={`mt-4 p-4 rounded-lg max-w-lg ${
            isDarkMode ? 'bg-neutral-800/50' : 'bg-blue-50'
          }`}
        >
          <div className="flex items-start gap-2">
            <BulbOutlined
              className={isDarkMode ? 'text-yellow-500' : 'text-blue-500'}
              style={{ marginTop: 4 }}
            />
            <div className="text-left">
              <Text
                strong
                className={`text-sm ${isDarkMode ? 'text-neutral-300' : 'text-blue-700'}`}
              >
                Tips:
              </Text>
              <ul className="list-disc list-inside mt-1">
                {tips.map((tip, index) => (
                  <li
                    key={index}
                    className={`text-sm ${isDarkMode ? 'text-neutral-400' : 'text-blue-600'}`}
                  >
                    {tip.text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Pre-configured empty states for common scenarios
export const EmptyStatePresets = {
  NoImages: ({
    onUpload,
    t,
  }: {
    onUpload: () => void;
    t: (key: string, fallback?: string) => string;
  }) => (
    <EmptyState
      type="images"
      title={t('emptyState.noImages.title', 'No images uploaded yet')}
      description={t(
        'emptyState.noImages.description',
        'Upload your first images to start training your logo recognition model.'
      )}
      actions={[
        {
          label: t('emptyState.noImages.action', 'Upload Images'),
          onClick: onUpload,
          icon: <PictureOutlined />,
        },
      ]}
      tips={[
        { text: t('emptyState.noImages.tip1', 'Supported formats: JPG, PNG, WebP') },
        { text: t('emptyState.noImages.tip2', 'Maximum 10MB per image') },
        { text: t('emptyState.noImages.tip3', 'You can upload up to 50 images at once') },
      ]}
    />
  ),

  NoCategories: ({
    onCreate,
    t,
  }: {
    onCreate: () => void;
    t: (key: string, fallback?: string) => string;
  }) => (
    <EmptyState
      type="categories"
      title={t('emptyState.noCategories.title', 'No categories created')}
      description={t(
        'emptyState.noCategories.description',
        'Create categories to organize your logo annotations by brand or type.'
      )}
      actions={[
        {
          label: t('emptyState.noCategories.action', 'Create Category'),
          onClick: onCreate,
          icon: <TagsOutlined />,
        },
      ]}
      tips={[
        { text: t('emptyState.noCategories.tip1', 'Use descriptive names like "Nike" or "Tech Logos"') },
        { text: t('emptyState.noCategories.tip2', 'Categories can have a hierarchy (parent/child)') },
      ]}
    />
  ),

  NoModels: ({
    onTrain,
    t,
  }: {
    onTrain: () => void;
    t: (key: string, fallback?: string) => string;
  }) => (
    <EmptyState
      type="models"
      title={t('emptyState.noModels.title', 'No models trained yet')}
      description={t(
        'emptyState.noModels.description',
        'Train your first model using annotated images to enable logo recognition.'
      )}
      actions={[
        {
          label: t('emptyState.noModels.action', 'Train First Model'),
          onClick: onTrain,
          icon: <RocketOutlined />,
        },
      ]}
      tips={[
        { text: t('emptyState.noModels.tip1', 'You need at least 10 annotated images per category') },
        { text: t('emptyState.noModels.tip2', 'Training typically takes 5-30 minutes') },
      ]}
    />
  ),

  NoResults: ({
    onUpload,
    t,
  }: {
    onUpload: () => void;
    t: (key: string, fallback?: string) => string;
  }) => (
    <EmptyState
      type="recognition"
      title={t('emptyState.noResults.title', 'Ready to recognize logos')}
      description={t(
        'emptyState.noResults.description',
        'Upload an image to detect and identify logos using your trained models.'
      )}
      actions={[
        {
          label: t('emptyState.noResults.action', 'Upload Image'),
          onClick: onUpload,
          icon: <CameraOutlined />,
        },
      ]}
    />
  ),
};

export default EmptyState;
