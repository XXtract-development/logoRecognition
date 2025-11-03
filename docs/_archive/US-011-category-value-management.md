# User Story US-011: Category & Value Management

**Story ID:** US-011
**Epic:** EPIC-01 Training System
**Priority:** High
**Sprint:** 9
**Story Points:** 8
**Status:** 📋 Ready for Development
**Dependencies:** US-010 (Preview Panel)

---

## 🎯 **Story Definition**

**Als** Data Manager
**Wil ik** voor elke cropped logo preview een categorie en waarde kunnen toekennen
**Zodat** ik training data kan voorbereiden met correcte labels voor het machine learning model

---

## ✅ **Acceptance Criteria**

### **AC1: Category Selection Interface**
- [ ] Elke preview card heeft category dropdown onder de afbeelding
- [ ] Dropdown toont bestaande categorieën (Merk, Recycling, Package Type)
- [ ] Dropdown heeft autocomplete/filter functionaliteit
- [ ] "Add new category" optie onderaan dropdown
- [ ] Snelle category toevoeging via inline modal

### **AC2: Value Input Interface**
- [ ] Value input field verschijnt na category selectie
- [ ] Input field heeft autocomplete gebaseerd op eerdere waarden voor category
- [ ] Suggesties worden getoond tijdens typen
- [ ] "Add new value" functionaliteit voor nieuwe waarden
- [ ] Input validatie voorkomt lege of duplicate waarden

### **AC3: Category-Value Pairing**
- [ ] Elke combinatie van category + value wordt opgeslagen
- [ ] Systeem voorkomt identieke category-value paren binnen zelfde afbeelding
- [ ] Warning bij potentiële duplicates across afbeeldingen
- [ ] Historical suggestions gebaseerd op eerdere sessies

### **AC4: Quick Add Categories**
- [ ] "+ Add Category" button opent inline form
- [ ] Category naam validatie (uniek, niet leeg, max 50 chars)
- [ ] Category beschrijving (optioneel, max 200 chars)
- [ ] Direct gebruik na toevoeging
- [ ] Category management voor admin users

### **AC5: Visual State Management**
- [ ] Incomplete preview cards hebben warning indicator (⚠️)
- [ ] Complete preview cards hebben success indicator (✅)
- [ ] Required field highlighting voor lege category/value
- [ ] Progress indicator: "3 of 5 logos categorized"

### **AC6: Validation & Error Prevention**
- [ ] Real-time validatie tijdens typing
- [ ] Prevent submission met incomplete categorization
- [ ] Clear error messages voor validation failures
- [ ] Undo functionaliteit voor accidental changes

---

## 🎨 **UI/UX Specifications**

### **Enhanced Preview Card with Category Assignment**
```
┌─────────────────────────────┐
│ ┌─────────────────────────┐ │ 🗑️
│ │                         │ │
│ │    Cropped Logo         │ │ ✅/⚠️
│ │                         │ │
│ └─────────────────────────┘ │
│                             │
│ Category: [Merk        ▼]   │
│           [+ Add Category]  │
│                             │
│ Value:    [Nike_______]     │
│           ⚡ Suggestions:   │
│           • Nike            │
│           • Adidas          │
│                             │
│ ID: box-001                 │
└─────────────────────────────┘
```

### **Category Dropdown with Autocomplete**
```
┌─────────────────────────────┐
│ Category: [Mer|        ▼]   │
├─────────────────────────────┤
│ 🔍 Filter results...        │
│ ✓ Merk (23 uses)            │
│   Recycling (8 uses)        │
│   Package Type (5 uses)     │
├─────────────────────────────┤
│ + Add new category          │
└─────────────────────────────┘
```

### **Quick Add Category Modal**
```
┌─────────────────────────────┐
│ ➕ Add New Category         │
├─────────────────────────────┤
│                             │
│ Name: [_________________]   │
│                             │
│ Description (optional):     │
│ [_________________________] │
│ [_________________________] │
│                             │
│ Examples: "Merk", "Logo",   │
│ "Recycling Symbol"          │
│                             │
│     [Cancel] [Add Category] │
└─────────────────────────────┘
```

