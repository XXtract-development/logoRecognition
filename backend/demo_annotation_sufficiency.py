#!/usr/bin/env python3
"""
Demo script for annotation sufficiency feature.

This demonstrates how the annotation sufficiency analysis works
for determining if enough training data exists for 95-99% accuracy.
"""

import json
from datetime import datetime, timedelta
from app.services.annotation_statistics import (
    AnnotationStatisticsService,
    AnnotationProgressTracker
)


def generate_demo_annotations(count, unique_images=None):
    """Generate demo annotation data."""
    if unique_images is None:
        unique_images = max(1, count // 3)

    annotations = []
    now = datetime.now()

    for i in range(count):
        annotations.append({
            'id': i,
            'image_id': f'img_{i % unique_images}',
            'category': 'brand',
            'value': 'demo_logo',
            'bbox': {
                'x': 10 + (i * 7 % 70),
                'y': 10 + (i * 5 % 70),
                'width': 15 + (i % 40),
                'height': 15 + (i % 35)
            },
            'created_at': (now - timedelta(hours=i * 2)).isoformat(),
            'annotator_id': f'user_{i % 3}'
        })

    return annotations


def print_analysis_report(analysis):
    """Print a formatted analysis report."""
    print("\n" + "=" * 70)
    print(f"ANNOTATION SUFFICIENCY ANALYSIS REPORT")
    print("=" * 70)

    print(f"\n📊 SUMMARY")
    print(f"  Category: {analysis.category}")
    print(f"  Value: {analysis.value}")
    print(f"  Current Confidence: {analysis.current_confidence:.1f}%")
    print(f"  Target Confidence: {analysis.target_confidence:.0f}%")
    print(f"  Status: {'✅ SUFFICIENT' if analysis.is_sufficient else '❌ INSUFFICIENT'}")
    print(f"  Confidence Level: {analysis.confidence_level.value.upper()}")

    print(f"\n📈 METRICS")
    print(f"  Total Annotations: {analysis.metrics.total_annotations}")
    print(f"  Unique Images: {analysis.metrics.unique_images}")
    print(f"  Avg per Image: {analysis.metrics.avg_annotations_per_image:.2f}")
    print(f"  Diversity Score: {analysis.metrics.annotation_diversity_score:.2%}")
    print(f"  Temporal Distribution: {analysis.metrics.temporal_distribution:.2%}")
    print(f"  Annotator Agreement: {analysis.metrics.annotator_agreement_score:.2%}")
    print(f"  Augmentation Factor: {analysis.metrics.augmentation_factor}x")

    print(f"\n🎯 ACCURACY ESTIMATE")
    print(f"  Expected Range: {analysis.estimated_accuracy_range[0]:.1f}% - {analysis.estimated_accuracy_range[1]:.1f}%")

    print(f"\n📊 QUALITY FACTORS")
    for factor, score in analysis.quality_factors.items():
        bar = "█" * int(score * 20) + "░" * (20 - int(score * 20))
        print(f"  {factor.replace('_', ' ').title():20} {bar} {score:.2%}")

    print(f"\n🔧 RECOMMENDATIONS")
    if analysis.is_sufficient:
        print("  ✅ Ready for training! You have sufficient annotations.")
    else:
        print(f"  ⚠️ Need {analysis.required_additional_annotations} more annotations")

    for i, rec in enumerate(analysis.recommendations, 1):
        print(f"  {i}. {rec}")


def simulate_annotation_session():
    """Simulate a progressive annotation session."""
    print("\n" + "=" * 70)
    print("SIMULATING ANNOTATION SESSION")
    print("=" * 70)

    service = AnnotationStatisticsService()
    tracker = AnnotationProgressTracker()
    session_id = f"demo_session_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    annotation_counts = [10, 25, 50, 100, 200, 500, 1000]

    for count in annotation_counts:
        print(f"\n\n🔄 Checking with {count} annotations...")
        print("-" * 50)

        # Generate annotations
        annotations = generate_demo_annotations(count)

        # Analyze for 95% target
        analysis_95 = service.calculate_sufficiency(
            category='brand',
            value='demo_logo',
            annotations=annotations,
            target_accuracy=95.0,
            enable_augmentation=True
        )

        # Analyze for 99% target
        analysis_99 = service.calculate_sufficiency(
            category='brand',
            value='demo_logo',
            annotations=annotations,
            target_accuracy=99.0,
            enable_augmentation=True
        )

        # Track progress
        progress = tracker.update_progress(
            session_id=session_id,
            category='brand',
            value='demo_logo',
            new_annotation_count=count
        )

        # Print summary
        print(f"  Confidence: {analysis_95.current_confidence:.1f}%")
        print(f"  Level: {analysis_95.confidence_level.value}")
        print(f"  95% Target: {'✅ READY' if analysis_95.is_sufficient else f'❌ Need {analysis_95.required_additional_annotations} more'}")
        print(f"  99% Target: {'✅ READY' if analysis_99.is_sufficient else f'❌ Need {analysis_99.required_additional_annotations} more'}")

        if progress['next_milestone']:
            print(f"  Next Milestone: {progress['next_milestone']} "
                  f"({progress['progress_to_next_milestone']:.0f}% there)")

        # Stop if we reach 99% confidence
        if analysis_99.is_sufficient:
            print(f"\n🎉 SUCCESS! Reached 99% confidence with {count} annotations!")
            break


def compare_scenarios():
    """Compare different annotation scenarios."""
    print("\n" + "=" * 70)
    print("COMPARING ANNOTATION SCENARIOS")
    print("=" * 70)

    service = AnnotationStatisticsService()

    scenarios = [
        {
            'name': 'Low Quality - Same Image',
            'count': 100,
            'unique_images': 1,
            'description': '100 annotations on 1 image'
        },
        {
            'name': 'Medium Quality - Few Images',
            'count': 100,
            'unique_images': 10,
            'description': '100 annotations on 10 images'
        },
        {
            'name': 'High Quality - Many Images',
            'count': 100,
            'unique_images': 50,
            'description': '100 annotations on 50 images'
        },
        {
            'name': 'With Augmentation',
            'count': 100,
            'unique_images': 30,
            'description': '100 annotations with 8x augmentation',
            'augmentation': True
        },
        {
            'name': 'Without Augmentation',
            'count': 100,
            'unique_images': 30,
            'description': '100 annotations without augmentation',
            'augmentation': False
        }
    ]

    results = []

    for scenario in scenarios:
        annotations = generate_demo_annotations(
            scenario['count'],
            scenario['unique_images']
        )

        analysis = service.calculate_sufficiency(
            category='brand',
            value='test',
            annotations=annotations,
            target_accuracy=95.0,
            enable_augmentation=scenario.get('augmentation', True)
        )

        results.append({
            'name': scenario['name'],
            'description': scenario['description'],
            'confidence': analysis.current_confidence,
            'is_sufficient': analysis.is_sufficient,
            'quality_avg': sum(analysis.quality_factors.values()) / len(analysis.quality_factors)
        })

    # Print comparison table
    print("\n📊 Scenario Comparison (100 annotations each)")
    print("-" * 80)
    print(f"{'Scenario':<30} {'Confidence':<15} {'Quality':<15} {'95% Ready':<10}")
    print("-" * 80)

    for result in results:
        ready = '✅' if result['is_sufficient'] else '❌'
        print(f"{result['name']:<30} {result['confidence']:<15.1f}% "
              f"{result['quality_avg']*100:<15.1f}% {ready:<10}")

    print("-" * 80)
    print("\n💡 Key Insights:")
    print("  • Image diversity significantly impacts confidence")
    print("  • Data augmentation can multiply effective training data by 8x")
    print("  • Quality factors are as important as quantity")
    print("  • 500+ well-distributed annotations typically achieve 95% confidence")
    print("  • 1000+ annotations with good diversity can reach 99% confidence")


def main():
    """Run all demonstrations."""
    print("\n" * 2)
    print("🎯 ANNOTATION SUFFICIENCY ANALYSIS DEMO")
    print("=" * 70)
    print("This demo shows how to determine if you have enough annotated")
    print("logos for achieving 95-99% detection accuracy.")
    print("=" * 70)

    # Demo 1: Detailed analysis of a single scenario
    print("\n\n📝 DEMO 1: Detailed Analysis")
    annotations = generate_demo_annotations(250, unique_images=75)
    service = AnnotationStatisticsService()

    analysis = service.calculate_sufficiency(
        category='brand',
        value='nike',
        annotations=annotations,
        target_accuracy=95.0,
        enable_augmentation=True
    )

    print_analysis_report(analysis)

    # Demo 2: Progressive annotation session
    print("\n\n📝 DEMO 2: Progressive Session")
    simulate_annotation_session()

    # Demo 3: Compare different scenarios
    print("\n\n📝 DEMO 3: Scenario Comparison")
    compare_scenarios()

    print("\n\n✅ Demo complete! The annotation sufficiency feature is ready for use.")
    print("=" * 70)


if __name__ == "__main__":
    main()