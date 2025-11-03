/**
 * Annotation Sufficiency Integration Script
 *
 * Dit script voegt een sufficiency indicator toe aan je bestaande interface
 * zonder de huidige flow te verstoren.
 *
 * GEBRUIK:
 * 1. Voeg dit script toe aan je bestaande HTML pagina
 * 2. Het voegt automatisch een kleine widget toe rechtsonder
 * 3. De widget update automatisch na elke annotatie
 */

(function() {
    'use strict';

    // Configuration
    const API_BASE_URL = 'http://localhost:8000';

    // Inject styles
    const styles = `
        .sufficiency-indicator {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: white;
            border-radius: 12px;
            padding: 15px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            z-index: 10000;
            min-width: 200px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            transition: all 0.3s ease;
        }

        .sufficiency-indicator.minimized {
            width: 80px;
            height: 80px;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
        }

        .sufficiency-indicator.minimized .indicator-body {
            display: none;
        }

        .sufficiency-indicator.minimized .indicator-mini {
            display: block;
        }

        .indicator-mini {
            display: none;
            text-align: center;
        }

        .indicator-percentage {
            font-size: 1.8em;
            font-weight: bold;
            line-height: 1;
        }

        .indicator-label-mini {
            font-size: 0.7em;
            color: #666;
        }

        .indicator-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }

        .indicator-title {
            font-weight: 600;
            font-size: 0.9em;
            color: #333;
        }

        .indicator-toggle {
            cursor: pointer;
            font-size: 1.2em;
            color: #666;
            background: none;
            border: none;
            padding: 0;
        }

        .indicator-body {
            display: block;
        }

        .indicator-status {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 10px;
        }

        .indicator-circle {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 1.1em;
            color: white;
        }

        .indicator-circle.ready { background: #10b981; }
        .indicator-circle.progress { background: #f59e0b; }
        .indicator-circle.insufficient { background: #ef4444; }

        .indicator-info {
            flex: 1;
        }

        .indicator-value {
            font-weight: 600;
            font-size: 0.9em;
            color: #333;
        }

        .indicator-subtext {
            font-size: 0.8em;
            color: #666;
        }

        .indicator-action {
            margin-top: 10px;
            padding: 8px 12px;
            background: #7c3aed;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 0.85em;
            font-weight: 600;
            cursor: pointer;
            width: 100%;
            text-align: center;
        }

        .indicator-action:disabled {
            background: #ccc;
            cursor: not-allowed;
        }

        .indicator-action:hover:not(:disabled) {
            background: #6d28d9;
        }

        .indicator-recommendation {
            background: #fef3c7;
            border-left: 3px solid #f59e0b;
            padding: 8px;
            margin-top: 10px;
            border-radius: 4px;
            font-size: 0.8em;
            color: #78350f;
        }
    `;

    // Add styles to page
    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);

    // Create widget HTML
    const widget = document.createElement('div');
    widget.className = 'sufficiency-indicator';
    widget.innerHTML = `
        <div class="indicator-mini" onclick="SufficiencyIndicator.toggle()">
            <div class="indicator-percentage" id="si-percentage-mini">0%</div>
            <div class="indicator-label-mini">Ready</div>
        </div>
        <div class="indicator-body">
            <div class="indicator-header">
                <span class="indicator-title">Training Readiness</span>
                <button class="indicator-toggle" onclick="SufficiencyIndicator.toggle()">－</button>
            </div>
            <div class="indicator-status">
                <div class="indicator-circle insufficient" id="si-circle">
                    <span id="si-percentage">0%</span>
                </div>
                <div class="indicator-info">
                    <div class="indicator-value" id="si-logo-name">No logo selected</div>
                    <div class="indicator-subtext" id="si-status">Select a logo to annotate</div>
                </div>
            </div>
            <div class="indicator-recommendation" id="si-recommendation" style="display: none;"></div>
            <button class="indicator-action" id="si-action" disabled>Need more data</button>
        </div>
    `;

    // Add widget to page
    document.body.appendChild(widget);

    // Widget controller
    window.SufficiencyIndicator = {
        currentCategory: null,
        currentValue: null,
        isMinimized: false,

        // Initialize with current annotation
        init: function(category, value) {
            this.currentCategory = category;
            this.currentValue = value;
            this.update();
        },

        // Update sufficiency data
        update: async function() {
            if (!this.currentCategory || !this.currentValue) return;

            try {
                const response = await fetch(
                    `${API_BASE_URL}/api/annotation-metrics/sufficiency/${this.currentCategory}/${this.currentValue}?target_accuracy=95`
                );

                if (!response.ok) return;

                const data = await response.json();
                const analysis = data.analysis;

                this.displayUpdate(analysis);
            } catch (error) {
                console.error('Sufficiency check failed:', error);
            }
        },

        // Update display
        displayUpdate: function(analysis) {
            const confidence = Math.round(analysis.summary.current_confidence);
            const isReady = analysis.summary.is_sufficient;
            const needed = analysis.requirements.required_additional_annotations;

            // Update percentages
            document.getElementById('si-percentage').textContent = `${confidence}%`;
            document.getElementById('si-percentage-mini').textContent = `${confidence}%`;

            // Update circle color
            const circle = document.getElementById('si-circle');
            circle.className = 'indicator-circle';
            if (confidence >= 95) {
                circle.classList.add('ready');
            } else if (confidence >= 70) {
                circle.classList.add('progress');
            } else {
                circle.classList.add('insufficient');
            }

            // Update logo name
            document.getElementById('si-logo-name').textContent =
                `${this.currentValue} (${analysis.metrics.total_annotations} annotations)`;

            // Update status
            let statusText = '';
            if (isReady) {
                statusText = '✅ Ready for training!';
            } else if (needed > 0) {
                statusText = `Need ${needed} more annotations`;
            } else {
                statusText = 'Keep annotating...';
            }
            document.getElementById('si-status').textContent = statusText;

            // Update recommendation
            const recElement = document.getElementById('si-recommendation');
            if (!isReady && analysis.requirements.recommendations.length > 0) {
                const firstRec = analysis.requirements.recommendations[0]
                    .replace(/^[🔴🟡🟢💡✅]\s*/, '');
                recElement.textContent = `💡 ${firstRec}`;
                recElement.style.display = 'block';
            } else {
                recElement.style.display = 'none';
            }

            // Update action button
            const actionBtn = document.getElementById('si-action');
            if (isReady) {
                actionBtn.textContent = '🚀 Start Training';
                actionBtn.disabled = false;
                actionBtn.onclick = () => this.startTraining();
            } else {
                actionBtn.textContent = `Need ${needed} more`;
                actionBtn.disabled = true;
            }
        },

        // Toggle minimize/maximize
        toggle: function() {
            this.isMinimized = !this.isMinimized;
            const widget = document.querySelector('.sufficiency-indicator');
            if (this.isMinimized) {
                widget.classList.add('minimized');
            } else {
                widget.classList.remove('minimized');
            }
        },

        // Start training
        startTraining: function() {
            console.log(`Starting training for ${this.currentCategory}/${this.currentValue}`);
            alert(`Training will start for ${this.currentValue}!`);
            // Add actual training API call here
        },

        // Hide widget
        hide: function() {
            document.querySelector('.sufficiency-indicator').style.display = 'none';
        },

        // Show widget
        show: function() {
            document.querySelector('.sufficiency-indicator').style.display = 'block';
        }
    };

    // Hook into existing annotation saves
    // Method 1: Override existing save function
    const originalSave = window.saveAnnotation || window.save || function() {};
    const newSave = function(...args) {
        const result = originalSave.apply(this, args);

        // Extract category and value from form or arguments
        const category = document.querySelector('select[name="category"], #category')?.value ||
                        document.querySelector('input[name="category"]')?.value;
        const value = document.querySelector('input[name="value"], #logo-value')?.value ||
                     document.querySelector('input[name="logo_name"]')?.value;

        if (category && value) {
            SufficiencyIndicator.init(category, value);
        }

        return result;
    };

    if (window.saveAnnotation) {
        window.saveAnnotation = newSave;
    }
    if (window.save) {
        window.save = newSave;
    }

    // Method 2: Listen for form submissions
    document.addEventListener('submit', function(e) {
        const form = e.target;
        if (form.tagName === 'FORM') {
            setTimeout(() => {
                const category = form.querySelector('[name="category"]')?.value;
                const value = form.querySelector('[name="value"], [name="logo_name"], [name="logo_value"]')?.value;

                if (category && value) {
                    SufficiencyIndicator.init(category, value);
                }
            }, 500);
        }
    });

    // Method 3: Listen for custom events
    window.addEventListener('annotationSaved', function(e) {
        if (e.detail && e.detail.category && e.detail.value) {
            SufficiencyIndicator.init(e.detail.category, e.detail.value);
        }
    });

    // Auto-refresh every 10 seconds if active
    setInterval(() => {
        if (SufficiencyIndicator.currentCategory && SufficiencyIndicator.currentValue) {
            SufficiencyIndicator.update();
        }
    }, 10000);

    console.log('✅ Sufficiency Indicator loaded! Use SufficiencyIndicator.init(category, value) to start.');

})();