### **Progress Overview**
```
┌─────────────────────────────┐
│ Categorization Progress     │
│                             │
│ ████████░░ 8/10 Complete    │
│                             │
│ ✅ Categorized (8)          │
│ ⚠️  Missing info (2)        │
│                             │
│ [Continue to Training] 🔒   │
└─────────────────────────────┘
```

---

## 🛠️ **Technical Implementation**

### **Category & Value Data Structure**
```typescript
interface Category {
  id: string;
  name: string;
  description?: string;
  usageCount: number;
  createdAt: Date;
  createdBy: string;
  isDefault: boolean;
}

interface CategoryValue {
  id: string;
  categoryId: string;
  value: string;
  usageCount: number;
  lastUsed: Date;
  aliases?: string[];  // Alternative names
}

interface LogoAnnotation {
  id: string;
  previewId: string;
  boundingBoxId: string;
  category: Category | null;
  value: CategoryValue | null;
  confidence?: number;
  isComplete: boolean;
  lastModified: Date;
}

interface AnnotationState {
  annotations: LogoAnnotation[];
  categories: Category[];
  values: CategoryValue[];
  suggestions: Record<string, CategoryValue[]>;
}
```

### **Category Management Service**
```typescript
class CategoryService {
  private static readonly DEFAULT_CATEGORIES: Partial<Category>[] = [
    { name: 'Merk', description: 'Brand logos (Nike, Adidas, etc.)', isDefault: true },
    { name: 'Recycling', description: 'Recycling symbols (PET, HDPE, etc.)', isDefault: true },
    { name: 'Package Type', description: 'Package types (bottle, box, etc.)', isDefault: true }
  ];

  static async getCategories(): Promise<Category[]> {
    // Try API first, fallback to defaults
    try {
      const response = await fetch('/api/v1/training/categories');
      return await response.json();
    } catch {
      return this.DEFAULT_CATEGORIES.map((cat, index) => ({
        id: `default-${index}`,
        usageCount: 0,
        createdAt: new Date(),
        createdBy: 'system',
        ...cat
      })) as Category[];
    }
  }

  static async createCategory(name: string, description?: string): Promise<Category> {
    const newCategory: Category = {
      id: `cat-${Date.now()}`,
      name: name.trim(),
      description: description?.trim(),
      usageCount: 0,
      createdAt: new Date(),
      createdBy: 'current-user',
      isDefault: false
    };

    try {
      const response = await fetch('/api/v1/training/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCategory)
      });
      return await response.json();
    } catch {
      // Fallback to local storage
      const stored = this.getStoredCategories();
      stored.push(newCategory);
      localStorage.setItem('custom-categories', JSON.stringify(stored));
      return newCategory;
    }
  }

  static async getValueSuggestions(categoryId: string): Promise<CategoryValue[]> {
    try {
      const response = await fetch(`/api/v1/training/categories/${categoryId}/values`);
      return await response.json();
    } catch {
      // Return common suggestions based on category
      return this.getDefaultSuggestions(categoryId);
    }
  }

  private static getDefaultSuggestions(categoryId: string): CategoryValue[] {
    const suggestions = {
      'merk': ['Nike', 'Adidas', 'Puma', 'Apple', 'Samsung', 'Google'],
      'recycling': ['PET', 'HDPE', 'PP', 'LDPE', 'PS', 'OTHER'],
      'package-type': ['Bottle', 'Box', 'Bag', 'Can', 'Tube', 'Pouch']
    };

    const category = categoryId.toLowerCase();
    const values = suggestions[category] || [];

    return values.map((value, index) => ({
      id: `val-${categoryId}-${index}`,
      categoryId,
      value,
      usageCount: Math.floor(Math.random() * 10),
      lastUsed: new Date(),
    }));
  }
}
```

