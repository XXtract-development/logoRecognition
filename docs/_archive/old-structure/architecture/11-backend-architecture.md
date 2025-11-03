# 11. Backend Architecture

## 11.1 Service Architecture

### Controller/Route Organization
```
app/
├── api/
│   ├── __init__.py
│   ├── dependencies.py     # Shared dependencies
│   └── v1/
│       ├── __init__.py
│       ├── auth.py         # Auth endpoints
│       ├── training.py     # Training endpoints
│       ├── recognition.py  # Recognition endpoints
│       └── admin.py        # Admin endpoints
├── core/
│   ├── config.py           # Configuration
│   ├── security.py         # Security utilities
│   └── exceptions.py       # Custom exceptions
├── models/
│   ├── __init__.py
│   ├── user.py
│   ├── training.py
│   └── recognition.py
├── schemas/
│   ├── __init__.py
│   ├── user.py
│   ├── training.py
│   └── recognition.py
├── services/
│   ├── __init__.py
│   ├── auth.py
│   ├── training.py
│   ├── recognition.py
│   └── ml/
│       ├── inference.py
│       ├── training.py
│       └── augmentation.py
├── repositories/
│   ├── __init__.py
│   ├── base.py
│   └── logo.py
├── tasks/                  # Celery tasks
│   ├── __init__.py
│   ├── training.py
│   └── recognition.py
└── main.py                 # FastAPI app
```

### Controller Template
```python