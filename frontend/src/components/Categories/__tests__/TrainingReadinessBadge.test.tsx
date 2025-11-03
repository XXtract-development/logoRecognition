/**
 * Frontend Component Tests for TrainingReadinessBadge
 *
 * Tests AC-3 and AC-4: Frontend Badge Component and Details
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TrainingReadinessBadge } from '../TrainingReadinessBadge';
import { ReadinessStatus, CategoryReadiness } from '../../../types/category';

describe('TrainingReadinessBadge Component', () => {
  const mockReadinessInsufficient: CategoryReadiness = {
    categoryId: 1,
    categorie: 'brand',
    categorieNaam: 'Brand Logos',
    code: 'test',
    codeNaam: 'Test Brand',
    annotationCount: 5,
    uniqueImages: 3,
    readinessPercentage: 20.5,
    readinessStatus: ReadinessStatus.INSUFFICIENT,
    readinessColor: '#EF4444',
    requiredAdditionalAnnotations: 70,
    estimatedAccuracyRange: [20, 50],
    recommendations: [
      '🔴 Critical: Add at least 70 more annotations',
      '🟡 Increase image variety: Add 7 more unique images'
    ]
  };

  const mockReadinessHigh: CategoryReadiness = {
    categoryId: 2,
    categorie: 'brand',
    categorieNaam: 'Brand Logos',
    code: 'nike',
    codeNaam: 'Nike',
    annotationCount: 80,
    uniqueImages: 50,
    readinessPercentage: 88.3,
    readinessStatus: ReadinessStatus.HIGH,
    readinessColor: '#10B981',
    requiredAdditionalAnnotations: 5,
    estimatedAccuracyRange: [85, 92],
    recommendations: [
      '🟡 Add 5 more annotations to reach 95% confidence',
      '✅ Good image variety'
    ]
  };

  const mockReadinessVeryHigh: CategoryReadiness = {
    categoryId: 3,
    categorie: 'brand',
    categorieNaam: 'Brand Logos',
    code: 'adidas',
    codeNaam: 'Adidas',
    annotationCount: 100,
    uniqueImages: 60,
    readinessPercentage: 95.7,
    readinessStatus: ReadinessStatus.VERY_HIGH,
    readinessColor: '#059669',
    requiredAdditionalAnnotations: 0,
    estimatedAccuracyRange: [93, 97],
    recommendations: [
      '✅ Sufficient annotations for 95% target accuracy! Ready for training.'
    ]
  };

  describe('AC-3: Badge Display', () => {
    it('renders badge with percentage', () => {
      render(<TrainingReadinessBadge readiness={mockReadinessHigh} />);

      // Badge should show percentage
      expect(screen.getByText('88%')).toBeInTheDocument();
    });

    it('applies correct color for insufficient status', () => {
      const { container } = render(<TrainingReadinessBadge readiness={mockReadinessInsufficient} />);

      // Badge should have red background
      const badge = container.querySelector('.ant-badge-count');
      expect(badge).toHaveStyle({ backgroundColor: '#EF4444' });
    });

    it('applies correct color for high status', () => {
      const { container } = render(<TrainingReadinessBadge readiness={mockReadinessHigh} />);

      // Badge should have green background
      const badge = container.querySelector('.ant-badge-count');
      expect(badge).toHaveStyle({ backgroundColor: '#10B981' });
    });

    it('applies correct color for very high status', () => {
      const { container } = render(<TrainingReadinessBadge readiness={mockReadinessVeryHigh} />);

      // Badge should have dark green background
      const badge = container.querySelector('.ant-badge-count');
      expect(badge).toHaveStyle({ backgroundColor: '#059669' });
    });

    it('displays status text when showDetails is true', () => {
      render(<TrainingReadinessBadge readiness={mockReadinessHigh} showDetails={true} />);

      expect(screen.getByText('Almost ready')).toBeInTheDocument();
    });

    it('hides status text when showDetails is false', () => {
      render(<TrainingReadinessBadge readiness={mockReadinessHigh} showDetails={false} />);

      expect(screen.queryByText('Almost ready')).not.toBeInTheDocument();
    });
  });

  describe('AC-4: Tooltip Details', () => {
    it('shows tooltip on hover with detailed information', async () => {
      render(<TrainingReadinessBadge readiness={mockReadinessHigh} />);

      const badgeElement = screen.getByText('88%');
      fireEvent.mouseOver(badgeElement);

      await waitFor(() => {
        // Check for readiness percentage in tooltip
        expect(screen.getByText(/Training Readiness: 88.3%/)).toBeInTheDocument();
      });
    });

    it('displays annotation count in tooltip', async () => {
      render(<TrainingReadinessBadge readiness={mockReadinessHigh} />);

      const badgeElement = screen.getByText('88%');
      fireEvent.mouseOver(badgeElement);

      await waitFor(() => {
        expect(screen.getByText(/Annotations: 80/)).toBeInTheDocument();
      });
    });

    it('displays unique images count in tooltip', async () => {
      render(<TrainingReadinessBadge readiness={mockReadinessHigh} />);

      const badgeElement = screen.getByText('88%');
      fireEvent.mouseOver(badgeElement);

      await waitFor(() => {
        expect(screen.getByText(/Unique Images: 50/)).toBeInTheDocument();
      });
    });

    it('displays estimated accuracy range in tooltip', async () => {
      render(<TrainingReadinessBadge readiness={mockReadinessHigh} />);

      const badgeElement = screen.getByText('88%');
      fireEvent.mouseOver(badgeElement);

      await waitFor(() => {
        expect(screen.getByText(/Estimated Accuracy: 85%-92%/)).toBeInTheDocument();
      });
    });

    it('displays required additional annotations when > 0', async () => {
      render(<TrainingReadinessBadge readiness={mockReadinessHigh} />);

      const badgeElement = screen.getByText('88%');
      fireEvent.mouseOver(badgeElement);

      await waitFor(() => {
        expect(screen.getByText(/Need 5 more annotations/)).toBeInTheDocument();
      });
    });

    it('hides required annotations message when 0', async () => {
      render(<TrainingReadinessBadge readiness={mockReadinessVeryHigh} />);

      const badgeElement = screen.getByText('96%');
      fireEvent.mouseOver(badgeElement);

      await waitFor(() => {
        expect(screen.queryByText(/Need.*more annotations/)).not.toBeInTheDocument();
      });
    });

    it('displays recommendations (top 3)', async () => {
      render(<TrainingReadinessBadge readiness={mockReadinessInsufficient} />);

      const badgeElement = screen.getByText('21%');
      fireEvent.mouseOver(badgeElement);

      await waitFor(() => {
        expect(screen.getByText(/Critical: Add at least 70 more annotations/)).toBeInTheDocument();
        expect(screen.getByText(/Increase image variety/)).toBeInTheDocument();
      });
    });

    it('limits recommendations to top 3', async () => {
      const manyRecommendations: CategoryReadiness = {
        ...mockReadinessInsufficient,
        recommendations: [
          'Recommendation 1',
          'Recommendation 2',
          'Recommendation 3',
          'Recommendation 4',
          'Recommendation 5'
        ]
      };

      render(<TrainingReadinessBadge readiness={manyRecommendations} />);

      const badgeElement = screen.getByText('21%');
      fireEvent.mouseOver(badgeElement);

      await waitFor(() => {
        expect(screen.getByText(/Recommendation 1/)).toBeInTheDocument();
        expect(screen.getByText(/Recommendation 2/)).toBeInTheDocument();
        expect(screen.getByText(/Recommendation 3/)).toBeInTheDocument();
        expect(screen.queryByText(/Recommendation 4/)).not.toBeInTheDocument();
      });
    });
  });

  describe('Color Mapping (AC-3)', () => {
    it('uses red (#EF4444) for insufficient status (<50%)', () => {
      const { container } = render(<TrainingReadinessBadge readiness={mockReadinessInsufficient} />);

      const badge = container.querySelector('.ant-badge-count');
      expect(badge).toHaveStyle({ backgroundColor: '#EF4444' });
    });

    it('uses orange for low status (50-70%)', () => {
      const lowReadiness: CategoryReadiness = {
        ...mockReadinessInsufficient,
        readinessPercentage: 60,
        readinessStatus: ReadinessStatus.LOW,
        readinessColor: '#F59E0B'
      };

      const { container } = render(<TrainingReadinessBadge readiness={lowReadiness} />);

      const badge = container.querySelector('.ant-badge-count');
      expect(badge).toHaveStyle({ backgroundColor: '#F59E0B' });
    });

    it('uses yellow for moderate status (70-85%)', () => {
      const moderateReadiness: CategoryReadiness = {
        ...mockReadinessInsufficient,
        readinessPercentage: 77,
        readinessStatus: ReadinessStatus.MODERATE,
        readinessColor: '#FBBF24'
      };

      const { container } = render(<TrainingReadinessBadge readiness={moderateReadiness} />);

      const badge = container.querySelector('.ant-badge-count');
      expect(badge).toHaveStyle({ backgroundColor: '#FBBF24' });
    });

    it('uses green for high status (85-95%)', () => {
      const { container } = render(<TrainingReadinessBadge readiness={mockReadinessHigh} />);

      const badge = container.querySelector('.ant-badge-count');
      expect(badge).toHaveStyle({ backgroundColor: '#10B981' });
    });

    it('uses dark green for very high status (95%+)', () => {
      const { container } = render(<TrainingReadinessBadge readiness={mockReadinessVeryHigh} />);

      const badge = container.querySelector('.ant-badge-count');
      expect(badge).toHaveStyle({ backgroundColor: '#059669' });
    });
  });

  describe('Accessibility (AC-4)', () => {
    it('badge is keyboard accessible', () => {
      render(<TrainingReadinessBadge readiness={mockReadinessHigh} />);

      // Find the wrapper span with tabIndex
      const wrapperElement = screen.getByRole('button', { name: /Training readiness: 88%/ });
      expect(wrapperElement).toBeInTheDocument();
      expect(wrapperElement).toHaveAttribute('tabIndex', '0');

      // Badge should be focusable via tab
      wrapperElement.focus();
      expect(document.activeElement).toBe(wrapperElement);
    });

    it('has appropriate cursor style', () => {
      const { container } = render(<TrainingReadinessBadge readiness={mockReadinessHigh} />);

      const badge = container.querySelector('.ant-badge-count');
      expect(badge).toHaveStyle({ cursor: 'pointer' });
    });
  });

  describe('Edge Cases', () => {
    it('handles 0% readiness', () => {
      const zeroReadiness: CategoryReadiness = {
        ...mockReadinessInsufficient,
        readinessPercentage: 0,
        annotationCount: 0,
        uniqueImages: 0
      };

      render(<TrainingReadinessBadge readiness={zeroReadiness} />);

      expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('handles 100% readiness', () => {
      const perfectReadiness: CategoryReadiness = {
        ...mockReadinessVeryHigh,
        readinessPercentage: 100
      };

      render(<TrainingReadinessBadge readiness={perfectReadiness} />);

      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('handles empty recommendations array', async () => {
      const noRecommendations: CategoryReadiness = {
        ...mockReadinessHigh,
        recommendations: []
      };

      render(<TrainingReadinessBadge readiness={noRecommendations} />);

      const badgeElement = screen.getByText('88%');
      fireEvent.mouseOver(badgeElement);

      await waitFor(() => {
        // Should still show tooltip without recommendations section
        expect(screen.getByText(/Training Readiness: 88.3%/)).toBeInTheDocument();
      });
    });

    it('rounds percentage to nearest integer for display', () => {
      const decimalReadiness: CategoryReadiness = {
        ...mockReadinessHigh,
        readinessPercentage: 88.7
      };

      render(<TrainingReadinessBadge readiness={decimalReadiness} />);

      expect(screen.getByText('89%')).toBeInTheDocument();
    });
  });
});