### **Category Value Assignment Component**
```typescript
const CategoryValueAssignment: React.FC<{
  annotation: LogoAnnotation;
  categories: Category[];
  onUpdate: (annotation: LogoAnnotation) => void;
}> = ({ annotation, categories, onUpdate }) => {
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(annotation.category);
  const [inputValue, setInputValue] = useState(annotation.value?.value || '');
  const [suggestions, setSuggestions] = useState<CategoryValue[]>([]);
  const [showAddCategory, setShowAddCategory] = useState(false);

  // Load value suggestions when category changes
  useEffect(() => {
    if (selectedCategory) {
      CategoryService.getValueSuggestions(selectedCategory.id)
        .then(setSuggestions);
    }
  }, [selectedCategory]);

  const handleCategorySelect = (category: Category) => {
    setSelectedCategory(category);
    setInputValue(''); // Clear value when changing category

    const updatedAnnotation = {
      ...annotation,
      category,
      value: null,
      isComplete: false
    };
    onUpdate(updatedAnnotation);
  };

  const handleValueChange = (value: string) => {
    setInputValue(value);

    const categoryValue: CategoryValue = {
      id: `val-${selectedCategory?.id}-${Date.now()}`,
      categoryId: selectedCategory?.id || '',
      value: value.trim(),
      usageCount: 1,
      lastUsed: new Date()
    };

    const updatedAnnotation = {
      ...annotation,
      value: categoryValue,
      isComplete: !!(selectedCategory && value.trim())
    };
    onUpdate(updatedAnnotation);
  };

  const handleAddCategory = async (name: string, description?: string) => {
    try {
      const newCategory = await CategoryService.createCategory(name, description);
      // Refresh categories list in parent component
      setSelectedCategory(newCategory);
      setShowAddCategory(false);
    } catch (error) {
      message.error('Failed to add category');
    }
  };

  return (
    <div className="category-value-assignment">
      {/* Category Selection */}
      <div className="category-section">
        <label>Category:</label>
        <Select
          value={selectedCategory?.id}
          placeholder="Select category..."
          style={{ width: '100%' }}
          showSearch
          filterOption={(input, option) =>
            option?.children?.toLowerCase().includes(input.toLowerCase())
          }
          dropdownRender={menu => (
            <div>
              {menu}
              <Divider style={{ margin: '4px 0' }} />
              <div style={{ padding: '4px 8px', cursor: 'pointer' }}
                   onClick={() => setShowAddCategory(true)}>
                + Add new category
              </div>
            </div>
          )}
        >
          {categories.map(category => (
            <Select.Option key={category.id} value={category.id}>
              {category.name} ({category.usageCount} uses)
            </Select.Option>
          ))}
        </Select>
      </div>

      {/* Value Input */}
      {selectedCategory && (
        <div className="value-section">
          <label>Value:</label>
          <AutoComplete
            value={inputValue}
            onChange={handleValueChange}
            placeholder={`Enter ${selectedCategory.name.toLowerCase()} value...`}
            style={{ width: '100%' }}
            options={suggestions.map(suggestion => ({
              value: suggestion.value,
              label: suggestion.value
            }))}
            filterOption={(input, option) =>
              option?.value?.toLowerCase().includes(input.toLowerCase())
            }
          />

          {suggestions.length > 0 && (
            <div className="suggestions">
              ⚡ Suggestions: {suggestions.slice(0, 3).map(s => s.value).join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Status Indicator */}
      <div className="status-indicator">
        {annotation.isComplete ? (
          <span className="complete">✅ Complete</span>
        ) : (
          <span className="incomplete">⚠️ Missing {!selectedCategory ? 'category' : 'value'}</span>
        )}
      </div>

      {/* Add Category Modal */}
      <Modal
        title="Add New Category"
        open={showAddCategory}
        onCancel={() => setShowAddCategory(false)}
        footer={null}
      >
        <AddCategoryForm onSubmit={handleAddCategory} onCancel={() => setShowAddCategory(false)} />
      </Modal>
    </div>
  );
};
```

### **Add Category Form Component**
```typescript
const AddCategoryForm: React.FC<{
  onSubmit: (name: string, description?: string) => Promise<void>;
  onCancel: () => void;
}> = ({ onSubmit, onCancel }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values: { name: string; description?: string }) => {
    setLoading(true);
    try {
      await onSubmit(values.name, values.description);
      form.resetFields();
    } catch (error) {
      message.error('Failed to add category');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form form={form} onFinish={handleSubmit} layout="vertical">
      <Form.Item
        name="name"
        label="Category Name"
        rules={[
          { required: true, message: 'Please enter category name' },
          { max: 50, message: 'Name must be less than 50 characters' },
          { pattern: /^[a-zA-Z0-9\s]+$/, message: 'Only letters, numbers and spaces allowed' }
        ]}
      >
        <Input placeholder="e.g., Merk, Logo Type, etc." />
      </Form.Item>

      <Form.Item
        name="description"
        label="Description (Optional)"
        rules={[
          { max: 200, message: 'Description must be less than 200 characters' }
        ]}
      >
        <Input.TextArea
          rows={3}
          placeholder="Brief description of this category..."
        />
      </Form.Item>

      <div className="form-actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="primary" htmlType="submit" loading={loading}>
          Add Category
        </Button>
      </div>
    </Form>
  );
};
```

### **Progress Tracking Component**
```typescript
const CategorizationProgress: React.FC<{
  annotations: LogoAnnotation[];
  onContinue: () => void;
}> = ({ annotations, onContinue }) => {
  const completedCount = annotations.filter(a => a.isComplete).length;
  const totalCount = annotations.length;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const canContinue = completedCount === totalCount && totalCount > 0;

  return (
    <Card title="Categorization Progress" className="progress-card">
      <div className="progress-stats">
        <Progress
          percent={Math.round(progressPercent)}
          status={canContinue ? 'success' : 'active'}
          format={() => `${completedCount}/${totalCount}`}
        />

        <div className="stats-breakdown">
          <div className="stat-item">
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
            <span>Categorized ({completedCount})</span>
          </div>
          <div className="stat-item">
            <ExclamationCircleOutlined style={{ color: '#faad14' }} />
            <span>Missing info ({totalCount - completedCount})</span>
          </div>
        </div>

        <Button
          type="primary"
          size="large"
          disabled={!canContinue}
          onClick={onContinue}
          icon={<ArrowRightOutlined />}
        >
          Continue to Training
        </Button>

        {!canContinue && totalCount > 0 && (
          <div className="validation-message">
            Please complete categorization for all {totalCount - completedCount} remaining logos
          </div>
        )}
      </div>
    </Card>
  );
};
```

---

## 🧪 **Testing Requirements**

### **Unit Tests**
- [ ] Category creation and validation
- [ ] Value suggestions and autocomplete
- [ ] Annotation state management
- [ ] Progress calculation logic
- [ ] Form validation rules

### **Integration Tests**
- [ ] Category-value pairing workflow
- [ ] API integration for categories/values
- [ ] LocalStorage fallback functionality
- [ ] Real-time progress updates

### **E2E Tests**
- [ ] Complete categorization workflow
- [ ] Add new category functionality
- [ ] Autocomplete and suggestions
- [ ] Progress validation and continuation

---

## 📊 **Performance Requirements**

- [ ] Category dropdown loads within 200ms
- [ ] Value suggestions appear within 100ms
- [ ] Form validation feedback immediate (<50ms)
- [ ] Smooth interaction with 20+ categories
- [ ] Efficient suggestion filtering for large datasets

---

## 🔗 **Dependencies**

### **Prerequisite Stories**
- ✅ US-008: Interactive Canvas
- ✅ US-009: Detection Modes
- ✅ US-010: Cropped Preview Panel

### **API Dependencies**
- Category CRUD endpoints
- Value suggestions endpoint
- Annotation persistence API

---

## 📋 **Definition of Done**

- [ ] All acceptance criteria met and tested
- [ ] Category management fully functional
- [ ] Value assignment with autocomplete working
- [ ] Progress tracking accurate
- [ ] API integration complete with fallbacks
- [ ] Form validation comprehensive
- [ ] Accessibility requirements met
- [ ] Code review completed
- [ ] Unit tests ≥85% coverage

---

## 📝 **Implementation Notes**

### **Data Persistence Strategy**
- Primary: API endpoints for categories/values
- Fallback: LocalStorage for offline capability
- Sync mechanism when connection restored

### **UX Considerations**
- Provide helpful examples for new categories
- Smart defaults based on common use cases
- Keyboard shortcuts for power users
- Bulk operations for efficiency

This story completes the annotation workflow by enabling proper labeling of detected logos, which is essential for training the machine learning model.